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

Nothing here touches user stories, tasks, sprints, story points, branches or
CI/CD. The boundary test from the direction: *would an engineer open UNISON
daily to do their job?* If yes, we have built Azure DevOps.

The full exclusion list, unchanged and not to be quietly relaxed during
implementation: user stories, tasks, sprints, story points, testing status,
linked test cases, linked risks, dependency graphs, requirements coverage,
defect status, traceability health, phase transition history.

**Sequencing is unchanged** by anything in this spec: Projects write path →
Frameworks write path → **Delivery Items** → Project Dependencies and
Prerequisites → Requirements → Traceability → Integrations. This slice is the
third of those and does not borrow from the fourth.

## Making a third level unrepresentable

The direction is explicit that the depth cap is a schema rule, not a convention,
"because principles erode one reasonable request at a time". No triggers, no
application-side validation. Three constraints carry it:

```sql
level int not null check (level in (1, 2)),

-- Generated, never written by the application. This is the column that lets a
-- foreign key say "the parent is a level-1 item", which no single-column key
-- can express.
parent_level int generated always as (case when parent_id is null then null else 1 end) stored,

check ((level = 1 and parent_id is null) or (level = 2 and parent_id is not null)),

foreign key (parent_id, parent_level, project_id)
  references public.delivery_items (id, level, project_id)
```

The composite key does three jobs at once: the parent must exist, must be
**level 1**, and must belong to the **same project**. Its target needs
`unique (id, level, project_id)` on `delivery_items`.

**`parent_level` is a generated column, which removes the boilerplate cost of
the redundancy.** This was probed against the live database before being
specified — a scratch table with exactly these constraints, seven insert
scenarios, then dropped:

| Attempt | Result |
| --- | --- |
| level 1, no parent | accepted |
| level 2 under a level 1 | accepted |
| **level 3** | refused `23514` |
| **level 2 under a level 2** | refused `23503` |
| level 1 *with* a parent | refused `23514` |
| level 2 with no parent | refused `23514` |
| parent in another project | refused `23503` |

Postgres accepts a stored generated column in a composite foreign key, and the
invariant holds in every direction. The practical cost the addendum asked to
weigh comes out near zero: the application never writes `parent_level`, so
inserts and updates carry no extra field, server actions gain no branch, and the
generated type is one nullable integer nobody sets. The only additions are one
unique index and a column comment explaining why the column exists.

**The alternative considered and rejected:** two tables, `level_1_items` and
`level_2_items`, which makes a third level unrepresentable without any redundant
column. It was rejected because it duplicates every shared column, doubles the
RLS policies and server actions, turns every read into a union, and contradicts
the direction's own model — "a Delivery Item has a **level**", one entity, not
two. That is more boilerplate than the generated column, not less.

Application-side validation and a trigger were both ruled out by the direction
itself, which requires the cap to be structural.

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

**Health is four values: Healthy, Watch, At Risk, Critical.** "On Track" is
deliberately not offered at Delivery Item level.

This was challenged rather than inherited, and the evidence is that `On Track`
and `Healthy` are already duplicates in this codebase:

- `delivery-primitives.tsx:35-36` styles them identically —
  `bg-emerald-50 text-emerald-800` for both.
- `overview-bands.ts` collapses them into a single band, `On Track / Healthy`,
  with a comment saying the grouping is intentional.
- Nothing anywhere branches on the difference. Two values, one meaning.

At Delivery Item level the overlap is worse than at project level, because
`status` already carries the schedule dimension — Not Started, In Progress,
**Blocked**, Complete — and a target date carries the rest. "On Track" is a
statement about schedule; an item that is Blocked is by definition not on track,
so offering both invites a row that reads `Blocked · On Track`. "Healthy" makes
no schedule claim, so status and health stay orthogonal: **status says where the
work is, health says what condition it is in.**

Dropping "On Track" rather than "Healthy" is the choice that removes the
ambiguity instead of relocating it.

