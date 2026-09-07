import assert from 'node:assert/strict'
import test from 'node:test'

import { summariseDeliveryItems, type BriefingItemRow } from '../../features/delivery/item-briefing.ts'

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
