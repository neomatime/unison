import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const registers = (...parts: string[]) => read('features', 'registers', ...parts)

test('the query layer reads one page for one organisation, through the register rules, and fails loudly', () => {
  const source = registers('queries', 'query-register.ts')
  assert.match(source, /^import 'server-only'/)
  assert.match(source, /applyRegisterFilters\(/)
  assert.match(source, /applyRegisterOrder\(/)
  assert.match(source, /count: 'exact'/)
  assert.match(source, /\.range\(/)
  assert.match(source, /pageWindow\(/)
  assert.match(source, /if \(\w+\.error\) throw/)
  assert.doesNotMatch(source, /select\('\*'\)(?!, \{)/, 'no unbounded select')
})

test('the summary and the owner list are server-only and fail loudly', () => {
  for (const name of ['get-register-summary.ts', 'list-owners.ts']) {
    const source = registers('queries', name)
    assert.match(source, /^import 'server-only'/, name)
    assert.match(source, /if \(\w+\.error\) throw/, name)
  }
  assert.match(registers('queries', 'get-register-summary.ts'), /rpc\('register_summary'/)
  assert.match(registers('queries', 'list-owners.ts'), /\.eq\('organization_id', organization\.id\)/)
})

test('the archive actions check the kind and the id first, write only archived_at, and scope by organisation', () => {
  const source = registers('actions', 'archive.ts')
  assert.match(source, /^'use server'/)
  for (const line of source.split('\n')) {
    if (/^export /.test(line)) assert.match(line, /^export (async function|type) /, line)
  }
  const kind = source.indexOf('isRegisterKind(')
  const id = source.indexOf('isUuid(')
  const write = source.indexOf('.update(')
  assert.ok(kind > -1 && id > -1 && write > id && write > kind, 'the kind and id are checked before any write')
  assert.match(source, /\.update\(\{ archived_at:/)
  assert.doesNotMatch(source, /\.update\(\{(?![^}]*archived_at)/, 'nothing but archived_at is written')
  assert.match(source, /\.eq\('organization_id', organization\.id\)/)
  assert.match(source, /This record is already archived\./)
  assert.match(source, /This record is not archived\./)
  assert.match(source, /\.is\('archived_at', null\)/, 'archiving only touches a row that is not archived yet')
  assert.match(source, /\.not\('archived_at', 'is', null\)/, 'restoring only touches a row that is archived')
  assert.match(source, /!result\.data\?\.length\) return \{ error: archive \? 'This record is already archived\.' : 'This record is not archived\.' \}/, 'no row updated means someone else got there first')
})

test('the single-record read no longer loads a whole table', () => {
  const queries = read('features', 'commercial-finance', 'queries', 'phase-six.ts')
  const start = queries.indexOf('export async function getPhaseSixRecord')
  assert.ok(start > -1)
  const body = queries.slice(start)
  assert.match(body, /\.eq\('id', id\)|\.eq\("id", id\)/, 'one row by id')
  assert.match(body, /maybeSingle\(\)/)
  assert.ok(body.split('.find(').length - 1 <= 1, 'no find over a loaded list for the five registers (only the unreachable forecast path may keep one)')
  assert.match(body, /kind === ['"]forecast['"][^\n]*\.find\(/, 'the one remaining find is the forecast path')
  assert.match(registers('queries', 'query-register.ts'), /PGRST103/, 'a page past the end is handled')
})

test('the register screen reads the address, asks for one page and the summary, and shows the three states', () => {
  const source = registers('components', 'register-screen.tsx')
  assert.doesNotMatch(source, /^\s*['"]use (client|server)['"]/, 'a server component')
  assert.match(source, /readRegisterParams\(/)
  assert.match(source, /queryRegister\(/)
  assert.match(source, /getRegisterSummary\(/)
  assert.match(source, /buildCards\(/)
  assert.match(source, /Nothing matches these filters/)
  assert.match(source, /Clear filters/)
  assert.match(source, /Enter at least 2 characters to search\./)
  assert.match(source, /Showing /)
  assert.match(source, /aria-sort/)
  assert.match(source, /Previous/)
  assert.match(source, /Next/)
  assert.match(source, /archiveRecordAction/)
  assert.match(source, /restoreRecordAction/)
  assert.doesNotMatch(source, /Duplicate/, 'Duplicate only pretended to work and is not offered')
})

test('the toolbar is a client component that changes the address and offers the four controls', () => {
  const source = registers('components', 'register-toolbar.tsx')
  assert.match(source, /^'use client'/)
  assert.match(source, /name="q"/)
  assert.match(source, /name="status"/)
  assert.match(source, /name="owner"/)
  assert.match(source, /name="archived"/)
  assert.match(source, /useRouter\(/)
  assert.doesNotMatch(source, /server-only|queries\//, 'a client component imports no server code')
})

test('the five registers pass the address on, keep PhaseSixRegister, and the old whole-table loading is gone', () => {
  for (const [path, kind] of [
    [['commercial', 'leads'], 'lead'], [['commercial', 'quotes'], 'quote'], [['commercial', 'sales'], 'opportunity'],
    [['finance', 'invoices'], 'invoice'], [['finance', 'expenses'], 'expense'],
  ] as const) {
    const page = read('app', '(unison)', ...path, 'page.tsx')
    assert.match(page, /PhaseSixRegister/)
    assert.match(page, new RegExp(`kind="${kind}"`))
    assert.match(page, /searchParams/)
  }
  const register = read('features', 'commercial-finance', 'components', 'phase-six-register.tsx')
  assert.match(register, /RegisterScreen/)
  assert.doesNotMatch(register, /listLeads|listQuotes|listOpportunities|listInvoices|listExpenses/)
  const queries = read('features', 'commercial-finance', 'queries', 'phase-six.ts')
  assert.doesNotMatch(queries, /export (const|async function) list(Leads|Quotes|Opportunities|Invoices|Expenses)/)
  assert.doesNotMatch(queries, /allRows\(/)
})

test('the register rules are the only place a column name for the page comes from', () => {
  for (const name of ['register-screen.tsx', 'register-toolbar.tsx']) {
    assert.doesNotMatch(registers('components', name), /\.order\(|\.ilike\(|\.range\(/, `${name} does not build queries`)
  }
})

test('a filtered register can be cleared in one click from the toolbar, and a former owner is not hidden', () => {
  const toolbar = registers('components', 'register-toolbar.tsx')
  assert.match(toolbar, /filtered \? <Link href=\{clearHref\}[^>]*>Clear filters<\/Link>/, 'the toolbar itself offers Clear filters when a filter is set')
  assert.match(toolbar, /Former member/, 'an owner who is no longer in the list is still shown')
  const screen = registers('components', 'register-screen.tsx')
  assert.match(screen, /filtered=\{filtered\}/)
  assert.match(screen, /clearHref=\{frame\.base\}/)
})

test('the export control posts the current filters, shows the route\'s message, and the screen offers it', () => {
  const source = registers('components', 'register-export.tsx')
  assert.match(source, /^'use client'/)
  assert.match(source, /\/api\/records\/export/)
  assert.match(source, /message/)
  assert.match(source, /role="alert"/)
  assert.match(source, /CSV/)
  assert.match(source, /XLSX/)
  assert.match(source, /PDF/)
  assert.match(registers('components', 'register-screen.tsx'), /RegisterExport/)
})
