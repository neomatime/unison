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
    // Other props (the lead page's Convert button in `actions`) may sit between id and after.
    const mounted = new RegExp(`<PhaseSixDetail\\s+kind="${kind}"\\s+id=\\{${idName}\\}(\\s+actions=\\{[\\s\\S]*?\\})?\\s+after=\\{<${component} ${idName}=\\{${idName}\\}( notice=\\{notice\\})? />\\}\\s*/>`)
    assert.match(source, mounted, `${kind} page must pass <${component}> as PhaseSixDetail's after prop`)
  }
  const client = page('operations', 'clients', '[clientId]')
  assert.match(client, /getRecordWorkspace\('client', clientId\)/)
  assert.match(client, /<ClientDetail[^>]*workspace=\{workspace\}/, 'the client page must hand the workspace to ClientDetail')
  assert.match(read('..', '..', 'features', 'clients', 'components', 'client-detail.tsx'), /<RecordWorkspaceSections workspace=\{workspace\} sections=\{\['contacts', 'followups', 'timeline'\]\} \/>/)
})

test('the lead form no longer offers Converted, and conversion is only reachable through the Convert page', () => {
  const form = readFileSync(join(workspace, 'features', 'commercial-finance', 'components', 'phase-six-form.tsx'), 'utf8')
  assert.match(form, /value\("status"\) === "Converted" \? \["New", "Contacted", "Qualified", "Disqualified", "Converted"\] : \["New", "Contacted", "Qualified", "Disqualified"\]/)
  const page = readFileSync(join(workspace, 'app', '(unison)', 'commercial', 'leads', '[leadId]', 'convert', 'page.tsx'), 'utf8')
  assert.match(page, /findMatchingClients\(companyName\)/)
  assert.match(page, /lead\.status === 'Converted' \|\| lead\.archivedAt/, 'an already converted or archived lead is sent back')
  const leadPage = readFileSync(join(workspace, 'app', '(unison)', 'commercial', 'leads', '[leadId]', 'page.tsx'), 'utf8')
  assert.match(leadPage, /!workspace\.conversion && !workspace\.record\.archived/, 'the button is hidden once converted or archived')
})

test('the save action refuses Lost without a reason and explains the Converted rule', () => {
  const action = readFileSync(join(workspace, 'features', 'commercial-finance', 'actions', 'phase-six.ts'), 'utf8')
  assert.match(action, /stage === "Lost" && !optional\(form, "lostReason"\)/)
  assert.match(action, /leads_converted_status_check/)
  assert.match(action, /leads_conversion_guarded/, 'a member hits the guard trigger first, not the check')
  assert.match(action, /sales_opportunities_lost_reason_check/)
  assert.match(action, /conversionRefused && leavingConverted\s*\? "A converted lead cannot be changed back to another status\."/, 'leaving Converted has its own message')
  assert.match(action, /leavingConverted = kind === "lead" && Boolean\(id && isUuid\(id\)\) && values\.status !== "Converted"/)
  assert.ok(action.indexOf('conversionRefused && leavingConverted') < action.indexOf('A lead becomes Converted by using Convert lead on its page.'), 'the leaving case is decided before the forging message')
})

test('the website lead intake leaves an already converted lead alone instead of failing on replay', () => {
  const route = readFileSync(join(workspace, 'app', 'api', 'integrations', 'website-leads', 'route.ts'), 'utf8')
  assert.match(route, /converted_at/, 'the intake must check for a converted lead before upserting')
  assert.ok(route.indexOf('converted_at') < route.indexOf('.upsert('), 'the check must come before the upsert')
})

test('the lead import skips Converted rows with a message instead of letting the database guard fail the batch', () => {
  const source = readFileSync(join(workspace, 'features', 'data-portability', 'import-records.ts'), 'utf8')
  assert.match(source, /definition\.table === "leads" && record\.status === "Converted"/)
  assert.match(source, /Convert lead on its page/)
  assert.ok(source.indexOf('record.status === "Converted"') < source.indexOf('if (valid) records.push(record)'), 'the check must come before the row is accepted')
})

test('the opportunity import has a Lost Reason column and skips Lost rows without one instead of letting the database check fail the batch', () => {
  const source = readFileSync(join(workspace, 'features', 'data-portability', 'import-records.ts'), 'utf8')
  assert.match(source, /definition\.table === "sales_opportunities" && record\.stage === "Lost"/)
  assert.match(source, /Stage Lost needs a Lost reason\./)
  assert.ok(source.indexOf('record.stage === "Lost"') < source.indexOf('if (valid) records.push(record)'), 'the check must come before the row is accepted')
  const collections = readFileSync(join(workspace, 'features', 'data-portability', 'portable-collections.ts'), 'utf8')
  const opportunities = collections.slice(collections.indexOf('"sales-opportunities": {'), collections.indexOf('quotes: {'))
  assert.equal(opportunities.match(/column\("lost_reason", "Lost Reason"\)/g)?.length, 2, 'the reason is both exported and importable')
})

