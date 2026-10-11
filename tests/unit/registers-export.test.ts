import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { EXPORT_LIMIT, EXPORT_TOO_MANY, isOverCap, readAllRows, readExportRequest } from '../../features/registers/export-query.ts'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

test('the cap and the message are the spec\'s', () => {
  assert.equal(EXPORT_LIMIT, 5000)
  assert.equal(EXPORT_TOO_MANY, 'More than 5,000 rows match. Narrow the search and try again.')
})

test('a register export request reads the same checked parameters as the page', () => {
  const request = readExportRequest(new URLSearchParams('collection=invoices&format=xlsx&kind=invoice&q=acme&status=Overdue&sort=due&dir=desc&page=7'))
  assert.equal(request.format, 'xlsx')
  assert.equal(request.kind, 'invoice')
  assert.equal(request.params?.q, 'acme')
  assert.equal(request.params?.status, 'Overdue')
  assert.equal(request.params?.sort, 'due')
  assert.equal(request.params?.dir, 'desc')
})

test('a hostile or mismatched request is ignored rather than trusted', () => {
  assert.equal(readExportRequest(new URLSearchParams('collection=invoices&format=xlsx&kind=users')).kind, null)
  assert.equal(readExportRequest(new URLSearchParams('collection=invoices&format=xlsx&kind=invoice&status=bogus&sort=password')).params?.status, null)
  assert.equal(readExportRequest(new URLSearchParams('collection=invoices&format=xlsx&kind=invoice&sort=password')).params?.sort, null)
  assert.equal(readExportRequest(new URLSearchParams('collection=leads&format=csv&kind=invoice')).kind, null, 'the kind must match the collection')
  assert.equal(readExportRequest(new URLSearchParams('collection=invoices&format=exe&kind=invoice')).format, null)
  assert.equal(readExportRequest(new URLSearchParams('collection=clients&format=csv')).kind, null, 'other collections keep the old behaviour')
})

test('the route applies the register rules for the five registers and answers 413 with the message', () => {
  const route = read('app', 'api', 'records', 'export', 'route.ts')
  assert.match(route, /readExportRequest\(/)
  assert.match(route, /applyRegisterFilters\(/)
  assert.match(route, /applyRegisterOrder\(/)
  assert.match(route, /status: 413/)
  assert.match(route, /EXPORT_TOO_MANY/)
  assert.doesNotMatch(route, /\.limit\(5000\)/, 'the silent cut-off is gone')
})

// A recording fake of a ranged, ordered query over `size` rows. `maxRows` stands for the server's per-request cap.
function fakeTable(size: number, maxRows = 1000) {
  const calls: Array<[number, number]> = []
  const readRange = async (from: number, to: number) => {
    calls.push([from, to])
    const end = Math.min(to, from + maxRows - 1, size - 1)
    const data = from > end ? [] : Array.from({ length: end - from + 1 }, (_, index) => ({ n: from + index }))
    return { data, error: null }
  }
  return { calls, readRange }
}

test('the cap decision is made from the exact count: at the cap is allowed, one above is refused', () => {
  assert.equal(isOverCap(0), false)
  assert.equal(isOverCap(5000), false)
  assert.equal(isOverCap(5001), true)
  assert.equal(isOverCap(null), false)
})

test('the reader returns every row of 1,500 in two ranges of 1,000, with no duplicates', async () => {
  const table = fakeTable(1500)
  const result = await readAllRows(table.readRange, 1500)
  assert.equal(result.rows.length, 1500)
  assert.equal(new Set(result.rows.map((row) => row.n)).size, 1500)
  assert.deepEqual(table.calls, [[0, 999], [1000, 1999]])
})

test('an exact multiple of a page needs no extra read, and a short last page ends the reading', async () => {
  const exact = fakeTable(2000)
  assert.equal((await readAllRows(exact.readRange, 2000)).rows.length, 2000)
  assert.deepEqual(exact.calls, [[0, 999], [1000, 1999]])
  const short = fakeTable(2001)
  assert.equal((await readAllRows(short.readRange, 2001)).rows.length, 2001)
  assert.equal(short.calls.length, 3)
})

test('no rows reads nothing, and an empty range ends the reading when rows vanish after the count', async () => {
  const none = fakeTable(0)
  assert.deepEqual((await readAllRows(none.readRange, 0)).rows, [])
  assert.equal(none.calls.length, 0)
  const shrunk = fakeTable(10)
  const result = await readAllRows(shrunk.readRange, 1200)
  assert.equal(result.rows.length, 10)
  assert.equal(result.error, null)
})

test('a server that answers fewer rows than asked for never makes the reader lose rows', async () => {
  const table = fakeTable(1300, 500)
  const result = await readAllRows(table.readRange, 1300)
  assert.equal(result.rows.length, 1300)
  assert.equal(new Set(result.rows.map((row) => row.n)).size, 1300)
})

test('a read error is reported and no partial file is offered', async () => {
  const result = await readAllRows(async (from) => (from === 0 ? { data: [{ n: 0 }], error: null } : { data: null, error: { message: 'boom' } }), 3, 1)
  assert.equal(result.error, 'boom')
  assert.deepEqual(result.rows, [])
})

test('rows added after the count that push past the cap are refused rather than exported', async () => {
  const table = fakeTable(7000, 2000)
  const result = await readAllRows(table.readRange, 4999, 1500)
  assert.equal(result.tooMany, true)
  assert.deepEqual(result.rows, [])
})

test('the route counts first, refuses over the cap before reading, and pages with a stable order', () => {
  const route = read('app', 'api', 'records', 'export', 'route.ts')
  assert.match(route, /count: "exact", head: true/)
  assert.match(route, /isOverCap\(/)
  assert.match(route, /readAllRows</)
  assert.match(route, /\.range\(/)
  assert.match(route, /\.order\("id"/, 'the other collections end their order with id')
  assert.ok(route.indexOf('isOverCap(') < route.indexOf('readAllRows<'), 'the count decides before any row is read')
  assert.doesNotMatch(route, /\.limit\(/, 'one limit() is capped by the server at 1,000 rows')
})
