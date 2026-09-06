# Frameworks write path

**Date:** 2026-09-06
**Status:** Approved, ready for planning

## Why

[`frameworks-audit.md`](../../frameworks-audit.md) established the position: the
database half is small, correct and enforced; the UI half is a closed fixture
world that shares nothing with it but names.

Every tenant is seeded with six frameworks and forty-six phases by
`provision_organization`. The Projects form reads them. The **Frameworks module
reads none of them** — its register, detail screen and five-step wizard all read
`features/delivery/data.ts`. So the two halves of the product disagree about what
a framework is, and coincide only in their names.

`product-definition.md` §3 makes this the core moat: *"UNISON does not force the
organisation to adopt a generic methodology. It digitises the methodology the
organisation has chosen."* Today an organisation cannot add, rename or reorder
anything. It gets HIMARK's six methodologies and no way to express its own.

## Scope

**In:** the register, detail screen and forms driven by the real tables;
framework create and edit; phase add, rename, reorder and archive; route
boundaries; deletion of the fixture world.

**Out, deliberately:** gates, artefacts, evidence, roles, controls and exception
rules — five domains with no tables, and §18 forbids building them before the
operating loop closes. Framework **versioning** is also out: `version` stays a
read-only free-text label, because editing it without version history behind it
is a claim the product cannot keep. Hard deletion of a phase is out; see below.

## Approach: a plain table, not `ModuleWorkspace`

Projects moved onto `ModuleWorkspace`'s connected mode, and consistency argues
Frameworks should follow. It should not.

A tenant has about six frameworks. Search, pagination, bulk select and view tabs
are dead weight at that size, and adopting `ModuleWorkspace` would mean adding a
thirteenth entry to `registry.ts` — a registry whose guards exist to police work
registers, not configuration surfaces. Frameworks is a configuration surface with
an editor attached. No existing workspace does inline ordered-child editing, so
the detail screen is bespoke whichever host the register uses.

So: a server-component table for the register, and a bespoke detail screen. This
is less code than the registry route, and it inherits none of `ModuleWorkspace`'s
controls that would need gating behind `!connected`.

**`RecordCollectionWorkspace` must not be modified.** `FrameworksScreen` uses it
today; this slice satisfies "stop mutating records in local state" by no longer
using it, exactly as Projects did.

## Schema

Two additions. Both are additive; no applied migration is edited.

### `framework_phases.archived_at`

Removing a phase archives it. Live projects keep pointing at it and still display
it; pickers hide it.

This is the pattern `frameworks`, `clients` and `projects` already use, and it
avoids the alternative's defect. `projects_phase_fkey` is
`ON DELETE SET NULL (phase_id)`, so a real delete would silently blank the
current phase of every project sitting in it — the same silent-erasure shape as
the owner bug fixed in PR #2. It also needs no `DELETE` policy, which
`framework_phases` does not have.

**Archiving must be reversible from the UI.** Task 5 of the projects slice
removed a fake Restore button and left archive with no in-UI undo at all; that
hazard is not to be repeated. Unarchive is in scope, for both phases and
frameworks.

**Hard deletion is out of scope entirely.** Neither table has a `DELETE` policy,
and adding one would buy the ability to remove a phase no project has ever used —
little value against a new policy and a new guard. Archive covers the need.

### `reorder_framework_phases(p_framework_id uuid, p_phase_ids uuid[])`

`framework_phases_position_unique (framework_id, position)` means a naive swap
violates the constraint mid-flight. Each PostgREST `.update()` is its own
transaction, so a server action cannot hold the intermediate state — the reorder
has to happen inside one transaction, which means an RPC.

`security definer`, `set search_path = ''`, granted to `authenticated`, and:

- refuses unless `is_member_of` the framework's organisation
- refuses unless `p_phase_ids` contains **every** phase of that framework exactly
  once — no missing, extra or duplicated ids
- rewrites positions to `1..n` in array order, in two statements: negative
  positions first, then flipped positive. Both run in the function's single
  transaction, so no intermediate state is ever visible and the unique constraint
  is never violated.

The array carries archived phases too, so the invariant stays simple: positions
are contiguous across all of a framework's phases. The UI composes active phases
in their new order followed by archived ones in their existing order.

## The projects phase picker inherits PR #2's retention rule

Once phases can be archived, `listProjectFormOptions` must exclude archived
phases **but keep the project's own current phase**, labelled, exactly as
`selectOwnerOptions` keeps a removed owner. Same defect otherwise: the select
falls back to its empty option and the next unrelated edit writes
`phase_id: null`.

This reuses `features/delivery/form-options.ts`, which already exists for that
purpose and is already unit tested.

