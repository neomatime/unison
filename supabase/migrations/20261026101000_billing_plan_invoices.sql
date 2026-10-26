-- Accept to invoice, stage 1, task 2: building a plan and its invoices. Functions only, plus one constraint pair on the plan
-- tables. Nothing here changes behaviour while the switch (organization_settings.billing_plans_enabled, default false) is off,
-- with one exception on purpose: create_invoice_from_quote no longer makes a second live invoice for the same quote.
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. An item's quote is its plan's quote: billing_plans gains unique (id, quote_id) and billing_plan_items a composite foreign
--    key to it, so no item can name a quote other than the one its plan belongs to. The tables are empty when this runs.
-- 2. private.ensure_billing_plan(quote): the plan and its items, built once whatever races (insert ... on conflict do nothing).
-- 3. private.build_plan_item_invoice(item): one Draft invoice for one item, copied from the accepted quote's lines. An item is
--    invoiced once: the item row is locked, an archived Draft lets the item go, and anything else still linked refuses.
-- 4. public.create_plan_item_invoice(item): the per-month button, for a member of the item's organisation.
-- 5. public.create_invoice_from_quote(quote): replaced from 20261013240000_drop_retired_billing_columns.sql. The checks and the
--    copy are unchanged; between the status checks and the copy (under the same row lock) it now refuses a quote that has a
--    plan or a live invoice, and, with the switch on and terms on the quote, builds the plan and returns the first invoice.
--
-- Money is never typed or recomputed here: every invoice line is a copy of a quote line, and the totals and the VAT come from
-- the triggers that already work them out. Dates are South African days.

