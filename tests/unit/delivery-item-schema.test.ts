import assert from 'node:assert/strict'
import test from 'node:test'

import { bandFor, HEALTH_BANDS } from '../../features/delivery/overview-bands.ts'
import { PROJECT_HEALTHS } from '../../features/delivery/schemas/project.ts'
import { DELIVERY_ITEM_HEALTHS, DELIVERY_ITEM_STATUSES, deliveryItemInputSchema } from '../../features/delivery/schemas/delivery-item.ts'

test('status is the four work states, and health omits On Track', () => {
  assert.deepEqual([...DELIVERY_ITEM_STATUSES], ['Not Started', 'In Progress', 'Blocked', 'Complete'])
  assert.deepEqual([...DELIVERY_ITEM_HEALTHS], ['Healthy', 'Watch', 'At Risk', 'Critical'])
})

test('health is a narrowing of the project vocabulary, not a fork', () => {
  // Every delivery-item health must be a project health that bandFor already
  // handles, so item health aggregates through the existing briefing bands with
  // no new mapping. This is the test that keeps the narrowing a narrowing.
  for (const health of DELIVERY_ITEM_HEALTHS) {
    assert.ok(PROJECT_HEALTHS.includes(health), `${health} must be a member of PROJECT_HEALTHS`)
    assert.ok(HEALTH_BANDS.includes(bandFor(health)), `bandFor must map ${health} to a known band`)
  }
})

test('On Track is deliberately absent, because status already carries schedule', () => {
  // An item that is Blocked cannot also be On Track; offering both invites a
  // row that reads "Blocked / On Track".
  assert.equal(DELIVERY_ITEM_HEALTHS.includes('On Track' as never), false)
})

test('a level 1 item may not name a parent, and a level 2 item must', () => {
  const base = { name: 'Item', status: 'Not Started', health: 'Healthy' }
  assert.equal(deliveryItemInputSchema.safeParse({ ...base, level: '1', parentId: '' }).success, true)
  assert.equal(deliveryItemInputSchema.safeParse({ ...base, level: '1', parentId: '3f3b2bbc-a9e8-46d4-8dfb-083cc5a2b5a0' }).success, false)
  assert.equal(deliveryItemInputSchema.safeParse({ ...base, level: '2', parentId: '' }).success, false)
  assert.equal(deliveryItemInputSchema.safeParse({ ...base, level: '2', parentId: '3f3b2bbc-a9e8-46d4-8dfb-083cc5a2b5a0' }).success, true)
})

test('a third level cannot be parsed', () => {
  const result = deliveryItemInputSchema.safeParse({ name: 'Deep', status: 'Not Started', health: 'Healthy', level: '3', parentId: '' })
  assert.equal(result.success, false)
})

// A blank startDate/targetDate used to reach `new Date('T00:00:00Z').toISOString()`,
// which throws on an Invalid Date rather than returning a string. An unhandled
// throw inside zod parsing escapes safeParse entirely, so create-delivery-item's
// `deliveryItemInputSchema.safeParse(...)` call itself threw and the server
// action returned a 500 instead of a validation error. Each case below asserts
// that safeParse *returns* a result object — not merely that `.success` reads a
// particular way — because a test written as `.success === false` would still
// pass if the throw were merely caught somewhere else in the chain; only
// checking that the call returns at all, rather than throwing past safeParse,
// proves the actual defect is fixed.
const dateBase = { name: 'Item', status: 'Not Started', health: 'Healthy', level: '1', parentId: '' }

test('a blank start date parses to null rather than crashing safeParse', () => {
  let result
  assert.doesNotThrow(() => {
    result = deliveryItemInputSchema.safeParse({ ...dateBase, startDate: '' })
  })
  assert.equal(result!.success, true)
  assert.equal(result!.data!.startDate, null)
})

test('a valid start date parses to itself', () => {
  let result
  assert.doesNotThrow(() => {
    result = deliveryItemInputSchema.safeParse({ ...dateBase, startDate: '2026-09-30' })
  })
  assert.equal(result!.success, true)
  assert.equal(result!.data!.startDate, '2026-09-30')
})

test('an impossible calendar date is rejected as a field error, not a throw', () => {
  let result
  assert.doesNotThrow(() => {
    result = deliveryItemInputSchema.safeParse({ ...dateBase, startDate: '2026-02-30' })
  })
  assert.equal(result!.success, false)
})

test('a malformed date string is rejected as a field error, not a throw', () => {
  let result
  assert.doesNotThrow(() => {
    result = deliveryItemInputSchema.safeParse({ ...dateBase, startDate: 'not-a-date' })
  })
  assert.equal(result!.success, false)
})