test('the lead page rejects a malformed id before it loads the workspace, so it is a 404 and not a database error', () => {
  const source = readFileSync(join(workspace, 'app', '(unison)', 'commercial', 'leads', '[leadId]', 'page.tsx'), 'utf8')
  const check = source.indexOf('if (!isUuid(leadId)) notFound()')
  assert.ok(check > -1, 'the page must call notFound() for an id that is not a uuid')
  const pageStart = source.indexOf('export default async function Page')
  assert.ok(check > pageStart, 'the check belongs in the page itself')
  assert.ok(check < source.indexOf('await loadWorkspace(leadId)', pageStart), 'the check must come before the page loads the workspace')
})

test('the Convert form keeps the client choice in state so a reset after a failed submit does not change it', () => {
  const source = read('components', 'convert-lead-form.tsx')
  assert.match(source, /useState\(matches\[0\]\?\.id \?\? 'new'\)/, 'the choice starts on the first existing match, or new')
  assert.match(source, /name="clientId" value=\{match\.id\} checked=\{choice === match\.id\} onChange=\{\(\) => setChoice\(match\.id\)\}/)
  assert.match(source, /name="clientId" value="new" checked=\{choice === 'new'\} onChange=\{\(\) => setChoice\('new'\)\}/)
  assert.doesNotMatch(source, /defaultChecked/, 'an uncontrolled radio is reset by React after the action')
})

test('the stage control is a client module, offers every stage, and asks for a reason on Lost', () => {
  const source = read('components', 'stage-control.tsx')
  assert.ok(isClient(source))
  assert.match(source, /OPPORTUNITY_STAGES\.map/)
  assert.match(source, /chosen === 'Lost' \?/)
  assert.match(source, /name="lostReason" required/)
  assert.match(source, /name="stage" value=\{chosen\} onChange=/, 'the stage is controlled state, so a reset after the action does not change it')
  assert.match(source, /name="lostReason" required[^\n]*value=\{reason\} onChange=/, 'the reason is controlled state, so a failed save keeps what was typed')
  assert.doesNotMatch(source, /defaultValue|defaultChecked/, 'an uncontrolled field is reset by React after the action')
  const page = readFileSync(join(workspace, 'app', '(unison)', 'commercial', 'sales', '[opportunityId]', 'page.tsx'), 'utf8')
  assert.match(page, /<StageControl opportunityId=\{opportunityId\}/)
  assert.match(page, /workspace\.record\.stage && !workspace\.record\.archived/, 'no control for a missing or archived opportunity')
  assert.match(page, /<StageControl [^>]*key=\{`\$\{workspace\.record\.stage\}\|\$\{workspace\.record\.lostReason \?\? ''\}`\}/, 'the control remounts when the stored stage or reason changes, so its state follows the record')
})

test('the client page rejects a malformed id before it loads anything, so it is a 404 and not a database error', () => {
  const source = readFileSync(join(workspace, 'app', '(unison)', 'operations', 'clients', '[clientId]', 'page.tsx'), 'utf8')
  const pageStart = source.indexOf('export default async function Page')
  const check = source.indexOf('if (!isUuid(clientId)) notFound()', pageStart)
  assert.ok(check > -1, 'the page itself must call notFound() for an id that is not a uuid')
  assert.ok(check < source.indexOf('await getClient(clientId)', pageStart), 'the check must come before the client is loaded')
  assert.ok(check < source.indexOf('await getRecordWorkspace(', pageStart), 'the check must come before the workspace is loaded')
})

test('the opportunity page rejects a malformed id before it loads the workspace, so it is a 404 and not a database error', () => {
  const source = readFileSync(join(workspace, 'app', '(unison)', 'commercial', 'sales', '[opportunityId]', 'page.tsx'), 'utf8')
  const pageStart = source.indexOf('export default async function Page')
  const check = source.indexOf('if (!isUuid(opportunityId)) notFound()', pageStart)
  assert.ok(check > -1, 'the page itself must call notFound() for an id that is not a uuid')
  assert.ok(check < source.indexOf('await loadWorkspace(opportunityId)', pageStart), 'the check must come before the page loads the workspace')
})
