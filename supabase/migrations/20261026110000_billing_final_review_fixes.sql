-- Accept to invoice, stage 1, final fix wave: three changes from the whole-branch review. Nothing here changes behaviour while the
-- switch (organization_settings.billing_plans_enabled, default false) is off, except duplicate_quote (3), which has no switch.
-- Append-only: earlier migrations are applied and are not edited. Each function is replaced from its newest definition (named below)
-- with the one change stated; the security, search_path, revoke and grant lines are restated.
--
-- 1. private.build_plan_item_invoice(item): replaced from 20261026101000_billing_plan_invoices.sql. When a month is built again, an
--    archived Draft that is linked to it lets the month go. Until now the draft was only unlinked and kept, so a member who pressed
--    Restore in the Invoices register got back an ordinary, unlinked Draft that nothing locks: its page offered Issue invoice, and
--    issue_invoice issued it without the approval or the checks, a second first invoice or a second month invoice. The discarded
--    draft is now deleted instead of unlinked. Cancelling it was the first choice (it would stay on record and could never be
--    issued) but the table refuses it: invoices_draft_reference_only_in_draft allows a DRAFT- reference only on a Draft, and a draft
--    that was never issued never had a real number. Deleting loses no number and nothing that was sent: a draft has no payments and
--    no email, and its lines and offerings go with it (on delete cascade). The function runs as the table owner, so the signed-in
--    guards do not apply and no trigger refuses the delete. Every other line is as it was.
-- 2. public.create_invoice_from_quote(quote): replaced from 20261026101500_billing_duplicate_guard_fix.sql. The branch that builds a
--    plan now also requires that the quote's client is not archived, the rule private.billing_on_acceptance already applies
--    (the pause trigger of 20261026103000_billing_plan_state.sql fires only on the act of archiving a client, so a plan made for a
--    client that is already archived would never be paused). An archived client falls through to the plain copy below it, a plain
--    draft invoice with no plan, as a quote without terms does. A quote with no client (client_id null) is not an archived client:
--    it still goes to private.ensure_billing_plan and is refused there (BILLING_QUOTE_NOT_ELIGIBLE), as before.
-- 3. public.duplicate_quote(quote): replaced from 20261026105000_quote_billing_terms_send.sql. The copy no longer carries start_date
--    and term_months: a duplicate of an old accepted quote carried a start date that may be in the past, which showed on the portal
--    and the PDF and made months due at once. The new draft has no terms and staff set them. public.revise_quote is unchanged: it
--    calls this function and then sets both columns from the quote it revises, so a revision keeps the terms of its original.
--
-- Money is never typed or recomputed here.

-- ---------------------------------------------------------------------------
-- 1. A discarded plan draft is cancelled when its month is built again.
-- ---------------------------------------------------------------------------
create or replace function private.build_plan_item_invoice(p_item_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.billing_plan_items%rowtype;
  v_plan_status text;
  v_quote public.quotes%rowtype;
  v_new uuid;
begin
  select * into v_item from public.billing_plan_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;
  if v_item.status = 'cancelled' then
    raise exception 'BILLING_ITEM_CANCELLED' using errcode = '23514';
  end if;
  select p.status into v_plan_status from public.billing_plans p where p.id = v_item.plan_id;
  if v_plan_status is distinct from 'active' then
    raise exception 'BILLING_PLAN_NOT_ACTIVE' using errcode = '23514';
  end if;
  select * into v_quote from public.quotes q where q.id = v_item.quote_id;
  if not found then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;

  delete from public.invoices i
  where i.billing_plan_item_id = p_item_id and i.organization_id = v_item.organization_id
    and i.archived_at is not null and i.status = 'Draft';
  if exists (select 1 from public.invoices i where i.billing_plan_item_id = p_item_id) then
    raise exception 'BILLING_ITEM_ALREADY_INVOICED' using errcode = '23514';
  end if;

  begin
    insert into public.invoices (
      organization_id, client_id, client_name, owner_id, opportunity_id, quote_id, currency, status,
      project_name, project_description, project_ref, client_ref, billing_plan_item_id)
    values (
      v_item.organization_id, v_quote.client_id, v_quote.client_name, v_quote.owner_id, v_quote.opportunity_id, v_quote.id, v_quote.currency, 'Draft',
      v_quote.project_name, v_quote.project_description, v_quote.project_ref, v_quote.client_ref, v_item.id)
    returning id into v_new;
  exception when unique_violation then
    raise exception 'BILLING_ITEM_ALREADY_INVOICED' using errcode = '23514';
  end;

  insert into public.invoice_lines (organization_id, invoice_id, position, title, description, quantity, unit_price, vat_code)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code
  from public.quote_lines l
  where l.quote_id = v_quote.id and l.organization_id = v_item.organization_id
    and (v_item.kind = 'first' or l.charge_kind = 'monthly');

  insert into public.invoice_offerings (organization_id, invoice_id, position, offering_kind, offering_key)
  select o.organization_id, v_new, o.position, o.offering_kind, o.offering_key
  from public.quote_offerings o
  where o.quote_id = v_quote.id and o.organization_id = v_item.organization_id;

  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_item.organization_id, 'quote.invoiced', 'Draft invoice created from quote ' || v_quote.quote_number,
          jsonb_build_object('invoice_id', v_new, 'quote_id', v_quote.id, 'quote_number', v_quote.quote_number,
                             'billing_plan_item_id', v_item.id, 'month_number', v_item.month_number),
          public.activity_actor(v_item.organization_id), v_quote.id);

  return v_new;
