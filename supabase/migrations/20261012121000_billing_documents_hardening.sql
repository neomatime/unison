-- Pricing and credit model, part 3 hardening (review round 1). Append-only: 20261012120000_billing_documents.sql is already applied.
-- 1. "Ended" means ended before today. A scheduled tier change gives the retainer in force a future end date; it is still in
--    force today and can still be billed.
-- 2. The first invoice (or first quote) of a retainer chain can be built through any engagement of the chain, the root or a
--    successor, because a tier change does not need a first invoice. It is built with the called engagement's tier but linked
--    to the chain's root, so the once-only index covers the whole chain and the monthly invoice finds it by the root. A
--    successor is refused only when the chain's first invoice already exists (IMPLEMENTATION_ALREADY_BILLED).
-- 3. A top-up needs an engagement in force: not ended before today (ENGAGEMENT_ENDED) and already started (ENGAGEMENT_NOT_STARTED).
-- 4. Both builders refuse an archived client (CLIENT_NOT_FOUND), as the monthly invoice does.
-- 5. A linked document cannot be moved to another client by a signed-in role.
-- Same signatures and grants as before (create or replace keeps them); the grants are restated for clarity.

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
         or (v_old ->> 'billing_kind' is not null and (v_new ->> 'client_id') is distinct from (v_old ->> 'client_id')) then
        raise exception 'BILLING_COLUMNS_GENERATED' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.document_billing_columns_guard() from public, anon, authenticated;

create or replace function public.create_first_document(p_engagement uuid, p_kind text default 'invoice') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.client_engagements%rowtype;
  v_client public.clients%rowtype;
  v_main public.price_list_items%rowtype;
  v_impl public.price_list_items%rowtype;
  v_doc uuid;
  v_ended boolean;
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
      v_main := private.rate_item(v_e.organization_id, 'retainer.' || v_e.package_key || '.monthly');
      v_impl := private.rate_item(v_e.organization_id, 'retainer.' || v_e.package_key || '.implementation');
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
  select * into v_client from public.clients where id = v_e.client_id;
  if not found or v_client.archived_at is not null then
    raise exception 'CLIENT_NOT_FOUND' using errcode = '42501';
  end if;
  -- In force today: a scheduled tier change leaves the old tier running until the day before the new one starts.
  if v_e.ended_on is not null and v_e.ended_on < private.sa_today() then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;
  if v_e.start_date > private.sa_today() then
    raise exception 'ENGAGEMENT_NOT_STARTED' using errcode = '23514';
  end if;
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

revoke all on function public.create_first_document(uuid, text) from public, anon;
revoke all on function public.create_top_up_invoice(uuid, numeric) from public, anon;
grant execute on function public.create_first_document(uuid, text) to authenticated;
grant execute on function public.create_top_up_invoice(uuid, numeric) to authenticated;
