import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { EXPORT_LIMIT, EXPORT_TOO_MANY, readExportRequest } from '../../features/registers/export-query.ts'

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

test('the route applies the register rules for the five registers, caps at 5,001 rows and answers 413 with the message', () => {
  const route = read('app', 'api', 'records', 'export', 'route.ts')
  assert.match(route, /readExportRequest\(/)
  assert.match(route, /applyRegisterFilters\(/)
  assert.match(route, /applyRegisterOrder\(/)
  assert.match(route, /EXPORT_LIMIT \+ 1/)
  assert.match(route, /status: 413/)
  assert.match(route, /EXPORT_TOO_MANY/)
  assert.doesNotMatch(route, /\.limit\(5000\)/, 'the silent cut-off is gone')
})
