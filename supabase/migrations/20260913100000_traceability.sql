-- Traceability: links requirements to the delivery items that build them and
-- the evidence that verifies them. See
-- docs/superpowers/specs/2026-09-13-traceability-design.md.
--
-- Both ends of each link must belong to the SAME project, not merely the
-- same organisation -- enforced structurally via composite foreign keys, the
-- same way delivery_items_parent_fkey pins a child to its parent's project.
-- This requires widening three existing tables' uniqueness: every table's id
-- is already globally unique via its primary key, so pairing it with columns
-- already fixed per-row (project_id, organization_id) costs nothing to
-- satisfy -- these constraints exist purely so the foreign keys below can
-- reference them.
alter table public.requirements
  add constraint requirements_id_project_org_unique unique (id, project_id, organization_id);

alter table public.delivery_items
  add constraint delivery_items_id_project_org_unique unique (id, project_id, organization_id);

-- governance_artefacts.project_id is nullable (framework- or approval-scoped
-- evidence has none). This constraint, like requirement_evidence's foreign
-- key below, only ever matches rows where it is set -- exactly the
-- project-scoped subset this feature links to. Framework- or approval-scoped
-- evidence can never satisfy this foreign key, by construction: NULL never
-- equals a NOT NULL column, so it is structurally unlinkable, not merely
-- unoffered by the UI.
alter table public.governance_artefacts
  add constraint governance_artefacts_id_project_org_unique unique (id, project_id, organization_id);

create table public.requirement_delivery_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  requirement_id uuid not null,
  delivery_item_id uuid not null,
  created_at timestamptz not null default now(),
  unique (requirement_id, delivery_item_id),
  constraint requirement_delivery_items_requirement_fkey
    foreign key (requirement_id, project_id, organization_id)
    references public.requirements(id, project_id, organization_id) on delete cascade,
  constraint requirement_delivery_items_delivery_item_fkey
    foreign key (delivery_item_id, project_id, organization_id)
    references public.delivery_items(id, project_id, organization_id) on delete cascade
);

create table public.requirement_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  requirement_id uuid not null,
  evidence_id uuid not null,
  created_at timestamptz not null default now(),
  unique (requirement_id, evidence_id),
  constraint requirement_evidence_requirement_fkey
    foreign key (requirement_id, project_id, organization_id)
    references public.requirements(id, project_id, organization_id) on delete cascade,
  constraint requirement_evidence_evidence_fkey
    foreign key (evidence_id, project_id, organization_id)
    references public.governance_artefacts(id, project_id, organization_id) on delete cascade
);

comment on table public.requirement_delivery_items is
  'Links a requirement to the delivery item(s) that build it. Both ends must share one project -- enforced by the composite foreign keys, not the application. Status is derived, never stored: see features/delivery/traceability-options.ts.';
comment on table public.requirement_evidence is
  'Links a requirement to the evidence (governance_artefacts) that verifies it. Both ends must share one project -- enforced by the composite foreign keys, not the application.';

create index requirement_delivery_items_requirement_idx on public.requirement_delivery_items (requirement_id);
create index requirement_delivery_items_delivery_item_idx on public.requirement_delivery_items (delivery_item_id);
create index requirement_evidence_requirement_idx on public.requirement_evidence (requirement_id);
create index requirement_evidence_evidence_idx on public.requirement_evidence (evidence_id);

alter table public.requirement_delivery_items enable row level security;
alter table public.requirement_evidence enable row level security;

-- No update policy on either table, matching project_dependencies: a link is
-- an edge, it either holds or it does not, and it has no field worth mutating.
create policy requirement_delivery_items_select on public.requirement_delivery_items
  for select using (public.is_member_of(organization_id));
create policy requirement_delivery_items_insert on public.requirement_delivery_items
  for insert with check (public.is_member_of(organization_id));
create policy requirement_delivery_items_delete on public.requirement_delivery_items
  for delete using (public.is_member_of(organization_id));

create policy requirement_evidence_select on public.requirement_evidence
  for select using (public.is_member_of(organization_id));
create policy requirement_evidence_insert on public.requirement_evidence
  for insert with check (public.is_member_of(organization_id));
create policy requirement_evidence_delete on public.requirement_evidence
  for delete using (public.is_member_of(organization_id));

create trigger requirement_delivery_items_audit
  after insert or delete on public.requirement_delivery_items
  for each row execute function public.record_audit_event();
create trigger requirement_evidence_audit
  after insert or delete on public.requirement_evidence
  for each row execute function public.record_audit_event();
