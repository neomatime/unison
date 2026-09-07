# Delivery Items in the Briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the executive briefing see below project level — the phase panel charts delivery items, and Key Focus Areas reports blocked ones.

**Architecture:** One new pure module aggregates delivery-item rows into the shape the briefing already renders; `getDeliveryOverview` fetches the rows and calls it; the panel changes the unit it charts and its footnote. No new component and no new zone.

**Tech Stack:** Next.js 16 App Router, React 19 server components, Supabase Postgres 17 with RLS, `node:test`.

## Global Constraints

- **A field in the UI is a claim that the product supports that capability.** This slice adds one line and changes one panel's unit; it must add no other claim.
- **The honest-zero rule.** The panel is labelled as charting items and must **never** silently fall back to charting projects. No items means the absent state, not a zero-filled distribution. No items means no blocked-items claim, not a reassuring "0 blocked".
- The briefing is a live delivery briefing, not an analytics dashboard — no KPI grids, no widget-heavy charts.
- Delivery-item health is Healthy / Watch / At Risk / Critical, a narrowing of `PROJECT_HEALTHS`; `bandFor()` handles all four.
- The framework-selection rule does **not** change: still "the framework with the most active projects", never "the most items".
- The intervention queue stays projects-only. No item-health focus line. Health divergence is out of scope.
- `features/product-ui/components/record-collection-workspace.tsx` must not be modified.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.

---

## File Structure

**Create**
- `features/delivery/item-briefing.ts` — the pure aggregation, no `server-only`, unit testable
- `tests/unit/item-briefing.test.ts`

**Modify**
- `features/delivery/overview-bands.ts` — the `DeliveryOverview` field changes
- `features/delivery/queries/delivery-overview.ts` — fetch items, call the aggregation
- `features/delivery/components/delivery-overview-components.tsx` — the panel's unit, its footnote, the focus line
- `tests/unit/delivery-overview.test.ts` and `tests/unit/ui-completeness.test.ts` — guards

**Known dead code, do not update and do not delete here:** `features/delivery/components/phase-distribution-chart.tsx` exports `PhaseDistributionChart`, which takes `PhaseColumn[]` and is **rendered nowhere** — grep confirms its only occurrence is its own definition. It was orphaned when the briefing gained its own inline chart. It will look like a consumer of the types this plan changes; it is not. Report it; its removal is the final review's to triage.

---

### Task 1: The aggregation, as a pure module

**Files:**
- Create: `features/delivery/item-briefing.ts`
- Test: `tests/unit/item-briefing.test.ts`

**Interfaces:**
- Consumes: `bandFor`, `HEALTH_BANDS`, `PhaseColumn` from `features/delivery/overview-bands.ts`.
- Produces:
  - `BriefingItemRow = { projectId: string; phaseId: string | null; health: string; status: string }`
  - `ItemBriefing = { itemPhaseColumns: PhaseColumn[]; leadingFrameworkItemCount: number; itemsWithoutPhaseCount: number; blockedItemCount: number; blockedItemProjectCount: number; activeItemCount: number }`
  - `summariseDeliveryItems(input: { rows; leadingFrameworkPhases; leadingFrameworkProjectIds; activeProjectIds }): ItemBriefing`

A single named-field argument rather than four positionals: three of the four are sets and arrays that would be trivially swappable at a call site, and a silently transposed pair here means a chart that looks plausible and is wrong.

**Both scopes live in this module**, so both are unit testable — that is why the active-project set is a parameter rather than a filter the caller applies first. The tests pin both: the phase distribution is scoped to the charted framework, because an axis of one framework's phases cannot hold another's; the blocked counts span every **active** project, because "what is stuck" is an organisation-wide question and hiding stuck work outside one framework would be the briefing lying by omission.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/item-briefing.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { summariseDeliveryItems } from '../../features/delivery/item-briefing.ts'

const PHASES = [
  { id: 'ph-1', name: 'Discover', position: 1 },
  { id: 'ph-2', name: 'Build', position: 2 },
  { id: 'ph-3', name: 'Test', position: 3 },
]

// p-1 and p-2 are in the charted framework; p-9 is active but in another
// framework; p-x is not active at all. Three distinct cases the code must
// treat differently, so the fixtures name all three up front.
function summarise(rows: BriefingItemRow[]) {
  return summariseDeliveryItems({
    rows,
    leadingFrameworkPhases: PHASES,
    leadingFrameworkProjectIds: new Set(['p-1', 'p-2']),
    activeProjectIds: new Set(['p-1', 'p-2', 'p-9']),
  })
}

