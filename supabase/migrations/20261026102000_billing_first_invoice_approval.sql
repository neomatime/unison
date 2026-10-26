-- Accept to invoice, stage 1, task 3: the locks on a plan's invoices and the approval of the first one. Nothing here changes
-- behaviour while the switch (organization_settings.billing_plans_enabled, default false) is off: every check below starts from
-- invoices.billing_plan_item_id, which only the plan functions of 20261026101000_billing_plan_invoices.sql ever set, and they
-- only run with the switch on. Unlinked invoices and monthly drafts are issued and edited exactly as before.
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. public.invoices_documents_before(): replaced from 20261011120000_documents_hardening.sql. A signed-in role cannot insert an
--    invoice with a billing link or change one (BILLING_COLUMNS_GENERATED), and on a Draft that has a link may change only the
--    due date, the notes and archived_at (INVOICE_PLAN_LOCKED). Archiving is how a plan draft is discarded: the month is freed
--    when it is built again (private.build_plan_item_invoice).
-- 2. public.invoice_lines_freeze(): replaced from the same file. A signed-in role cannot insert, update or delete a line of a
--    Draft that has a link (INVOICE_PLAN_LOCKED). An issued invoice is still INVOICE_FROZEN, which is checked first.
-- 3. public.issue_invoice(uuid): replaced from the same file. The first invoice of a plan is issued only by
--    public.approve_first_invoice, which sets the transaction-local setting unison.billing_approval to the item's id just before
--    it calls this function. The setting cannot be set through the API (set_config is not an exposed function), and it is reset
--    straight after the call and in any case ends with the transaction. Otherwise INVOICE_USE_APPROVAL.
-- 4. private.billing_invoice_blockers(invoice): what is missing before an invoice can go out, as codes for the page to list, in
--    a fixed order. Not callable by any role; public.billing_invoice_readiness(invoice) is the member's way to read it.
-- 5. public.approve_first_invoice(item): an owner or admin approves the first invoice of a plan, which issues it through the
--    existing issue_invoice (so the number, the dates, the due date and the freezing are the existing rules). The checks run
--    before a number is used. No email is sent here.
--
-- Money is never typed or recomputed here. Dates are South African days.

-- ---------------------------------------------------------------------------
-- 1. The header lock. The body is 20261011120000_documents_hardening.sql unchanged except for two checks in the signed-in
--    branches: the link on insert and update, and the plan lock at the end of the update branch.
-- ---------------------------------------------------------------------------
create or replace function public.invoices_documents_before() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_member boolean := current_user in ('authenticated', 'anon');
  v_new_draft boolean := new.status = 'Draft';
  v_old_draft boolean;
  v_sub numeric(14,2);
  v_std numeric(14,2);
  v_rate numeric(5,2);
  -- The columns a signed-in role may still change on a Draft that has a link: the due date, the notes and archived_at. The
  -- others here are not the person's to change at all: updated_at is the database's and the four money columns are worked out
  -- below from the lines.
  v_open_columns constant text[] := array['updated_at', 'subtotal', 'tax_amount', 'total_amount', 'balance_amount', 'due_date', 'notes', 'archived_at'];
begin
  if tg_op = 'INSERT' then
    if v_member then
      if new.billing_plan_item_id is not null then
        raise exception 'BILLING_COLUMNS_GENERATED' using errcode = '23514';
      end if;
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
      if new.billing_plan_item_id is distinct from old.billing_plan_item_id then
        raise exception 'BILLING_COLUMNS_GENERATED' using errcode = '23514';
      end if;
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
      -- A draft that follows an accepted quote: everything but the due date, the notes and archived_at is the quote's.
      if v_old_draft and old.billing_plan_item_id is not null
         and (to_jsonb(new) - v_open_columns) is distinct from (to_jsonb(old) - v_open_columns) then
        raise exception 'INVOICE_PLAN_LOCKED' using errcode = '23514';
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
  -- A draft's balance follows its total, including at the moment it is issued (the rate may change then).
  if new.status = 'Draft' or (tg_op = 'UPDATE' and old.status = 'Draft') then
    new.balance_amount := new.total_amount;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The line lock. The body is 20261011120000_documents_hardening.sql unchanged except that the parent's billing link is read
