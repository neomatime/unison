-- Accept to invoice, stage 2, task 2: two refactors with no change in behaviour, and one helper, so the system path (the billing
-- runner, which has no signed-in user) can issue an invoice and record its email with the very same code a member's click runs.
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. private.issue_invoice_apply(uuid): everything public.issue_invoice (last defined in 20261026103500_billing_issue_guard_paused_plan.sql)
--    does from reading the client down: client, lines and company details present, the issue and due dates, the number, and the
--    update to Issued with the frozen bill_to and issuer. It makes no membership check and no plan check: its callers have made them.
--    public.issue_invoice keeps its membership check, row lock, draft check, first-invoice approval check and its paused, ended or
--    cancelled check exactly where they were, then returns the apply function's answer. Every token is raised as before.
-- 2. private.record_document_email_core(...): public.record_document_email (20261011130000_documents_delivery.sql) from the draft
--    check down: address, subject, body and hash validation, the document_emails insert and the timeline entry. sent_by comes from
--    public.activity_actor, which is null when there is no signed-in user. public.record_document_email keeps the document lookup and
--    the membership check and calls the core.
-- 3. private.billing_client_email(uuid): the address an invoice is emailed to: the client's billing email when it passes the address
--    rule used in private.billing_invoice_blockers and public.record_document_email, otherwise the email of the client's primary
--    unarchived contact when that passes, otherwise null.
--
-- Nothing here changes what any signed-in person can do.

