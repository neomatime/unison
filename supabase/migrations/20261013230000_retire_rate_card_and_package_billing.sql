-- Retires the HIMARK rate card and package billing (step 2 of
-- docs/superpowers/specs/2026-10-13-retire-rate-card-and-package-billing.md).
-- HIVE Origin now owns offerings, retainers and credits; UNISON reads HIVE's feed.
--
-- NOT APPLIED. This file is for review. It runs in one transaction, so it either
-- completes or changes nothing. Before running: take a Supabase backup (Dashboard >
-- Database > Backups) and read the "Rollback" section at the end.
--
-- What it does, in order:
--   0. Refuses to run if the data is not what was reviewed (see the checks below).
--   1. Copies everything it is about to change into schema retired_rate_card, including
--      the source of every function it drops.
--   2. Drops the rate lock, rate guard and billing-column guard triggers.
--   3. Turns the rate-locked lines on draft documents into ordinary lines.
--   4. Deletes the 28 rate card rows. Lines keep their text and prices; the link to the
--      price list row is cleared by the existing ON DELETE SET NULL.
--   5. Drops the package billing and rate card functions (no CASCADE: if something else
--      still depends on one, the migration stops).
--   6. Drops engagement_support and client_engagements (both empty) and the indexes and
--      foreign keys that pointed at them.
--
-- Deliberately NOT done here (step 3, once no code reads them): the columns
-- quotes/invoices.engagement_id, billing_kind, billing_month, quote_lines/invoice_lines
-- .rate_locked and .price_list_item_id, and the price_list_items table itself.
-- duplicate_quote() and create_invoice_from_quote() still copy those columns, so they
-- keep working unchanged until step 3 rewrites them.

begin;

-- 0. Safety checks -----------------------------------------------------------------
do $$
declare
  n bigint;
begin
  select count(*) into n from public.client_engagements;
  if n <> 0 then raise exception 'ABORT: client_engagements has % rows; expected 0', n; end if;

  select count(*) into n from public.engagement_support;
  if n <> 0 then raise exception 'ABORT: engagement_support has % rows; expected 0', n; end if;

  select count(*) into n from public.quotes where engagement_id is not null or billing_kind is not null;
  if n <> 0 then raise exception 'ABORT: % quotes carry billing links; expected 0', n; end if;

  select count(*) into n from public.invoices where engagement_id is not null or billing_kind is not null or billing_month is not null;
  if n <> 0 then raise exception 'ABORT: % invoices carry billing links; expected 0', n; end if;

  select count(*) into n from public.quote_lines l join public.quotes q on q.id = l.quote_id
    where l.rate_locked and q.status <> 'Draft';
  if n <> 0 then raise exception 'ABORT: % rate-locked quote lines sit on a quote that is not a draft', n; end if;

  select count(*) into n from public.invoice_lines l join public.invoices i on i.id = l.invoice_id
    where l.rate_locked and i.status <> 'Draft';
  if n <> 0 then raise exception 'ABORT: % rate-locked invoice lines sit on an invoice that is not a draft', n; end if;

  select count(*) into n from public.price_list_items where rate_key is null and archived_at is null;
  if n <> 0 then raise exception 'ABORT: % custom price list items exist; expected 0', n; end if;
end $$;

-- 1. Snapshot ----------------------------------------------------------------------
create schema retired_rate_card;
revoke all on schema retired_rate_card from public, anon, authenticated;

create table retired_rate_card.price_list_items as select * from public.price_list_items where rate_key is not null;
create table retired_rate_card.rate_locked_quote_lines as
  select id, quote_id, price_list_item_id, rate_locked from public.quote_lines where rate_locked or price_list_item_id is not null;
create table retired_rate_card.rate_locked_invoice_lines as
  select id, invoice_id, price_list_item_id, rate_locked from public.invoice_lines where rate_locked or price_list_item_id is not null;
create table retired_rate_card.client_engagements as select * from public.client_engagements;
create table retired_rate_card.engagement_support as select * from public.engagement_support;