## Screens

**Register** (`/delivery/frameworks`) — a server-component table: framework,
type, version, phase count, project count, status.

Precisely: **phase count** is the framework's unarchived phases; **project
count** is its unarchived projects, of any status; **status** is derived —
`frameworks` has no status column, so it reads Active or Archived from
`archived_at`. Archived frameworks are **excluded from the register entirely**,
with no toggle in this slice; an archived framework is reachable by its URL,
where it can be unarchived. Both counts come from the query, not the component.

The eight fabricated metric cards are deleted, not connected; the delivery
overview already carries real counts and a register should be a register.

**Detail** (`/delivery/frameworks/[frameworkId]`) — three tabs, all real:

- **Overview** — name, type, version, phase count, project count, archived state
- **Phases** — the ordered list, with add, rename, reorder and archive inline
- **Projects** — live projects governed by this framework

Renamed from "Phases & Gates", because gates do not exist. Workstreams,
Artefacts, Roles, Controls and Versions are deleted.

**Forms** — framework create and edit: `name` (required, unique per
organisation), `type` (optional), archive/unarchive. `version` is displayed and
not editable.

Both uniqueness constraints are reachable by ordinary use — two frameworks named
"Client Onboarding" in one organisation, two phases named "Design" in one
framework. Each must surface as a **field-level message, not a 500**: the actions
catch Postgres `23505` and return the offending field's error, the way
`create-project.ts` handles a foreign-key violation.

`type` is validated as a zod enum exported from the schema module, so the form
and the schema cannot drift — the pattern `PROJECT_STATUSES` established. No
database check constraint is added: nothing branches on `type`, and the column is
nullable free text today. Add the constraint when something depends on it.

**Boundaries** — `error.tsx` and `loading.tsx` under `delivery/frameworks/`, as
`operations/projects/` has.

## Deleted

- `features/delivery/components/framework-form.tsx` — the five-step wizard. It
  has no `name` attributes and sets `setSaved(true)`; four of its five steps
  collect data for domains with no tables. Wiring it would mean building all of
  them.
- The eight fabricated metric cards in `frameworks-screen.tsx` — of the three
  checkable against the database, all three are wrong.
- Five detail tabs, the fabricated framework code, version history and project
  list.
- The `frameworks` and `deliveryPhases` fixtures in `features/delivery/data.ts`,
  and any fabricated owner or person names they carry.

## Testing

**RLS specs** (`tests/integration/rls/`):

- `reorder_framework_phases` refuses a framework in another organisation
- it refuses an array that is not exactly that framework's phase set — one
  spec each for a missing id, an extra id and a duplicated id
- it rewrites positions contiguously in array order, and the unique constraint
  is never violated by the intermediate state
- an archived phase remains a valid `phase_id` for a project already in it —
  `archived_at` must not affect the foreign key
- archiving a phase does not change any project's `phase_id`

**Unit tests:**

- the phase-option retention rule: an archived phase is offered when it is the
  project's current phase and excluded otherwise. **Proved by reverting the
  retention branch and watching it fail**, as PR #2's guard was.
- `frameworkInputSchema` rejects an unknown `type` and requires `name`
- a duplicate framework name and a duplicate phase name each return a
  field-level message rather than throwing
- no fabricated framework name, metric value or the wizard file survives

## Success criteria

A signed-in member sees the six seeded frameworks with real phase and project
counts. Creating a framework writes a row and lands on its detail page. Adding,
renaming, reordering and archiving phases persist and survive a reload.
Unarchiving works from the UI. An archived phase disappears from the projects
form's phase picker but still displays on a project already in it. Reordering is
atomic — no intermediate state violates position uniqueness.

`tsc`, `pnpm test`, `pnpm test:rls` and `pnpm build` green from a clean tree,
verified with `git stash --include-untracked` rather than from the working copy.

## Global constraints

- Migrations are an append-only log; never edit an applied one. Apply through
  the Supabase MCP.
- `on delete set null` on a composite foreign key **must** name its column list.
- Grants do not carry across a signature change, and `revoke ... from public`
  does not strip Supabase's default grant to `anon`.
- A `security definer` function sets `search_path = ''` and checks authorisation
  in Postgres, not in the caller.
- `pnpm test:rls` runs against the shared `unison-uat` project. Every fixture
  must be registered for `cleanup()`.
- `features/product-ui/components/record-collection-workspace.tsx` must **not**
  be modified — ten-plus screens depend on its local-state behaviour.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- A field in the UI is a claim that the product supports that capability
  (`docs/product-principles.md`). This slice removes several; it must add none.
