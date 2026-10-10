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

test('the hidden occurredAt value is derived from the same state as the visible picker', () => {
  const source = read('components', 'occurred-at-field.tsx')
  assert.equal(source.match(/useState\(/g)?.length, 1, 'one state only: a second independent state is what let a stale time ride along')
  assert.match(source, /type="datetime-local"[\s\S]*?value=\{local\}/, 'the picker is controlled by that state')
  assert.match(source, /const iso = [^\n]*(toIso\(local\)|local)/, 'the ISO value is computed from the state at render')
  assert.match(source, /name="occurredAt" value=\{iso\}/, 'the hidden field carries the derived value')
  assert.doesNotMatch(source, /setIso|\[iso,/, 'no separate iso state')
  assert.match(read('components', 'timeline-section.tsx'), /<OccurredAtField key=\{savedCount\} \/>/, 'the log form remounts the picker after a save')
})

test('repeated row buttons carry the row name for assistive tech', () => {
  assert.match(read('components', 'contacts-section.tsx'), /aria-label=\{`Edit \$\{contact\.fullName\}`\}/)
  assert.match(read('components', 'contacts-section.tsx'), /ariaLabel=\{`Remove \$\{contact\.fullName\}`\}/)
  assert.match(read('components', 'timeline-section.tsx'), /aria-label=\{`Edit \$\{entry\.subject\}`\}/)
  assert.match(read('components', 'timeline-section.tsx'), /ariaLabel=\{`Remove \$\{entry\.subject\}`\}/)
  assert.match(read('components', 'follow-ups-section.tsx'), /ariaLabel=\{`Mark done: \$\{item\.title\}`\}/)
  assert.match(read('components', 'follow-ups-section.tsx'), /ariaLabel=\{`Reopen: \$\{item\.title\}`\}/)
})

test('each record page passes the workspace into the page, not just defines it', () => {
  const page = (...parts: string[]) => readFileSync(join(workspace, 'app', '(unison)', ...parts, 'page.tsx'), 'utf8')
  const all = "['contacts', 'followups', 'timeline']"
  const cases = [
    { source: page('commercial', 'leads', '[leadId]'), kind: 'lead', idName: 'leadId', component: 'LeadWorkspace', sections: all },
    { source: page('commercial', 'sales', '[opportunityId]'), kind: 'opportunity', idName: 'opportunityId', component: 'OpportunityWorkspace', sections: all },
    { source: page('commercial', 'quotes', '[quoteId]'), kind: 'quote', idName: 'quoteId', component: 'QuoteWorkspace', sections: "['timeline']" },
  ]
  for (const { source, kind, idName, component, sections } of cases) {
    assert.ok(source.includes(`getRecordWorkspace('${kind}', ${idName})`), `${kind} page loads its workspace`)
    assert.ok(source.includes(`sections={${sections}}`), `${kind} page lists its sections`)
    assert.ok(
      source.includes(`<PhaseSixDetail kind="${kind}" id={${idName}} after={<${component} ${idName}={${idName}} />} />`),
      `${kind} page must pass <${component}> as PhaseSixDetail's after prop`,
    )
  }
  const client = page('operations', 'clients', '[clientId]')
  assert.match(client, /getRecordWorkspace\('client', clientId\)/)
  assert.match(client, /<ClientDetail[^>]*workspace=\{workspace\}/, 'the client page must hand the workspace to ClientDetail')
  assert.match(read('..', '..', 'features', 'clients', 'components', 'client-detail.tsx'), /<RecordWorkspaceSections workspace=\{workspace\} sections=\{\['contacts', 'followups', 'timeline'\]\} \/>/)
})
