-- Needed so projects can key on (client_id, organization_id). Additive: it
-- changes no existing behaviour, since (id) is already unique as the PK.
alter table public.clients
  add constraint clients_id_org_unique unique (id, organization_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Null for internal change work; set when the project is delivered for a client.
  client_id uuid,
  name text not null,
  framework_id uuid not null,
  phase_id uuid,
  owner_id uuid references auth.users(id) on delete set null,
  status text not null default 'Active'
    check (status in ('Active', 'On Hold', 'Complete', 'Cancelled')),
  health text not null default 'On Track'
    check (health in ('On Track', 'Healthy', 'Watch', 'At Risk', 'Critical')),
  progress smallint not null default 0 check (progress >= 0 and progress <= 100),
  next_gate text,
  due_date date,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A plain phase_id FK would let a project on Client Onboarding sit in the
  -- Build phase, since both are valid phase rows. This makes that
  -- unrepresentable instead of relying on application code to check.
  --
  -- The column list on `set null` is load-bearing: a bare `on delete set
  -- null` nulls every column in the composite key, which here would include
  -- framework_id -- a NOT NULL column -- and abort the delete with a
  -- not-null violation instead of degrading gracefully. Naming (phase_id)
  -- restricts the null-out to just that column.
  constraint projects_phase_fkey
    foreign key (framework_id, phase_id)
    references public.framework_phases (framework_id, id) on delete set null (phase_id),

  -- Tenant isolation, not tidiness. The RLS insert check validates only
  -- projects.organization_id; it does not verify that client_id belongs to the
  -- same organisation. Without this, a crafted insert can hold a live
  -- cross-tenant reference. client_id is nullable and MATCH SIMPLE skips the
  -- check when it is null, which is exactly right for internal work.
  --
  -- Same reasoning as projects_phase_fkey above: the column list on `set
  -- null` is load-bearing, restricting the null-out to client_id so
  -- organization_id (NOT NULL) is left untouched.
  constraint projects_client_fkey
    foreign key (client_id, organization_id)
    references public.clients (id, organization_id) on delete set null (client_id),

  constraint projects_framework_fkey
    foreign key (framework_id, organization_id)
    references public.frameworks (id, organization_id)
);

create index projects_org_idx on public.projects (organization_id, archived_at);
create index projects_client_idx on public.projects (organization_id, client_id);
create index projects_name_trgm_idx on public.projects using gin (name gin_trgm_ops);

alter table public.projects enable row level security;

create policy projects_select on public.projects
  for select to authenticated using (is_member_of(organization_id));
create policy projects_insert on public.projects
  for insert to authenticated with check (is_member_of(organization_id));
create policy projects_update on public.projects
  for update to authenticated
  using (is_member_of(organization_id)) with check (is_member_of(organization_id));

create trigger projects_set_updated_at before update on public.projects
  for each row execute function set_updated_at();
create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function record_audit_event();
