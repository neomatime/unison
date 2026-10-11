-- Pricing and credit model, part 3: building the documents from a client's package.
-- Quotes and invoices built here carry locked lines copied from the rate card. A retainer or project gets one first invoice
-- (unique index, a cancelled invoice frees the slot); a client gets one monthly invoice per month (same rule); top-ups can be
-- bought any number of times. The link columns are set only by these functions. Append-only.

-- ---------------------------------------------------------------------------
-- 1. Link columns on the documents.
--    The foreign keys to client_engagements are deferred to the end of the transaction. Deleting an organisation (or a
--    client) cascades to both the engagements and the documents; an immediate check would fire in the middle of the
--    cascade, when the engagements are already gone and the documents are not yet, and refuse the whole delete.
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column engagement_id uuid,
  add column billing_kind text,
  add column billing_month date;
alter table public.quotes
  add column engagement_id uuid,
  add column billing_kind text;

alter table public.invoices
  add constraint invoices_billing_kind_check check (billing_kind in ('first', 'monthly', 'top_up')),
  add constraint invoices_billing_shape check (
    (billing_kind is null and engagement_id is null and billing_month is null)
    or (billing_kind in ('first', 'top_up') and engagement_id is not null and billing_month is null)
    or (billing_kind = 'monthly' and engagement_id is null and billing_month is not null and extract(day from billing_month) = 1)
  ),
  add foreign key (engagement_id, organization_id) references public.client_engagements(id, organization_id) deferrable initially deferred;
alter table public.quotes
  add constraint quotes_billing_kind_check check (billing_kind = 'first'),
  add constraint quotes_billing_shape check ((billing_kind is null) = (engagement_id is null)),
  add foreign key (engagement_id, organization_id) references public.client_engagements(id, organization_id) deferrable initially deferred;

create unique index invoices_one_first_per_engagement on public.invoices(engagement_id)
  where billing_kind = 'first' and status <> 'Cancelled';
create unique index invoices_one_monthly_per_client_month on public.invoices(client_id, billing_month)
  where billing_kind = 'monthly' and status <> 'Cancelled';
create index invoices_engagement_idx on public.invoices(engagement_id) where engagement_id is not null;
create index quotes_engagement_idx on public.quotes(engagement_id) where engagement_id is not null;

-- A signed-in role never sets or changes the link; only the functions below (and the quote functions) do.
create or replace function public.document_billing_columns_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if v_new ->> 'engagement_id' is not null or v_new ->> 'billing_kind' is not null or v_new ->> 'billing_month' is not null then
        raise exception 'BILLING_COLUMNS_GENERATED' using errcode = '23514';
      end if;
    else
      v_old := to_jsonb(old);
      if (v_new ->> 'engagement_id') is distinct from (v_old ->> 'engagement_id')
         or (v_new ->> 'billing_kind') is distinct from (v_old ->> 'billing_kind')
         or (v_new ->> 'billing_month') is distinct from (v_old ->> 'billing_month') then
        raise exception 'BILLING_COLUMNS_GENERATED' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger invoices_billing_columns_guard before insert or update on public.invoices
  for each row execute function public.document_billing_columns_guard();
create trigger quotes_billing_columns_guard before insert or update on public.quotes
  for each row execute function public.document_billing_columns_guard();
