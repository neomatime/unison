import assert from 'node:assert/strict'
import test from 'node:test'

import { PAGE_SIZE, cleanSearch, readRegisterParams, registerHref, typedSearch } from '../../features/registers/read-register-params.ts'

const UUID = '3b241101-e2bb-4255-8caf-4136c566a962'

test('a page is 25 rows', () => assert.equal(PAGE_SIZE, 25))

test('search text keeps letters, digits, spaces and . @ + \' - and nothing else', () => {
  assert.equal(cleanSearch('  Acme  (Pty), Ltd  '), 'Acme Pty Ltd')
  assert.equal(cleanSearch('o\'neil-smith@example.com'), "o'neil-smith@example.com")
  assert.equal(cleanSearch('50% off_now'), '50 off now')
  assert.equal(cleanSearch('a,b.eq.c)(or=x'), 'a b.eq.c or x')
  assert.equal(cleanSearch('Ñandú Zoë'), 'Ñandú Zoë')
  assert.equal(cleanSearch('"; drop table leads; --'), 'drop table leads --')
  assert.equal(cleanSearch('x'.repeat(500)).length, 120)
  assert.equal(cleanSearch(''), '')
})

test('an accent typed as a letter plus a combining mark is kept, not split', () => {
  assert.equal(cleanSearch('José Zoë'), 'José Zoë')
  assert.equal(cleanSearch('José'), cleanSearch('José'))
})

test('the box shows what was typed in the address, even a single character that is not searched', () => {
  assert.equal(typedSearch(new URLSearchParams('q=a')), 'a')
  assert.equal(typedSearch({ q: '  a,b ' }), 'a,b')
  assert.equal(typedSearch({}), '')
  assert.equal(readRegisterParams('lead', { q: 'a' }).searchTooShort, true)
})

test('an empty address gives the defaults', () => {
  assert.deepEqual(readRegisterParams('invoice', {}), { q: '', status: null, owner: null, archived: false, sort: null, dir: 'asc', page: 1, searchTooShort: false })
})

test('valid values are read, and arrays take their first value', () => {
  const params = readRegisterParams('invoice', { q: 'acme', status: 'Overdue', owner: UUID, archived: '1', sort: 'due', dir: 'desc', page: '3' })
  assert.deepEqual(params, { q: 'acme', status: 'Overdue', owner: UUID, archived: true, sort: 'due', dir: 'desc', page: 3, searchTooShort: false })
  assert.equal(readRegisterParams('invoice', { status: ['Paid', 'Overdue'] }).status, 'Paid')
  assert.equal(readRegisterParams('invoice', new URLSearchParams('status=Paid&page=2')).page, 2)
})

test('a sort, status or owner that is not on the list is ignored', () => {
  const params = readRegisterParams('invoice', { sort: 'password', status: 'Pending', owner: 'not-a-uuid', dir: 'sideways' })
  assert.equal(params.sort, null)
  assert.equal(params.status, null)
  assert.equal(params.owner, null)
  assert.equal(params.dir, 'asc')
  assert.equal(readRegisterParams('lead', { sort: 'due' }).sort, null, 'a column of another register is not on this one')
  assert.equal(readRegisterParams('lead', { status: 'Overdue' }).status, null, 'a status of another register is not on this one')
  assert.equal(readRegisterParams('opportunity', { status: 'Won' }).status, 'Won')
})

test('the page is a whole number of at least 1', () => {
  for (const [page, expected] of [['0', 1], ['-3', 1], ['abc', 1], ['2.7', 2], ['', 1], ['999999999', 999999999], ['1e3', 1]] as const) {
    assert.equal(readRegisterParams('invoice', { page }).page, expected, page)
  }
})

test('a one-character search is flagged and not used; two characters search', () => {
  assert.deepEqual(readRegisterParams('invoice', { q: 'a' }), { q: '', status: null, owner: null, archived: false, sort: null, dir: 'asc', page: 1, searchTooShort: true })
  assert.equal(readRegisterParams('invoice', { q: 'ab' }).q, 'ab')
  assert.equal(readRegisterParams('invoice', { q: ' , ' }).searchTooShort, false, 'text that cleans to nothing is no search at all')
})

test('only the exact switch value turns archived on', () => {
  assert.equal(readRegisterParams('invoice', { archived: '1' }).archived, true)
  for (const value of ['0', 'true', 'yes', '']) assert.equal(readRegisterParams('invoice', { archived: value }).archived, false, value)
})

test('registerHref omits defaults, applies a change, and returns to page 1 when a filter changes', () => {
  const base = readRegisterParams('invoice', { q: 'acme', status: 'Overdue', page: '4' })
  assert.equal(registerHref('/finance/invoices', base), '/finance/invoices?q=acme&status=Overdue&page=4')
  assert.equal(registerHref('/finance/invoices', base, { page: 5 }), '/finance/invoices?q=acme&status=Overdue&page=5')
  assert.equal(registerHref('/finance/invoices', base, { status: 'Paid' }), '/finance/invoices?q=acme&status=Paid')
  assert.equal(registerHref('/finance/invoices', base, { q: '' , status: null }), '/finance/invoices')
  assert.equal(registerHref('/finance/invoices', readRegisterParams('invoice', {})), '/finance/invoices')
  assert.equal(registerHref('/finance/invoices', base, { sort: 'due', dir: 'desc' }), '/finance/invoices?q=acme&status=Overdue&sort=due&dir=desc')
})

test('a sort that is an inherited object key is ignored', () => {
  for (const sort of ['constructor', 'toString', '__proto__']) assert.equal(readRegisterParams('invoice', { sort }).sort, null, sort)
})

test('an owner uuid is returned in lower case', () => {
  assert.equal(readRegisterParams('invoice', { owner: UUID.toUpperCase() }).owner, UUID)
})

test('a search cut to 120 characters never splits a character outside the basic plane', () => {
  const cut = cleanSearch('a'.repeat(119) + '\u{1D49C}' + 'b'.repeat(10)) // U+1D49C is a letter written with two UTF-16 units
  assert.equal(Array.from(cut).length, 120)
  assert.equal(cut.endsWith('\u{1D49C}'), true)
  assert.doesNotMatch(cut, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/, 'no lone high surrogate')
})