end $$;

revoke all on function private.build_plan_item_invoice(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. No billing plan from the Create invoice button for an archived client.
-- ---------------------------------------------------------------------------
create or replace function public.create_invoice_from_quote(p_quote_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  v_org uuid;
  v_quote public.quotes%rowtype;
  v_new uuid;
  v_plan uuid;
  v_item uuid;
begin
  select q.organization_id into v_org from public.quotes q where q.id = p_quote_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_quote.archived_at is not null then
    raise exception 'QUOTE_ARCHIVED' using errcode = '23514';
  end if;
  if v_quote.status <> 'Accepted' then
    raise exception 'QUOTE_NOT_ACCEPTED' using errcode = '23514';
  end if;

  if exists (select 1 from public.billing_plans p where p.quote_id = p_quote_id) then
    raise exception 'QUOTE_HAS_BILLING_PLAN' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.invoices i
    where i.quote_id = p_quote_id and i.organization_id = v_org
      and i.status <> 'Cancelled' and not (i.status = 'Draft' and i.archived_at is not null)) then
    raise exception 'QUOTE_ALREADY_INVOICED' using errcode = '23514';
  end if;
  if v_quote.start_date is not null and v_quote.term_months is not null
     and coalesce((select s.billing_plans_enabled from public.organization_settings s where s.organization_id = v_org), false)
     and not (v_quote.client_id is not null and exists (
       select 1 from public.clients c
       where c.id = v_quote.client_id and c.organization_id = v_org and c.archived_at is not null)) then
    v_plan := private.ensure_billing_plan(p_quote_id);
    select i.id into v_item from public.billing_plan_items i where i.plan_id = v_plan and i.month_number = 1;
    return private.build_plan_item_invoice(v_item);
  end if;

  begin
    insert into public.invoices (
      organization_id, client_id, client_name, owner_id, opportunity_id, quote_id, currency, status,
      project_name, project_description, project_ref, client_ref)
    values (
      v_org, v_quote.client_id, v_quote.client_name, v_quote.owner_id, v_quote.opportunity_id, v_quote.id, v_quote.currency, 'Draft',
      v_quote.project_name, v_quote.project_description, v_quote.project_ref, v_quote.client_ref)
    returning id into v_new;
  exception when unique_violation then
    raise exception 'FIRST_INVOICE_EXISTS' using errcode = '23514';
  end;

  insert into public.invoice_lines (organization_id, invoice_id, position, title, description, quantity, unit_price, vat_code)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code
  from public.quote_lines l
  where l.quote_id = p_quote_id and l.organization_id = v_org;

  insert into public.invoice_offerings (organization_id, invoice_id, position, offering_kind, offering_key)
  select o.organization_id, v_new, o.position, o.offering_kind, o.offering_key
  from public.quote_offerings o
  where o.quote_id = p_quote_id and o.organization_id = v_org;

  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_org, 'quote.invoiced', 'Draft invoice created from quote ' || v_quote.quote_number,
          jsonb_build_object('invoice_id', v_new, 'quote_id', p_quote_id, 'quote_number', v_quote.quote_number),
          public.activity_actor(v_org), p_quote_id);

  return v_new;
end $function$;

revoke all on function public.create_invoice_from_quote(uuid) from public, anon;
grant execute on function public.create_invoice_from_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A duplicate of a quote has no billing terms.
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
    terms, notes, project_name, project_description, project_ref, client_ref)
  values (
    v_src.organization_id, v_src.client_id, v_src.client_name, v_src.contact_name, v_src.lead_id, v_src.opportunity_id,
    v_src.owner_id, v_src.currency, 'Draft', v_src.terms, v_src.notes, v_src.project_name, v_src.project_description,
    v_src.project_ref, v_src.client_ref)
  returning id into v_new;
  insert into public.quote_lines (organization_id, quote_id, position, title, description, quantity, unit_price, vat_code, charge_kind)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code, l.charge_kind
  from public.quote_lines l
  where l.quote_id = p_id and l.organization_id = v_src.organization_id;
  return v_new;
end $$;

revoke all on function public.duplicate_quote(uuid) from public, anon;
grant execute on function public.duplicate_quote(uuid) to authenticated;
