-- Project-to-project prerequisites. The value is not recording a dependency; it
-- is making downstream project risk visible and governable. See
-- docs/project-dependencies.md.
--
-- Three of the four integrity rules from §6 are declarative and live here. The
-- fourth -- no cycles -- cannot be expressed as a constraint and arrives in
-- 20260907100500_project_dependency_cycle_guard.sql.
create table public.project_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  dependent_project_id uuid not null,
  prerequisite_project_id uuid not null,
  -- Denormalised from the prerequisite project, exactly as delivery_items does
  -- with framework_id: it is what makes the phase key below expressible.
  -- project_dependencies_prerequisite_framework_fkey keeps it honest.
  prerequisite_framework_id uuid not null,
  -- A column, not a hardcoded assumption, so §8's further types (Dependency,
  -- Related Project, Successor/Predecessor) are an additive change to this
  -- check rather than a rebuild. One value until demand is validated.
  relationship_type text not null default 'Prerequisite',
  -- Exactly one of these is set. A single polymorphic text column would be
  -- unvalidatable, and would make Satisfied underivable.
  required_status text,
  required_phase_id uuid,
  dependency_owner_id uuid,
  criticality text not null default 'Standard',
  required_by_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_dependencies_type_check check (relationship_type in ('Prerequisite')),
  -- 'Active' means started, 'Complete' means completed -- the two entries in
  -- §2's list that are project statuses rather than phase names. 'On Hold' and
  -- 'Cancelled' are not coherent as things to *require* of a prerequisite.
  constraint project_dependencies_required_status_check
    check (required_status is null or required_status in ('Active', 'Complete')),
  constraint project_dependencies_criticality_check check (criticality in ('Standard', 'Critical')),
  constraint project_dependencies_no_self_check
    check (dependent_project_id <> prerequisite_project_id),
  -- Exactly one, never both, never neither.
  constraint project_dependencies_required_state_check check (
    (required_status is not null and required_phase_id is null)
    or (required_status is null and required_phase_id is not null)
  ),
  constraint project_dependencies_unique
    unique (organization_id, dependent_project_id, prerequisite_project_id, relationship_type),

  constraint project_dependencies_organization_fkey foreign key (organization_id)
    references public.organizations (id) on delete cascade,
  -- Both sides tenant-pinned. This is what makes a cross-tenant dependency
  -- unrepresentable rather than merely rejected: there is no pair of values
  -- naming projects in two different organisations that satisfies both keys.
  constraint project_dependencies_dependent_fkey
    foreign key (dependent_project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade,
  constraint project_dependencies_prerequisite_fkey
    foreign key (prerequisite_project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade,
  -- Ties the denormalised framework to the prerequisite project that owns it.
  constraint project_dependencies_prerequisite_framework_fkey
    foreign key (prerequisite_project_id, prerequisite_framework_id)
    references public.projects (id, framework_id),
  -- A required phase must belong to the PREREQUISITE'S OWN framework. Without
  -- this, a dependency could require "Build" from an unrelated framework and
  -- would never be satisfiable by any state the prerequisite can reach.
  constraint project_dependencies_phase_fkey
    foreign key (prerequisite_framework_id, required_phase_id)
    references public.framework_phases (framework_id, id),
  constraint project_dependencies_owner_fkey
    foreign key (organization_id, dependency_owner_id)
    references public.memberships (organization_id, user_id)
    on delete set null (dependency_owner_id)
);

comment on table public.project_dependencies is
  'Project-to-project prerequisites. Status is derived, never stored: see features/delivery/dependency-status.ts.';
comment on constraint project_dependencies_phase_fkey on public.project_dependencies is
  'A required phase must belong to the prerequisite project''s own framework, so the required state is always something that project can actually reach.';

create index project_dependencies_dependent_idx
  on public.project_dependencies (dependent_project_id);
create index project_dependencies_prerequisite_idx
  on public.project_dependencies (prerequisite_project_id);

alter table public.project_dependencies enable row level security;

create policy project_dependencies_select on public.project_dependencies
  for select using (public.is_member_of(organization_id));
create policy project_dependencies_insert on public.project_dependencies
  for insert with check (public.is_member_of(organization_id));
create policy project_dependencies_update on public.project_dependencies
  for update using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));
-- A delete policy, unlike projects/frameworks/delivery_items. A dependency is an
-- edge: it either holds or it does not, it has no children to orphan, and an
-- archived edge answers no question a deleted one does not. Hard delete is also
-- why project_dependencies_unique can stay simple -- a soft-deleted duplicate
-- would otherwise block its own recreation.
create policy project_dependencies_delete on public.project_dependencies
  for delete using (public.is_member_of(organization_id));

create trigger project_dependencies_audit
  after insert or delete or update on public.project_dependencies
  for each row execute function public.record_audit_event();
create trigger project_dependencies_set_updated_at
  before update on public.project_dependencies
  for each row execute function public.set_updated_at();
