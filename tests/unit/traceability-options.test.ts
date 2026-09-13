import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveCoverage, unlinkedOptions } from '../../features/delivery/traceability-options.ts'

test('zero delivery items and zero evidence is Not linked', () => {
  assert.equal(deriveCoverage(0, 0), 'Not linked')
})

test('a delivery item with no evidence is Built', () => {
  assert.equal(deriveCoverage(1, 0), 'Built')
  assert.equal(deriveCoverage(3, 0), 'Built')
})

test('any evidence is Verified regardless of delivery item count', () => {
  assert.equal(deriveCoverage(0, 1), 'Verified')
  assert.equal(deriveCoverage(3, 2), 'Verified')
})

test('unlinkedOptions removes already-linked ids and keeps the rest', () => {
  const all = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(unlinkedOptions(all, ['b']), [{ id: 'a' }, { id: 'c' }])
})

test('unlinkedOptions returns every option when nothing is linked', () => {
  const all = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(unlinkedOptions(all, []), all)
})

test('unlinkedOptions returns nothing when everything is linked', () => {
  const all = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(unlinkedOptions(all, ['a', 'b']), [])
})
