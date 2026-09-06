# Frameworks: what exists, what is enforced, what is only UI

**Audit date 2026-09-06.** Written to satisfy
[`product-definition.md`](product-definition.md) §20, which requires the current
Frameworks model to be inspected — *what already exists, what is only UI, what is
actually enforced, what requires schema work, what can remain configuration, and
what would create unnecessary complexity* — before any design work begins.

This is an inspection, not a proposal. It records the state of the code and the
database on the date above. The design conversation it feeds is a separate step.

## Summary

The database half is small, correct and genuinely enforced. The UI half is a
closed fixture world that shares nothing with it but names.

Frameworks is where Projects was before its write path — with one difference
that makes it worse: Projects' register at least read real rows. The Frameworks
module reads none. Its register, its detail screen and its five-step wizard are
all backed by `features/delivery/data.ts`, while the six real frameworks those
screens claim to describe are read only by the *Projects* form.

## What exists and is enforced

Two tables, seeded per tenant by `provision_organization` — every provisioned
organisation gets six frameworks and forty-six phases, so the old follow-up
"new tenants have no delivery frameworks" is resolved.

**`frameworks`** — `id`, `organization_id`, `name`, `type`, `version`,
`archived_at`, `created_at`, `updated_at`.

**`framework_phases`** — `id`, `framework_id`, `organization_id`, `name`,
`position`. No timestamps and no `archived_at`.

Enforced, verified against the live database:

| Constraint | What it makes impossible |
| --- | --- |
| `frameworks_name_unique (organization_id, name)` | two frameworks with one name in a tenant |
| `framework_phases_framework_fkey (framework_id, organization_id) → frameworks(id, organization_id) ON DELETE CASCADE` | a phase belonging to another tenant's framework |
| `framework_phases_name_unique (framework_id, name)` | two phases with one name in a framework |
| `framework_phases_position_unique (framework_id, position)` | two phases claiming the same position |
| `framework_phases_framework_id_unique (framework_id, id)` | — it is the target for the projects key below |
| `projects_phase_fkey (framework_id, phase_id) → framework_phases(framework_id, id) ON DELETE SET NULL (phase_id)` | a project whose phase belongs to a different framework |

That last one is §9's rule already holding for Projects: a mismatched
framework/phase pair is **unrepresentable**, not merely rejected. Delivery Items'
`current_phase_id` should copy this shape exactly, column list included.

RLS: `select` / `insert` / `update` on both tables, all `is_member_of(organization_id)`.
**No `delete` policy on either**, consistent with `projects`. Audit triggers on
both; `set_updated_at` on `frameworks` only, since `framework_phases` has no
`updated_at` column to set.

Ordering is real: `position` is `not null` and unique per framework, and the
`(framework_id, position)` index means the phase sequence is a first-class
property rather than a display convention.

## What is only UI

**There are no framework server actions and no framework queries.** No file in
`features/delivery/actions/` or `features/delivery/queries/` mentions frameworks
except as a join in the Projects queries. All four routes under
`app/(unison)/delivery/frameworks/` render client components that import from
`../data`.

### The register (`frameworks-screen.tsx`)

Eight hard-coded metric cards, none computed from anything:

> Published 6 · Draft 2 · Under Review 3 · Projects Covered 42 (91% adoption) ·
> Phases 48 · Gates 39 · Artefacts 126 (74 mandatory) · Health 94%

Three of those are checkable against the database and all three are wrong: there
are **6** frameworks, not 11 across three statuses; there are **46** phases, not
48; and there is no gates or artefacts table at all, so 39 and 126 describe
nothing. This is the same defect class as the six fabricated metric cards deleted
from `ProjectsScreen`.

Its columns are Framework, Type, Owner, Projects, Version, Review, Status,
Updated. Of those, only **name, type and version** exist in the database.
`owner`, `projects`, `review`, `status` and `health` are fixture-only fields.

Its form fields include a **"Framework Code", marked required** — no such column
exists. Its contextual actions are **Publish, Create New Version, Compare
Versions** — there is no versioning table, so all three name capabilities the
product does not have.

### The wizard (`framework-form.tsx`, serving both `/new` and `/edit`)