function row(over: Partial<BriefingItemRow> = {}): BriefingItemRow {
  return { projectId: 'p-1', phaseId: 'ph-2', health: 'Healthy', status: 'In Progress', ...over }
}

test('items are counted into the phase they are in', () => {
  const result = summarise([row({ phaseId: 'ph-1' }), row({ phaseId: 'ph-2' }), row({ phaseId: 'ph-2' })])

  assert.deepEqual(result.itemPhaseColumns.map((column) => [column.phase, column.total]), [
    ['Discover', 1], ['Build', 2], ['Test', 0],
  ])
})

test('every phase of the framework appears, including empty ones', () => {
  // An empty column is the useful part of a distribution, not a gap to omit.
  assert.equal(summarise([row({ phaseId: 'ph-1' })]).itemPhaseColumns.length, 3)
})

test('an item with no phase is reported, not dropped', () => {
  const result = summarise([row({ phaseId: null }), row({ phaseId: 'ph-2' })])

  assert.equal(result.itemsWithoutPhaseCount, 1)
  assert.equal(result.leadingFrameworkItemCount, 2)
  assert.equal(result.itemPhaseColumns.reduce((sum, column) => sum + column.total, 0), 1)
})

test('items outside the charted framework are excluded from the distribution', () => {
  const result = summarise([row({ projectId: 'p-1' }), row({ projectId: 'p-9' })])

  assert.equal(result.leadingFrameworkItemCount, 1)
  assert.equal(result.itemPhaseColumns.reduce((sum, column) => sum + column.total, 0), 1)
})

test('an item whose project is not active is excluded from every count', () => {
  // The briefing frames everything by active projects. An item on a completed
  // or archived project must not raise a blocked count nobody can act on.
  const result = summarise([row({ projectId: 'p-x', status: 'Blocked' }), row({ projectId: 'p-x' })])

  assert.equal(result.blockedItemCount, 0)
  assert.equal(result.leadingFrameworkItemCount, 0)
  assert.equal(result.activeItemCount, 0, 'an inactive project contributes nothing')
})

test('activeItemCount spans active projects outside the charted framework', () => {
  // This is what distinguishes "none blocked" from "none recorded" in the
  // focus line, so it must not inherit the framework scoping.
  const result = summarise([row({ projectId: 'p-1' }), row({ projectId: 'p-9' }), row({ projectId: 'p-x' })])

  assert.equal(result.activeItemCount, 2)
  assert.equal(result.leadingFrameworkItemCount, 1)
})

test('blocked counts span every active project, not only the charted framework', () => {
  // "What is stuck" is an organisation-wide question. Scoping it to the charted
  // framework would hide stuck work, which is the briefing lying by omission.
  const result = summarise([
    row({ projectId: 'p-1', status: 'Blocked' }),
    row({ projectId: 'p-1', status: 'Blocked' }),
    row({ projectId: 'p-9', status: 'Blocked' }),
    row({ projectId: 'p-2', status: 'In Progress' }),
  ])

  assert.equal(result.blockedItemCount, 3)
  assert.equal(result.blockedItemProjectCount, 2, 'three blocked items across two projects')
})

test('no items produces an absent distribution, not a row of zeroes', () => {
  // The honest-zero rule. An empty array is what makes the panel render "no
  // items" rather than an axis implying items were placed and none arrived.
  const result = summarise([])

  assert.deepEqual(result.itemPhaseColumns, [])
  assert.equal(result.leadingFrameworkItemCount, 0)
  assert.equal(result.blockedItemCount, 0)
})

test('health is banded through the shared mapping', () => {
  const result = summarise([row({ health: 'Critical' }), row({ health: 'Healthy' })])
  const build = result.itemPhaseColumns.find((column) => column.phase === 'Build')

  assert.equal(build?.counts.Critical, 1)
  assert.equal(build?.counts['On Track / Healthy'], 1)
})
```

Import `type BriefingItemRow` alongside `summariseDeliveryItems`.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test --experimental-strip-types tests/unit/item-briefing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `features/delivery/item-briefing.ts`:

```ts
import { bandFor, HEALTH_BANDS, type PhaseColumn } from './overview-bands'

