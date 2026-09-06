import assert from 'node:assert/strict'
import test from 'node:test'

import { assembleDeliveryItemTree } from '../../features/delivery/delivery-item-tree.ts'
import type { DeliveryItemRow } from '../../features/delivery/delivery-item-tree.ts'

const BASE: Omit<DeliveryItemRow, 'id' | 'level' | 'parentId' | 'name' | 'archivedAt'> = {
  description: null,
  ownerName: 'Unassigned',
  status: 'Not Started',
  health: 'Healthy',
  phaseName: 'Design',
  phaseArchived: false,
  startDate: null,
  targetDate: null,
}

function row(overrides: Partial<DeliveryItemRow> & Pick<DeliveryItemRow, 'id' | 'level' | 'name'>): DeliveryItemRow {
  return { ...BASE, parentId: null, archivedAt: null, ...overrides }
}

test('a live parent with live children nests them, unflagged', () => {
  const rows = [
    row({ id: 'p1', level: 1, name: 'Parent' }),
    row({ id: 'c1', level: 2, name: 'Child', parentId: 'p1' }),
  ]

  const tree = assembleDeliveryItemTree(rows)

  assert.equal(tree.length, 1)
  assert.equal(tree[0].id, 'p1')
  assert.equal(tree[0].parentArchived, false)
  assert.equal(tree[0].children.length, 1)
  assert.equal(tree[0].children[0].id, 'c1')
  assert.equal(tree[0].children[0].parentArchived, false)
})

test('a live parent with an archived child does not show the archived child', () => {
  const rows = [
    row({ id: 'p1', level: 1, name: 'Parent' }),
    row({ id: 'c1', level: 2, name: 'Archived Child', parentId: 'p1', archivedAt: '2026-09-01T00:00:00Z' }),
  ]

  const tree = assembleDeliveryItemTree(rows)

  assert.equal(tree.length, 1)
  assert.equal(tree[0].children.length, 0)
})

test('an archived parent with a live child promotes the child to top level, flagged', () => {
  // The reachable state this guards: archive a child, archive the parent,
  // then restore the child. Filtering archived rows out of the pool before
  // grouping used to drop this child entirely -- not shown as archived, not
  // shown at all, unreachable in the UI.
  const rows = [
    row({ id: 'p1', level: 1, name: 'Archived Parent', archivedAt: '2026-09-01T00:00:00Z' }),
    row({ id: 'c1', level: 2, name: 'Orphaned Child', parentId: 'p1' }),
  ]

  const tree = assembleDeliveryItemTree(rows)

  assert.equal(tree.length, 1, 'the archived parent must not appear, but its live child must')
  assert.equal(tree[0].id, 'c1')
  assert.equal(tree[0].parentArchived, true)
  assert.deepEqual(tree[0].children, [])
})

test('an item with no phase carries a null phaseName', () => {
  const rows = [row({ id: 'p1', level: 1, name: 'Parent', phaseName: null, phaseArchived: false })]

  const tree = assembleDeliveryItemTree(rows)

  assert.equal(tree[0].phaseName, null)
  assert.equal(tree[0].phaseArchived, false)
})

test('an item with an archived phase carries phaseArchived: true', () => {
  const rows = [row({ id: 'p1', level: 1, name: 'Parent', phaseName: 'Legacy Gate', phaseArchived: true })]

  const tree = assembleDeliveryItemTree(rows)

  assert.equal(tree[0].phaseName, 'Legacy Gate')
  assert.equal(tree[0].phaseArchived, true)
})
