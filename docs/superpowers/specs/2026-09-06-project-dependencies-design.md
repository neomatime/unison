# Project Prerequisites and Dependencies

**Date:** 2026-09-06
**Status:** Approved, ready for planning
**Requirement:** [`project-dependencies.md`](../../project-dependencies.md), agreed 2026-09-03
**Product definition:** §10

## Why

`project-dependencies.md` states the point plainly:

> The value is not recording a dependency. It is making downstream project risk
> visible and governable across the portfolio.

Today a PM tracks cross-project dependencies in Excel, email and status meetings.
UNISON holds the projects, their frameworks, their phases and their health, and
can therefore answer *"what other projects could prevent this one from
succeeding?"* — but nothing in the product asks it.

This slice makes the relationship explicit, enforces its structural integrity in
the database rather than the UI, and derives its status so it cannot go stale.

## Scope

**In:** the `project_dependencies` table and its integrity rules; a derived
status with a visible reason; a Dependencies tab on the project detail screen
showing both directions, with add and remove.

**Out**, deliberately:

- **Portfolio-level visibility.** §5's cascade view is the eventual goal and the
  requirement says a complex visual graph is not required for the first version.
  See *The traversal lives in one place* for the constraint this places on the
  slice that adds it.
- **Relationship types beyond Prerequisite.** §8 says to model so more can be
  added without rebuilding, and not to expose them without validated demand. The
  column exists; the vocabulary holds one value.
- **Editing an existing dependency.** Add and remove only. A dependency is four
  small facts; changing one is delete-and-recreate, and an update path is a
  second write surface to secure and test for little gain. Revisit on demand.
- **Delivery-item-level dependencies.** §7 draws the product boundary at
  project-to-project governance. UNISON does not replace Jira or Azure DevOps
  dependency handling between stories, tasks or sprint items.

## Schema

One table, `project_dependencies`, in an append-only migration.

`relationship_type` is a column constrained to `'Prerequisite'`, so §8's further
types are an additive change to a check constraint rather than a rebuild.

### Three of the four rules are declarative

Each makes an invalid state **unrepresentable** rather than merely rejected,
following the pattern `delivery_items` established:

- **Same tenant** — composite foreign keys on
  `(dependent_project_id, organization_id)` and
  `(prerequisite_project_id, organization_id)` against
  `projects (id, organization_id)`. The target constraint
  `projects_id_org_unique` already exists.
- **No self-dependency** —
  `check (prerequisite_project_id <> dependent_project_id)`.
- **No duplicates** — a unique index on
  `(organization_id, dependent_project_id, prerequisite_project_id, relationship_type)`.

### Required state is two columns, not one

`required_status` and `required_phase_id`, both nullable, with a check that
**exactly one** is set. A single polymorphic text column would be unvalidatable
and would make Satisfied underivable.

`required_status` is constrained to **`'Active'` and `'Complete'` only**. The
requirement's list — "started, a specific framework phase reached, ready,
deployed, completed" — maps "started" to Active and "completed" to Complete;
Ready and Deploy are phase names in the seeded frameworks, not statuses. `On
Hold` and `Cancelled` are not coherent as things to *require*.

`required_phase_id` must name a phase of the **prerequisite project's own
framework**. The row carries `prerequisite_framework_id` with composite foreign
keys to both `projects (id, framework_id)` and
`framework_phases (framework_id, id)` — the targets
`projects_id_framework_unique` and `framework_phases_framework_id_unique`
already exist. This is the same class of bug the `(framework_id, phase_id)` key
on `projects` prevents: a dependency that requires a phase belonging to some
other framework.

Because `prerequisite_framework_id` is a stored copy, it must be written from
the prerequisite project's current `framework_id` and the composite FK is what
keeps the two honest.

### Other fields

`dependency_owner_id` (nullable, an organisation member), `criticality`,
`required_by_date` (nullable), `notes` (nullable), plus `organization_id` and
timestamps.

