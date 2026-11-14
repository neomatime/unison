-- Market intelligence: external market data (mining organisations and their operating sites), kept apart from the
-- CRM's own records and joined to them by two links on the organisation (client_id, lead_id). Nothing here changes a
-- client, lead, opportunity or quote; the map reads those to work out each organisation's engagement status.
--
-- One organisation has many operations: a mining company is stored once, and each mine it runs is a separate row with
-- its own coordinates. Rows only come from an import of a verified dataset (see docs/market-intelligence/README.md),
-- and every row keeps where it came from (source, source_ref) and when it was last checked (verified_on).
--
-- industry is there so another sector can use the same tables later; only 'mining' is allowed today.

create table public.market_organizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  industry text not null default 'mining' check (industry in ('mining')),
  registered_name text not null check (length(trim(registered_name)) between 1 and 300),
  trading_name text,
  parent_name text,
  registration_number text,
  website text check (website is null or website ~* '^https?://'),
  organization_type text,
  commodities text[] not null default '{}',
  -- The key the importer matches on, so a second import of the same company updates it instead of adding it again:
  -- the registration number when there is one, otherwise the lower-cased name without punctuation or "(Pty) Ltd".
  match_key text not null check (length(match_key) between 1 and 300),
  source text not null check (length(trim(source)) between 1 and 300),
  source_ref text,
  verified_on date,
  client_id uuid references public.clients(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, industry, match_key)
);

create table public.market_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  market_organization_id uuid not null references public.market_organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 300),
  province text not null check (province in (
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'
  )),
  district text,
  -- South Africa's mainland, with a margin. A point outside it is a typo, not a mine.
  latitude numeric(9, 6) not null check (latitude between -35.5 and -21.5),
  longitude numeric(9, 6) not null check (longitude between 15.5 and 33.5),
  primary_commodity text,
  other_commodities text[] not null default '{}',
  operation_type text,
  operating_status text,
  -- How sure the source is of the point: the site itself, near it, or only the district or town.
  location_accuracy text not null default 'exact' check (location_accuracy in ('exact', 'approximate', 'district')),
  match_key text not null check (length(match_key) between 1 and 300),
  source text not null check (length(trim(source)) between 1 and 300),
  source_ref text,
  verified_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market_organization_id, match_key)
);

create index market_organizations_org_idx on public.market_organizations (organization_id, industry);
create index market_organizations_client_idx on public.market_organizations (client_id) where client_id is not null;
create index market_organizations_lead_idx on public.market_organizations (lead_id) where lead_id is not null;
create index market_operations_org_idx on public.market_operations (organization_id, province);
create index market_operations_parent_idx on public.market_operations (market_organization_id);

-- An operation belongs to an organisation in the same tenant, and a link points at a client or lead of that tenant.
create or replace function public.market_rows_same_tenant() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'market_operations' then
    if not exists (select 1 from public.market_organizations m where m.id = new.market_organization_id and m.organization_id = new.organization_id) then
      raise exception 'The operation and its organisation belong to different workspaces.' using errcode = '23514';
    end if;
  else
    if new.client_id is not null and not exists (select 1 from public.clients c where c.id = new.client_id and c.organization_id = new.organization_id) then
      raise exception 'That client is not in this workspace.' using errcode = '23514';
    end if;
    if new.lead_id is not null and not exists (select 1 from public.leads l where l.id = new.lead_id and l.organization_id = new.organization_id) then
      raise exception 'That lead is not in this workspace.' using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger market_organizations_tenant before insert or update on public.market_organizations
  for each row execute function public.market_rows_same_tenant();
create trigger market_operations_tenant before insert or update on public.market_operations
  for each row execute function public.market_rows_same_tenant();

alter table public.market_organizations enable row level security;
alter table public.market_operations enable row level security;

-- Every member reads the map. Any member may link an organisation to a lead or client (that is what Create Lead does),
-- and may change nothing else. Market data is written only by market_import (below), which checks for an owner or admin.
create policy market_organizations_select on public.market_organizations for select to authenticated
  using (public.is_member_of(organization_id));
create policy market_organizations_link on public.market_organizations for update to authenticated
  using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id));
create policy market_operations_select on public.market_operations for select to authenticated
  using (public.is_member_of(organization_id));

revoke all on public.market_organizations, public.market_operations from anon, authenticated;
grant select on public.market_organizations, public.market_operations to authenticated;
grant update (client_id, lead_id) on public.market_organizations to authenticated;

