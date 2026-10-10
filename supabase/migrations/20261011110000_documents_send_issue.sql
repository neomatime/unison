-- Stage 2, slice A, part 2: numbering, send and issue, and the rules that stop a sent
-- document being changed.
--
-- The guard and freeze rules apply to the signed-in roles (authenticated and anon), the
-- same way leads_guard_conversion does: the definer functions below and referential
-- actions run as the table owner and are not held to them, and neither is the service
-- role used by fixtures. Totals are calculated for everyone.

-- ---------------------------------------------------------------------------
-- 1. The next number: PREFIX-Q-YYYY-NNNNN or PREFIX-I-YYYY-NNNNN, one counter per
--    organisation, kind and year (the year in South Africa). The row lock taken by the
--    upsert serialises two callers; the increment rolls back with the caller's
--    transaction, so a failed send leaves no gap.
-- ---------------------------------------------------------------------------
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
  return v_prefix || '-' || case p_kind when 'quote' then 'Q' else 'I' end || '-' || v_year::text || '-' || lpad(v_next::text, 5, '0');
end $$;

revoke all on function public.next_document_number(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The guard and the freeze, on the documents themselves. These replace the part 1
--    functions of the same name and keep everything they did.
-- ---------------------------------------------------------------------------
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
    new.vat_rate := old.vat_rate;
    select coalesce(sum(l.line_amount), 0), coalesce(sum(l.line_amount) filter (where l.vat_code = 'standard'), 0)
      into v_sub, v_std
      from public.quote_lines l
      where l.quote_id = new.id and l.organization_id = new.organization_id;
    new.subtotal := v_sub;
    new.tax_amount := round(v_std * new.vat_rate / 100, 2);
    new.total_amount := v_sub + new.tax_amount;
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
    new.vat_rate := old.vat_rate;
    select coalesce(sum(l.line_amount), 0), coalesce(sum(l.line_amount) filter (where l.vat_code = 'standard'), 0)
      into v_sub, v_std
      from public.invoice_lines l
      where l.invoice_id = new.id and l.organization_id = new.organization_id;
    new.subtotal := v_sub;
    new.tax_amount := round(v_std * new.vat_rate / 100, 2);
    new.total_amount := v_sub + new.tax_amount;
  end if;
  if new.status = 'Draft' then
    new.balance_amount := new.total_amount;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The freeze, on the lines: a signed-in role cannot add, change or remove a line of a
--    document that has gone out.
-- ---------------------------------------------------------------------------
create or replace function public.quote_lines_freeze() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_status text;
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    select q.status into v_status from public.quotes q where q.id = old.quote_id and q.organization_id = old.organization_id;
    if found and v_status not in ('Draft', 'Internal Review') then
      raise exception 'QUOTE_FROZEN' using errcode = '23514';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select q.status into v_status from public.quotes q where q.id = new.quote_id and q.organization_id = new.organization_id;
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
    select i.status into v_status from public.invoices i where i.id = old.invoice_id and i.organization_id = old.organization_id;
    if found and v_status <> 'Draft' then
      raise exception 'INVOICE_FROZEN' using errcode = '23514';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select i.status into v_status from public.invoices i where i.id = new.invoice_id and i.organization_id = new.organization_id;
    if found and v_status <> 'Draft' then
      raise exception 'INVOICE_FROZEN' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger quote_lines_freeze
  before insert or update or delete on public.quote_lines
  for each row execute function public.quote_lines_freeze();
create trigger invoice_lines_freeze
  before insert or update or delete on public.invoice_lines
  for each row execute function public.invoice_lines_freeze();

revoke all on function public.quote_lines_freeze() from public, anon, authenticated;
revoke all on function public.invoice_lines_freeze() from public, anon, authenticated;
revoke all on function public.quotes_documents_before() from public, anon, authenticated;
revoke all on function public.invoices_documents_before() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Send a quote. security definer, because it writes the number and the snapshots that
--    members may not write. It therefore does its own checks: the caller must be a member
--    of the quote's organisation, and everything it reads or writes is scoped to it.
-- ---------------------------------------------------------------------------
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
    issue_date = v_issue,
    valid_until = v_valid,
    terms = coalesce(nullif(btrim(v_quote.terms), ''), v_settings.default_quote_terms),
    client_name = v_client.name,
    bill_to = jsonb_build_object(
      'name', v_client.name, 'address_line1', v_client.address_line1, 'address_line2', v_client.address_line2,
      'city', v_client.city, 'postal_code', v_client.postal_code, 'country', v_client.country,
      'vat_number', v_client.vat_number),
    issuer = to_jsonb(v_settings) - 'id' - 'organization_id' - 'created_at' - 'updated_at'
  where id = p_id;

  return jsonb_build_object('id', p_id, 'number', v_number);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Issue an invoice, the same way.
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

  v_issue := coalesce(v_invoice.issue_date, (now() at time zone 'Africa/Johannesburg')::date);
  v_due := coalesce(v_invoice.due_date, v_issue + v_settings.default_payment_days);
  if v_due < v_issue then
    raise exception 'INVOICE_DUE_BEFORE_ISSUE' using errcode = '23514';
  end if;
  v_number := public.next_document_number(v_org, 'invoice');

  update public.invoices set
    invoice_number = v_number,
    status = 'Issued',
    issue_date = v_issue,
    due_date = v_due,
    payment_terms = coalesce(nullif(btrim(v_invoice.payment_terms), ''), v_settings.default_payment_terms),
    client_name = v_client.name,
    bill_to = jsonb_build_object(
      'name', v_client.name, 'address_line1', v_client.address_line1, 'address_line2', v_client.address_line2,
      'city', v_client.city, 'postal_code', v_client.postal_code, 'country', v_client.country,
      'vat_number', v_client.vat_number),
    issuer = to_jsonb(v_settings) - 'id' - 'organization_id' - 'created_at' - 'updated_at',
    balance_amount = v_invoice.total_amount
  where id = p_id;

  return jsonb_build_object('id', p_id, 'number', v_number);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Duplicate a quote as a new draft, with its lines and project details. security
--    invoker: row level security already limits the caller to their own organisations,
--    and what is created is only what a member could create by hand.
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_quote(p_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_src public.quotes%rowtype;
  v_new uuid;
begin
  select * into v_src from public.quotes where id = p_id;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  insert into public.quotes (
    organization_id, client_id, client_name, contact_name, lead_id, opportunity_id, owner_id, currency, status,
    terms, notes, project_name, project_description, project_ref, client_ref)
  values (
    v_src.organization_id, v_src.client_id, v_src.client_name, v_src.contact_name, v_src.lead_id, v_src.opportunity_id,
    v_src.owner_id, v_src.currency, 'Draft', v_src.terms, v_src.notes, v_src.project_name, v_src.project_description,
    v_src.project_ref, v_src.client_ref)
  returning id into v_new;
  insert into public.quote_lines (organization_id, quote_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code, l.price_list_item_id
  from public.quote_lines l
  where l.quote_id = p_id and l.organization_id = v_src.organization_id;
  return v_new;
end $$;

revoke all on function public.send_quote(uuid) from public, anon;
revoke all on function public.issue_invoice(uuid) from public, anon;
revoke all on function public.duplicate_quote(uuid) from public, anon;
grant execute on function public.send_quote(uuid) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.duplicate_quote(uuid) to authenticated;
