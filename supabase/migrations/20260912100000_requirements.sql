-- Formal, discrete things a project must produce or satisfy. Traceability
-- (next in the build order) will link delivery items and evidence back to
-- these; this slice does not build that link, only the entity it will need.
--
-- Copies project_risks' shape exactly: same RLS pattern, same trigger set,
-- no archived_at. A requirement's lifecycle is fully expressed by status;
-- removal is a hard delete, matching a register rather than a soft-deleted
-- hierarchy with children worth preserving.
create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  title text not null,
  description text,
  -- Matches the vocabulary already repeated across project_risks,
  -- support_tickets, support_cases and integration event priority in this
  -- schema -- not a new invented scale.
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Critical')),
  -- Unconstrained between values, matching delivery_items.status and
  -- project_risks.status: neither enforces transition order, and inventing
  -- one here for a single entity would be new complexity with no precedent.
  status text not null default 'Draft' check (status in ('Draft','Approved','In Progress','Delivered','Verified')),
  owner_id uuid,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint requirements_project_fkey foreign key (project_id, organization_id)
    references public.projects(id, organization_id) on delete cascade,
  constraint requirements_owner_fkey foreign key (organization_id, owner_id)
    references public.memberships(organization_id, user_id) on delete set null (owner_id)
);

comment on table public.requirements is
  'Formal, discrete delivery requirements. Status is stored, never derived -- nothing yet exists to derive it from.';

create index requirements_project_idx on public.requirements(project_id, status);

alter table public.requirements enable row level security;

create policy requirements_select on public.requirements
  for select to authenticated using (public.is_member_of(organization_id));
create policy requirements_insert on public.requirements
  for insert to authenticated with check (public.is_member_of(organization_id));
create policy requirements_update on public.requirements
  for update to authenticated using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));
create policy requirements_delete on public.requirements
  for delete to authenticated using (public.is_member_of(organization_id));

create trigger requirements_set_updated_at before update on public.requirements
  for each row execute function public.set_updated_at();
create trigger requirements_audit after insert or update or delete on public.requirements
  for each row execute function public.record_audit_event();

revoke all on public.requirements from anon;
grant select, insert, update, delete on public.requirements to authenticated;