-- ---------------------------------------------------------------------------
-- 1. Issuing.
-- ---------------------------------------------------------------------------
create or replace function private.issue_invoice_apply(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_invoice public.invoices%rowtype;
  v_settings public.organization_settings%rowtype;
  v_client public.clients%rowtype;
  v_number text;
  v_issue date;
  v_due date;
begin
  select * into v_invoice from public.invoices where id = p_id for update;
  if not found then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  v_org := v_invoice.organization_id;
  select * into v_client from public.clients where id = v_invoice.client_id and organization_id = v_org;
  if v_invoice.client_id is null or not found then
    raise exception 'INVOICE_NEEDS_CLIENT' using errcode = '23514';
  end if;
  if not exists (select 1 from public.invoice_lines l where l.invoice_id = p_id and l.organization_id = v_org) then
    raise exception 'INVOICE_NEEDS_LINES' using errcode = '23514';
  end if;
  select * into v_settings from public.organization_settings where organization_id = v_org;
  if not found or v_settings.document_prefix is null or btrim(coalesce(v_settings.legal_name, '')) = '' then
    raise exception 'COMPANY_DETAILS_MISSING' using errcode = '23514';
  end if;

  -- An invoice is dated the day it is issued, never a date typed on the draft: the number and the date
  -- always agree, and invoices stay in date order.
  v_issue := (now() at time zone 'Africa/Johannesburg')::date;
  v_due := coalesce(v_invoice.due_date, v_issue + v_settings.default_payment_days);
  if v_due < v_issue then
    raise exception 'INVOICE_DUE_BEFORE_ISSUE' using errcode = '23514';
  end if;
  v_number := public.next_document_number(v_org, 'invoice');

  update public.invoices set
    invoice_number = v_number,
    status = 'Issued',
    vat_rate = v_settings.vat_rate,
    issue_date = v_issue,
    due_date = v_due,
    payment_terms = coalesce(nullif(btrim(v_invoice.payment_terms), ''), v_settings.default_payment_terms),
    client_name = v_client.name,
    bill_to = jsonb_build_object(
      'name', v_client.name, 'address_line1', v_client.address_line1, 'address_line2', v_client.address_line2,
      'city', v_client.city, 'postal_code', v_client.postal_code, 'country', v_client.country,
      'vat_number', v_client.vat_number),
    issuer = jsonb_build_object(
      'legal_name', v_settings.legal_name, 'tagline', v_settings.tagline,
      'address_line1', v_settings.address_line1, 'address_line2', v_settings.address_line2, 'city', v_settings.city,
      'postal_code', v_settings.postal_code, 'country', v_settings.country, 'vat_number', v_settings.vat_number,
      'email', v_settings.email, 'phone', v_settings.phone, 'website', v_settings.website,
      'bank_name', v_settings.bank_name, 'bank_account_name', v_settings.bank_account_name,
      'bank_account_number', v_settings.bank_account_number, 'bank_branch_code', v_settings.bank_branch_code,
      'bank_account_type', v_settings.bank_account_type, 'quote_closing_text', v_settings.quote_closing_text,
      'invoice_closing_text', v_settings.invoice_closing_text, 'logo_path', v_settings.logo_path,
      'header_image_path', v_settings.header_image_path),
    balance_amount = v_invoice.total_amount
  where id = p_id;

  return jsonb_build_object('id', p_id, 'number', v_number);
end $$;

revoke all on function private.issue_invoice_apply(uuid) from public, anon, authenticated;

create or replace function public.issue_invoice(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_invoice public.invoices%rowtype;
  v_kind text;
  v_item_status text;
  v_plan_status text;
begin
  select i.organization_id into v_org from public.invoices i where i.id = p_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_invoice from public.invoices where id = p_id for update;
  if not found then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_invoice.archived_at is not null or v_invoice.status <> 'Draft' then
    raise exception 'INVOICE_NOT_DRAFT' using errcode = '23514';
  end if;
  if v_invoice.billing_plan_item_id is not null then
    select i.kind into v_kind from public.billing_plan_items i where i.id = v_invoice.billing_plan_item_id;
    if v_kind = 'first' and current_setting('unison.billing_approval', true) is distinct from v_invoice.billing_plan_item_id::text then
      raise exception 'INVOICE_USE_APPROVAL' using errcode = '23514';
    end if;
    -- Nothing is invoiced while the plan is paused or ended, nor for a month that was cancelled: first and monthly invoices alike.
    -- Plain reads, no row locks: a pause that commits just after this read lets this one issue through, and no lock is taken
    -- here that billing_plan_set_state, approve_first_invoice or create_plan_item_invoice could wait on in a circle.
    select i.status, p.status into v_item_status, v_plan_status
    from public.billing_plan_items i join public.billing_plans p on p.id = i.plan_id
    where i.id = v_invoice.billing_plan_item_id;
    if found then
      if v_item_status = 'cancelled' then
        raise exception 'BILLING_ITEM_CANCELLED' using errcode = '23514';
      elsif v_plan_status <> 'active' then
        raise exception 'BILLING_PLAN_NOT_ACTIVE' using errcode = '23514';
      end if;
    end if;
  end if;
  return private.issue_invoice_apply(p_id);
end $$;

revoke all on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Recording an email.
-- ---------------------------------------------------------------------------
create or replace function private.record_document_email_core(
  p_kind text, p_id uuid, p_to text, p_subject text, p_body text, p_sha256 text, p_bytes integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_number text;
  v_draft boolean;
  v_client uuid;
  v_to text := btrim(coalesce(p_to, ''));
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := coalesce(p_body, '');
  v_id uuid;
begin
  if p_kind = 'quote' then
    select q.organization_id, q.quote_number, q.status in ('Draft', 'Internal Review')
      into v_org, v_number, v_draft
      from public.quotes q where q.id = p_id;
    if not found then
      raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
    end if;
  elsif p_kind = 'invoice' then
    select i.organization_id, i.invoice_number, i.status = 'Draft', i.client_id
      into v_org, v_number, v_draft, v_client
      from public.invoices i where i.id = p_id;
    if not found then
      raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
    end if;
  else
    raise exception 'DOCUMENT_KIND_UNKNOWN' using errcode = '22023';
  end if;

  if v_draft then
    raise exception 'DOCUMENT_IS_DRAFT' using errcode = '23514';
  end if;
  -- One plain ASCII address: no display name, no list, no whitespace, no control characters.
  if char_length(v_to) > 254
     or v_to !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?[.])+[A-Za-z]{2,}$'
     or v_to ~ '(^[.]|[.]@|[.][.])' then
    raise exception 'EMAIL_ADDRESS_INVALID' using errcode = '23514';
  end if;
  if char_length(v_subject) not between 1 and 300
     or position(chr(10) in v_subject) > 0 or position(chr(13) in v_subject) > 0 then
    raise exception 'EMAIL_SUBJECT_INVALID' using errcode = '23514';
  end if;
  if char_length(v_body) > 10000 then
    raise exception 'EMAIL_BODY_TOO_LONG' using errcode = '23514';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_bytes is null or p_bytes < 1 or p_bytes > 20000000 then
    raise exception 'EMAIL_RECORD_INVALID' using errcode = '23514';
  end if;

  insert into public.document_emails (organization_id, quote_id, invoice_id, to_address, subject, body, pdf_sha256, pdf_bytes, sent_by)
  values (
    v_org,
    case when p_kind = 'quote' then p_id end,
    case when p_kind = 'invoice' then p_id end,
    v_to, v_subject, v_body, p_sha256, p_bytes, public.activity_actor(v_org))
  returning id into v_id;

  if p_kind = 'quote' then
    insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
    values (v_org, 'quote.emailed', 'Quote ' || v_number || ' emailed to ' || v_to,
            jsonb_build_object('document_id', p_id, 'number', v_number, 'to', v_to),
            public.activity_actor(v_org), p_id);
  elsif v_client is not null then
    insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
    values (v_org, 'invoice.emailed', 'Invoice ' || v_number || ' emailed to ' || v_to,
            jsonb_build_object('document_id', p_id, 'number', v_number, 'to', v_to),
            public.activity_actor(v_org), v_client);
  end if;

  return v_id;
end $$;

revoke all on function private.record_document_email_core(text, uuid, text, text, text, text, integer) from public, anon, authenticated;

create or replace function public.record_document_email(
  p_kind text, p_id uuid, p_to text, p_subject text, p_body text, p_sha256 text, p_bytes integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if p_kind = 'quote' then
    select q.organization_id into v_org from public.quotes q where q.id = p_id;
    if not found or not public.is_member_of(v_org) then
      raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
    end if;
  elsif p_kind = 'invoice' then
    select i.organization_id into v_org from public.invoices i where i.id = p_id;
    if not found or not public.is_member_of(v_org) then
      raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
    end if;
  else
    raise exception 'DOCUMENT_KIND_UNKNOWN' using errcode = '22023';
  end if;
  return private.record_document_email_core(p_kind, p_id, p_to, p_subject, p_body, p_sha256, p_bytes);
end $$;

revoke all on function public.record_document_email(text, uuid, text, text, text, text, integer) from public, anon;
grant execute on function public.record_document_email(text, uuid, text, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Where an invoice is emailed to.
-- ---------------------------------------------------------------------------
create or replace function private.billing_client_email(p_invoice_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select trimmed.address
  from public.invoices i
  join public.clients c on c.id = i.client_id and c.organization_id = i.organization_id
  cross join lateral (
    select 1 as rank, c.billing_email as email
    union all
    select 2, p.email from public.contacts p
    where p.client_id = c.id and p.organization_id = c.organization_id and p.is_primary and p.archived_at is null
  ) as candidates
  cross join lateral (
    select regexp_replace(coalesce(candidates.email, ''), '^[\s\xa0\xfeff]+|[\s\xa0\xfeff]+$', '', 'g') as address
  ) as trimmed
  where i.id = p_invoice_id
    and char_length(trimmed.address) <= 254
    and trimmed.address ~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?[.])+[A-Za-z]{2,}$'
    and trimmed.address !~ '(^[.]|[.]@|[.][.])'
  order by candidates.rank
  limit 1
$$;

revoke all on function private.billing_client_email(uuid) from public, anon, authenticated;
