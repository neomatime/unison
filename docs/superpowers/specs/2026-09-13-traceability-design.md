# Traceability

**Date:** 2026-09-13
**Status:** Approved, ready for planning
**Build order:** `docs/product-definition.md` §18, item 5 — after Requirements;
before Integrations (Azure DevOps / Jira).

## Why

Requirements records what a project must produce or satisfy. Delivery Items
records what is happening. Governance's Evidence register records what has
been proven. Nothing yet connects them — there is no way to answer *was
requirement X actually built, and is there proof it was verified?*

Requirements' own spec named this explicitly: "No link to delivery items or
evidence. That is Traceability's entire purpose." This slice is that link.

## Scope

**In:** for each requirement on a project, the ability to link it to the
delivery item(s) that build it and the evidence record(s) that verify it,
both many-to-many, surfaced on a new project tab with a derived coverage
status per requirement.

**Out:**

- **No coverage rollup dashboard or chart.** A per-requirement badge is the
  whole of this slice's reporting. An aggregate view (e.g. "62% verified")
  is a real, separate feature to build once this exists to aggregate.
- **No bulk linking.** One link created or removed at a time, matching how
  every other edge in this codebase (`project_dependencies`) works.
- **No cross-project traceability.** A requirement links only to delivery
  items and evidence within its own project — matching Requirements'
  project-scoped design.
- **No linking to anything other than delivery items and evidence.** Not
  risks, decisions, dependencies, or other requirements. If a future need
  for those emerges it is a new, separate design decision.
- **No external tool sync.** That is the Integrations item that follows this
  one in the build order (§18, item 6).

## Schema

Two new join tables, following `project_dependencies`' established pattern
for an edge that "either holds or it does not" — plain rows, no mutable
fields beyond their existence, hard delete, no update policy.

Both requirement and target must belong to the **same project**, not merely
the same organisation — enforced structurally, the same way
`delivery_items_parent_fkey` pins a child to its parent's project. This
requires widening three existing uniqueness constraints (each addition is
free: every table's `id` is already globally unique via its primary key, so
pairing it with columns already fixed per-row costs nothing to satisfy):

```sql
alter table public.requirements
  add constraint requirements_id_project_org_unique unique (id, project_id, organization_id);

alter table public.delivery_items
  add constraint delivery_items_id_project_org_unique unique (id, project_id, organization_id);

-- governance_artefacts.project_id is nullable (framework- or approval-scoped
-- evidence has none) -- this constraint, like the FK below, only ever
-- matches rows where it is set, which is exactly the project-scoped subset
-- this slice links to.
alter table public.governance_artefacts
  add constraint governance_artefacts_id_project_org_unique unique (id, project_id, organization_id);
```

```sql
create table public.requirement_delivery_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  requirement_id uuid not null,
  delivery_item_id uuid not null,
  created_at timestamptz not null default now(),
  unique (requirement_id, delivery_item_id),
  foreign key (requirement_id, project_id, organization_id)
    references public.requirements(id, project_id, organization_id) on delete cascade,
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
  foreign key (requirement_id, project_id, organization_id)
    references public.requirements(id, project_id, organization_id) on delete cascade,
  foreign key (evidence_id, project_id, organization_id)
    references public.governance_artefacts(id, project_id, organization_id) on delete cascade
);
```

Neither table stores `project_id` redundantly for convenience — it is what
makes "same project on both ends" a foreign-key guarantee rather than an
application-level check that could be bypassed by a direct write.

**RLS**, matching `project_dependencies` exactly: `select`/`insert`/`delete`
gated on `public.is_member_of(organization_id)`. No `update` policy — a link
has nothing to update, only to create or remove. `record_audit_event`
trigger on insert/delete, matching every other tenant-scoped table.

## Coverage status (derived, not stored)

Computed per requirement from its link counts, never written to the
database:

- Zero delivery-item links and zero evidence links → **Not linked**
- One or more delivery-item links, zero evidence links → **Built**
- One or more evidence links (regardless of delivery-item count) → **Verified**

This is pure logic over two counts — a small, directly unit-testable
function, the same shape as `dependency-status.ts`.

## UI

A new **Traceability** tab on the project detail screen — the 7th, alongside
Overview / Framework / Delivery / Governance / Dependencies / Requirements.

One row per requirement (empty state: "No requirements recorded" — reused
verbatim, since Traceability has nothing to show without at least one
requirement). Each row shows:

- The requirement's title and the derived coverage badge.
- Its linked delivery items, each listed by name with an "Unlink" control,
  and an "Add delivery item" select scoped to this project's delivery items
  not already linked to this requirement.
- Its linked evidence, same pattern: listed by name with "Unlink", and an
  "Add evidence" select scoped to this project's governance artefacts (only
  the project-scoped ones — framework- or approval-scoped evidence with no
  `project_id` is not offered, since it has no project to be pinned to here)
  not already linked.

No multi-field form and no edit-in-place: the only actions are linking and
unlinking, each a single select-and-submit.

## Testing

**RLS tests**, following `project_dependencies.test.ts`'s pattern:

- a requirement and a delivery item in different projects cannot be linked
  (the composite FK refuses it, not just the UI)
- a cross-tenant link is unrepresentable, from either side
- a member of the organisation can link, see, and unlink
- an outsider can do none of the three
- deleting the requirement, the delivery item, or the evidence removes the
  link (cascade), never leaves it dangling

**Unit tests** for the coverage-status function: the three cases above, plus
the boundary case (evidence present despite zero delivery-item links still
reads "Verified", not "Built").

## Success criteria

A PM can link a requirement to a delivery item, see its badge move from "Not
linked" to "Built", then link it to a piece of evidence and see the badge
move to "Verified". Unlinking removes the connection without touching either
side's own record. A delivery item or evidence record from a different
project is never offered as linkable. A member of another organisation
cannot read or write any link under any path. `pnpm typecheck`, `pnpm test`,
`pnpm test:rls` and `pnpm build` green from a clean tree.

## Global constraints

- Integrity rules are enforced structurally, not only in the UI: same-project
  and same-organisation are both foreign-key guarantees, not application
  checks.
- A field or control in the UI is a claim the product supports that
  capability — this slice claims exactly linking and unlinking, nothing else.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- Migrations are append-only; never edit one that has been applied.
- `features/product-ui/components/record-collection-workspace.tsx` must not
  be modified.
