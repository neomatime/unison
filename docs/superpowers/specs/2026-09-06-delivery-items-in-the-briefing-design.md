# Delivery Items in the executive briefing

**Date:** 2026-09-06
**Status:** Approved, ready for planning

## Why

`delivery-items.md` names the questions the model exists to answer:

> What is currently in Build? What is currently in Test? What is stuck? Where are
> the major pieces of this project right now?

Delivery Items merged today with a `current_phase_id` constrained to the
project's own framework. **Nothing asks those questions yet.** The briefing at
`/overview` computes entirely from project-level fields, so the loop's Detect and
Progress stages stop at the project boundary.

Two consequences today:

- The panel headed **Delivery by phase** charts *projects* per phase. A project
  sits in one phase for months; its items move through Discover, Build and Test.
  The panel that should answer "what is in Build" is occupied by a coarser thing.
- **`Blocked` is invisible.** It is the one delivery-item status with no project
  equivalent, and the sharpest signal below project level. A briefing can read
  "no projects require intervention" while a dozen items sit blocked underneath.

## Scope

**In:** the phase panel switches its unit to delivery items; Key Focus Areas
gains one line for blocked items; the query and its aggregation.

**Out:** everything else on the screen. Specifically:

- **The intervention queue stays projects-only.** Its columns — client,
  framework, next checkpoint — mean different things for an item than a project,
  and a blocked item's owner is not the project's owner. Mixing two units in one
  table reads fine to whoever built it and confuses everyone else.
- **No item-health focus line.** At Risk / Critical at item level largely
  restates what project health should already reflect, and a fifth and sixth
  focus line erodes a panel whose argument is answering five questions in sixty
  seconds.
- **Health divergence is deliberately not built.** When a project reports
  Healthy while three of its items are Critical, that gap is exactly what §11's
  causal visibility is for — and it is a bigger idea than a briefing tweak. Noted
  here so it is a decision rather than an oversight.
- Phase transition history, still out per the locked direction.

## The phase panel changes unit

**Delivery by phase** charts delivery items, for the same leading framework the
panel already selects — the one carrying the most active work. Items belong to
projects, which belong to frameworks, so the axis stays coherent.

**The framework-selection rule does not change.** It stays "the framework with
the most active projects", not "the most items". Two reasons: a framework is a
property of projects, and changing the selection rule at the same time as the
charted unit would make a regression impossible to attribute to either. If item
volume turns out to be the better selector, that is its own change with its own
reasoning.

**A framework with projects but no items shows the absent state**, not a row of
empty columns. The distinction the panel is making is "there are no items to
place", which an axis of zeroes states less clearly than a sentence.

Its footnote changes with it. Today it reads *"4 of 6 active projects use
Regulatory Change."* It becomes the item equivalent, and states how many items
carry **no phase**, because that is a real recording gap and this panel is the
natural place to surface it.

**`PhaseColumn` is reused unchanged.** Its `counts` field is
`Record<HealthBand, number>`, and every delivery-item health value is a member of
`PROJECT_HEALTHS` that `bandFor()` already maps — the narrowing established when
Delivery Items shipped. So the chart's shape survives the change of unit and no
new type is needed.

**Which items:** unarchived items of **active** projects, matching the frame the
rest of the briefing already uses.

## Key Focus Areas gains one line

Blocked items, expressed with the projects they span — *"7 delivery items blocked
across 3 projects"* — or the clear state when none are.

This is the line the briefing most needs and cannot currently give: `Blocked` has
no project-level equivalent, so nothing above it can imply it.

## The honest-zero rule

This is where the change could go wrong, so it is a requirement rather than a
detail.

**The panel will be labelled as charting items. It must never silently chart
something else.** If a tenant has no delivery items — true for every tenant today
— it says so. It must **not** fall back to charting projects: a chart that
quietly changes its unit while keeping its heading is worse than an empty one,
and it is the exact defect class this codebase has spent three slices removing.

The same applies to the focus line. No items means no blocked-items claim, not a
reassuring "0 blocked" that implies items were checked and found clear. An
absent register and an empty one are different statements.

## Query and aggregation

`getDeliveryOverview` gains one select over `delivery_items`, scoped to the
organisation and to active projects, in the same parallel-fetch style it already
uses.

**The aggregation goes in a pure module**, taking rows and returning the counts,
so it can be unit tested away from `server-only` — the split `overview-bands.ts`
and `delivery-item-tree.ts` already established.

`DeliveryOverview` changes, named explicitly so the plan cannot drift from them:

- `columns` becomes **`itemPhaseColumns`**, same `PhaseColumn[]` type. A field
  whose meaning changes while its name stays is how a later reader is misled; the
  name carries the unit now.
- `lifecycleProjectCount` and `lifecycleUnassignedPhaseCount` are replaced by
  **`leadingFrameworkItemCount`** and **`itemsWithoutPhaseCount`**. **Remove the
  project-derived pair only after confirming nothing else reads them** — if
  something does, that is a finding worth reporting, not a reason to leave a dead
  field behind.
- **`blockedItemCount`** and **`blockedItemProjectCount`** are added for the
  focus line. They are different numbers and easy to conflate: seven blocked
  items across three projects is `7` and `3`.

Everything else on `DeliveryOverview` is untouched.

## Testing

**Unit tests** on the pure aggregation:

- items spread across several phases produce the right per-phase totals
- an item with no phase is counted in the no-phase figure and in no column
- blocked items spanning three projects report 3, not the item count, as the
  project figure — the two numbers are different and easy to conflate
- an item whose project is not active is excluded
- **zero items produces the absent state, not a zero-filled distribution** — the
  honest-zero rule, tested directly
- every delivery-item health maps through `bandFor()` into a known band, so the
  reused `PhaseColumn.counts` cannot drift

**A guard** that the panel cannot render a project-derived number under an
item-labelled heading — derived from the source rather than restating a string,
following the guards this codebase already uses.

Every new guard is proved by reverting the thing it guards and watching it fail.

## Success criteria

A project with items in Discover, Build and Test produces a three-column
distribution with those totals. An item with no phase is reported as such rather
than dropped. A blocked item raises the focus line naming both counts. A tenant
with no delivery items sees an honest absent state in both places, and no chart
silently showing projects.

`tsc`, `pnpm test`, `pnpm test:rls` and `pnpm build` green from a clean tree.

## Global constraints

- A field in the UI is a claim that the product supports that capability. This
  slice adds one line and changes one panel's unit; it must add no other claim.
- The briefing is a live delivery briefing, not an analytics dashboard. It must
  not drift back toward KPI grids or widget-heavy charts.
- Delivery-item health is Healthy / Watch / At Risk / Critical, a narrowing of
  `PROJECT_HEALTHS`; `bandFor()` handles all four.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- `features/product-ui/components/record-collection-workspace.tsx` must not be
  modified.
