import assert from 'node:assert/strict'
import test from 'node:test'

import { escapeLikePattern, sortColumn } from '../../features/delivery/queries/list-projects-helpers.ts'

test('wildcards in a search term are escaped to literals', () => {
  // Without this, searching "big_corp" also matches "bigXcorp", and "50%"
  // matches every row — the count and the visible rows then disagree.
  assert.equal(escapeLikePattern('big_corp'), 'big\\_corp')
  assert.equal(escapeLikePattern('50%'), '50\\%')
  assert.equal(escapeLikePattern('back\\slash'), 'back\\\\slash')
})

test('an ordinary search term is unchanged', () => {
  assert.equal(escapeLikePattern('Claims Intake'), 'Claims Intake')
})

test('only known columns can be sorted on', () => {
  assert.equal(sortColumn('name'), 'name')
  assert.equal(sortColumn('status'), 'status')
  assert.equal(sortColumn(undefined), 'updated_at')
  // Anything else falls back rather than reaching .order() as-is.
  assert.equal(sortColumn('notes'), 'updated_at')
  assert.equal(sortColumn('owner_id'), 'updated_at')
})
