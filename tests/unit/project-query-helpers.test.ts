import assert from 'node:assert/strict'
import test from 'node:test'

import { escapeLikePattern, sortColumn } from '../../features/delivery/queries/list-projects-helpers.ts'

test('every character that widens an ilike match is escaped, including PostgREST\'s *', () => {
  // Without this, searching "big_corp" also matches "bigXcorp", and "50%"
  // matches every row — the count and the visible rows then disagree.
  assert.equal(escapeLikePattern('big_corp'), 'big\\_corp')
  assert.equal(escapeLikePattern('50%'), '50\\%')
  assert.equal(escapeLikePattern('back\\slash'), 'back\\\\slash')
  // PostgREST rewrites * to % inside a like/ilike filter value before Postgres
  // sees it, so an unescaped asterisk is a third wildcard. Verified live:
  // name=ilike.Client* matched "Client Onboarding". Escaping it stops a search
  // for "*" from returning every project in the organisation.
  assert.equal(escapeLikePattern('Client*'), 'Client\\*')
  assert.equal(escapeLikePattern('*'), '\\*')
  assert.equal(escapeLikePattern('a*b_c%d\\e'), 'a\\*b\\_c\\%d\\\\e')
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
