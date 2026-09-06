-- Composite targets. `projects` carried only a primary key, so the keys below
-- had nothing to reference. Both are additive and change no behaviour.
alter table public.projects
  add constraint projects_id_org_unique unique (id, organization_id);
alter table public.projects
  add constraint projects_id_framework_unique unique (id, framework_id);

-- Framework-supplied terminology for the two levels: Epic/Feature,
-- Work Package/Deliverable, Obligation/Control. Nullable, because an unset
-- label renders "Level 1" rather than an invented default -- defaulting to
-- "Epic" would assert a methodology the organisation has not chosen, which is
-- the opposite of what the generic model exists to do.
alter table public.frameworks
  add column level_1_label text,
  add column level_2_label text;

comment on column public.frameworks.level_1_label is
  'Label for level-1 delivery items. Null renders as "Level 1", never an invented default.';
comment on column public.frameworks.level_2_label is
  'Label for level-2 delivery items. Null renders as "Level 2", never an invented default.';

create table public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  -- Denormalised from the project deliberately: it is what makes the phase key
  -- below expressible. delivery_items_project_framework_fkey keeps it honest.
  framework_id uuid not null,
  level int not null,
  parent_id uuid,
  -- Generated, never written by the application. This is the column that lets a
  -- foreign key say "the parent is a level-1 item", which no single-column key
  -- can express. Verified against Postgres 17: a stored generated column is
  -- accepted in a composite foreign key.
  parent_level int generated always as (case when parent_id is null then null else 1 end) stored,
  name text not null,
  description text,
  owner_id uuid,
  status text not null default 'Not Started',
  health text not null default 'Healthy',
  current_phase_id uuid,
  start_date date,
  target_date date,
  -- Plumbing for later external identity mapping. Null throughout the pilot,
  -- invisible to users, claims nothing. Retrofitting this onto populated data
  -- is what it exists to avoid.
  source_system text,
  external_reference text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint delivery_items_level_check check (level in (1, 2)),
  constraint delivery_items_shape_check check (
    (level = 1 and parent_id is null) or (level = 2 and parent_id is not null)
  ),
  -- Health omits 'On Track' deliberately: `status` already carries schedule,
  -- including Blocked, so an item could otherwise read "Blocked / On Track".
  constraint delivery_items_status_check check (status in ('Not Started', 'In Progress', 'Blocked', 'Complete')),
  constraint delivery_items_health_check check (health in ('Healthy', 'Watch', 'At Risk', 'Critical')),
  constraint delivery_items_id_level_project_unique unique (id, level, project_id),

  constraint delivery_items_organization_fkey foreign key (organization_id)
    references public.organizations (id) on delete cascade,
  constraint delivery_items_project_fkey foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade,
  constraint delivery_items_project_framework_fkey foreign key (project_id, framework_id)
    references public.projects (id, framework_id),
  constraint delivery_items_phase_fkey foreign key (framework_id, current_phase_id)
    references public.framework_phases (framework_id, id) on delete set null (current_phase_id),
  constraint delivery_items_owner_fkey foreign key (organization_id, owner_id)
    references public.memberships (organization_id, user_id) on delete set null (owner_id),
  -- The depth cap. Three guarantees in one key: the parent exists, it is level 1
  -- (parent_level generates to 1 whenever parent_id is set), and it is in the
  -- same project. `no action` on delete is a backstop against a direct database
  -- delete orphaning a level-2 item; there is no delete policy on this table.
  constraint delivery_items_parent_fkey foreign key (parent_id, parent_level, project_id)
    references public.delivery_items (id, level, project_id)
);

comment on constraint delivery_items_parent_fkey on public.delivery_items is
  'Makes a third level unrepresentable: a level-2 item cannot be the parent of anything, because parent_level is always 1 and only level-1 rows match.';

create index delivery_items_project_idx on public.delivery_items (project_id, archived_at);
create index delivery_items_parent_idx on public.delivery_items (parent_id);

alter table public.delivery_items enable row level security;

create policy delivery_items_select on public.delivery_items
  for select using (public.is_member_of(organization_id));
create policy delivery_items_insert on public.delivery_items
  for insert with check (public.is_member_of(organization_id));
create policy delivery_items_update on public.delivery_items
  for update using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));
-- Deliberately no delete policy. Archive only, as with projects and frameworks.

create trigger delivery_items_audit
  after insert or delete or update on public.delivery_items
  for each row execute function public.record_audit_event();
create trigger delivery_items_set_updated_at
  before update on public.delivery_items
  for each row execute function public.set_updated_at();