**No `archived_at`.** Projects, frameworks, phases and delivery items are soft
deleted because they carry history worth keeping and children that would be
orphaned. A dependency is an edge: it either holds or it does not, it has no
children, and an archived edge is indistinguishable from a deleted one for every
question this feature answers. Removing a dependency is a hard delete, which is
also why the unique index can stay simple — a soft-deleted duplicate would
otherwise block its own recreation.

`dependency_owner_id` uses `on delete set null` semantics consistent with
`projects.owner_id`, so removing a member never deletes the dependency itself.

`criticality` is a small constrained vocabulary. §4 requires the project view to
show "whether the dependency is critical", so two values — `Critical` and
`Standard` — are sufficient and honest. Do not invent a five-point scale.

### Cycle prevention is a trigger, and needs a lock

Postgres has no declarative way to forbid a cycle in a self-referencing edge
table. A `before insert or update` trigger runs a recursive CTE from the new
dependent back through its prerequisites and raises if it reaches the
prerequisite being added. It must reject both `A → B, B → A` and
`A → B, B → C, C → A`.

**The trigger alone is not enough.** Two transactions can each insert an edge
that is individually acyclic but jointly forms a cycle, because neither sees the
other's uncommitted row. Close it with `pg_advisory_xact_lock` keyed on the
organisation, taken at the top of the trigger: cheaper than `serializable`,
scoped to one tenant, and dependency edits are rare. Without it the rule holds
under testing and fails under two PMs editing at once — a rule that only works
when nobody else is working is not a rule.

The function is `security definer` with `set search_path = ''`, following the
convention already in this schema.

### RLS

Follows the existing per-tenant pattern: a member of the organisation may read
and write dependencies belonging to it, and nothing else. Both project
references are already tenant-pinned by their composite keys, so RLS and the
foreign keys agree by construction rather than by discipline.

## Derived status

**Status is never stored.** Pending and Satisfied depend on the prerequisite's
current state, which changes independently of the dependency row. A stored
status goes stale silently — precisely the failure this feature exists to
remove.

The derivation is a **pure function** over a dependency row plus the
prerequisite's state, so it is unit testable away from `server-only`, following
the split `overview-bands.ts` and `item-briefing.ts` established.

- **Satisfied.**
  - For `required_phase_id`: the prerequisite's current phase `position >=` the
    required phase's `position`. "Reached" means reached *or passed*, not "is
    exactly at" — a project in Deploy has evidently passed Build. A prerequisite
    with **no phase recorded** has no position and is therefore not satisfied.
  - For `required_status`: exact match. Project status is a lifecycle
    vocabulary, not an ordered progression, so no `>=` reading exists.
- **Blocked.** The required state is unmet **and** either:
  - `required_by_date` has passed, **or**
  - the prerequisite is `Cancelled` or archived, which makes the required state
    permanently unreachable regardless of any date. A dependency waiting on a
    cancelled project is the clearest possible blockage and must not sit as
    Pending until its date happens to lapse.
- **At Risk.** Unmet, not Blocked, and either `required_by_date` falls within
  **30 days** or the prerequisite's own `health` is `At Risk` or `Critical`.
- **Pending.** Unmet and none of the above.

A dependency with **no `required_by_date`** can never be Blocked by date. It can
still be Blocked by cancellation or archival, and At Risk by the prerequisite's
health. This is a real consequence of making the date optional and is correct:
absent a date, there is nothing to be late against.

The 30-day window matches `PROJECT_DATE_WINDOW_DAYS` already used by the
briefing. Reuse that constant rather than introducing a second one.

### The reason is part of the status

§3 requires the UI to make the reason for a non-Satisfied state visible, in the
shape:

> Claims Mobile App — **Blocked**
> Digital Claims Platform prerequisite has not reached Completed.

So the derivation returns a status **and** a reason string naming the
prerequisite and what it has not reached. A badge without its reason is the
thing this requirement explicitly refuses.

## UI

A fourth tab, **Dependencies**, on the project detail screen alongside Overview,
Framework and Delivery. §4 requires both directions:

- **This project depends on** — prerequisite name, required state, derived
  status with reason, owner, required-by date, criticality.