-- ---------------------------------------------------------------------------
-- 1. An item belongs to its plan's quote.
-- ---------------------------------------------------------------------------
alter table public.billing_plans add constraint billing_plans_id_quote_id_key unique (id, quote_id);
alter table public.billing_plan_items add constraint billing_plan_items_plan_id_quote_id_fkey
  foreign key (plan_id, quote_id) references public.billing_plans (id, quote_id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 2. The plan and its items. Item 1 is the first invoice, billed on the day the plan is built; items 2 to term_months are the
--    monthly ones, each dated start_date plus (n - 1) months counted from the start date (never chained, so a start on the 31st
--    gives 28 or 29 February, then 31 March, then 30 April), and only when the quote has a monthly line and terms. The plan is
--    inserted on conflict do nothing, so a plan that exists is returned as it is. Called by definer functions that hold the
--    quote's row lock or are otherwise serialised by the unique keys; there is no way to call it from the API.
-- ---------------------------------------------------------------------------
create or replace function private.ensure_billing_plan(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_quote public.quotes%rowtype;
  v_plan uuid;
  v_created boolean := false;
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  select * into v_quote from public.quotes q where q.id = p_quote_id;
  if not found or v_quote.status <> 'Accepted' or v_quote.archived_at is not null or v_quote.client_id is null then
    raise exception 'BILLING_QUOTE_NOT_ELIGIBLE' using errcode = '23514';
  end if;

  insert into public.billing_plans (organization_id, quote_id, client_id, start_date, term_months)
  values (v_quote.organization_id, v_quote.id, v_quote.client_id, v_quote.start_date, v_quote.term_months)
  on conflict (quote_id) do nothing
  returning id into v_plan;
  if v_plan is null then
    -- Someone else built it (or this transaction did earlier): use theirs.
    select p.id into v_plan from public.billing_plans p where p.quote_id = p_quote_id;
  else
    v_created := true;
  end if;

  insert into public.billing_plan_items (organization_id, plan_id, quote_id, month_number, kind, bill_on)
  values (v_quote.organization_id, v_plan, v_quote.id, 1, 'first', v_today)
  on conflict (quote_id, month_number) do nothing;

  if v_quote.start_date is not null and v_quote.term_months is not null and v_quote.term_months >= 2
     and exists (
       select 1 from public.quote_lines l
       where l.quote_id = v_quote.id and l.organization_id = v_quote.organization_id and l.charge_kind = 'monthly') then
    insert into public.billing_plan_items (organization_id, plan_id, quote_id, month_number, kind, bill_on)
    select v_quote.organization_id, v_plan, v_quote.id, n, 'monthly', (v_quote.start_date + make_interval(months => n - 1))::date
    from generate_series(2, v_quote.term_months::integer) as n
    on conflict (quote_id, month_number) do nothing;
  end if;

  if v_created then
    insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
    values (v_quote.organization_id, 'billing.plan_created', 'Billing plan created for quote ' || v_quote.quote_number,
            jsonb_build_object('plan_id', v_plan, 'quote_id', v_quote.id, 'quote_number', v_quote.quote_number,
                               'start_date', v_quote.start_date, 'term_months', v_quote.term_months),
            public.activity_actor(v_quote.organization_id), v_quote.id);
  end if;

  return v_plan;
end $$;

revoke all on function private.ensure_billing_plan(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. One Draft invoice for one item. The item row is locked first, so two callers for the same month are served one after the
--    other and the second finds the first one's invoice. Archived Drafts are let go (their link is cleared, never the invoice)
--    and the month is free again; any other invoice still linked, a Cancelled one included, keeps the month. The header is the
--    one create_invoice_from_quote makes. The first item carries every quote line; a monthly item only the monthly lines (a line
--    with no kind is once-off). The offerings come with either. due_date is left empty.
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

  update public.invoices i set billing_plan_item_id = null
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
-- 4. The per-month button. A caller who is not a member of the item's organisation, and a caller asking for an item that does
--    not exist, get the same answer. The quote's row lock comes before the item's (build_plan_item_invoice takes it), the same
--    order create_invoice_from_quote uses, so two callers wait for each other in turn and never deadlock. The item and its plan are read again under the
--    lock, and the checks that build_plan_item_invoice repeats are made here first so the answer names the most useful reason
--    (a cancelled month is "cancelled" even before its day, a paused plan is "paused" before "not due").
-- ---------------------------------------------------------------------------
create or replace function public.create_plan_item_invoice(p_item_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.billing_plan_items%rowtype;
  v_quote public.quotes%rowtype;
  v_plan_status text;
begin
  select * into v_item from public.billing_plan_items i where i.id = p_item_id;
  if not found or not public.is_member_of(v_item.organization_id) then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;
  if not coalesce((select s.billing_plans_enabled from public.organization_settings s where s.organization_id = v_item.organization_id), false) then
    raise exception 'BILLING_NOT_ENABLED' using errcode = '23514';
  end if;

  select * into v_quote from public.quotes q where q.id = v_item.quote_id for update;
  if not found then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;
  if v_quote.archived_at is not null then
    raise exception 'QUOTE_ARCHIVED' using errcode = '23514';
  end if;
  if v_quote.status <> 'Accepted' then
    raise exception 'QUOTE_NOT_ACCEPTED' using errcode = '23514';
  end if;

  select * into v_item from public.billing_plan_items i where i.id = p_item_id;
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
  if v_item.kind = 'monthly' and v_item.bill_on > (now() at time zone 'Africa/Johannesburg')::date then
    raise exception 'BILLING_ITEM_NOT_DUE' using errcode = '23514';
  end if;

  return private.build_plan_item_invoice(p_item_id);
end $$;

revoke all on function public.create_plan_item_invoice(uuid) from public, anon;
grant execute on function public.create_plan_item_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. create_invoice_from_quote: the body of 20261013240000_drop_retired_billing_columns.sql, unchanged except for the block
--    between the status checks and the copy. A quote that has a plan is billed through it (QUOTE_HAS_BILLING_PLAN, whatever the
--    switch says now); otherwise a quote that already has a live invoice (not Cancelled, not archived) gets no second one
--    (QUOTE_ALREADY_INVOICED); otherwise, with the switch on and terms on the quote, the plan is built and item 1's invoice is
--    returned; otherwise the copy below is the one it always was, with no plan.
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
    where i.quote_id = p_quote_id and i.organization_id = v_org and i.status <> 'Cancelled' and i.archived_at is null) then
    raise exception 'QUOTE_ALREADY_INVOICED' using errcode = '23514';
  end if;
  if v_quote.start_date is not null and v_quote.term_months is not null
     and coalesce((select s.billing_plans_enabled from public.organization_settings s where s.organization_id = v_org), false) then
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