/**
 * Shared by the server query and its unit tests, so this module must remain
 * free of `server-only` imports — the same split overview-bands.ts and
 * delivery-item-tree.ts already use.
 */

export type BriefingItemRow = {
  projectId: string
  phaseId: string | null
  health: string
  status: string
}

export type ItemBriefing = {
  /**
   * Delivery items of the charted framework's projects, by phase.
   *
   * EMPTY when there are none. That is the honest-zero rule and not an
   * oversight: the panel is labelled as charting items, so an axis of zeroes
   * would imply items were placed and none arrived. An absent register and an
   * empty one are different statements.
   */
  itemPhaseColumns: PhaseColumn[]
  /** Items belonging to the charted framework's projects. */
  leadingFrameworkItemCount: number
  /** Of those, the ones carrying no phase — a real recording gap. */
  itemsWithoutPhaseCount: number
  /** Blocked items across EVERY active project, not only the charted framework. */
  blockedItemCount: number
  /** Distinct projects those blocked items sit in. Different number; easy to conflate. */
  blockedItemProjectCount: number
  /**
   * Items across every active project, blocked or not.
   *
   * This is what lets the focus line tell "none are blocked" from "none are
   * recorded" — the honest-zero rule. leadingFrameworkItemCount cannot serve:
   * it is framework-scoped while the blocked counts are organisation-wide.
   */
  activeItemCount: number
}

