-- Step 3 of docs/superpowers/specs/2026-10-13-retire-rate-card-and-package-billing.md:
-- drops what step 2 (20261013230000_retire_rate_card_and_package_billing.sql) left behind
-- because two live functions still copied it.
--
-- NOT APPLIED. For review. Run ONLY after step 2 has been applied and the app code that stops
-- reading and writing these columns is deployed (it is, from the same PR). One transaction.
--
--   * duplicate_quote() and create_invoice_from_quote() are rewritten without the retired
--     columns (everything else in them is unchanged, including grants and search_path).
--   * quotes/invoices: engagement_id, billing_kind, billing_month are dropped.
--   * quote_lines/invoice_lines: price_list_item_id (with its foreign key and index) and
--     rate_locked are dropped.
--   * the price_list_items table (empty after step 2) is dropped.
--
-- After applying, regenerate types/database.ts (Supabase generate_typescript_types).

begin;

-- Safety checks: step 2 is applied and nothing is left to lose ---------------------------
do $$
declare
  n bigint;
begin
  if to_regclass('public.client_engagements') is not null or to_regprocedure('public.add_rate_card_line(text,uuid,text,numeric)') is not null then
    raise exception 'ABORT: step 2 (20261013230000) has not been applied';
  end if;
  if to_regclass('retired_rate_card.price_list_items') is null then
    raise exception 'ABORT: the step 2 snapshot schema retired_rate_card is missing';
  end if;

  select count(*) into n from public.price_list_items;
  if n <> 0 then raise exception 'ABORT: price_list_items still has % rows', n; end if;

  select count(*) into n from public.quote_lines where price_list_item_id is not null or rate_locked;
  if n <> 0 then raise exception 'ABORT: % quote lines still carry a price list link or lock', n; end if;

  select count(*) into n from public.invoice_lines where price_list_item_id is not null or rate_locked;
  if n <> 0 then raise exception 'ABORT: % invoice lines still carry a price list link or lock', n; end if;

  select count(*) into n from public.quotes where engagement_id is not null or billing_kind is not null;
  if n <> 0 then raise exception 'ABORT: % quotes still carry billing links', n; end if;

  select count(*) into n from public.invoices where engagement_id is not null or billing_kind is not null or billing_month is not null;
  if n <> 0 then raise exception 'ABORT: % invoices still carry billing links', n; end if;
end $$;

-- Keep the definitions that are about to be replaced, next to the step 2 snapshot ---------
insert into retired_rate_card.function_definitions (signature, definition)
select p.oid::regprocedure::text || ' (before step 3)', pg_get_functiondef(p.oid)
from pg_proc p
where p.oid::regprocedure::text in ('duplicate_quote(uuid)', 'create_invoice_from_quote(uuid)');

-- The two functions, without the retired columns -----------------------------------------
create or replace function public.duplicate_quote(p_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  insert into public.quote_lines (organization_id, quote_id, position, title, description, quantity, unit_price, vat_code)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code
  from public.quote_lines l
  where l.quote_id = p_id and l.organization_id = v_src.organization_id;
  return v_new;
end $function$;

create or replace function public.create_invoice_from_quote(p_quote_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_org uuid;
  v_quote public.quotes%rowtype;
  v_new uuid;
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

-- Columns (dropping price_list_item_id also drops its foreign key and index) ---------------
alter table public.quotes drop column engagement_id, drop column billing_kind;
alter table public.invoices drop column engagement_id, drop column billing_kind, drop column billing_month;
alter table public.quote_lines drop column price_list_item_id, drop column rate_locked;
alter table public.invoice_lines drop column price_list_item_id, drop column rate_locked;

-- The price list (empty) -------------------------------------------------------------------
drop table public.price_list_items;

commit;

-- Rollback --------------------------------------------------------------------------------
-- One transaction: a failure leaves everything as it was. After a successful run:
--   * the two functions' previous definitions are in retired_rate_card.function_definitions
--     (signatures ending "(before step 3)");
--   * the dropped columns held no data (checked above); re-add them from migrations
--     20261012100000 to 20261012141000 if ever needed;
--   * price_list_items' 28 rows are in retired_rate_card.price_list_items.
-- A Supabase backup taken before step 2 is the full-restore option.