revoke all on function public.document_billing_columns_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers: a new draft header, and a locked line copied from a rate card item.
-- ---------------------------------------------------------------------------
create or replace function private.new_document(
  p_kind text, p_client public.clients, p_engagement uuid, p_billing_kind text, p_month date, p_project_name text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_kind = 'invoice' then
    insert into public.invoices (organization_id, client_id, client_name, currency, status, engagement_id, billing_kind, billing_month, project_name)
    values (p_client.organization_id, p_client.id, p_client.name, 'ZAR', 'Draft', p_engagement, p_billing_kind, p_month, p_project_name)
    returning id into v_id;
  else
    insert into public.quotes (organization_id, client_id, client_name, currency, status, engagement_id, billing_kind, project_name)
    values (p_client.organization_id, p_client.id, p_client.name, 'ZAR', 'Draft', p_engagement, p_billing_kind, p_project_name)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function private.add_rate_line(
  p_kind text, p_doc uuid, p_org uuid, p_position integer, p_item public.price_list_items, p_quantity numeric, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_description text := nullif(concat_ws(' ', nullif(p_item.description, ''), p_note), '');
begin
  if p_kind = 'invoice' then
    insert into public.invoice_lines (organization_id, invoice_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id, rate_locked)
    values (p_org, p_doc, p_position, p_item.title, v_description, p_quantity, p_item.unit_price, p_item.vat_code, p_item.id, true);
  else
    insert into public.quote_lines (organization_id, quote_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id, rate_locked)
    values (p_org, p_doc, p_position, p_item.title, v_description, p_quantity, p_item.unit_price, p_item.vat_code, p_item.id, true);
  end if;
end $$;

revoke all on function private.new_document(text, public.clients, uuid, text, date, text) from public, anon, authenticated;
revoke all on function private.add_rate_line(text, uuid, uuid, integer, public.price_list_items, numeric, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The first invoice (or quote) of a retainer or project.
--    Retainer: the monthly fee and the one-time implementation fee. Project: the project fee. A retainer that replaced an
--    earlier tier never gets an implementation fee: the first retainer's first invoice stands for the whole chain.
-- ---------------------------------------------------------------------------
create or replace function public.create_first_document(p_engagement uuid, p_kind text default 'invoice') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.client_engagements%rowtype;
  v_client public.clients%rowtype;
  v_main public.price_list_items%rowtype;
  v_impl public.price_list_items%rowtype;
  v_doc uuid;
begin
  if p_kind not in ('invoice', 'quote') then
    raise exception 'DOCUMENT_KIND_UNKNOWN' using errcode = '22023';
  end if;
  select * into v_e from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_e.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  if v_e.ended_on is not null then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;
  if v_e.kind = 'retainer' and v_e.replaces_id is not null then
    raise exception 'IMPLEMENTATION_ALREADY_BILLED' using errcode = '23514';
  end if;
  select * into v_client from public.clients where id = v_e.client_id for update;
  if p_kind = 'invoice' and exists (
    select 1 from public.invoices i where i.engagement_id = p_engagement and i.billing_kind = 'first' and i.status <> 'Cancelled'
  ) then
    raise exception 'FIRST_INVOICE_EXISTS' using errcode = '23514';
  end if;

  begin
    if v_e.kind = 'retainer' then
      v_main := private.rate_item(v_e.organization_id, 'retainer.' || v_e.package_key || '.monthly');
      v_impl := private.rate_item(v_e.organization_id, 'retainer.' || v_e.package_key || '.implementation');
      v_doc := private.new_document(p_kind, v_client, p_engagement, 'first', null, v_main.title);
      perform private.add_rate_line(p_kind, v_doc, v_e.organization_id, 1, v_main, 1);
      perform private.add_rate_line(p_kind, v_doc, v_e.organization_id, 2, v_impl, 1);
    else
      v_main := private.rate_item(v_e.organization_id, 'project.' || v_e.package_key);
      v_doc := private.new_document(p_kind, v_client, p_engagement, 'first', null, v_main.title);
      perform private.add_rate_line(p_kind, v_doc, v_e.organization_id, 1, v_main, 1);
    end if;
  exception when unique_violation then
    raise exception 'FIRST_INVOICE_EXISTS' using errcode = '23514';
  end;

  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_e.organization_id, 'billing.document_built', 'Draft ' || p_kind || ' built: first ' || p_kind || ' for ' || v_main.title,
          jsonb_build_object('document_id', v_doc, 'document_kind', p_kind, 'billing_kind', 'first', 'engagement_id', p_engagement),
          public.activity_actor(v_e.organization_id), v_e.client_id);
  return v_doc;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A client's monthly invoice: the retainer's monthly fee (the tier in force on the last day of the month, from the month
--    after the retainer chain started, once its first invoice exists) and every support service running at any time in the
--    month. No proration. One per client per month; a cancelled one frees the month.
-- ---------------------------------------------------------------------------
create or replace function public.create_monthly_invoice(p_client uuid, p_month date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients%rowtype;
  v_month date := private.month_start(coalesce(p_month, private.sa_today()));
  v_end date;
  v_ret public.client_engagements%rowtype;
  v_root_start date;
  v_has_ret boolean := false;
  v_support integer;
  v_item public.price_list_items%rowtype;
  v_doc uuid;
  v_pos integer := 0;
  v_svc record;
begin
  select * into v_client from public.clients where id = p_client;
  if not found or not public.is_member_of(v_client.organization_id) or v_client.archived_at is not null then
    raise exception 'CLIENT_NOT_FOUND' using errcode = '42501';
  end if;
  if v_month > private.month_start(private.sa_today()) or v_month < date '2020-01-01' then
    raise exception 'BILLING_MONTH_INVALID' using errcode = '23514';
  end if;
  v_end := (v_month + interval '1 month' - interval '1 day')::date;
  perform 1 from public.clients where id = p_client for update;

  if exists (
    select 1 from public.invoices i where i.client_id = p_client and i.billing_kind = 'monthly' and i.billing_month = v_month and i.status <> 'Cancelled'
  ) then
    raise exception 'MONTH_ALREADY_BILLED' using errcode = '23514';
  end if;

  select * into v_ret from public.client_engagements e
  where e.client_id = p_client and e.kind = 'retainer' and e.start_date <= v_end and (e.ended_on is null or e.ended_on >= v_end)
  order by e.start_date desc limit 1;
  if found then
    select r.start_date into v_root_start from public.client_engagements r where r.id = v_ret.root_id;
    if v_month > private.month_start(v_root_start) then
      if not exists (
        select 1 from public.invoices i where i.engagement_id = v_ret.root_id and i.billing_kind = 'first' and i.status <> 'Cancelled'
      ) then
        raise exception 'FIRST_INVOICE_MISSING' using errcode = '23514';
      end if;
      v_has_ret := true;
    end if;
  end if;

  select count(*) into v_support
  from public.engagement_support s join public.client_engagements e on e.id = s.engagement_id
  where e.client_id = p_client and s.start_date <= v_end and (s.ended_on is null or s.ended_on >= v_month);
  if not v_has_ret and v_support = 0 then
    raise exception 'NOTHING_TO_BILL' using errcode = '23514';
  end if;

  begin
    v_doc := private.new_document('invoice', v_client, null, 'monthly', v_month, null);
    if v_has_ret then
      v_item := private.rate_item(v_client.organization_id, 'retainer.' || v_ret.package_key || '.monthly');
      v_pos := v_pos + 1;
      perform private.add_rate_line('invoice', v_doc, v_client.organization_id, v_pos, v_item, 1);
    end if;
    for v_svc in
      select s.service_key
      from public.engagement_support s join public.client_engagements e on e.id = s.engagement_id
      where e.client_id = p_client and s.start_date <= v_end and (s.ended_on is null or s.ended_on >= v_month)
      order by s.start_date, s.service_key
    loop
      v_item := private.rate_item(v_client.organization_id, v_svc.service_key);
      v_pos := v_pos + 1;
      perform private.add_rate_line('invoice', v_doc, v_client.organization_id, v_pos, v_item, 1);
    end loop;
  exception when unique_violation then
    raise exception 'MONTH_ALREADY_BILLED' using errcode = '23514';
  end;

  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_client.organization_id, 'billing.document_built', 'Draft invoice built: monthly invoice for ' || to_char(v_month, 'FMMonth YYYY'),
          jsonb_build_object('document_id', v_doc, 'document_kind', 'invoice', 'billing_kind', 'monthly', 'billing_month', v_month),
          public.activity_actor(v_client.organization_id), p_client);
  return v_doc;
end $$;

-- ---------------------------------------------------------------------------
-- 5. A top-up: extra credits at the rate of the engagement's tier (retainer) or the project rate. Any number of times.
-- ---------------------------------------------------------------------------
create or replace function public.create_top_up_invoice(p_engagement uuid, p_credits numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.client_engagements%rowtype;
  v_client public.clients%rowtype;
  v_item public.price_list_items%rowtype;
  v_doc uuid;
begin
  if p_credits is null or p_credits < 1 or p_credits > 10000 or p_credits <> trunc(p_credits) then
    raise exception 'TOP_UP_CREDITS_INVALID' using errcode = '23514';
  end if;
  select * into v_e from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_e.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  if v_e.ended_on is not null then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;
  select * into v_client from public.clients where id = v_e.client_id;
  if v_e.kind = 'retainer' then
    v_item := private.rate_item(v_e.organization_id, 'retainer.' || v_e.package_key || '.top_up');
  else
    v_item := private.rate_item(v_e.organization_id, 'project.top_up');
  end if;
  v_doc := private.new_document('invoice', v_client, p_engagement, 'top_up', null, v_item.title);
  perform private.add_rate_line('invoice', v_doc, v_e.organization_id, 1, v_item, p_credits);
  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_e.organization_id, 'billing.document_built', 'Draft invoice built: top-up of ' || p_credits::text || ' credits',
          jsonb_build_object('document_id', v_doc, 'document_kind', 'invoice', 'billing_kind', 'top_up', 'engagement_id', p_engagement, 'credits', p_credits),
          public.activity_actor(v_e.organization_id), v_e.client_id);
  return v_doc;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Quote to invoice and duplicate keep the lock and the link. create_invoice_from_quote is the version from
--    20261011130000_documents_delivery.sql plus rate_locked and the link; a quote's first-invoice link is refused when the
--    engagement already has a first invoice. duplicate_quote becomes a definer function (a signed-in role cannot create a
--    locked line itself) with the same membership check.
-- ---------------------------------------------------------------------------
create or replace function public.create_invoice_from_quote(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_quote public.quotes%rowtype;
  v_new uuid;
begin
  select q.organization_id into v_org from public.quotes q where q.id = p_quote_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  -- The row lock serialises two simultaneous calls on the same quote and stops a status change in between.
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
      project_name, project_description, project_ref, client_ref, engagement_id, billing_kind)
    values (
      v_org, v_quote.client_id, v_quote.client_name, v_quote.owner_id, v_quote.opportunity_id, v_quote.id, v_quote.currency, 'Draft',
      v_quote.project_name, v_quote.project_description, v_quote.project_ref, v_quote.client_ref, v_quote.engagement_id, v_quote.billing_kind)
    returning id into v_new;
  exception when unique_violation then
    raise exception 'FIRST_INVOICE_EXISTS' using errcode = '23514';
  end;

  insert into public.invoice_lines (organization_id, invoice_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id, rate_locked)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code, l.price_list_item_id, l.rate_locked
  from public.quote_lines l
  where l.quote_id = p_quote_id and l.organization_id = v_org;

  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_org, 'quote.invoiced', 'Draft invoice created from quote ' || v_quote.quote_number,
          jsonb_build_object('invoice_id', v_new, 'quote_id', p_quote_id, 'quote_number', v_quote.quote_number),
          public.activity_actor(v_org), p_quote_id);

  return v_new;
end $$;

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
    terms, notes, project_name, project_description, project_ref, client_ref, engagement_id, billing_kind)
  values (
    v_src.organization_id, v_src.client_id, v_src.client_name, v_src.contact_name, v_src.lead_id, v_src.opportunity_id,
    v_src.owner_id, v_src.currency, 'Draft', v_src.terms, v_src.notes, v_src.project_name, v_src.project_description,
    v_src.project_ref, v_src.client_ref, v_src.engagement_id, v_src.billing_kind)
  returning id into v_new;
  insert into public.quote_lines (organization_id, quote_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id, rate_locked)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code, l.price_list_item_id, l.rate_locked
  from public.quote_lines l
  where l.quote_id = p_id and l.organization_id = v_src.organization_id;
  return v_new;
end $$;

revoke all on function public.create_first_document(uuid, text) from public, anon;
revoke all on function public.create_monthly_invoice(uuid, date) from public, anon;
revoke all on function public.create_top_up_invoice(uuid, numeric) from public, anon;
revoke all on function public.create_invoice_from_quote(uuid) from public, anon;
revoke all on function public.duplicate_quote(uuid) from public, anon;
grant execute on function public.create_first_document(uuid, text) to authenticated;
grant execute on function public.create_monthly_invoice(uuid, date) to authenticated;
grant execute on function public.create_top_up_invoice(uuid, numeric) to authenticated;
grant execute on function public.create_invoice_from_quote(uuid) to authenticated;
grant execute on function public.duplicate_quote(uuid) to authenticated;
