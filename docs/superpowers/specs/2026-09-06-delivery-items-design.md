# Delivery Items

**Date:** 2026-09-06
**Status:** Approved, ready for planning

Implements [`delivery-items.md`](../../delivery-items.md), the product direction
locked on 2026-09-03. That document is the authority on *what* and *why*; this
spec is *how*. Where they disagree, the direction wins and this changes.

## Why now

The direction's own sequencing put the Projects write path first, because
"Delivery Items on an unwritable parent gives a hierarchy nobody can populate".
That path merged as PR #1–#3, and Frameworks became real in PR #4. Both
prerequisites now exist.

`product-definition.md` §8 makes Delivery Items the generic abstraction for major
execution structure, and §4's operating loop names them under Structure and
Progress — the stage the product currently cannot answer at all below project
level.

## Scope

**In:** the `delivery_items` table with the two-level hierarchy enforced
structurally; framework-supplied level labels; create, edit and archive; the
project detail page's Delivery tab made real; deletion of the nine empty tabs
beside it.

**Out, deliberately:** phase transition history — the direction says "know it is
coming; do not build it yet". Also out: linked test cases, testing status, linked
risks, dependency graphs, requirements coverage, defect status and traceability
health. The direction names all seven explicitly, and the provisioning MFA toggle
is the precedent for why an unbacked field is worse than an absent one.

Nothing here touches user stories, sprints, story points, branches or CI/CD.
The boundary test from the direction: *would an engineer open UNISON daily to do
their job?* If yes, we have built Azure DevOps.

## Making a third level unrepresentable

The direction is explicit that the depth cap is a schema rule, not a convention,
"because principles erode one reasonable request at a time". No triggers, no
application-side validation. Three constraints carry it:

```sql
check (level in (1, 2))

check (
  (level = 1 and parent_id is null and parent_level is null)
  or
  (level = 2 and parent_id is not null and parent_level = 1)
)

foreign key (parent_id, parent_level, project_id)
  references public.delivery_items (id, level, project_id)
```

The composite key is doing three jobs at once: the parent must exist, it must be
**level 1** (because `parent_level` is pinned to 1 by the check above), and it
must belong to the **same project**. A level-2 item parented to another level-2
item cannot be written — Postgres refuses it. This is the same discipline as
`projects_owner_fkey`, and its target needs `unique (id, level, project_id)` on
`delivery_items`.

`parent_level` is redundant data, and that is the point: it is the column that
lets a foreign key express "the parent is a level-1 item", which no single-column
key can say.

**On parent deletion:** `no action`. There is no delete policy on this table —
archive only — so this is a backstop against a direct database delete leaving an
orphaned level-2 item, not a workflow path.

## Constraining the phase to the project's own framework

The direction requires `current_phase_id` to be limited to phases of the
project's own framework, "which is the composite-FK pattern `projects` already
uses". That needs two links, because the item must first be pinned to its
project's framework and then to that framework's phases:

```sql
foreign key (project_id, framework_id)
  references public.projects (id, framework_id)

foreign key (framework_id, current_phase_id)
  references public.framework_phases (framework_id, id)
  on delete set null (current_phase_id)
```

`framework_id` on the item is denormalised deliberately: it is what makes the
second key expressible. The first key keeps it honest — it cannot drift from the
project's framework, because a mismatched pair has no referent.
`projects.framework_id` is `not null`, so there is no null-matching hole here.

**The `(current_phase_id)` column list on `on delete set null` is required, not
decorative.** Without it Postgres nulls every column in the constraint, including
the `not null` `framework_id` — the same defect that produced migration
`20260826111259` and was guarded against again in `projects_owner_fkey`.

Tenant scoping uses the same shape: `(project_id, organization_id) → projects
(id, organization_id)`, and ownership reuses
`(organization_id, owner_id) → memberships (organization_id, user_id)
on delete set null (owner_id)`.

`projects` today carries only a primary key, so this slice adds
`unique (id, organization_id)` and `unique (id, framework_id)` to it. Both are
additive and neither changes any existing behaviour.

## Framework-supplied labels

`frameworks` gains `level_1_label` and `level_2_label`, both nullable text,
editable in the framework form. This is the terminology the direction's central
argument rests on: Epic/Feature, Work Package/Deliverable, Obligation/Control,
supplied per framework so methodology stays configuration rather than three code
paths.

**An unset label renders as "Level 1" / "Level 2", never as an invented default.**
Defaulting to "Epic" would assert a methodology the organisation has not chosen,
which is the opposite of what the model exists to do.

## Fields

**Surfaced:** name, level, parent, project, owner, status, health, current phase,
start date, target date, description.

**Plumbing, present and unsurfaced:** `source_system` and `external_reference`,
nullable throughout the pilot. The direction's reasoning stands — they are
invisible, they claim nothing, and retrofitting external identity mapping onto
populated data is genuinely painful. Plumbing may run ahead of use; product
claims may not.

**Not present at all:** the seven capabilities listed under Scope.

### Status and health

Health reuses `PROJECT_HEALTHS` unchanged — On Track, Healthy, Watch, At Risk,
Critical — because a delivery item's health means the same thing as a project's
and a second vocabulary would invite drift.

