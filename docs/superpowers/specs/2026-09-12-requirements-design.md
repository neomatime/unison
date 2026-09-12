# Requirements

**Date:** 2026-09-12
**Status:** Approved, ready for planning
**Build order:** `docs/product-definition.md` §18, item 4 — after Projects, Delivery
Items and Project Dependencies; before Traceability.

## Why

Nothing in UNISON today records what a project is actually supposed to deliver.
Delivery Items record what is happening. Risks record what could go wrong.
Nothing records the thing both are measured against.

Traceability — next in the build order — needs something to link delivery
items and evidence back to: *prove requirement X was actually built and
tested.* Requirements is that something.

Unlike Delivery Items and Project Dependencies, this feature had no locked
direction doc before this spec. `docs/product-definition.md` §18 names it in
one line; `docs/product-principles.md` §9 lists **Requirement** as a
first-class entity alongside delivery item, risk, decision, approval, evidence
and dependency — the family this feature joins. Everything else here was
decided in this brainstorm, not inherited.

## Scope

**In:** a project-scoped register of formal, discrete requirements — what the
project must produce or satisfy — each with a priority and a status lifecycle,
owned and dated the same way risks and dependencies already are. Full CRUD
through a new tab on the project detail screen.

**Out**, both by explicit precedent from the two slices immediately before
this one:

- **No link to delivery items or evidence.** That is Traceability's entire
  purpose. Building a link now would mean guessing at a shape Traceability
  hasn't been designed to need — the same reasoning Project Dependencies used
  to defer picker retention until an edit path existed to need it.
- **No representation on the executive briefing.** Delivery Items shipped
  without touching `/overview`; briefing integration arrived as its own
  separate follow-up slice once the base feature existed. Project Dependencies
  followed the same sequencing. Requirements should too.
- **No routing through the real approvals infrastructure.** `approval_decisions`,
  `approvals`, `governance_gates` and `governance_artefacts` already exist as
  real, RLS-enabled tables (from the phase-seven governance migration) — not
  fixtures. A Requirement's `Approved` status is a plain stored value a PM or
  approver sets directly, not a routed decision through that infrastructure.
  That module's actual maturity is unaudited; building on top of it sight
  unseen would be exactly the "speculative sophistication" §18 warns against.
- **No status transition rules.** Every status field already in this schema —
  delivery items, risks — allows any value to any value with no enforced
  order. Requirements matches. Inventing a workflow engine for one entity
  while its siblings have none would be new complexity with no precedent and
  no stated need.
- **No category/type taxonomy** (Functional / Non-Functional / Regulatory).
  §9 states that method-specific vocabulary belongs in framework
  configuration, not a hardcoded enum — a categorisation scheme is exactly
  that kind of organisation-specific vocabulary, and inventing one now would
  be a bigger design question than this slice needs to answer.
- **No programme-level requirements.** Project-scoped only, matching every
  other entity built so far (delivery items, risks, dependencies). A
  programme-wide requirement cascading to several projects is a real,
  separate design question — deciding how its status would derive from its
  children's is precisely the kind of complexity to defer until there is a
  programme-level entity that actually needs it.

## Schema

One new table, `requirements`, copying `project_risks`' shape exactly — same
migration this codebase already uses for this class of entity, from
`20260910130104_core_delivery_governance.sql`:

```sql
create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  title text not null,
  description text,
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Critical')),
  status text not null default 'Draft' check (status in ('Draft','Approved','In Progress','Delivered','Verified')),
  owner_id uuid,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  foreign key (organization_id, owner_id) references public.memberships(organization_id, user_id) on delete set null (owner_id)
);
```

**`priority`** uses `Low/Medium/High/Critical` — the vocabulary already
repeated across `project_risks`, `support_tickets`, `support_cases` and
`integration_connections` error priority in this schema, not a fifth
invented scale.

**`status`** is `Draft → Approved → In Progress → Delivered → Verified`,
unconstrained between values, stored as a plain column — never derived, never
routed through the approvals tables. Nothing yet exists to derive it from;
that is a decision for whenever Traceability exists to make it, not this
slice's to pre-empt.