create table retired_rate_card.function_definitions (signature text primary key, definition text not null);
insert into retired_rate_card.function_definitions (signature, definition)
select p.oid::regprocedure::text, pg_get_functiondef(p.oid)
from pg_proc p
where p.oid::regprocedure::text in (
  'add_proposed_support_line(text,uuid,text)',
  'add_rate_card_line(text,uuid,text,numeric)',
  'add_support_service(uuid,text,date)',
  'change_retainer_tier(uuid,text,date)',
  'create_first_document(uuid,text)',
  'create_monthly_invoice(uuid,date)',
  'create_top_up_invoice(uuid,numeric)',
  'discard_billing_draft(uuid)',
  'document_billing_columns_guard()',
  'document_lines_rate_lock()',
  'end_engagement(uuid,date)',
  'end_support_service(uuid,date)',
  'fill_document_from_package(text,uuid,text)',
  'price_list_items_rate_guard()',
  'set_client_package(uuid,text,date)',
  'private.add_rate_line(text,uuid,uuid,integer,price_list_items,numeric,text)',
  'private.client_engagements_initiative_limit()',
  'private.new_document(text,clients,uuid,text,date,text)',
  'private.rate_item(uuid,text)',
  'private.seed_rate_card(uuid)'
);
do $$
begin
  if (select count(*) from retired_rate_card.function_definitions) <> 20 then
    raise exception 'ABORT: expected 20 functions to snapshot, found %', (select count(*) from retired_rate_card.function_definitions);
  end if;
end $$;

-- 2. Triggers ----------------------------------------------------------------------
drop trigger quote_lines_rate_lock on public.quote_lines;
drop trigger invoice_lines_rate_lock on public.invoice_lines;
drop trigger price_list_items_rate_guard on public.price_list_items;
drop trigger quotes_billing_columns_guard on public.quotes;
drop trigger invoices_billing_columns_guard on public.invoices;

-- 3. Locked lines become ordinary lines (title, price and totals do not change) -------
update public.quote_lines set rate_locked = false where rate_locked;
update public.invoice_lines set rate_locked = false where rate_locked;

-- 4. Rate card rows ----------------------------------------------------------------
delete from public.price_list_items where rate_key is not null;

-- 5. Functions (public ones first: they call the private helpers) --------------------
drop function public.add_proposed_support_line(text, uuid, text);
drop function public.add_rate_card_line(text, uuid, text, numeric);
drop function public.add_support_service(uuid, text, date);
drop function public.change_retainer_tier(uuid, text, date);
drop function public.create_first_document(uuid, text);
drop function public.create_monthly_invoice(uuid, date);
drop function public.create_top_up_invoice(uuid, numeric);
drop function public.discard_billing_draft(uuid);
drop function public.end_engagement(uuid, date);
drop function public.end_support_service(uuid, date);
drop function public.fill_document_from_package(text, uuid, text);
drop function public.set_client_package(uuid, text, date);
drop function public.document_billing_columns_guard();
drop function public.document_lines_rate_lock();
drop function public.price_list_items_rate_guard();
drop function private.add_rate_line(text, uuid, uuid, integer, public.price_list_items, numeric, text);
drop function private.new_document(text, public.clients, uuid, text, date, text);
drop function private.rate_item(uuid, text);
drop function private.seed_rate_card(uuid);

-- 6. Engagement tables and what pointed at them --------------------------------------
alter table public.quotes drop constraint if exists quotes_engagement_id_organization_id_fkey;
alter table public.invoices drop constraint if exists invoices_engagement_id_organization_id_fkey;
drop index if exists public.quotes_engagement_idx;
drop index if exists public.invoices_engagement_idx;
drop index if exists public.invoices_one_first_per_engagement;
drop index if exists public.invoices_one_monthly_per_client_month;

drop table public.engagement_support;
drop table public.client_engagements;
drop function private.client_engagements_initiative_limit();

-- Afterwards, as a check, nothing may still depend on a dropped function ------------
do $$
declare
  n bigint;
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname in ('public', 'private')
      and p.prokind = 'f'
      and (p.prosrc ilike '%client_engagements%' or p.prosrc ilike '%engagement_support%'
        or p.prosrc ilike '%add_rate_line%' or p.prosrc ilike '%private.rate_item%' or p.prosrc ilike '%new_document(%');
  if n <> 0 then raise exception 'ABORT: % remaining functions still mention retired objects', n; end if;
end $$;

commit;

-- Rollback -------------------------------------------------------------------------
-- Everything above is in one transaction, so a failure leaves the database as it was.
-- After a successful run, the data and function bodies are in schema retired_rate_card:
--   * functions: run each `definition` from retired_rate_card.function_definitions;
--   * client_engagements / engagement_support: recreate from supabase/migrations
--     20261012110000 and 20261012111000, then insert from the snapshot copies (empty today);
--   * rate card rows: insert into public.price_list_items select * from
--     retired_rate_card.price_list_items;
--   * line links: update public.quote_lines / invoice_lines from the two snapshot tables.
-- A Supabase backup taken before running is the full-restore option.