export function summariseDeliveryItems({
  rows,
  leadingFrameworkPhases,
  leadingFrameworkProjectIds,
  activeProjectIds,
}: {
  rows: ReadonlyArray<BriefingItemRow>
  leadingFrameworkPhases: ReadonlyArray<{ id: string; name: string; position: number }>
  /** Projects of the framework being charted — always a subset of the active ones. */
  leadingFrameworkProjectIds: ReadonlySet<string>
  /** Every active project. The briefing frames everything by these. */
  activeProjectIds: ReadonlySet<string>
}): ItemBriefing {
  const inFramework = rows.filter((row) => leadingFrameworkProjectIds.has(row.projectId))

  // Blocked reads from every ACTIVE project, not from inFramework: "what is
  // stuck" is an organisation-wide question, and scoping it to the charted
  // framework would hide stuck work behind a chart's axis.
  const inActiveProject = rows.filter((row) => activeProjectIds.has(row.projectId))
  const blocked = inActiveProject.filter((row) => row.status === 'Blocked')

  return {
    itemPhaseColumns: inFramework.length === 0 ? [] : leadingFrameworkPhases.map((phase) => {
      const counts = Object.fromEntries(HEALTH_BANDS.map((band) => [band, 0])) as PhaseColumn['counts']
      let total = 0
      for (const row of inFramework) {
        if (row.phaseId !== phase.id) continue
        counts[bandFor(row.health)] += 1
        total += 1
      }
      return { phase: phase.name, position: phase.position, total, counts }
    }),
    leadingFrameworkItemCount: inFramework.length,
    itemsWithoutPhaseCount: inFramework.filter((row) => row.phaseId === null).length,
    blockedItemCount: blocked.length,
    blockedItemProjectCount: new Set(blocked.map((row) => row.projectId)).size,
    activeItemCount: inActiveProject.length,
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test --experimental-strip-types tests/unit/item-briefing.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Prove the honest-zero guard**

Change `inFramework.length === 0 ? [] :` to always map the phases, re-run, and confirm **"no items produces an absent distribution, not a row of zeroes"** fails. Restore it and confirm it passes. Record the real output in your report — a guard that has never failed is not yet a guard.

- [ ] **Step 6: Commit**

```bash
git add features/delivery/item-briefing.ts tests/unit/item-briefing.test.ts
git commit -m "feat(briefing): aggregate delivery items for the phase panel and blocked count"
```

---

### Task 2: Fetch the items and change the overview's shape

**Files:**
- Modify: `features/delivery/overview-bands.ts`, `features/delivery/queries/delivery-overview.ts`
- Test: `tests/unit/delivery-overview.test.ts`

**Interfaces:**
- Consumes: `summariseDeliveryItems`, `ItemBriefing` from Task 1.
- Produces, on `DeliveryOverview`: `itemPhaseColumns: PhaseColumn[]` (replacing `columns`), `leadingFrameworkItemCount: number` and `itemsWithoutPhaseCount: number` (replacing `lifecycleProjectCount` and `lifecycleUnassignedPhaseCount`), plus `blockedItemCount`, `blockedItemProjectCount` and `activeItemCount`, all `number`.

- [ ] **Step 1: Confirm what actually reads the fields being replaced**

Run: `grep -rn "lifecycleProjectCount\|lifecycleUnassignedPhaseCount\|overview.columns" features/ app/ --include="*.ts" --include="*.tsx"`

Expected: only `features/delivery/components/delivery-overview-components.tsx` and the definitions themselves. **If anything else reads them, stop and report it** — the spec says removing the pair is conditional on nothing else needing them.

Note that `features/delivery/components/phase-distribution-chart.tsx` takes a `columns` prop of the same type but is **rendered nowhere**; it is not a consumer. Do not update it and do not delete it — say so in your report.

- [ ] **Step 2: Change the type**

In `features/delivery/overview-bands.ts`, replace these three lines of `DeliveryOverview`:

```ts
  /** Active projects belonging to the selected lifecycle framework. */
  lifecycleProjectCount: number
  /** Selected-framework projects that do not have a recorded phase. */
  lifecycleUnassignedPhaseCount: number
  columns: PhaseColumn[]
```

with:

```ts
  /** Delivery items belonging to the charted framework's projects. */
  leadingFrameworkItemCount: number
  /** Of those, the ones carrying no phase. */
  itemsWithoutPhaseCount: number
  /**
   * Delivery items by phase, for the charted framework. Named for its unit
   * because it used to carry projects: a field whose meaning changes while its
   * name stays is how a later reader is misled.
   *
   * Empty when there are no items — see the honest-zero rule in item-briefing.ts.
   */
  itemPhaseColumns: PhaseColumn[]
  /** Blocked delivery items across every active project. */
  blockedItemCount: number
  /** Distinct projects those blocked items sit in. */
  blockedItemProjectCount: number
  /** Delivery items across every active project, blocked or not. */
  activeItemCount: number
```

- [ ] **Step 3: Fetch the items**

In `features/delivery/queries/delivery-overview.ts`, add a third entry to the existing `Promise.all` alongside the projects select and `listOrganizationMembers()`:

```ts
    supabase
      .from('delivery_items')
      .select('project_id, current_phase_id, health, status')
      .eq('organization_id', organization.id)
      .is('archived_at', null),
```

Destructure it as `itemResult`, and `if (itemResult.error) throw itemResult.error` beside the existing error check.

**Scope it to active projects in TypeScript, not SQL.** `active` is already computed in this function as the projects whose status is `'Active'`; filtering the fetched rows against that set keeps one definition of "active" rather than duplicating the status literal into a second query where the two could drift.

- [ ] **Step 4: Replace the project-based lifecycle block with the item summary**

Read the block at `features/delivery/queries/delivery-overview.ts:88-120` before editing. Note its shape: `phases` is fetched **inside** the `if (leading)` branch and is scoped to it, so nothing outside that branch can see it today. Keep the leading-framework selection above it **exactly as it is** — the selection rule does not change.

Replace `let lifecycleProjectCount = 0`, `let lifecycleUnassignedPhaseCount = 0` and `let columns: PhaseColumn[] = []` with two variables the branch fills and the summary reads:

```ts
  let leadingPhases: { id: string; name: string; position: number }[] = []
  let leadingProjectIds = new Set<string>()
```

Inside the branch, keep the `framework_phases` fetch and its error check unchanged, then assign instead of counting:

```ts
    leadingProjectIds = new Set(active.filter((row) => row.framework_id === frameworkId).map((row) => row.id))
    leadingPhases = (phases ?? []).map((phase) => ({ id: phase.id, name: phase.name, position: phase.position }))
```

`lifecycleRows` and the whole `columns = (phases ?? []).map(...)` loop go away — the aggregation module does that work now.

**After the branch closes**, so it runs for every tenant:

```ts
  const itemBriefing = summariseDeliveryItems({
    rows: (itemResult.data ?? []).map((row) => ({
      projectId: row.project_id,
      phaseId: row.current_phase_id,
      health: row.health,
      status: row.status,
    })),
    leadingFrameworkPhases: leadingPhases,
    leadingFrameworkProjectIds: leadingProjectIds,
    activeProjectIds: new Set(active.map((row) => row.id)),
  })
```

**Pass every fetched row.** Do not pre-filter to active projects here — the module owns that scoping so it can be unit tested, and filtering in both places is how the two definitions drift apart.

**Calling it outside the branch is load-bearing, not tidiness.** A tenant whose projects carry no framework still has blocked items. Put this call inside `if (leading)` and blocked work vanishes for that tenant — the exact silent-omission class this slice exists to remove. The empty `leadingPhases` and `leadingProjectIds` make the distribution correctly absent while the blocked counts still report.

`PhaseColumn` may become an unused import in this file once `columns` is gone — check, and remove it from the import list if so. It stays exported from `overview-bands.ts`.

Return `...itemBriefing` in place of the three removed fields — all six of its fields land on `DeliveryOverview` under the same names.

- [ ] **Step 5: Add the drift guard**

Append to `tests/unit/delivery-overview.test.ts`:

```ts
test('every delivery-item health bands cleanly for the briefing', () => {
  // itemPhaseColumns reuses PhaseColumn, whose counts are keyed by HealthBand.
  // If a delivery-item health ever stopped mapping, the column counts would be
  // silently wrong rather than loud.
  for (const health of DELIVERY_ITEM_HEALTHS) {
    assert.doesNotThrow(() => bandFor(health), `bandFor has no case for '${health}'`)
    assert.ok(HEALTH_BANDS.includes(bandFor(health)))
  }
})
```

Import `DELIVERY_ITEM_HEALTHS` from `../../features/delivery/schemas/delivery-item.ts`.

- [ ] **Step 6: Typecheck, test and commit**

Run: `pnpm typecheck && pnpm test`
Expected: 0 errors. **The component will not typecheck until Task 3** — if `delivery-overview-components.tsx` is the only failure and it is about the renamed fields, that is expected; fix it in Task 3, not here. Any other failure is real.

If leaving the tree failing at this boundary is unacceptable, fold Task 3 in and commit once — say which you did.

```bash
git add features/delivery/overview-bands.ts features/delivery/queries/delivery-overview.ts tests/unit/delivery-overview.test.ts
git commit -m "feat(briefing): compute the delivery-item summary in the overview query"
```

---

### Task 3: The panel changes unit, and the focus line appears

**Files:**
- Modify: `features/delivery/components/delivery-overview-components.tsx`

**Interfaces:**
- Consumes: the five new `DeliveryOverview` fields from Task 2.

- [ ] **Step 1: Rewire the phase panel's props**

At `delivery-overview-components.tsx:288-294`, `DeliveryHorizon` passes `columns`, `frameworkProjectCount` and `unassignedPhaseCount` into `PhaseDistribution`. Rename the props to carry their new unit and pass the new fields:

```tsx
        <PhaseDistribution
          activeProjects={overview.activeProjects}
          itemColumns={overview.itemPhaseColumns}
          frameworkName={overview.framework?.name ?? null}
          itemCount={overview.leadingFrameworkItemCount}
          itemsWithoutPhaseCount={overview.itemsWithoutPhaseCount}
        />
```

Change the signature and destructuring at line 335 to match (`itemColumns: PhaseColumn[]`, `itemCount: number`, `itemsWithoutPhaseCount: number`), and rename `columns` to `itemColumns` throughout the body — including `totalAssigned` and `coloredColumns`. Keep `activeProjects`: the empty branch still needs it to tell "no projects at all" from "projects but no items".

- [ ] **Step 2: Fix the chart's accessible label**

Line 372 reads:

```tsx
            aria-label={`${totalAssigned} projects assigned across ${columns.length} phases in ${frameworkName}`}
```

**This is the honest-zero rule in its least visible form.** A sighted user will see the heading and the item counts; a screen-reader user gets only this string, and it currently says "projects". Change it to:

```tsx
            aria-label={`${totalAssigned} delivery ${plural('item', totalAssigned)} across ${itemColumns.length} phases in ${frameworkName}`}
```

- [ ] **Step 3: Change the footnote to describe items**

Lines 395-398 currently read `{frameworkProjectCount} of {activeProjects} active projects use {frameworkName}.` That sentence describes projects and must not survive a panel that charts items. Replace the whole `<p>` with:

```tsx
          <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-[var(--briefing-muted)]">
            {itemCount} delivery {plural('item', itemCount)} across {frameworkName}.
            {itemsWithoutPhaseCount > 0 ? ` ${itemsWithoutPhaseCount} ${plural('item', itemsWithoutPhaseCount)} ${itemsWithoutPhaseCount === 1 ? 'has' : 'have'} no phase recorded.` : ''}
          </p>
```

The no-phase clause stays conditional, as it is today: a zero-gap tenant should not read a sentence about a gap it does not have.

- [ ] **Step 4: Make the absent state honest**

`PhaseDistribution` renders `BriefingEmptyState` when the column array is empty. That now covers **four** distinct situations, and the current code only distinguishes three. All four are determinable from the props — do not collapse them:

```tsx
      {itemColumns.length === 0 ? (
        <BriefingEmptyState
          icon={Milestone}
          title={activeProjects === 0
            ? 'No active lifecycle yet'
            : itemCount > 0
              ? 'No lifecycle phases available'
              : 'No delivery items recorded'}
          description={activeProjects === 0
            ? 'Active projects will appear here when delivery begins.'
            : frameworkName === null
              ? 'No active project is connected to a delivery framework.'
              : itemCount > 0
                ? `${frameworkName} has no configured phase sequence to display.`
                : `No delivery items are recorded against ${frameworkName} projects yet.`}
        />
      ) : (
```

Why `itemCount > 0` is the discriminator: the aggregation returns an empty array both when the framework has no phases and when it has no items. With items present and columns still empty, the phases are what is missing; with no items, the items are. Reversing that test tells a tenant its framework is unconfigured when the framework is fine.

**Under no circumstances may this panel fall back to charting projects.** It is labelled as charting items; a chart that changes its unit while keeping its heading is worse than an empty one.

- [ ] **Step 5: Add the blocked-items focus line**

`KeyFocusList` builds `focusItems: FocusItem[]` at line 89 — four entries, each an icon, a tone, a title and a detail. Add a fifth, at the **end** of the array so the existing four keep their order and the intervention line stays first:

```tsx
    {
      icon: overview.blockedItemCount > 0 ? OctagonX : overview.activeItemCount > 0 ? CheckCircle2 : Layers,
      tone: overview.blockedItemCount > 0 ? 'danger' : overview.activeItemCount > 0 ? 'success' : 'brand',
      title: overview.blockedItemCount > 0
        ? `${overview.blockedItemCount} delivery ${plural('item', overview.blockedItemCount)} blocked across ${overview.blockedItemProjectCount} ${plural('project', overview.blockedItemProjectCount)}`
        : overview.activeItemCount > 0
          ? 'No delivery items are blocked'
          : 'No delivery items are recorded',
      detail: overview.blockedItemCount > 0
        ? 'Blocked is the one delivery-item status with no project-level equivalent.'
        : overview.activeItemCount > 0
          ? `None of the ${overview.activeItemCount} recorded delivery ${plural('item', overview.activeItemCount)} is currently blocked.`
          : 'Blocked work cannot be reported until delivery items are recorded against active projects.',
    },
```

Import `OctagonX` and `Layers` from `lucide-react` alongside the icons already imported there.

**Three states, not two, and that is the honest-zero rule.** With no items recorded, this line must not read "no delivery items are blocked" — that implies items were checked and found clear, which is exactly the reassuring falsehood this slice exists to prevent. The neutral `brand` tone belongs to that state: it is neither good news nor bad, it is an absent register.

The title names both numbers because they are different and easy to conflate: seven blocked items across three projects is `7` and `3`, not `7` twice.

**Note on `activeItemCount`:** the spec's field list names only `blockedItemCount` and `blockedItemProjectCount`, but its own honest-zero rule cannot be implemented without knowing whether any items exist at all — `leadingFrameworkItemCount` is framework-scoped while the blocked counts are organisation-wide, so it cannot stand in. Task 1 adds `activeItemCount` for this reason. Flag it in your report as a deliberate addition, not a drift.

- [ ] **Step 6: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 errors; suite passes; build clean.

```bash
git add features/delivery/components/delivery-overview-components.tsx
git commit -m "feat(briefing): chart delivery items by phase, and surface blocked ones"
```

---

### Task 4: Guards

**Files:**
- Modify: `tests/unit/ui-completeness.test.ts`

- [ ] **Step 1: Write the guard**

Append:

```ts
test('the phase panel cannot render a project-derived number under an item heading', () => {
  // The panel is labelled as charting delivery items. It used to chart
  // projects, and the failure mode this guards is the quiet one: a chart that
  // changes its unit while keeping its heading is worse than an empty one.
  const components = readFileSync(join(workspace, 'features', 'delivery', 'components', 'delivery-overview-components.tsx'), 'utf8')

  const start = components.indexOf('function PhaseDistribution')
  assert.ok(start >= 0, 'PhaseDistribution was not found')
  const next = components.indexOf('\nfunction ', start + 1)
  const panel = components.slice(start, next === -1 ? undefined : next)

  // activeProjects is still legitimately used to tell "no projects" from "no
  // items", so the assertion is about what is COUNTED, not what is referenced.
  for (const projectField of ['lifecycleProjectCount', 'frameworkProjectCount', 'active projects use']) {
    assert.ok(!panel.includes(projectField), `the item panel must not report '${projectField}'`)
  }

  assert.match(panel, /itemColumns/, 'the panel must chart the item-derived columns')
  assert.match(panel, /itemCount/, 'the panel must report the item count')

  // The chart's aria-label is the least visible place this can go wrong: a
  // sighted reader sees the heading and the counts, a screen-reader user gets
  // only this string. It said "projects" before this slice.
  const label = panel.slice(panel.indexOf('aria-label'), panel.indexOf('\n', panel.indexOf('aria-label')))
  assert.ok(!/\bprojects\b/.test(label), `the chart's accessible label must not say projects: ${label}`)
  assert.match(label, /item/, "the chart's accessible label must name delivery items")
})

