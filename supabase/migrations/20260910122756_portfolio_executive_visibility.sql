create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  owner_id uuid,
  sponsor_id uuid,
  business_unit text,
  strategic_objective text,
  status text not null default 'Planning' check (status in ('Planning','Active','Under Review','On Hold','Complete')),
  start_date date,
  target_end_date date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id),
  foreign key (organization_id, owner_id) references public.memberships(organization_id,user_id) on delete set null (owner_id),
  foreign key (organization_id, sponsor_id) references public.memberships(organization_id,user_id) on delete set null (sponsor_id)
);

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  portfolio_id uuid not null,
  name text not null,
  code text not null,
  description text,
  owner_id uuid,
  sponsor_id uuid,
  status text not null default 'Planning' check (status in ('Planning','In Delivery','On Hold','Complete')),
  health text not null default 'Healthy' check (health in ('Healthy','Watch','At Risk','Critical')),
  start_date date,
  target_end_date date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, code),
  unique (id, organization_id),
  unique (id, portfolio_id, organization_id),
  foreign key (portfolio_id, organization_id) references public.portfolios(id,organization_id) on delete cascade,
  foreign key (organization_id, owner_id) references public.memberships(organization_id,user_id) on delete set null (owner_id),
  foreign key (organization_id, sponsor_id) references public.memberships(organization_id,user_id) on delete set null (sponsor_id)
);

alter table public.projects add column portfolio_id uuid, add column programme_id uuid;
alter table public.projects add constraint projects_portfolio_fkey foreign key (portfolio_id,organization_id) references public.portfolios(id,organization_id) on delete set null (portfolio_id);
alter table public.projects add constraint projects_programme_fkey foreign key (programme_id,portfolio_id,organization_id) references public.programmes(id,portfolio_id,organization_id) on delete set null (programme_id);

create index portfolios_org_idx on public.portfolios(organization_id,archived_at);
create index programmes_portfolio_idx on public.programmes(portfolio_id,archived_at);
create index projects_portfolio_idx on public.projects(portfolio_id,programme_id);

alter table public.portfolios enable row level security;
alter table public.programmes enable row level security;
create policy portfolios_select on public.portfolios for select to authenticated using (public.is_member_of(organization_id));
create policy portfolios_insert on public.portfolios for insert to authenticated with check (public.is_member_of(organization_id));
create policy portfolios_update on public.portfolios for update to authenticated using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id));
create policy programmes_select on public.programmes for select to authenticated using (public.is_member_of(organization_id));
create policy programmes_insert on public.programmes for insert to authenticated with check (public.is_member_of(organization_id));
create policy programmes_update on public.programmes for update to authenticated using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id));

create trigger portfolios_set_updated_at before update on public.portfolios for each row execute function public.set_updated_at();
create trigger programmes_set_updated_at before update on public.programmes for each row execute function public.set_updated_at();
create trigger portfolios_audit after insert or update or delete on public.portfolios for each row execute function public.record_audit_event();
create trigger programmes_audit after insert or update or delete on public.programmes for each row execute function public.record_audit_event();

revoke all on public.portfolios,public.programmes from anon;
grant select,insert,update on public.portfolios,public.programmes to authenticated;
