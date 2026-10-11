-- Pricing and credit model, part 2: the client's package.
-- A client has engagements (one active retainer at most, any number of projects) and support services attached to a project.
-- Written only by the definer functions below (members can read). A retainer tier allows only so many active projects
-- (price_list_items.initiative_limit on its monthly item); the limit is enforced by a trigger as well as by the functions.
-- Append-only: earlier migrations are not edited.

-- ---------------------------------------------------------------------------
-- 1. Helpers.
-- ---------------------------------------------------------------------------
create or replace function private.sa_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Johannesburg')::date
$$;

-- The first day of the month of a date, by plain date arithmetic (no time zone involved).
create or replace function private.month_start(d date) returns date
language sql immutable set search_path = '' as $$
  select d - (extract(day from d)::integer - 1)
$$;

create or replace function private.rate_item(p_org uuid, p_key text) returns public.price_list_items
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.price_list_items;
begin
  select * into r from public.price_list_items where organization_id = p_org and rate_key = p_key and archived_at is null;
  if not found then
    raise exception 'RATE_ITEM_UNAVAILABLE' using errcode = '23514';
  end if;
  return r;
end $$;

revoke all on function private.sa_today() from public, anon, authenticated;
revoke all on function private.month_start(date) from public, anon, authenticated;
revoke all on function private.rate_item(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tables.
-- ---------------------------------------------------------------------------
create table public.client_engagements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null,
  kind text not null check (kind in ('retainer', 'project')),
  package_key text not null check (length(trim(package_key)) > 0),
  start_date date not null,
  ended_on date,
  replaces_id uuid,
  root_id uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (ended_on is null or ended_on >= start_date),
  check (replaces_id is null or kind = 'retainer'),
  foreign key (client_id, organization_id) references public.clients(id, organization_id) on delete cascade,
  foreign key (replaces_id, organization_id) references public.client_engagements(id, organization_id)
);

create unique index client_engagements_one_active_retainer on public.client_engagements(client_id) where kind = 'retainer' and ended_on is null;
create index client_engagements_client_idx on public.client_engagements(client_id, kind, ended_on);

create table public.engagement_support (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  engagement_id uuid not null,
  service_key text not null check (length(trim(service_key)) > 0),
  start_date date not null,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= start_date),
  foreign key (engagement_id, organization_id) references public.client_engagements(id, organization_id) on delete cascade
);

create unique index engagement_support_one_active on public.engagement_support(engagement_id, service_key) where ended_on is null;
create index engagement_support_engagement_idx on public.engagement_support(engagement_id, ended_on);

create trigger client_engagements_set_updated_at before update on public.client_engagements
  for each row execute function public.set_updated_at();
create trigger engagement_support_set_updated_at before update on public.engagement_support
  for each row execute function public.set_updated_at();
create trigger client_engagements_audit after insert or update or delete on public.client_engagements
  for each row execute function public.record_audit_event();
create trigger engagement_support_audit after insert or update or delete on public.engagement_support
  for each row execute function public.record_audit_event();

alter table public.client_engagements enable row level security;
alter table public.engagement_support enable row level security;
create policy client_engagements_select on public.client_engagements
  for select to authenticated using (public.is_member_of(organization_id));
create policy engagement_support_select on public.engagement_support
  for select to authenticated using (public.is_member_of(organization_id));
revoke all on public.client_engagements, public.engagement_support from anon, authenticated;
grant select on public.client_engagements, public.engagement_support to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The initiative limit. A client with an active retainer may have only as many active projects as the tier allows;
--    an empty limit means no limit. Also enforced inside the functions that lock the client row first.
-- ---------------------------------------------------------------------------
create or replace function private.client_engagements_initiative_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer;
  v_active integer;
begin
  if new.kind = 'project' then
    select r.initiative_limit into v_limit
    from public.client_engagements e
    join public.price_list_items r
      on r.organization_id = e.organization_id and r.item_kind = 'retainer_monthly' and r.package_key = e.package_key
    where e.client_id = new.client_id and e.kind = 'retainer' and e.ended_on is null;
    if v_limit is not null then
      select count(*) into v_active
      from public.client_engagements p
      where p.client_id = new.client_id and p.kind = 'project' and p.ended_on is null;
      if v_active >= v_limit then
        raise exception 'INITIATIVE_LIMIT_REACHED' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;

create trigger client_engagements_initiative_limit before insert on public.client_engagements
  for each row execute function private.client_engagements_initiative_limit();
revoke all on function private.client_engagements_initiative_limit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Timeline entries for the package. The definer functions write them; members never insert a system kind.
-- ---------------------------------------------------------------------------
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in ('call', 'meeting', 'email', 'note', 'lead.converted', 'client.created_from_lead', 'opportunity.created_from_lead', 'opportunity.stage_changed', 'quote.sent', 'quote.accepted', 'quote.emailed', 'invoice.emailed', 'quote.invoiced', 'payment.recorded', 'payment.voided', 'invoice.overdue', 'billing.package_set', 'billing.tier_changed', 'billing.support_added', 'billing.document_built'));

-- ---------------------------------------------------------------------------
-- 5. Record a package for a client (a retainer or a project).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 6. Change a retainer's tier. The new tier carries on from the old one: no new implementation fee is ever billed for it.
-- ---------------------------------------------------------------------------
create or replace function public.change_retainer_tier(p_engagement uuid, p_new_package_key text, p_start_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.client_engagements%rowtype;
  v_item public.price_list_items%rowtype;
  v_id uuid := gen_random_uuid();
  v_active integer;
begin
  select * into v_old from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_old.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  perform 1 from public.clients where id = v_old.client_id for update;
  select * into v_old from public.client_engagements where id = p_engagement for update;
  if v_old.kind <> 'retainer' or v_old.ended_on is not null then
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

-- ---------------------------------------------------------------------------
-- 7. End an engagement (and any support services still running on it).
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
  if v_end < v_e.start_date then
    raise exception 'PACKAGE_START_INVALID' using errcode = '23514';
  end if;
  update public.client_engagements set ended_on = v_end where id = p_engagement;
  update public.engagement_support set ended_on = greatest(start_date, v_end) where engagement_id = p_engagement and ended_on is null;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Support services on a project.
-- ---------------------------------------------------------------------------
create or replace function public.add_support_service(p_engagement uuid, p_service_key text, p_start_date date default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.client_engagements%rowtype;
  v_item public.price_list_items%rowtype;
  v_start date := coalesce(p_start_date, private.sa_today());
  v_id uuid;
begin
  select * into v_e from public.client_engagements where id = p_engagement;
  if not found or not public.is_member_of(v_e.organization_id) then
    raise exception 'ENGAGEMENT_NOT_FOUND' using errcode = '42501';
  end if;
  if v_e.kind <> 'project' or v_e.ended_on is not null then
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
  if v_s.ended_on is not null or v_end < v_s.start_date then
    raise exception 'PACKAGE_START_INVALID' using errcode = '23514';
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
