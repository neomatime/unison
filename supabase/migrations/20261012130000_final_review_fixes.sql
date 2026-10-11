-- Pricing and credit model: fixes from the final review. Append-only: the six 20261012* migrations before this one are
-- already applied.
-- 1. The first invoice (or first quote) of a retainer chain is always built from the chain ROOT's tier, whichever engagement
--    of the chain is called: the first retainer's implementation fee stands for the whole chain, and a tier change bills no
--    new implementation fee, so an upgrade or downgrade made before the first invoice does not change it (Ruling 9).
-- 2. A retainer is billed for a month if it was in force at any time in that month, like a support service, with no
--    proration; among the retainers that overlap the month and whose chain started in an earlier month, the latest start is
--    billed (a tier change inside the month bills the later tier; an old retainer that ended in the month a new chain
--    started is still billed for it) (Ruling 8).
-- 3. A support service that starts after its project ended is never billed, and ending a project removes the support
--    services that have not started by the end date.
-- 4. discard_billing_draft: a member deletes a draft built from a client package (members have no delete grant on
--    invoices), which frees its first-invoice slot or its month.
-- 5. A rate card item cannot be archived (or restored) by a signed-in role at all, and its VAT code is fixed (Ruling 7).
-- 6. The currency of a document built from a package is fixed for a signed-in role, like its client.
-- Same signatures and grants as before for the re-created functions (create or replace keeps them); restated for clarity.

-- ---------------------------------------------------------------------------
-- 1. The first document: the root's tier. Re-created from 20261012121000_billing_documents_hardening.sql; only the tier read
--    for a retainer changes (a project is its own root).
-- ---------------------------------------------------------------------------
create or replace function public.create_first_document(p_engagement uuid, p_kind text default 'invoice') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.client_engagements%rowtype;
  v_client public.clients%rowtype;
  v_main public.price_list_items%rowtype;
  v_impl public.price_list_items%rowtype;
  v_doc uuid;
  v_ended boolean;
  v_root_tier text;
begin
  if p_kind not in ('invoice', 'quote') then
    raise exception 'DOCUMENT_KIND_UNKNOWN' using errcode = '22023';
  end if;
  select * into v_e from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_e.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_client from public.clients where id = v_e.client_id for update;
  if not found or v_client.archived_at is not null then
    raise exception 'CLIENT_NOT_FOUND' using errcode = '42501';
  end if;
  -- Read again under the client lock, so a tier change or an end that was in progress is seen.
  select * into v_e from public.client_engagements where id = p_engagement;
  if not found then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  v_ended := v_e.ended_on is not null and v_e.ended_on < private.sa_today();
  if v_e.kind = 'project' and v_ended then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;
  -- The slot is the chain's: the root's id is on the first invoice whichever engagement of the chain built it. Quotes never occupy it.
  if p_kind = 'invoice' and exists (
    select 1 from public.invoices i where i.engagement_id = v_e.root_id and i.billing_kind = 'first' and i.status <> 'Cancelled'
  ) then
    if v_e.replaces_id is not null then
      raise exception 'IMPLEMENTATION_ALREADY_BILLED' using errcode = '23514';
    end if;
    raise exception 'FIRST_INVOICE_EXISTS' using errcode = '23514';
  end if;
  if v_ended then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;

  begin
    if v_e.kind = 'retainer' then
      -- The chain's first invoice is the first retainer's: its tier, whichever engagement of the chain is called.
      select r.package_key into v_root_tier from public.client_engagements r where r.id = v_e.root_id;
      v_main := private.rate_item(v_e.organization_id, 'retainer.' || v_root_tier || '.monthly');
      v_impl := private.rate_item(v_e.organization_id, 'retainer.' || v_root_tier || '.implementation');
      v_doc := private.new_document(p_kind, v_client, v_e.root_id, 'first', null, v_main.title);
      perform private.add_rate_line(p_kind, v_doc, v_e.organization_id, 1, v_main, 1);
      perform private.add_rate_line(p_kind, v_doc, v_e.organization_id, 2, v_impl, 1);
    else
      v_main := private.rate_item(v_e.organization_id, 'project.' || v_e.package_key);
      v_doc := private.new_document(p_kind, v_client, v_e.root_id, 'first', null, v_main.title);
      perform private.add_rate_line(p_kind, v_doc, v_e.organization_id, 1, v_main, 1);
    end if;
  exception when unique_violation then
    raise exception 'FIRST_INVOICE_EXISTS' using errcode = '23514';
  end;

  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_e.organization_id, 'billing.document_built', 'Draft ' || p_kind || ' built: first ' || p_kind || ' for ' || v_main.title,
          jsonb_build_object('document_id', v_doc, 'document_kind', p_kind, 'billing_kind', 'first', 'engagement_id', v_e.root_id, 'built_through', p_engagement),
          public.activity_actor(v_e.organization_id), v_e.client_id);
  return v_doc;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The monthly invoice. Re-created from 20261012120000_billing_documents.sql; changed: the retainer is the latest-start
