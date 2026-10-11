-- Pricing and credit model, part 2 hardening (review round 1). Append-only: 20261012110000_client_engagements.sql is already applied.
-- 1. Two retainers could cover the same months: a new retainer is refused when it starts on or before the end of an earlier
--    one (PACKAGE_OVERLAP), and an engagement or support service cannot be ended in the future or before it started
--    (PACKAGE_END_INVALID), so an end date can never be used to claim months that have not happened.
-- 2. Misleading tokens: a tier change on a project is ENGAGEMENT_NOT_RETAINER, support on a retainer is ENGAGEMENT_NOT_PROJECT,
--    and ending a support service that has already ended is SUPPORT_ALREADY_ENDED (ENGAGEMENT_ENDED keeps meaning "ended").
-- 3. end_support_service locks its row before testing it; change_retainer_tier and add_support_service refuse an archived
--    client (CLIENT_NOT_FOUND) as set_client_package does; add_support_service locks the engagement so it cannot add a
--    service to a project that is being ended at the same moment.
-- Same signatures and grants as before (create or replace keeps them); the grants are restated for clarity.

create or replace function public.set_client_package(p_client uuid, p_package_key text, p_start_date date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_client public.clients%rowtype;
  v_item public.price_list_items%rowtype;
  v_start date := coalesce(p_start_date, private.sa_today());
  v_id uuid := gen_random_uuid();
  v_active integer;
begin
  select * into v_client from public.clients where id = p_client;
  if not found or not public.is_member_of(v_client.organization_id) or v_client.archived_at is not null then
    raise exception 'CLIENT_NOT_FOUND' using errcode = '42501';
  end if;
  -- One package change at a time per client, so the limit and the one-active-retainer rule cannot race.
  perform 1 from public.clients where id = p_client for update;

  select * into v_item from public.price_list_items
  where organization_id = v_client.organization_id and package_key = p_package_key
    and item_kind in ('retainer_monthly', 'project') and archived_at is null;
  if not found then
    raise exception 'PACKAGE_UNKNOWN' using errcode = '23514';
  end if;
  if v_start < private.sa_today() - 366 or v_start > private.sa_today() + 366 then
    raise exception 'PACKAGE_START_INVALID' using errcode = '23514';
  end if;

  if v_item.item_kind = 'retainer_monthly' then
    if exists (select 1 from public.client_engagements e where e.client_id = p_client and e.kind = 'retainer' and e.ended_on is null) then
      raise exception 'CLIENT_HAS_RETAINER' using errcode = '23514';
    end if;
    -- An earlier retainer that ended on or after this start would cover the same months.
    if exists (select 1 from public.client_engagements e where e.client_id = p_client and e.kind = 'retainer' and e.ended_on is not null and e.ended_on >= v_start) then
      raise exception 'PACKAGE_OVERLAP' using errcode = '23514';
    end if;
    if v_item.initiative_limit is not null then
      select count(*) into v_active from public.client_engagements e where e.client_id = p_client and e.kind = 'project' and e.ended_on is null;
      if v_active > v_item.initiative_limit then
        raise exception 'INITIATIVE_LIMIT_REACHED' using errcode = '23514';
      end if;
    end if;
    insert into public.client_engagements (id, organization_id, client_id, kind, package_key, start_date, root_id, created_by)
    values (v_id, v_client.organization_id, p_client, 'retainer', p_package_key, v_start, v_id, (select auth.uid()));
    update public.clients set engagement_type = 'Retainer' where id = p_client and engagement_type is distinct from 'Retainer';
  else
    insert into public.client_engagements (id, organization_id, client_id, kind, package_key, start_date, root_id, created_by)
    values (v_id, v_client.organization_id, p_client, 'project', p_package_key, v_start, v_id, (select auth.uid()));
    update public.clients set engagement_type = 'Project' where id = p_client and engagement_type is null;
  end if;

  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_client.organization_id, 'billing.package_set', 'Package recorded: ' || v_item.title,
          jsonb_build_object('engagement_id', v_id, 'package_key', p_package_key, 'start_date', v_start),
          public.activity_actor(v_client.organization_id), p_client);
  return v_id;
end $$;