**RLS, triggers and grants** follow `project_risks` exactly: full CRUD
(`select`/`insert`/`update`/`delete`) gated on
`public.is_member_of(organization_id)`, `set_updated_at` and
`record_audit_event` triggers, revoked from `anon`, granted to `authenticated`.

**No `archived_at`, deliberately** — the schema above has none, matching
`project_risks`. A requirement's lifecycle is already fully expressed by
`status`; a superseded or abandoned one moves to whatever status means that,
the same way a risk does. Removal is a hard delete, which the delete policy
above exists to allow. This is not an oversight to "fix" toward the
soft-delete pattern `projects` and `delivery_items` use — those carry history
and children worth preserving; a requirement row does not yet.

**Structural integrity**, matching every other entity in this family: the
composite foreign key on `(project_id, organization_id)` makes a
cross-tenant requirement unrepresentable, not merely rejected. The owner
foreign key on `(organization_id, owner_id)` with `on delete set null
(owner_id)` means a removed member's requirements survive with ownership
cleared, never with a dangling reference.

## UI

A fifth tab on the project detail screen — **Requirements**, alongside
Overview / Framework / Delivery / Governance / Dependencies.

**Correction found during planning, resolved with the user:** the Governance
tab (Risks/Decisions/Approvals/Evidence) is genuinely create-only today — no
edit, no delete, no owner assignment on any of its four registers, despite the
database permitting all of it. This spec originally said Requirements would
follow "the Governance tab's existing structure" while also requiring an edit
path and an owner picker — those two statements were in tension, since
Governance has neither. Decided: **Requirements gets full CRUD** — add, edit
(including moving status through its lifecycle and assigning an owner), and
delete. A status lifecycle that can never move is decorative, not a feature.
This makes Requirements more capable than its four Governance siblings today;
that is a real, visible inconsistency worth a follow-up note, not a reason to
hold Requirements back to match a thinner precedent.

No read-only counterpart section (unlike Dependencies, which has one because
a dependency is visible from both ends of the edge; a requirement belongs to
exactly one project and is never visible from anywhere else).

Fields on the form: title, description, priority, status, owner, target date
— matching the schema exactly, nothing implied that isn't stored.

**The picker-retention rule applies to the owner picker**, the same class of
defect found five times already in this codebase (owner, client, phase,
framework, delivery items). Since this slice has both an add path and an edit
path from day one — unlike Dependencies, which deferred retention because it
had no edit path to need it — the owner picker must go through
`features/delivery/form-options.ts`'s retention pattern from the start, not
as a follow-up.

## Testing

**RLS tests**, following the pattern this codebase already uses, each
asserting the specific constraint name rather than only a SQLSTATE:

- a cross-tenant requirement is unrepresentable, from the project side
- an owner outside the organisation is refused
- a member of the organisation can read, write and delete
- an outsider can neither read, write nor delete
- removing a member sets `owner_id` null rather than orphaning the row

**No pure aggregation module is needed for this slice.** Unlike
`risk-severity.ts` or `dependency-status.ts`, nothing here is derived from two
axes or computed from another entity's state — priority and status are both
plain stored values a form writes directly. There is nothing to unit test that
isn't already covered by the picker-retention functions' existing tests.

## Success criteria

A PM can record a requirement on a project, set its priority and status, and
see it listed on the Requirements tab. Removing the assigned owner leaves the
requirement intact with ownership cleared, not erased. A member of another
organisation cannot read or write it under any path. `pnpm typecheck`,
`pnpm test`, `pnpm test:rls` and `pnpm build` green from a clean tree.

## Global constraints

- A field in the UI is a claim that the product supports that capability —
  this slice claims exactly six fields and nothing else.
- Integrity rules are enforced structurally, not only in the UI.
- The picker-retention pattern applies to the owner picker from day one, since
  this slice ships with an edit path unlike Dependencies.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- Migrations are append-only; never edit one that has been applied.
- `features/product-ui/components/record-collection-workspace.tsx` must not
  be modified.
