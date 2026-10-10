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