Five steps — Framework Basics, Phases & Gates, Workstreams, Artefacts & Roles,
Controls & Metrics. It has **no `name` attributes on any field** and no form
action; its submit sets `setSaved(true)`.

This is precisely the defect the Projects spec described: *"a four-step wizard
whose submit handler sets local state, whose fields have no `name` attributes,
and which shows a 'Project created' panel having written nothing."* The same
sentence is true here, with one more step.

### The detail screen (`framework-detail-screen.tsx`)

Eight tabs — Overview, Phases & Gates, Workstreams, Artefacts, Roles, Controls,
Projects, Versions. Six of the eight name domains with no table behind them.

It resolves its framework with `frameworks.find(...)` against the **fixture**, so
it is keyed by slugs like `business-technology-change` while the real rows carry
uuids. It renders `deliveryPhases` — a single global fixture list — rather than
the phases of the framework being viewed, so every framework displays the same
lifecycle regardless of the 6-to-8 phase sequences actually stored. It also
carries a fabricated framework code (`BTC-01`), a fabricated version history
(`v3.1`, `v3.2`, `v3.3 Draft`) and a fabricated project list.

### The consequence worth naming

The Frameworks module and the Projects form disagree about what a framework is.
The Projects form offers six real frameworks by uuid, correctly excluding
archived ones. The Frameworks register shows six fixture frameworks by slug, with
owners, health and review dates that exist nowhere. They coincide only in their
names — which is why the disagreement is easy to miss.

## What would need schema work

Everything §3 asks Frameworks to control, except the two things already present:

| §3 capability | State |
| --- | --- |
| lifecycle phases | **exists and is enforced** |
| ordering / progression sequence | **exists** (`position`, unique per framework) |
| gates | no table |
| required artefacts | no table |
| required evidence | no table |
| roles | no table |
| approval rules | no table |
| governance controls | no table |
| Delivery Item terminology | no columns |
| exception rules | no table |
| versioning / lifecycle | no table; `version` is free text with no history |

## What can remain configuration

- **`type`** is nullable free text. The UI offers Enterprise / Technology /
  Operations / Compliance / Commercial. It needs a check constraint or an enum
  only if something branches on it; nothing does today.
- **Delivery Item terminology** (§8's Epic/Feature, Work Package/Deliverable,
  Obligation/Control) is two nullable label columns on `frameworks`, not a new
  domain. It is the cheapest item on the §3 list and the one Delivery Items
  actually needs.
- **Phase sequence** is already configuration and already enforced.

## What would create unnecessary complexity

- **Versioning with instantiation semantics.** The UI promises it three times
  (Versions tab, Create New Version, Compare Versions), but it forces a hard
  product decision first: does a project pin the framework version it was created
  under, and what happens to in-flight projects when a framework changes? Until
  gates and artefacts exist there is little to version, and answering it early
  would constrain them.
- **Building gates, artefacts, evidence, roles and controls together.** That is
  five new domains at once, before any of them has been exercised by a real
  project. §18's warning against speculative sophistication applies directly.
- **A generic rules engine** for progression and exception rules. §3 asks for
  the behaviour, not for a rules engine, and the difference is large.

## Observations for whoever designs the next step

1. **The read path is the cheap half and it is missing.** Making the three
   screens read the real tables — deleting the fabricated metrics and the
   invented columns — needs no schema at all. It would stop the two halves of
   the product disagreeing, and it is the same move that unblocked Projects.
2. **The wizard should probably be deleted rather than wired**, as the Projects
   wizard was. Four of its five steps collect data for domains that do not
   exist; wiring it would mean building all of them.
3. **Gates are the natural first governance primitive**, because §4's loop names
   Govern and a gate is the thing a project is refused progression by. Artefacts
   and evidence hang off gates; roles and approval rules hang off both.
4. **`framework_phases` has no `archived_at` and no timestamps.** Renaming or
   reordering phases under live projects is currently silent and untraceable,
   though the audit trigger does record it.
5. **There is no delete policy**, so a framework can only be archived — but
   `archived_at` is on `frameworks` only, and the Projects form already filters
   on it. An archived framework's projects keep working; only the picker hides
   it. That asymmetry is worth a deliberate decision rather than inheritance.
