-- Accept to invoice, stage 1, task 2, fix round 1: which invoices make the duplicate guard in create_invoice_from_quote refuse.
-- 20261026101000_billing_plan_invoices.sql treated any archived invoice as not live. A member can archive an invoice that has been
-- issued (archived_at is not among the columns an issued invoice freezes), so archiving an issued invoice would have let
-- Create invoice make a second live invoice for the same quote: the duplicate the guard exists to stop. The rule is now the one
-- build_plan_item_invoice already applies to a plan item: an invoice is live unless it is Cancelled, or it is a Draft that has
-- been archived (a discarded draft). Replaced from 20261026101000_billing_plan_invoices.sql; the only change is that predicate.
-- Append-only: earlier migrations are applied and are not edited.

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