create or replace function public.change_retainer_tier(p_engagement uuid, p_new_package_key text, p_start_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.client_engagements%rowtype;
  v_client public.clients%rowtype;
  v_item public.price_list_items%rowtype;
  v_id uuid := gen_random_uuid();
  v_active integer;
begin
  select * into v_old from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_old.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_client from public.clients where id = v_old.client_id for update;
  if not found or v_client.archived_at is not null then
    raise exception 'CLIENT_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_old from public.client_engagements where id = p_engagement for update;
  if v_old.kind <> 'retainer' then
    raise exception 'ENGAGEMENT_NOT_RETAINER' using errcode = '23514';
  end if;
  if v_old.ended_on is not null then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;

  select * into v_item from public.price_list_items
  where organization_id = v_old.organization_id and package_key = p_new_package_key
    and item_kind = 'retainer_monthly' and archived_at is null;
  if not found then
    raise exception 'PACKAGE_UNKNOWN' using errcode = '23514';
  end if;
  if v_item.package_key = v_old.package_key then
    raise exception 'PACKAGE_UNCHANGED' using errcode = '23514';
  end if;
  if p_start_date is null or p_start_date <= v_old.start_date or p_start_date > private.sa_today() + 366 then
    raise exception 'PACKAGE_START_INVALID' using errcode = '23514';
  end if;
  if v_item.initiative_limit is not null then
    select count(*) into v_active from public.client_engagements e where e.client_id = v_old.client_id and e.kind = 'project' and e.ended_on is null;
    if v_active > v_item.initiative_limit then
      raise exception 'INITIATIVE_LIMIT_REACHED' using errcode = '23514';
    end if;
  end if;

  update public.client_engagements set ended_on = p_start_date - 1 where id = v_old.id;
  insert into public.client_engagements (id, organization_id, client_id, kind, package_key, start_date, replaces_id, root_id, created_by)
  values (v_id, v_old.organization_id, v_old.client_id, 'retainer', p_new_package_key, p_start_date, v_old.id, v_old.root_id, (select auth.uid()));

  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_old.organization_id, 'billing.tier_changed', 'Retainer changed to ' || v_item.title,
          jsonb_build_object('engagement_id', v_id, 'replaces_id', v_old.id, 'from', v_old.package_key, 'to', p_new_package_key, 'start_date', p_start_date),
          public.activity_actor(v_old.organization_id), v_old.client_id);
  return v_id;
end $$;

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
  update public.engagement_support set ended_on = greatest(start_date, v_end) where engagement_id = p_engagement and ended_on is null;
end $$;

create or replace function public.add_support_service(p_engagement uuid, p_service_key text, p_start_date date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.client_engagements%rowtype;
  v_client public.clients%rowtype;
  v_item public.price_list_items%rowtype;
  v_start date := coalesce(p_start_date, private.sa_today());
  v_id uuid;
begin
  select * into v_e from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_e.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_client from public.clients where id = v_e.client_id;
  if not found or v_client.archived_at is not null then
    raise exception 'CLIENT_NOT_FOUND' using errcode = '42501';
  end if;
  -- Locked, so the project cannot be ended while a service is being added to it.
  select * into v_e from public.client_engagements where id = p_engagement for update;
  if v_e.kind <> 'project' then
    raise exception 'ENGAGEMENT_NOT_PROJECT' using errcode = '23514';
  end if;
  if v_e.ended_on is not null then
    raise exception 'ENGAGEMENT_ENDED' using errcode = '23514';
  end if;
  v_item := private.rate_item(v_e.organization_id, p_service_key);
  if v_item.item_kind <> 'support' or v_item.package_key is distinct from v_e.package_key then
    raise exception 'SUPPORT_NOT_FOR_PROJECT' using errcode = '23514';
  end if;
  if v_start < v_e.start_date or v_start > private.sa_today() + 366 then
    raise exception 'PACKAGE_START_INVALID' using errcode = '23514';
  end if;
  begin
    insert into public.engagement_support (organization_id, engagement_id, service_key, start_date)
    values (v_e.organization_id, p_engagement, p_service_key, v_start)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'SUPPORT_ALREADY_ACTIVE' using errcode = '23514';
  end;
  insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
  values (v_e.organization_id, 'billing.support_added', 'Support service recorded: ' || v_item.title,
          jsonb_build_object('engagement_id', p_engagement, 'support_id', v_id, 'service_key', p_service_key, 'start_date', v_start),
          public.activity_actor(v_e.organization_id), v_e.client_id);
  return v_id;
end $$;

create or replace function public.end_support_service(p_support uuid, p_ended_on date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.engagement_support%rowtype;
  v_end date := coalesce(p_ended_on, private.sa_today());
begin
  select * into v_s from public.engagement_support where id = p_support;
  if not found or not public.is_member_of(v_s.organization_id) then
    raise exception 'SUPPORT_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_s from public.engagement_support where id = p_support for update;
  if v_s.ended_on is not null then
    raise exception 'SUPPORT_ALREADY_ENDED' using errcode = '23514';
  end if;
  if v_end < v_s.start_date or v_end > private.sa_today() then
    raise exception 'PACKAGE_END_INVALID' using errcode = '23514';
  end if;
  update public.engagement_support set ended_on = v_end where id = p_support;
end $$;

revoke all on function public.set_client_package(uuid, text, date) from public, anon;
revoke all on function public.change_retainer_tier(uuid, text, date) from public, anon;
revoke all on function public.end_engagement(uuid, date) from public, anon;
revoke all on function public.add_support_service(uuid, text, date) from public, anon;
revoke all on function public.end_support_service(uuid, date) from public, anon;
grant execute on function public.set_client_package(uuid, text, date) to authenticated;
grant execute on function public.change_retainer_tier(uuid, text, date) to authenticated;
grant execute on function public.end_engagement(uuid, date) to authenticated;
grant execute on function public.add_support_service(uuid, text, date) to authenticated;
grant execute on function public.end_support_service(uuid, date) to authenticated;
