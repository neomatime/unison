import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const workspace = process.cwd()
const dir = join(workspace, 'features', 'crm-workspace')
const read = (...parts: string[]) => readFileSync(join(dir, ...parts), 'utf8')
const isClient = (source: string) => /^\s*['"]use client['"]/.test(source)
const components = readdirSync(join(dir, 'components')).filter((name) => name.endsWith('.tsx'))
const actions = readdirSync(join(dir, 'actions')).filter((name) => name.endsWith('.ts'))

test('the interactive sections are client modules and the composing section is a server component', () => {
  for (const name of ['contacts-section.tsx', 'timeline-section.tsx', 'follow-ups-section.tsx', 'action-button.tsx', 'occurred-at-field.tsx']) {
    assert.ok(isClient(read('components', name)), `${name} uses hooks and must be a client module`)
  }
  const composer = read('components', 'record-workspace.tsx')
  assert.ok(!isClient(composer), 'record-workspace.tsx is a server component')
  assert.doesNotMatch(composer, /useState\(|useEffect\(|useActionState\(|useTransition\(/)
})

test('modules shared by server and client carry no directive and no server-only import', () => {
  for (const name of ['types.ts', 'vocabulary.ts', 'fields.ts']) {
    const source = read(name)
    assert.ok(!isClient(source), `${name} must not be a client module`)
    assert.doesNotMatch(source, /server-only/, `${name} is imported by tests and client code`)
  }
  for (const name of ['components/form-parts.tsx', 'components/workspace-section.tsx']) {
    assert.ok(!isClient(read(name)), `${name} is shared and must carry no directive`)
  }
})

test("'use server' files export only async functions and types", () => {
  for (const name of actions) {
    const source = read('actions', name)
    assert.match(source, /^'use server'/, `${name} must be a server-action module`)
    for (const line of source.split('\n')) {
      if (!/^export /.test(line)) continue
      assert.match(line, /^export (async function|type) /, `${name} exports something other than an async function or a type: ${line}`)
    }
  }
})

test('every write action scopes by organisation and no action reads audit_events or fixture data', () => {
  for (const name of actions) {
    const source = read('actions', name)
    assert.doesNotMatch(source, /audit_events|fixtures?\/|mocks?\//, name)
  }
  for (const name of ['contacts.ts', 'activities.ts', 'follow-ups.ts', 'opportunity-stage.ts']) {
    assert.match(read('actions', name), /\.eq\('organization_id', organization\.id\)|organization_id: organization\.id/, `${name} must scope by organisation`)
  }
})

test('the section components import no delivery, fixture or mock code', () => {
  for (const name of components) {
    for (const imported of read('components', name).matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(!/features\/delivery|features\/overview\b|\/mocks?\/|fixtures?\//.test(imported[1]), `${name} imports ${imported[1]}`)
    }
  }
})

test('record pages mount the workspace sections', () => {
  const lead = readFileSync(join(workspace, 'app', '(unison)', 'commercial', 'leads', '[leadId]', 'page.tsx'), 'utf8')
  assert.match(lead, /getRecordWorkspace\('lead', leadId\)/)
  assert.match(lead, /sections=\{\['contacts', 'followups', 'timeline'\]\}/)
  const quote = readFileSync(join(workspace, 'app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'page.tsx'), 'utf8')
  assert.match(quote, /sections=\{\['timeline'\]\}/, 'the quote page shows the timeline only')
})
