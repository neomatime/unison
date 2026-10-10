import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const dir = join(process.cwd(), 'features', 'documents')
const read = (...parts: string[]) => readFileSync(join(dir, ...parts), 'utf8')
const isClient = (source: string) => /^\s*['"]use client['"]/.test(source)
const actions = readdirSync(join(dir, 'actions')).filter((name) => name.endsWith('.ts'))

test("'use server' files export only async functions and types", () => {
  assert.ok(actions.length >= 4)
  for (const name of actions) {
    const source = read('actions', name)
    assert.match(source, /^'use server'/, `${name} must be a server-action module`)
    for (const line of source.split('\n')) {
      if (!/^export /.test(line)) continue
      assert.match(line, /^export (async function|type) /, `${name} exports something other than an async function or a type: ${line}`)
    }
  }
})

test('shared modules carry no directive and no server-only import', () => {
  for (const name of ['vocabulary.ts', 'types.ts', 'fields.ts', 'errors.ts', 'document-view.ts']) {
    const source = read(name)
    assert.ok(!isClient(source), `${name} must not be a client module`)
    assert.doesNotMatch(source, /server-only/, `${name} is imported by tests and client code`)
    assert.doesNotMatch(source, /from\s+['"]@\//, `${name} must use relative imports so unit tests can load it`)
  }
})

test('every write scopes by organisation and no action touches audit data or fixtures', () => {
  for (const name of actions) {
    const source = read('actions', name)
    assert.doesNotMatch(source, /audit_events|fixtures?\/|mocks?\//, name)
  }
  for (const name of ['company.ts', 'price-list.ts', 'lines.ts']) {
    assert.match(read('actions', name), /\.eq\('organization_id', organization\.id\)|organization_id: organization\.id/, `${name} must scope by organisation`)
  }
})

test('the document kind and ids are checked before anything is read or written', () => {
  const lines = read('actions', 'lines.ts')
  assert.match(lines, /isDocumentKind\(kind\)/)
  assert.match(lines, /isUuid\(/)
  const send = read('actions', 'send.ts')
  assert.match(send, /isUuid\(/)
  assert.match(send, /documentErrorMessage\(/, 'database tokens are turned into plain messages')
  assert.match(lines, /documentErrorMessage\(/)
})

test('the company details action refuses anyone without the permission before it writes', () => {
  const source = read('actions', 'company.ts')
  const permission = source.indexOf("roleHasPermission(role, 'company.manage')")
  const write = source.indexOf("from('organization_settings')")
  assert.ok(permission > -1 && write > -1 && permission < write, 'the permission check must come before the write')
})

test('revalidation names the route group so it matches the real pages', () => {
  const source = read('revalidate.ts')
  assert.match(source, /\/\(unison\)\/commercial\/quotes\/\[quoteId\]/)
  assert.match(source, /\/\(unison\)\/finance\/invoices\/\[invoiceId\]/)
})
