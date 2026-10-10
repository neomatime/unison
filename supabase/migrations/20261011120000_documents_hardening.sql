-- Stage 2, slice A, hardening after the review of 20261011110000_documents_send_issue.sql. Append-only:
-- that migration is already applied, so these functions are replaced here.
--
-- 1. A line write and a send or issue can no longer interleave: the line freeze locks the parent document
--    (for no key update), so a writer that started on a draft waits and then sees the document has gone out.
--    A backstop in the document triggers also refuses any change to what a sent or issued document adds up to.
-- 2. A sent_at typed on a draft by a signed-in role is cleared, so the send stamps the real time and the
--    timeline entry is written.
-- 3. An invoice is dated the day it is issued. The VAT rate is taken from the company details at the moment a
--    document is sent or issued, so a draft made before the details existed no longer keeps a stale rate.
-- 4. The issuer snapshot is an explicit list of what is printed, not a copy of every settings column.
-- 5. A cancelled invoice cannot be revived by a signed-in role. A counter past 99999 raises a clear token.

create or replace function public.next_document_number(p_org uuid, p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text;
  v_year integer := extract(year from (now() at time zone 'Africa/Johannesburg'))::integer;
  v_next integer;
begin
  if p_kind not in ('quote', 'invoice') then
    raise exception 'DOCUMENT_KIND_UNKNOWN' using errcode = '22023';
  end if;
  select s.document_prefix into v_prefix from public.organization_settings s where s.organization_id = p_org;
  if v_prefix is null then
    raise exception 'COMPANY_DETAILS_MISSING' using errcode = '23514';
  end if;
  insert into public.document_counters as c (organization_id, kind, year, last_number)
  values (p_org, p_kind, v_year, 1)
  on conflict (organization_id, kind, year) do update set last_number = c.last_number + 1
  returning c.last_number into v_next;
  if v_next > 99999 then
    raise exception 'DOCUMENT_NUMBER_EXHAUSTED' using errcode = '23514';
  end if;
  return v_prefix || '-' || case p_kind when 'quote' then 'Q' else 'I' end || '-' || v_year::text || '-' || lpad(v_next::text, 5, '0');
end $$;

create or replace function public.quotes_documents_before() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_member boolean := current_user in ('authenticated', 'anon');
  v_new_draft boolean := new.status in ('Draft', 'Internal Review');
  v_old_draft boolean;
  v_sub numeric(14,2);
  v_std numeric(14,2);
  v_rate numeric(5,2);
begin
  if tg_op = 'INSERT' then
    if v_member then
      if not v_new_draft then
        raise exception 'QUOTE_USE_SEND' using errcode = '23514';
      end if;
      if new.quote_number is not null and btrim(new.quote_number) <> '' then
        raise exception 'DOCUMENT_NUMBER_GENERATED' using errcode = '23514';
      end if;
      new.bill_to := null;
      new.issuer := null;
      new.sent_at := null;
    end if;
    if new.quote_number is null or btrim(new.quote_number) = '' then
      new.quote_number := 'DRAFT-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    end if;
    select s.vat_rate into v_rate from public.organization_settings s where s.organization_id = new.organization_id;
    if found then
      new.vat_rate := v_rate;
    else
      -- No settings yet: the default rate, never a typed one.
      new.vat_rate := 15.00;
    end if;
    new.subtotal := 0;
    new.tax_amount := 0;
    new.total_amount := 0;
  else
    v_old_draft := old.status in ('Draft', 'Internal Review');
    if v_member then
      if new.quote_number is distinct from old.quote_number then
        raise exception 'DOCUMENT_NUMBER_GENERATED' using errcode = '23514';
      end if;
      if new.bill_to is distinct from old.bill_to or new.issuer is distinct from old.issuer then
        raise exception 'DOCUMENT_SNAPSHOT_GENERATED' using errcode = '23514';
      end if;
      if v_old_draft and not v_new_draft then
        raise exception 'QUOTE_USE_SEND' using errcode = '23514';
      end if;
      if not v_old_draft and v_new_draft then
        raise exception 'QUOTE_CANNOT_REOPEN' using errcode = '23514';
      end if;
      if v_new_draft then
        new.sent_at := null;
      end if;
      if not v_old_draft and (
        new.client_id is distinct from old.client_id
        or new.client_name is distinct from old.client_name
        or new.issue_date is distinct from old.issue_date
        or new.valid_until is distinct from old.valid_until
        or new.currency is distinct from old.currency
        or new.terms is distinct from old.terms
        or new.project_name is distinct from old.project_name
        or new.project_description is distinct from old.project_description
        or new.project_ref is distinct from old.project_ref
        or new.client_ref is distinct from old.client_ref
      ) then
        raise exception 'QUOTE_FROZEN' using errcode = '23514';
      end if;
    end if;
    -- The rate is fixed once a document has gone out and for a signed-in role; send_quote (the owner)
    -- sets it from the company details at the moment the quote is sent.
    if v_member or not v_old_draft then
      new.vat_rate := old.vat_rate;
    end if;
    select coalesce(sum(l.line_amount), 0), coalesce(sum(l.line_amount) filter (where l.vat_code = 'standard'), 0)
      into v_sub, v_std
      from public.quote_lines l
      where l.quote_id = new.id and l.organization_id = new.organization_id;
    new.subtotal := v_sub;
    new.tax_amount := round(v_std * new.vat_rate / 100, 2);
    new.total_amount := v_sub + new.tax_amount;
    -- Backstop: whatever raced with the send, a signed-in role never changes what a sent quote adds up to.
    if v_member and not v_old_draft and (new.subtotal is distinct from old.subtotal or new.tax_amount is distinct from old.tax_amount) then
      raise exception 'QUOTE_FROZEN' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create or replace function public.invoices_documents_before() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_member boolean := current_user in ('authenticated', 'anon');
  v_new_draft boolean := new.status = 'Draft';
  v_old_draft boolean;
  v_sub numeric(14,2);
  v_std numeric(14,2);
  v_rate numeric(5,2);
begin
  if tg_op = 'INSERT' then
    if v_member then
      if not v_new_draft then
        raise exception 'INVOICE_USE_ISSUE' using errcode = '23514';
      end if;
      if new.invoice_number is not null and btrim(new.invoice_number) <> '' then
        raise exception 'DOCUMENT_NUMBER_GENERATED' using errcode = '23514';
      end if;
      new.bill_to := null;
      new.issuer := null;
    end if;
    if new.invoice_number is null or btrim(new.invoice_number) = '' then
      new.invoice_number := 'DRAFT-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    end if;
    select s.vat_rate into v_rate from public.organization_settings s where s.organization_id = new.organization_id;
    if found then
      new.vat_rate := v_rate;
    else
      -- No settings yet: the default rate, never a typed one.
      new.vat_rate := 15.00;
    end if;
    new.subtotal := 0;
    new.tax_amount := 0;
    new.total_amount := 0;
  else
    v_old_draft := old.status = 'Draft';
    if v_member then
      if new.invoice_number is distinct from old.invoice_number then
        raise exception 'DOCUMENT_NUMBER_GENERATED' using errcode = '23514';
      end if;
      if new.bill_to is distinct from old.bill_to or new.issuer is distinct from old.issuer then
        raise exception 'DOCUMENT_SNAPSHOT_GENERATED' using errcode = '23514';
      end if;
      if v_old_draft and not v_new_draft then
        raise exception 'INVOICE_USE_ISSUE' using errcode = '23514';
      end if;
      if not v_old_draft and v_new_draft then
        raise exception 'INVOICE_CANNOT_REOPEN' using errcode = '23514';
      end if;
      if old.status = 'Cancelled' and new.status <> 'Cancelled' then
        raise exception 'INVOICE_CANCELLED' using errcode = '23514';
      end if;
      if not v_old_draft and (
        new.client_id is distinct from old.client_id
        or new.client_name is distinct from old.client_name
        or new.issue_date is distinct from old.issue_date
        or new.due_date is distinct from old.due_date
        or new.currency is distinct from old.currency
        or new.payment_terms is distinct from old.payment_terms
        or new.project_name is distinct from old.project_name
        or new.project_description is distinct from old.project_description
        or new.project_ref is distinct from old.project_ref
        or new.client_ref is distinct from old.client_ref
      ) then
        raise exception 'INVOICE_FROZEN' using errcode = '23514';
      end if;
    end if;
    -- The rate is fixed once an invoice has been issued and for a signed-in role; issue_invoice (the owner)
    -- sets it from the company details at the moment the invoice is issued.
    if v_member or not v_old_draft then
      new.vat_rate := old.vat_rate;
    end if;
    select coalesce(sum(l.line_amount), 0), coalesce(sum(l.line_amount) filter (where l.vat_code = 'standard'), 0)
      into v_sub, v_std
      from public.invoice_lines l
      where l.invoice_id = new.id and l.organization_id = new.organization_id;
    new.subtotal := v_sub;
    new.tax_amount := round(v_std * new.vat_rate / 100, 2);
    new.total_amount := v_sub + new.tax_amount;
    -- Backstop: whatever raced with the issue, a signed-in role never changes what an issued invoice adds up to.
    if v_member and not v_old_draft and (new.subtotal is distinct from old.subtotal or new.tax_amount is distinct from old.tax_amount) then
      raise exception 'INVOICE_FROZEN' using errcode = '23514';
    end if;
  end if;
  if new.status = 'Draft' then
    new.balance_amount := new.total_amount;
  end if;
  return new;
end $$;

create or replace function public.quote_lines_freeze() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_status text;
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select q.status into v_status from public.quotes q where q.id = old.quote_id and q.organization_id = old.organization_id for no key update;
    if found and v_status not in ('Draft', 'Internal Review') then
      raise exception 'QUOTE_FROZEN' using errcode = '23514';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select q.status into v_status from public.quotes q where q.id = new.quote_id and q.organization_id = new.organization_id for no key update;
    if found and v_status not in ('Draft', 'Internal Review') then
      raise exception 'QUOTE_FROZEN' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.invoice_lines_freeze() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_status text;
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select i.status into v_status from public.invoices i where i.id = old.invoice_id and i.organization_id = old.organization_id for no key update;
    if found and v_status <> 'Draft' then
      raise exception 'INVOICE_FROZEN' using errcode = '23514';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select i.status into v_status from public.invoices i where i.id = new.invoice_id and i.organization_id = new.organization_id for no key update;
    if found and v_status <> 'Draft' then
      raise exception 'INVOICE_FROZEN' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.send_quote(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_quote public.quotes%rowtype;
  v_settings public.organization_settings%rowtype;
  v_client public.clients%rowtype;
  v_number text;
  v_issue date;
  v_valid date;
begin
  select q.organization_id into v_org from public.quotes q where q.id = p_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  -- The row lock serialises two simultaneous sends of the same quote.
  select * into v_quote from public.quotes where id = p_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_quote.archived_at is not null or v_quote.status not in ('Draft', 'Internal Review') then
    raise exception 'QUOTE_NOT_DRAFT' using errcode = '23514';
  end if;
  select * into v_client from public.clients where id = v_quote.client_id and organization_id = v_org;
  if v_quote.client_id is null or not found then
    raise exception 'QUOTE_NEEDS_CLIENT' using errcode = '23514';
  end if;
  if not exists (select 1 from public.quote_lines l where l.quote_id = p_id and l.organization_id = v_org) then
    raise exception 'QUOTE_NEEDS_LINES' using errcode = '23514';
  end if;
  select * into v_settings from public.organization_settings where organization_id = v_org;
  if not found or v_settings.document_prefix is null or btrim(coalesce(v_settings.legal_name, '')) = '' then
    raise exception 'COMPANY_DETAILS_MISSING' using errcode = '23514';
  end if;

  v_issue := (now() at time zone 'Africa/Johannesburg')::date;
  v_valid := coalesce(v_quote.valid_until, v_issue + v_settings.default_quote_valid_days);
  if v_valid < v_issue then
    raise exception 'QUOTE_VALID_BEFORE_ISSUE' using errcode = '23514';
  end if;
  v_number := public.next_document_number(v_org, 'quote');

  update public.quotes set
    quote_number = v_number,
    status = 'Sent',
    vat_rate = v_settings.vat_rate,
    issue_date = v_issue,
    valid_until = v_valid,
    terms = coalesce(nullif(btrim(v_quote.terms), ''), v_settings.default_quote_terms),
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
      'header_image_path', v_settings.header_image_path)
  where id = p_id;

  return jsonb_build_object('id', p_id, 'number', v_number);
end $$;

create or replace function public.issue_invoice(p_id uuid) returns jsonb
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

revoke all on function public.next_document_number(uuid, text) from public, anon, authenticated;
revoke all on function public.quote_lines_freeze() from public, anon, authenticated;
revoke all on function public.invoice_lines_freeze() from public, anon, authenticated;
revoke all on function public.quotes_documents_before() from public, anon, authenticated;
revoke all on function public.invoices_documents_before() from public, anon, authenticated;
revoke all on function public.send_quote(uuid) from public, anon;
revoke all on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.send_quote(uuid) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
