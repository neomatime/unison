import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

// Source guards: the actions are not run by any test (only the signed-in walk exercises
// them), so these keep the shape the framework and the database rely on.
const ROOT = 'features/crm-workspace'
const actionFiles = readdirSync(`${ROOT}/actions`).filter((name) => name.endsWith('.ts'))
const read = (path: string) => readFileSync(path, 'utf8')

test('every action module is a use-server file that exports only async functions', () => {
  assert.ok(actionFiles.length >= 5)
  for (const name of actionFiles) {
    const source = read(`${ROOT}/actions/${name}`)
    assert.ok(source.startsWith("'use server'"), `${name} must start with 'use server'`)
    const exports = [...source.matchAll(/^export\s+(.*)$/gm)].map((match) => match[1])
    for (const line of exports) {
      assert.match(line, /^(async function |type )/, `${name}: only async functions and types may be exported (${line})`)
    }
  }
})

test('writes are scoped to the organisation and go through the session context', () => {
  for (const name of actionFiles) {
    const source = read(`${ROOT}/actions/${name}`)
    assert.match(source, /writeContext\(\)/, `${name} must resolve the session through writeContext`)
  }
  for (const name of ['contacts.ts', 'activities.ts', 'follow-ups.ts', 'opportunity-stage.ts']) {
    assert.match(read(`${ROOT}/actions/${name}`), /organization_id/, `${name} must scope by organization_id`)
  }
})

test('server-only modules import server-only, and the queries stay out of client code', () => {
  for (const path of [
    `${ROOT}/server-context.ts`,
    `${ROOT}/revalidate.ts`,
    `${ROOT}/queries/get-record-workspace.ts`,
    `${ROOT}/queries/find-matching-clients.ts`,
  ]) {
    assert.ok(read(path).startsWith("import 'server-only'"), `${path} must import server-only`)
  }
})

test('convert lead keeps redirect() outside any try/catch and maps every database token', () => {
  const source = read(`${ROOT}/actions/convert-lead.ts`)
  assert.ok(!/try\s*\{/.test(source), 'convert-lead must not wrap redirect() in try/catch')
  for (const token of ['LEAD_NOT_FOUND', 'LEAD_ARCHIVED', 'LEAD_ALREADY_CONVERTED', 'CLIENT_NOT_FOUND']) {
    assert.ok(source.includes(token), `${token} must be mapped to a message`)
  }
})

test('page revalidation patterns name the (unison) route group, because a page cache tag is its route file path', () => {
  const source = read(`${ROOT}/revalidate.ts`)
  const patterns = [...source.matchAll(/revalidatePath\('([^']+\[[^']+)', 'page'\)/g)].map((match) => match[1])
  assert.equal(patterns.length, 4, 'leads, opportunities, quotes and clients')
  for (const pattern of patterns) assert.ok(pattern.startsWith('/(unison)/'), `${pattern} must include the route group`)
})

test('a follow-up on a lead takes the converted client, read org-scoped with the error checked', () => {
  const source = read(`${ROOT}/actions/follow-ups.ts`)
  const lead = source.slice(source.indexOf("if (parentKind === 'lead')"), source.indexOf('const { error } = await db.from'))
  assert.match(lead, /\.from\('leads'\)\s*\.select\('converted_client_id'\)/)
  assert.match(lead, /\.eq\('organization_id', organization\.id\)/)
  assert.match(lead, /if \(lead\.error\) return/)
  assert.match(lead, /clientId = lead\.data\.converted_client_id/)
})

test('parent kinds are checked with Object.hasOwn, not in, so inherited names never pass', () => {
  for (const name of ['activities.ts', 'contacts.ts', 'follow-ups.ts']) {
    const source = read(`${ROOT}/actions/${name}`)
    assert.doesNotMatch(source, /\bin PARENT_COLUMN\b/, `${name} must not use the in operator`)
    assert.match(source, /Object\.hasOwn\(PARENT_COLUMN, /, `${name} must use Object.hasOwn`)
  }
})

test('a contact added but not made primary still revalidates the pages', () => {
  const source = read(`${ROOT}/actions/contacts.ts`)
  const failure = source.indexOf("The contact was added, but could not be made primary.")
  assert.ok(failure > -1)
  const before = source.slice(source.lastIndexOf('if (primary.error)', failure), failure)
  assert.match(before, /revalidateWorkspacePages\(\)/, 'revalidate before returning the partial-failure error')
})

test('convert lead never throws on a result it cannot read', () => {
  const source = read(`${ROOT}/actions/convert-lead.ts`)
  assert.doesNotMatch(source, /data\.opportunity_id/, 'data is not dereferenced unguarded')
  const guard = source.indexOf("typeof opportunityId !== 'string'")
  assert.ok(guard > -1 && guard < source.indexOf('redirect(`/commercial/sales/'), 'the result is checked before the redirect')
})

test('the CRM RLS suites clean up only the fixtures that exist, so a failed setup never leaves rows in production', () => {
  for (const name of ['crm-contacts-activities', 'crm-convert-lead', 'crm-overview']) {
    const source = read(`tests/integration/rls/${name}.test.ts`)
    const teardown = source.slice(source.indexOf('after(async () => {'))
    const call = teardown.slice(teardown.indexOf('await cleanup('), teardown.indexOf('\n})'))
    assert.match(call, /\[orgA, orgB\]\.filter\(Boolean\)/, `${name}: organisations must be filtered`)
    assert.match(call, /\]\.filter\(Boolean\)\)/, `${name}: user ids must be filtered`)
    assert.doesNotMatch(call, /[^?]\.id\b/, `${name}: a user id must be read with ?.`)
  }
})
