create table public.frameworks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text,
  version text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint frameworks_name_unique unique (organization_id, name),
  -- Referenced by framework_phases and projects. A unique constraint on
  -- exactly these columns is what lets those tables key on (id, organization_id).
  constraint frameworks_id_org_unique unique (id, organization_id)
);

create table public.framework_phases (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null,
  -- Carried rather than reached through the parent so the RLS policy is a
  -- direct column test like every other table. The composite FK below is what
  -- stops it diverging from the framework's own organization_id.
  organization_id uuid not null,
  name text not null,
  position integer not null,
  constraint framework_phases_position_unique unique (framework_id, position),
  constraint framework_phases_name_unique unique (framework_id, name),
  -- Referenced by projects(framework_id, phase_id). Column order matches the
  -- referencing clause exactly.
  constraint framework_phases_framework_id_unique unique (framework_id, id),
  constraint framework_phases_framework_fkey
    foreign key (framework_id, organization_id)
    references public.frameworks (id, organization_id) on delete cascade
);

create index frameworks_org_idx on public.frameworks (organization_id, archived_at);
create index framework_phases_framework_idx on public.framework_phases (framework_id, position);

alter table public.frameworks enable row level security;
alter table public.framework_phases enable row level security;

create policy frameworks_select on public.frameworks
  for select to authenticated using (is_member_of(organization_id));
create policy frameworks_insert on public.frameworks
  for insert to authenticated with check (is_member_of(organization_id));
create policy frameworks_update on public.frameworks
  for update to authenticated
  using (is_member_of(organization_id)) with check (is_member_of(organization_id));

create policy framework_phases_select on public.framework_phases
  for select to authenticated using (is_member_of(organization_id));
create policy framework_phases_insert on public.framework_phases
  for insert to authenticated with check (is_member_of(organization_id));
create policy framework_phases_update on public.framework_phases
  for update to authenticated
  using (is_member_of(organization_id)) with check (is_member_of(organization_id));

create trigger frameworks_set_updated_at before update on public.frameworks
  for each row execute function set_updated_at();
create trigger frameworks_audit after insert or update or delete on public.frameworks
  for each row execute function record_audit_event();
create trigger framework_phases_audit after insert or update or delete on public.framework_phases
  for each row execute function record_audit_event();