--    one that overlaps the month and whose chain started before the month, and a support service is billed only if it
--    started by the end of its project.
-- ---------------------------------------------------------------------------
create or replace function public.create_monthly_invoice(p_client uuid, p_month date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients%rowtype;
  v_month date := private.month_start(coalesce(p_month, private.sa_today()));
  v_end date;
  v_ret public.client_engagements%rowtype;
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

  -- In force at any time in the month, and eligible: its chain started in an earlier month (a chain's first month is
  -- covered by its first invoice). Among those, the latest start: after a tier change inside the month, the tier in force
  -- on its last day; when an old retainer ended in the month and a new chain started in it, the old one (the new chain's
  -- first month is its first invoice's).
  select e.* into v_ret from public.client_engagements e
  join public.client_engagements r on r.id = e.root_id
  where e.client_id = p_client and e.kind = 'retainer' and e.start_date <= v_end and (e.ended_on is null or e.ended_on >= v_month)
    and private.month_start(r.start_date) < v_month
  order by e.start_date desc limit 1;
  if found then
    if not exists (
      select 1 from public.invoices i where i.engagement_id = v_ret.root_id and i.billing_kind = 'first' and i.status <> 'Cancelled'
    ) then
      raise exception 'FIRST_INVOICE_MISSING' using errcode = '23514';
    end if;
    v_has_ret := true;
  end if;

  select count(*) into v_support
  from public.engagement_support s join public.client_engagements e on e.id = s.engagement_id
  where e.client_id = p_client and s.start_date <= v_end and (s.ended_on is null or s.ended_on >= v_month)
    and s.start_date <= coalesce(e.ended_on, v_end);
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
        and s.start_date <= coalesce(e.ended_on, v_end)
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
-- 3. Ending an engagement. Re-created from 20261012111000_client_engagements_hardening.sql; added: a support service that
--    has not started by the end date is removed (it never ran, so it is never billed), the others end on the end date.
-- ---------------------------------------------------------------------------
create or replace function public.end_engagement(p_engagement uuid, p_ended_on date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.client_engagements%rowtype;
  v_end date := coalesce(p_ended_on, private.sa_today());
begin
  select * into v_e from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_e.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_e from public.client_engagements where id = p_engagement for update;
  if v_e.ended_on is not null then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;
  if v_end < v_e.start_date or v_end > private.sa_today() then
    raise exception 'PACKAGE_END_INVALID' using errcode = '23514';
  end if;
  update public.client_engagements set ended_on = v_end where id = p_engagement;
  delete from public.engagement_support where engagement_id = p_engagement and ended_on is null and start_date > v_end;
  update public.engagement_support set ended_on = greatest(start_date, v_end) where engagement_id = p_engagement and ended_on is null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Discard a draft built from a client package. Only a draft (nothing issued, sent or cancelled) and only one with a
--    billing link; a hand-made draft is deleted the usual way. The lines go with it (on delete cascade), and the first-invoice
--    slot or the month is free again because the row is gone.
-- ---------------------------------------------------------------------------
create or replace function public.discard_billing_draft(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices%rowtype;
begin
  select * into v_inv from public.invoices where id = p_invoice;
  if not found or not public.is_member_of(v_inv.organization_id) then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  -- Locked, so it cannot be issued while it is being discarded.
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_inv.status <> 'Draft' or v_inv.billing_kind is null then
    raise exception 'BILLING_DRAFT_ONLY' using errcode = '23514';
  end if;
  delete from public.invoices where id = p_invoice;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The rate card guard. Re-created from 20261012101000_rate_card_hardening.sql; added: a rate card item's archived_at is
--    not changed by a signed-in role (RATE_CARD_NOT_ARCHIVABLE, before the owner/admin check), and its vat_code is fixed.
--    Custom items (no rate_key) behave exactly as before.
-- ---------------------------------------------------------------------------
create or replace function public.price_list_items_rate_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.rate_key is not null or new.item_kind is not null or new.package_key is not null or new.credits is not null
         or new.rate_status is not null or new.initiative_limit is not null then
        raise exception 'RATE_CARD_FIXED' using errcode = '23514';
      end if;
    else
      if new.rate_key is distinct from old.rate_key or new.item_kind is distinct from old.item_kind
         or new.package_key is distinct from old.package_key or new.credits is distinct from old.credits
         or new.rate_status is distinct from old.rate_status
         or (old.rate_key is not null and new.organization_id is distinct from old.organization_id)
         or (old.rate_key is not null and new.vat_code is distinct from old.vat_code) then
        raise exception 'RATE_CARD_FIXED' using errcode = '23514';
      end if;
      if old.rate_key is not null then
        if new.archived_at is distinct from old.archived_at then
          raise exception 'RATE_CARD_NOT_ARCHIVABLE' using errcode = '23514';
        end if;
        if not public.has_role(old.organization_id, array['owner', 'admin']) then
          raise exception 'RATE_CARD_ADMIN_ONLY' using errcode = '23514';
        end if;
      elsif new.initiative_limit is distinct from old.initiative_limit then
        raise exception 'RATE_CARD_FIXED' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 6. The link columns guard. Re-created from 20261012121000_billing_documents_hardening.sql; added: the currency of a
--    linked document is fixed, beside its client.
-- ---------------------------------------------------------------------------
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
         or (v_new ->> 'billing_month') is distinct from (v_old ->> 'billing_month')
         or (v_old ->> 'billing_kind' is not null and (v_new ->> 'client_id') is distinct from (v_old ->> 'client_id'))
         or (v_old ->> 'billing_kind' is not null and (v_new ->> 'currency') is distinct from (v_old ->> 'currency')) then
        raise exception 'BILLING_COLUMNS_GENERATED' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;

revoke all on function public.price_list_items_rate_guard() from public, anon, authenticated;
revoke all on function public.document_billing_columns_guard() from public, anon, authenticated;
revoke all on function public.create_first_document(uuid, text) from public, anon;
revoke all on function public.create_monthly_invoice(uuid, date) from public, anon;
revoke all on function public.end_engagement(uuid, date) from public, anon;
revoke all on function public.discard_billing_draft(uuid) from public, anon;
grant execute on function public.create_first_document(uuid, text) to authenticated;
grant execute on function public.create_monthly_invoice(uuid, date) to authenticated;
grant execute on function public.end_engagement(uuid, date) to authenticated;
grant execute on function public.discard_billing_draft(uuid) to authenticated;