- **Projects that depend on this** — the same, read-only from this side. A PM
  looking at a project must see the downstream risk it creates, not only the
  risk it carries.

Add and remove. The add form's fields are §9's: prerequisite project, required
state, criticality, owner, required-by date, optional notes. Relationship type
is not a field while the vocabulary holds one value — a select with one option
is a claim of choice the product does not offer.

Validation refuses same-tenant violations, self-reference, duplicates and cycles
**before** the write, with a message naming which rule refused. The database
still enforces all four; the form exists so a PM gets a sentence rather than a
constraint violation.

### The picker-retention rule

This codebase has now found the same defect five times — owner, client, phase,
framework and delivery items. An HTML `select` whose `defaultValue` matches no
option silently falls back to its first, so saving an unrelated field writes the
wrong value over recorded data.

This slice adds three pickers: prerequisite project, required phase and
dependency owner. **All three go through the retention pattern in
`features/delivery/form-options.ts`**, which keeps a recorded-but-no-longer-valid
option visible and labelled rather than dropping it. The prerequisite-project
picker must exclude the current project itself, since self-dependency is
refused.

### Archived and absent

An archived prerequisite project still renders — the dependency is real and its
status is Blocked with cancellation as the reason. Nothing here silently
disappears because a referenced record was archived; a dependency that vanishes
when its prerequisite is archived is how downstream risk gets lost.

## The traversal lives in one place

The recursive CTE that prevents cycles is the same traversal that will produce
§5's cascade view. In this slice, with portfolio visibility out of scope, it
lives **only in the trigger** — the project-detail lists are one-hop joins and
need no traversal.

This is honest for v1, but it places a constraint on the slice that adds the
portfolio view: **it must reuse that traversal**, as a view or set-returning
function, rather than growing a second one. Two implementations of the same
graph walk will disagree eventually, and the disagreement would be between the
rule and the picture of the rule.

## Testing

**RLS tests**, each attempting the write and asserting the **specific constraint
or trigger name** — not merely that an error occurred, since several other
foreign keys on this table raise the same SQLSTATE:

- a cross-tenant edge is unrepresentable, from both directions
- a self-edge is rejected
- a duplicate edge is rejected
- a two-hop cycle (`A → B`, then `B → A`) is rejected
- a three-hop cycle (`A → B`, `B → C`, then `C → A`) is rejected
- a `required_phase_id` naming a phase of another framework is rejected
- both `required_status` and `required_phase_id` set is rejected; neither set is
  rejected
- a member of another organisation cannot read or write these rows

**Unit tests** on the status derivation, which is pure:

- phase satisfied when the prerequisite has passed the required phase, not only
  when it sits exactly on it
- a prerequisite with no phase recorded is not satisfied
- status satisfied on exact match only
- Blocked when the required-by date has passed and the state is unmet
- Blocked when the prerequisite is Cancelled or archived, **with no date set** —
  the case that proves cancellation is independent of the date
- At Risk when the date is inside 30 days, and when the prerequisite's health is
  At Risk or Critical with no date at all
- Pending when unmet with a distant date and healthy prerequisite
- every returned status carries a reason naming the prerequisite

**Guards.** The picker-retention functions get the same unit coverage the
existing four have. Every new guard is proved by reverting the thing it guards
and watching it fail.

## Success criteria

A PM can declare that Digital Claims Platform requires Customer Data Migration
to reach Complete, see it as Pending, and watch it become Satisfied when the
prerequisite completes. Cancelling the prerequisite turns it Blocked with a
reason that says so. Attempting `A → B` when `B → A` exists is refused with a
message about cycles, and the same attempt made concurrently by two people is
still refused. A project shows both what it waits on and what waits on it.

`pnpm typecheck`, `pnpm test`, `pnpm test:rls` and `pnpm build` green from a
clean tree.

## Global constraints

- A field in the UI is a claim that the product supports that capability.
- Integrity rules are enforced structurally, not only in the UI (§6).
- Delivery-item and project health vocabularies are unchanged by this slice.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- Migrations are append-only; never edit one that has been applied.
- `features/product-ui/components/record-collection-workspace.tsx` must not be
  modified.
