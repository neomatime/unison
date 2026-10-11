import assert from 'node:assert/strict'
import test from 'node:test'

import { applyRegisterFilters, applyRegisterOrder, searchFilter } from '../../features/registers/apply-filters.ts'
import { pageWindow } from '../../features/registers/page-math.ts'
import { readRegisterParams } from '../../features/registers/read-register-params.ts'

const ORG = '11111111-1111-4111-8111-111111111111'
const OWNER = '3b241101-e2bb-4255-8caf-4136c566a962'

/** A query builder that records every call, so the filters can be checked without a database. */
function recorder() {
  const calls: Array<[string, ...unknown[]]> = []
  const query: any = new Proxy({}, { get: (_target, name: string) => (...args: unknown[]) => { calls.push([name, ...args]); return query } })
  return { query, calls }
}

test('the search is a case-insensitive match over the register\'s columns, joined by or', () => {
  assert.equal(searchFilter(['quote_number', 'client_name'], 'acme corp'), 'quote_number.ilike.%acme corp%,client_name.ilike.%acme corp%')
})

test('an invoice register query is limited to the organisation and to active records by default', () => {
  const { query, calls } = recorder()
  applyRegisterFilters(query, 'invoice', readRegisterParams('invoice', {}), ORG)
  assert.deepEqual(calls, [['eq', 'organization_id', ORG], ['is', 'archived_at', null]])
})

test('show archived shows only archived records', () => {
  const { query, calls } = recorder()
  applyRegisterFilters(query, 'invoice', readRegisterParams('invoice', { archived: '1' }), ORG)
  assert.deepEqual(calls, [['eq', 'organization_id', ORG], ['not', 'archived_at', 'is', null]])
})

test('status, owner and search are applied through the register rules', () => {
  const { query, calls } = recorder()
  applyRegisterFilters(query, 'expense', readRegisterParams('expense', { status: 'Approved', owner: OWNER, q: 'flight' }), ORG)
  assert.deepEqual(calls, [
    ['eq', 'organization_id', ORG], ['is', 'archived_at', null],
    ['eq', 'status', 'Approved'], ['eq', 'submitted_by', OWNER],
    ['or', 'description.ilike.%flight%,vendor_name.ilike.%flight%,category.ilike.%flight%'],
  ])
  const sales = recorder()
  applyRegisterFilters(sales.query, 'opportunity', readRegisterParams('opportunity', { status: 'Won' }), ORG)
  assert.deepEqual(sales.calls[2], ['eq', 'stage', 'Won'], 'the Sales status is the stage column')
})

test('hostile address values never become a column or a filter', () => {
  const { query, calls } = recorder()
  applyRegisterFilters(query, 'invoice', readRegisterParams('invoice', { status: 'x;drop', owner: "1' or '1'='1", sort: 'password', q: 'a,b)or(c' }), ORG)
  assert.deepEqual(calls.slice(0, 2), [['eq', 'organization_id', ORG], ['is', 'archived_at', null]])
  assert.deepEqual(calls[2], ['or', 'invoice_number.ilike.%a b or c%,client_name.ilike.%a b or c%'], 'only the cleaned search is used')
  assert.equal(calls.length, 3)
})

test('the order uses the chosen column, then the id, and the default when there is none', () => {
  const chosen = recorder()
  applyRegisterOrder(chosen.query, 'invoice', readRegisterParams('invoice', { sort: 'due', dir: 'desc' }))
  assert.deepEqual(chosen.calls, [['order', 'due_date', { ascending: false, nullsFirst: false }], ['order', 'id', { ascending: true }]])
  const fallback = recorder()
  applyRegisterOrder(fallback.query, 'invoice', readRegisterParams('invoice', {}))
  assert.deepEqual(fallback.calls, [['order', 'created_at', { ascending: false, nullsFirst: false }], ['order', 'id', { ascending: true }]])
  const expenses = recorder()
  applyRegisterOrder(expenses.query, 'expense', readRegisterParams('expense', {}))
  assert.deepEqual(expenses.calls[0], ['order', 'expense_date', { ascending: false, nullsFirst: false }])
})

test('page arithmetic: the first page, a middle page, the last partial page and an empty result', () => {
  assert.deepEqual(pageWindow(1, 1243), { page: 1, pageCount: 50, from: 1, to: 25, rangeFrom: 0, rangeTo: 24 })
  assert.deepEqual(pageWindow(2, 1243), { page: 2, pageCount: 50, from: 26, to: 50, rangeFrom: 25, rangeTo: 49 })
  assert.deepEqual(pageWindow(50, 1243), { page: 50, pageCount: 50, from: 1226, to: 1243, rangeFrom: 1225, rangeTo: 1249 })
  assert.deepEqual(pageWindow(1, 0), { page: 1, pageCount: 1, from: 0, to: 0, rangeFrom: 0, rangeTo: 24 })
  assert.deepEqual(pageWindow(1, 25), { page: 1, pageCount: 1, from: 1, to: 25, rangeFrom: 0, rangeTo: 24 })
  assert.deepEqual(pageWindow(2, 26), { page: 2, pageCount: 2, from: 26, to: 26, rangeFrom: 25, rangeTo: 49 })
})

test('a page past the end is clamped to the last page', () => {
  assert.equal(pageWindow(999999, 1243).page, 50)
  assert.equal(pageWindow(5, 0).page, 1)
  assert.equal(pageWindow(0, 100).page, 1)
})
