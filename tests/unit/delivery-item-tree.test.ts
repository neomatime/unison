import assert from 'node:assert/strict'
import test from 'node:test'

import { assembleDeliveryItemTree } from '../../features/delivery/delivery-item-tree.ts'
import type { DeliveryItemRow } from '../../features/delivery/delivery-item-tree.ts'

const BASE: Omit<DeliveryItemRow, 'id' | 'level' | 'parentId' | 'name' | 'archivedAt'> = {
  description: null,
  ownerName: 'Unassigned',
  ownerId: null,
  status: 'Not Started',
  health: 'Healthy',
  phaseName: 'Design',
  phaseArchived: false,
  currentPhaseId: null,
  startDate: null,
  targetDate: null,
}

function row(overrides: Partial<DeliveryItemRow> & Pick<DeliveryItemRow, 'id' | 'level' | 'name'>): DeliveryItemRow {
  return { ...BASE, parentId: null, archivedAt: null, ...overrides }
}

test('a live parent with live children nests them', () => {
  const rows = [
    row({ id: 'p1', level: 1, name: 'Parent' }),
    row({ id: 'c1', level: 2, name: 'Child', parentId: 'p1' }),
  ]

  const tree = assembleDeliveryItemTree(rows)

  assert.equal(tree.length, 1)
  assert.equal(tree[0].id, 'p1')
  assert.equal(tree[0].children.length, 1)
  assert.equal(tree[0].children[0].id, 'c1')
})

test('an archived child stays nested under its live parent, after the live children', () => {
  const rows = [
    row({ id: 'p1', level: 1, name: 'Parent' }),
    row({ id: 'c1', level: 2, name: 'Live Child', parentId: 'p1' }),
    row({ id: 'c2', level: 2, name: 'Archived Child', parentId: 'p1', archivedAt: '2026-09-01T00:00:00Z' }),
  ]

  const tree = assembleDeliveryItemTree(rows)

  assert.equal(tree.length, 1)
  assert.equal(tree[0].children.length, 2, 'the archived child must still be reachable, not dropped')
  assert.equal(tree[0].children[0].id, 'c1', 'the live child sorts first')
  assert.equal(tree[0].children[1].id, 'c2', 'the archived child sorts last')
  assert.equal(tree[0].children[1].archivedAt, '2026-09-01T00:00:00Z')
})

test('an archived parent is shown with its live child nested beneath it, as any parent is', () => {
  // The reachable state this guards: archive a child, archive the parent,
  // then restore the child. Filtering archived rows out of the tree used to
  // drop the parent entirely, leaving its live child with nowhere to nest --
  // not shown as archived, not shown at all, unreachable in the UI. Now the
  // archived parent is rendered like any other parent, so the live child
  // simply nests under it where it already belongs.
  const rows = [
    row({ id: 'p1', level: 1, name: 'Archived Parent', archivedAt: '2026-09-01T00:00:00Z' }),
    row({ id: 'c1', level: 2, name: 'Live Child', parentId: 'p1' }),
  ]

  const tree = assembleDeliveryItemTree(rows)

  assert.equal(tree.length, 1, 'the archived parent must appear')
  assert.equal(tree[0].id, 'p1')
  assert.equal(tree[0].archivedAt, '2026-09-01T00:00:00Z')
  assert.equal(tree[0].children.length, 1, 'its live child must still be reachable')
  assert.equal(tree[0].children[0].id, 'c1')
  assert.equal(tree[0].children[0].archivedAt, null)
})

test('archived level-1 items sort after live ones at the top level', () => {
  const rows = [
    row({ id: 'p1', level: 1, name: 'Archived Parent', archivedAt: '2026-09-01T00:00:00Z' }),
    row({ id: 'p2', level: 1, name: 'Live Parent' }),
  ]

  const tree = assembleDeliveryItemTree(rows)

  assert.deepEqual(tree.map((node) => node.id), ['p2', 'p1'])
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