test('the briefing reports blocked delivery items, and can tell none from absent', () => {
  const components = readFileSync(join(workspace, 'features', 'delivery', 'components', 'delivery-overview-components.tsx'), 'utf8')
  const start = components.indexOf('function KeyFocusList')
  const panel = components.slice(start, components.indexOf('\nfunction ', start + 1))

  assert.match(panel, /blockedItemCount/, 'the focus list must read the blocked count')
  assert.match(panel, /blockedItemProjectCount/, 'the focus list must name the projects those items span')
  // Without this, "no items are blocked" gets claimed for a tenant that has
  // recorded no items at all — the honest-zero rule.
  assert.match(panel, /activeItemCount/, 'the focus list must tell "none blocked" from "none recorded"')
})
```

- [ ] **Step 2: Prove both guards**

Break each deliberately — reinstate the projects footnote in the panel, then remove `blockedItemProjectCount` from the focus line — confirm the matching test fails, then restore. Record the real failure output in your report.

- [ ] **Step 3: Run everything and commit**

Run: `pnpm typecheck && pnpm test && pnpm test:rls && pnpm build`
Expected: 0 errors; both suites pass; build clean.

```bash
git add tests/unit/ui-completeness.test.ts
git commit -m "test(briefing): guard the panel's unit and the blocked-items line"
```

---

### Task 5: Signed-in verification

Controller-run. The two preceding slices each shipped a defect past every automated gate that only a person using the page could see.

- [ ] **Step 1** — with no delivery items anywhere, confirm the panel states that none are recorded and does **not** chart projects, and that the focus line says none are recorded rather than "none blocked".
- [ ] **Step 2** — create a project with items in three phases; confirm the distribution matches the database, including an empty column for a phase holding none.
- [ ] **Step 3** — give one item no phase; confirm it is reported in the footnote and excluded from the columns.
- [ ] **Step 4** — block two items in one project and one in another; confirm the focus line reads 3 items across 2 projects, and that the tone changes.
- [ ] **Step 5** — confirm a blocked item in a project **outside** the charted framework still counts, since blocked spans all active projects.
- [ ] **Step 6** — read the chart's `aria-label` off the rendered page and confirm it names delivery items, not projects.
- [ ] **Step 7** — check `preview_logs`, then delete every fixture created.

---

## Notes for the executor

- **The honest-zero rule is the point of this slice, not a detail.** Every tenant has zero delivery items today, so the absent state is what everyone sees first. If you find yourself making a chart render "sensibly" with no data by falling back to another unit, stop — that is the defect.
- **Two scopes, deliberately.** The phase distribution is framework-scoped; the blocked counts span every active project. They are not inconsistent; they answer different questions.
- **Do not touch `phase-distribution-chart.tsx`.** It looks like a consumer and is dead code.