-- Imports a batch of verified rows: each element is {"organization": {...}, "operation": {...} | null}, already checked
-- and given its match keys by the app (features/market-intelligence/import.ts). A company or site seen before (same match
-- key) is updated in place, never added twice; its CRM links are left alone. Owners and admins only.
create or replace function public.market_import(p_organization_id uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  row_item jsonb;
  org jsonb;
  op jsonb;
  org_id uuid;
  inserted boolean;
  orgs_added int := 0;
  orgs_updated int := 0;
  ops_added int := 0;
  ops_updated int := 0;
begin
  if not public.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Only an owner or admin can import market data.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Send between 1 and 5000 rows at a time.' using errcode = '22023';
  end if;

  for row_item in select value from jsonb_array_elements(p_rows) loop
    org := row_item -> 'organization';
    insert into public.market_organizations as m (
      organization_id, industry, registered_name, trading_name, parent_name, registration_number, website,
      organization_type, commodities, match_key, source, source_ref, verified_on
    ) values (
      p_organization_id, 'mining', org ->> 'registered_name', org ->> 'trading_name', org ->> 'parent_name',
      org ->> 'registration_number', org ->> 'website', org ->> 'organization_type',
      coalesce(array(select jsonb_array_elements_text(org -> 'commodities')), '{}'),
      org ->> 'match_key', org ->> 'source', org ->> 'source_ref', (org ->> 'verified_on')::date
    )
    on conflict (organization_id, industry, match_key) do update set
      registered_name = excluded.registered_name,
      trading_name = coalesce(excluded.trading_name, m.trading_name),
      parent_name = coalesce(excluded.parent_name, m.parent_name),
      registration_number = coalesce(excluded.registration_number, m.registration_number),
      website = coalesce(excluded.website, m.website),
      organization_type = coalesce(excluded.organization_type, m.organization_type),
      commodities = (select coalesce(array_agg(distinct c order by c), '{}') from unnest(m.commodities || excluded.commodities) c),
      source = excluded.source,
      source_ref = coalesce(excluded.source_ref, m.source_ref),
      verified_on = greatest(excluded.verified_on, m.verified_on)
    returning m.id, (xmax = 0) into org_id, inserted;
    if inserted then orgs_added := orgs_added + 1; else orgs_updated := orgs_updated + 1; end if;

    op := row_item -> 'operation';
    if op is not null and jsonb_typeof(op) = 'object' then
      insert into public.market_operations as o (
        organization_id, market_organization_id, name, province, district, latitude, longitude, primary_commodity,
        other_commodities, operation_type, operating_status, location_accuracy, match_key, source, source_ref, verified_on
      ) values (
        p_organization_id, org_id, op ->> 'name', op ->> 'province', op ->> 'district', (op ->> 'latitude')::numeric,
        (op ->> 'longitude')::numeric, op ->> 'primary_commodity',
        coalesce(array(select jsonb_array_elements_text(op -> 'other_commodities')), '{}'),
        op ->> 'operation_type', op ->> 'operating_status', coalesce(op ->> 'location_accuracy', 'exact'),
        op ->> 'match_key', op ->> 'source', op ->> 'source_ref', (op ->> 'verified_on')::date
      )
      on conflict (market_organization_id, match_key) do update set
        name = excluded.name, province = excluded.province, district = coalesce(excluded.district, o.district),
        latitude = excluded.latitude, longitude = excluded.longitude,
        primary_commodity = coalesce(excluded.primary_commodity, o.primary_commodity),
        other_commodities = excluded.other_commodities,
        operation_type = coalesce(excluded.operation_type, o.operation_type),
        operating_status = coalesce(excluded.operating_status, o.operating_status),
        location_accuracy = excluded.location_accuracy, source = excluded.source,
        source_ref = coalesce(excluded.source_ref, o.source_ref), verified_on = greatest(excluded.verified_on, o.verified_on)
      returning (xmax = 0) into inserted;
      if inserted then ops_added := ops_added + 1; else ops_updated := ops_updated + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('organizations_added', orgs_added, 'organizations_updated', orgs_updated,
    'operations_added', ops_added, 'operations_updated', ops_updated);
end $$;

revoke all on function public.market_import(uuid, jsonb) from public, anon;
grant execute on function public.market_import(uuid, jsonb) to authenticated;