**This is a narrowing, not a divergent vocabulary.** All four values are members
of `PROJECT_HEALTHS`, and `bandFor()` already maps every one of them correctly,
so a delivery item's health aggregates through the existing briefing bands with
no new mapping and no drift. The cost, stated plainly: a project may read
`On Track` while an item beneath it reads `Healthy`, and they mean the same
thing. That is the price of removing the duplicate, and it is smaller than
carrying an overlap into a new table.

Note the existing fixture register on the Delivery tab already offered four
values rather than five — it used `On Track` where this spec uses `Healthy`. The
count was right; the word was the one that collides with status.

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

### A retained archived phase must say so on the record, not only in the picker

Retention keeps the data honest. It must not make the *display* dishonest: an
item still sitting in a phase its framework has since archived must show that,
rather than rendering the phase as though it were current.

```
Current phase
Test
Archived in framework
```

The second line is a restrained qualifier in muted text, not a badge, a warning
colour or an alert — the phase is a legitimate recorded state, not an error, and
treating it as a problem would overstate it. It appears wherever the item's phase
is shown: the Delivery tab row and the item's own detail.

No schema supports this; `framework_phases.archived_at` already carries it and
`getFramework` already reads it. This is a presentation requirement only.

**Nine tabs are deleted** — Workstreams, Requirements, Documents, Processes,
Testing, Risks, Decisions, Governance, Benefits. All nine render empty registers
over tables that do not exist, which `project-detail-screen.tsx` admits in a code
comment. The Frameworks slice deleted five equivalent tabs for the same reason a
week's work earlier; leaving these would put nine unbacked claims beside a tab
that is now real, which makes them read as more credible rather than less.

Overview, Framework and Delivery remain. The roadmap those tabs sketched lives in
`product-definition.md`, which is where a roadmap belongs.

**Three tabs must read as the deliberate product surface, not as nine missing
ones.** A tab strip built for twelve and carrying three looks stripped; the same
three, spaced and weighted for three, look focused. So the strip is re-laid out
rather than merely shortened — sized to its contents instead of scrolling,
with the surrounding header carrying enough context that the page reads as
complete on arrival. No placeholder tabs, no "coming soon", no greyed-out
entries: an absent capability is a roadmap conversation, and a disabled tab is
the same unbacked claim in a duller colour.

The test is that a first-time viewer should not be able to tell that tabs were
removed.

### Room for causal context, without claiming it now

§11 of `product-definition.md` sets the visibility principle — *what → why →
impact → owner → intervention required* — and Delivery Items are where that will
eventually be answered below project level.

Nothing in this slice implements any of it, and no field, column or label may
hint at it. But the row and detail must not be *shaped* so that adding it later
means a redesign:

- the row renders from a single item view-model rather than positional cells, so
  a later "why" line is an addition to that model, not a re-cut of the table
- the detail is a section stack, not a fixed two-column grid, so a future
  cause-and-impact block is one more section
- the phase qualifier introduced above is the first instance of the pattern —
  a secondary line beneath a primary value — and later causal context reuses that
  shape rather than inventing a second one

This is a layout constraint, not scope. If it starts to look like scope in
implementation, it has been misread: build the six fields and nothing else.

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
- `DELIVERY_ITEM_STATUSES` and `DELIVERY_ITEM_HEALTHS` each offer exactly what
  their check constraint accepts, and no more
- `DELIVERY_ITEM_HEALTHS` does not contain `On Track`, and every value it does
  contain is a member of `PROJECT_HEALTHS` and is handled by `bandFor()` — the
  test that keeps the narrowing a narrowing rather than a fork
- an item whose phase is archived renders the qualifier; one whose phase is
  active does not
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
fall back to "Level 1" / "Level 2" where not. An item whose phase has since been
archived says so on the record rather than showing it as current.

**And the criterion that is not a checklist item:** *a project with Delivery
Items reads as a coherent governed-delivery surface, not a generic nested work
tracker.* The structure, ownership, progress and governance context should be
what the screen is obviously for. If it reads as a place to manage sprints or
tasks, the slice has failed even with every other criterion met — and the
boundary test from the direction applies: would an engineer open this daily to
do their job? If yes, we have built Azure DevOps.

The three remaining project tabs should look like the current product, not like
the remains of a larger one.

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
