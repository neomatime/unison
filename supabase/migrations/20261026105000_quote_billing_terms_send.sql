-- Accept to invoice, stage 1, task 6: the start date and term on a quote, staff side. The columns, their table checks and the freeze
-- after sending are in 20261026100000_billing_plan_schema.sql; this file is the three functions that read or copy them.
-- Append-only: earlier migrations are applied and are not edited. Each function is replaced from its newest definition and only the
-- change named below differs from it; security, the empty search_path, the revoke and the grant are stated again.
--
-- 1. send_quote (newest: 20261011120000_documents_hardening.sql). With the organisation's billing_plans_enabled switch on and at
--    least one line charged monthly, the quote also needs a start date and a term (QUOTE_BILLING_TERMS_REQUIRED) and a charge kind
--    on every line (QUOTE_CHARGE_KINDS_INCOMPLETE), both checked after the existing checks, the terms first. With the switch off,
--    or with no monthly line, nothing is added: the function behaves exactly as before.
-- 2. duplicate_quote (newest: 20261018101000_quote_portal_links.sql) copies start_date and term_months with the rest of the quote.
-- 3. revise_quote (newest: 20261018101500_quote_portal_links_fixes.sql) copies them too. It already gets them through
--    duplicate_quote; they are named in its own update so that a revision carries the terms whatever duplicate_quote does.

-- ---------------------------------------------------------------------------
-- 1. send_quote.
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
  -- A quote that will be billed monthly says from when and for how long, and says for every line whether it is once-off or monthly.
  if v_settings.billing_plans_enabled and exists (
    select 1 from public.quote_lines l where l.quote_id = p_id and l.organization_id = v_org and l.charge_kind = 'monthly'
  ) then
    if v_quote.start_date is null or v_quote.term_months is null then
      raise exception 'QUOTE_BILLING_TERMS_REQUIRED' using errcode = '23514';
    end if;
    if exists (select 1 from public.quote_lines l where l.quote_id = p_id and l.organization_id = v_org and l.charge_kind is null) then
      raise exception 'QUOTE_CHARGE_KINDS_INCOMPLETE' using errcode = '23514';
    end if;
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

revoke all on function public.send_quote(uuid) from public, anon;
grant execute on function public.send_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. duplicate_quote: as applied, plus start_date and term_months in the insert.
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_quote(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_src public.quotes%rowtype;
  v_new uuid;
begin
  select * into v_src from public.quotes where id = p_id;
  if not found or not public.is_member_of(v_src.organization_id) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  insert into public.quotes (
    organization_id, client_id, client_name, contact_name, lead_id, opportunity_id, owner_id, currency, status,
    terms, notes, project_name, project_description, project_ref, client_ref, start_date, term_months)
  values (
    v_src.organization_id, v_src.client_id, v_src.client_name, v_src.contact_name, v_src.lead_id, v_src.opportunity_id,
    v_src.owner_id, v_src.currency, 'Draft', v_src.terms, v_src.notes, v_src.project_name, v_src.project_description,
    v_src.project_ref, v_src.client_ref, v_src.start_date, v_src.term_months)
  returning id into v_new;
  insert into public.quote_lines (organization_id, quote_id, position, title, description, quantity, unit_price, vat_code, charge_kind)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code, l.charge_kind
  from public.quote_lines l
  where l.quote_id = p_id and l.organization_id = v_src.organization_id;
  return v_new;
end $$;

revoke all on function public.duplicate_quote(uuid) from public, anon;
grant execute on function public.duplicate_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. revise_quote: as applied, plus start_date and term_months in the update of the new draft. Runs as the table owner, so the
--    terms guards for signed-in roles (documents_terms_guard, documents_terms_edit_guard) do not stop it writing the template
--    columns onto its own new draft.
-- ---------------------------------------------------------------------------
create or replace function public.revise_quote(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_src public.quotes%rowtype;
  v_new uuid;
begin
  select q.organization_id into v_org from public.quotes q where q.id = p_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_src from public.quotes where id = p_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_src.status not in ('Sent', 'Declined', 'Expired') then
    raise exception 'QUOTE_CANNOT_REVISE' using errcode = '23514';
  end if;
  v_new := public.duplicate_quote(p_id);
  update public.quotes set
    supersedes_quote_id = p_id,
    service_inclusions = v_src.service_inclusions,
    terms_sources = v_src.terms_sources,
    terms_edited = v_src.terms_edited,
    start_date = v_src.start_date,
    term_months = v_src.term_months
  where id = v_new and organization_id = v_org;
  insert into public.quote_offerings (organization_id, quote_id, position, offering_kind, offering_key)
  select o.organization_id, v_new, o.position, o.offering_kind, o.offering_key
  from public.quote_offerings o
  where o.quote_id = p_id and o.organization_id = v_org;
  return v_new;
end $$;

revoke all on function public.revise_quote(uuid) from public, anon;
grant execute on function public.revise_quote(uuid) to authenticated;