--    with its status, and a Draft that has one refuses a signed-in role's insert, update and delete.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_lines_freeze() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_status text;
  v_link uuid;
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select i.status, i.billing_plan_item_id into v_status, v_link from public.invoices i where i.id = old.invoice_id and i.organization_id = old.organization_id for no key update;
    if found and v_status <> 'Draft' then
      raise exception 'INVOICE_FROZEN' using errcode = '23514';
    end if;
    if found and v_link is not null then
      raise exception 'INVOICE_PLAN_LOCKED' using errcode = '23514';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select i.status, i.billing_plan_item_id into v_status, v_link from public.invoices i where i.id = new.invoice_id and i.organization_id = new.organization_id for no key update;
    if found and v_status <> 'Draft' then
      raise exception 'INVOICE_FROZEN' using errcode = '23514';
    end if;
    if found and v_link is not null then
      raise exception 'INVOICE_PLAN_LOCKED' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- 3. issue_invoice. The body is 20261011120000_documents_hardening.sql unchanged except for the block after the draft check: an
--    invoice whose item is the first of its plan is issued only inside approve_first_invoice. The setting is read without
--    raising when it is missing, and a missing or empty value never equals an item id.
-- ---------------------------------------------------------------------------
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
  v_kind text;
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

revoke all on function public.invoice_lines_freeze() from public, anon, authenticated;
revoke all on function public.invoices_documents_before() from public, anon, authenticated;
revoke all on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. What is missing before an invoice can go out. Codes, in this order, each at most once: the company (legal name, document
--    prefix, VAT number only when a line carries standard VAT, bank details), the client (there is one; an email that looks like
--    one on the client or else on its primary unarchived contact; a first address line), then the lines and the total. When
--    there is no client the email and the address are not asked about. An empty array means nothing is missing. It reads the
--    stored total, which follows the lines. The one place that knows the list; approve_first_invoice and the page both use it.
-- ---------------------------------------------------------------------------
create or replace function private.billing_invoice_blockers(p_invoice_id uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices%rowtype;
  v_settings public.organization_settings%rowtype;
  v_client public.clients%rowtype;
  v_blockers text[] := '{}';
  v_standard boolean;
  v_email constant text := '^[^@\s]+@[^@\s]+\.[^@\s]+$';
begin
  select * into v_invoice from public.invoices i where i.id = p_invoice_id;
  if not found then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  -- No settings row at all leaves every field null, so every company code is raised.
  select * into v_settings from public.organization_settings s where s.organization_id = v_invoice.organization_id;
  select exists (
    select 1 from public.invoice_lines l
    where l.invoice_id = v_invoice.id and l.organization_id = v_invoice.organization_id and l.vat_code = 'standard'
  ) into v_standard;

  if btrim(coalesce(v_settings.legal_name, '')) = '' then
    v_blockers := array_append(v_blockers, 'COMPANY_NAME_MISSING');
  end if;
  if btrim(coalesce(v_settings.document_prefix, '')) = '' then
    v_blockers := array_append(v_blockers, 'COMPANY_PREFIX_MISSING');
  end if;
  if v_standard and btrim(coalesce(v_settings.vat_number, '')) = '' then
    v_blockers := array_append(v_blockers, 'COMPANY_VAT_NUMBER_MISSING');
  end if;
  if btrim(coalesce(v_settings.bank_name, '')) = ''
     or btrim(coalesce(v_settings.bank_account_name, '')) = ''
     or btrim(coalesce(v_settings.bank_account_number, '')) = ''
     or btrim(coalesce(v_settings.bank_branch_code, '')) = '' then
    v_blockers := array_append(v_blockers, 'BANK_DETAILS_MISSING');
  end if;

  select * into v_client from public.clients c where c.id = v_invoice.client_id and c.organization_id = v_invoice.organization_id;
  if v_invoice.client_id is null or not found then
    v_blockers := array_append(v_blockers, 'CLIENT_MISSING');
  else
    if not (
      btrim(coalesce(v_client.billing_email, '')) ~ v_email
      or exists (
        select 1 from public.contacts c
        where c.client_id = v_client.id and c.organization_id = v_client.organization_id
          and c.is_primary and c.archived_at is null and btrim(coalesce(c.email, '')) ~ v_email)
    ) then
      v_blockers := array_append(v_blockers, 'CLIENT_EMAIL_MISSING');
    end if;
    if btrim(coalesce(v_client.address_line1, '')) = '' then
      v_blockers := array_append(v_blockers, 'CLIENT_ADDRESS_MISSING');
    end if;
  end if;

  if not exists (select 1 from public.invoice_lines l where l.invoice_id = v_invoice.id and l.organization_id = v_invoice.organization_id) then
    v_blockers := array_append(v_blockers, 'NO_LINES');
  end if;
  if v_invoice.total_amount <= 0 then
    v_blockers := array_append(v_blockers, 'TOTAL_NOT_POSITIVE');
  end if;
  return v_blockers;
end $$;

revoke all on function private.billing_invoice_blockers(uuid) from public, anon, authenticated;

-- The page's reading of the list above, for any member of the invoice's organisation. A caller who is not a member and a caller
-- asking for an invoice that does not exist get the same answer.
create or replace function public.billing_invoice_readiness(p_invoice_id uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select i.organization_id into v_org from public.invoices i where i.id = p_invoice_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;
  return private.billing_invoice_blockers(p_invoice_id);
end $$;

revoke all on function public.billing_invoice_readiness(uuid) from public, anon;
grant execute on function public.billing_invoice_readiness(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The approval of the first invoice. In order: the item is in an organisation the caller belongs to (a caller who is not a
--    member and an item that does not exist get the same answer); the caller is an owner or admin; the switch is on. Then the
--    quote's row is locked and the item's, in the order create_plan_item_invoice uses, and the item is read again under the
--    lock: it is the first item, open, of an active plan, and not approved already; its invoice is there, not archived, and a
--    Draft. The list of what is missing is read before anything is changed, so a refusal uses no number and leaves no trace
--    (and any refusal later rolls the whole call back). Then the permission for issue_invoice is given for this transaction,
--    the invoice is issued by the existing function and the permission is taken away again. A monthly item raises
--    BILLING_ITEM_NOT_FOUND: only the first invoice of a plan is approved, so a monthly item is not an item to approve.
-- ---------------------------------------------------------------------------
create or replace function public.approve_first_invoice(p_item_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.billing_plan_items%rowtype;
  v_plan_status text;
  v_invoice public.invoices%rowtype;
  v_blockers text[];
  v_issued jsonb;
  v_number text;
begin
  select * into v_item from public.billing_plan_items i where i.id = p_item_id;
  if not found or not public.is_member_of(v_item.organization_id) then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;
  if not public.has_role(v_item.organization_id, array['owner', 'admin']) then
    raise exception 'BILLING_APPROVAL_ADMIN_ONLY' using errcode = '42501';
  end if;
  if not coalesce((select s.billing_plans_enabled from public.organization_settings s where s.organization_id = v_item.organization_id), false) then
    raise exception 'BILLING_NOT_ENABLED' using errcode = '23514';
  end if;

  perform q.id from public.quotes q where q.id = v_item.quote_id for no key update;
  if not found then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_item from public.billing_plan_items i where i.id = p_item_id for update;
  if not found or v_item.kind <> 'first' then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;
  if v_item.status = 'cancelled' then
    raise exception 'BILLING_ITEM_CANCELLED' using errcode = '23514';
  end if;
  select p.status into v_plan_status from public.billing_plans p where p.id = v_item.plan_id;
  if v_plan_status is distinct from 'active' then
    raise exception 'BILLING_PLAN_NOT_ACTIVE' using errcode = '23514';
  end if;
  if v_item.approved_at is not null then
    raise exception 'BILLING_ALREADY_APPROVED' using errcode = '23514';
  end if;
  select * into v_invoice from public.invoices i where i.billing_plan_item_id = p_item_id and i.organization_id = v_item.organization_id;
  if not found or v_invoice.archived_at is not null or v_invoice.status <> 'Draft' then
    raise exception 'INVOICE_NOT_DRAFT' using errcode = '23514';
  end if;

  v_blockers := private.billing_invoice_blockers(v_invoice.id);
  if cardinality(v_blockers) > 0 then
    raise exception 'BILLING_CHECKS_FAILED: %', array_to_string(v_blockers, ',') using errcode = '23514';
  end if;

  perform set_config('unison.billing_approval', p_item_id::text, true);
  v_issued := public.issue_invoice(v_invoice.id);
  perform set_config('unison.billing_approval', '', true);
  v_number := v_issued ->> 'number';

  update public.billing_plan_items set approved_at = now(), approved_by = auth.uid() where id = p_item_id;
  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_item.organization_id, 'billing.invoice_approved', 'Invoice ' || v_number || ' approved',
          jsonb_build_object('invoice_id', v_invoice.id, 'invoice_number', v_number, 'quote_id', v_item.quote_id, 'billing_plan_item_id', v_item.id),
          public.activity_actor(v_item.organization_id), v_item.quote_id);

  return jsonb_build_object('invoice_id', v_invoice.id, 'number', v_number);
end $$;

revoke all on function public.approve_first_invoice(uuid) from public, anon;
grant execute on function public.approve_first_invoice(uuid) to authenticated;