Status gets its own list: **Not Started, In Progress, Blocked, Complete.**
`PROJECT_STATUSES` was not reused because "On Hold" and "Cancelled" describe a
commercial engagement rather than a unit of work, and "Blocked" — the state a
delivery lead most needs to see — has no project equivalent.

Both are exported as const arrays and consumed by the form and the zod schema, so
the two cannot drift. Both are backed by check constraints, so the database
refuses a value the UI could never offer.

## Archiving

Archive only; no hard delete and no delete policy, consistent with every other
table. Unarchive is in scope from the start — the Projects slice shipped an
archive with no in-UI undo and that hazard is not repeated.

**Archiving a level-1 item with unarchived children is refused**, with a message
naming how many children block it. This one rule is enforced in the server action
rather than in the schema, and the distinction is worth stating: a level-2 item
whose parent is archived is not *invalid* data — the foreign key still holds,
because `archived_at` does not affect referential integrity — it is merely
confusing. Schema constraints are for invalid states; this is a workflow rule,
and dressing it up as a trigger would misrepresent which is which.

## Screens

**The project detail page's Delivery tab** becomes the Delivery Items surface:
level-1 items with their level-2 children nested beneath, each showing owner,
status, health, current phase and target date, with create, edit and archive.

**A level-2 item is created from its parent's row, never from a free parent
picker.** The parent is implicit in where the user clicked, so it cannot be
mis-set, and `level` is derived rather than chosen — there is no control anywhere
that offers "level 3", which is the UI half of making the depth cap structural.
The project is implicit for the same reason: this surface only ever exists inside
one project.

### The picker retention rule applies here too

This is the fifth instance of one defect. An HTML `select` whose `defaultValue`
matches no option falls back to its first — usually the empty one — so saving any
unrelated field writes `null` over a recorded value. It shipped for `owner_id`
and `client_id`, was fixed for `phase_id` in the Frameworks slice, and for
`framework_id` in that slice's final review.

Both pickers here inherit it:

- **Owner** offers active members, plus the item's own owner when that person has
  since been removed, labelled.
- **Current phase** offers unarchived phases of the project's framework, plus the
  item's own phase when it has since been archived, labelled.

`features/delivery/form-options.ts` already holds the four existing retention
functions; these reuse them rather than adding a fifth and sixth copy. If a
sixth optional foreign key ever reaches a form, retention is not optional.

**Nine tabs are deleted** — Workstreams, Requirements, Documents, Processes,
Testing, Risks, Decisions, Governance, Benefits. All nine render empty registers
over tables that do not exist, which `project-detail-screen.tsx` admits in a code
comment. The Frameworks slice deleted five equivalent tabs for the same reason a
week's work earlier; leaving these would put nine unbacked claims beside a tab
that is now real, which makes them read as more credible rather than less.

Overview, Framework and Delivery remain. The roadmap those tabs sketched lives in
`product-definition.md`, which is where a roadmap belongs.

## Testing

**RLS specs** (`tests/integration/rls/`):

- a level-2 item parented to another level-2 item is refused by the constraint
- a level-1 item with a parent is refused, and a level-2 item without one is
  refused
- a parent in a *different project* is refused
- a `current_phase_id` from another framework is refused
- an owner from another organisation is refused
- deleting a phase nulls `current_phase_id` and leaves `framework_id` intact —
  the assertion that would catch a missing column list on `on delete set null`
- a member of another organisation cannot read or write these rows

**Unit tests:**

- the level/parent rules in the zod schema, matching the database's
- `DELIVERY_ITEM_STATUSES` and the check constraint offer the same values
- an unset framework label renders "Level 1", not an invented default
- the owner and phase pickers retain an item's own removed owner and archived
  phase, and offer neither to a different item — the fifth instance of that
  defect, so it gets the same guard the other four have
- the nine deleted tabs do not return, and no fabricated record survives

Every new guard is proved by reverting the thing it guards and watching it fail,
as on the two preceding slices.

## Success criteria

A signed-in member opens a project, creates a level-1 item and a level-2 item
beneath it, and sets owner, status, health, current phase and target date on
each. The tab shows the hierarchy. A third level cannot be created through the
UI or by a crafted submit. A phase from another framework cannot be set.
Archiving a parent with live children is refused with a message; archiving a
childless item works and is reversible. Framework labels appear where set and
fall back to "Level 1" / "Level 2" where not.

`tsc`, `pnpm test`, `pnpm test:rls` and `pnpm build` green from a clean tree.

## Global constraints

- Migrations are an append-only log; never edit an applied one. Apply through
  the Supabase MCP.
- `on delete set null` on a composite foreign key **must** name its column list.
- Grants do not carry across a signature change, and `revoke ... from public`
  does not strip Supabase's default grant to `anon`.
- `pnpm test:rls` runs against the shared `unison-uat` project and is configured
  `--test-concurrency=1`; every fixture must be registered for `cleanup()`.
- `features/product-ui/components/record-collection-workspace.tsx` must **not**
  be modified.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- A field in the UI is a claim that the product supports that capability. This
  slice removes nine; it must add none.
