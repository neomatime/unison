import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Source guards for the readiness panel of a quote (accept to invoice, stage 4, task 4): the query, the override action, the panel, its
// form and the page that mounts it. Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const action = () => read('features', 'documents', 'actions', 'billing-readiness.ts')
const query = () => read('features', 'documents', 'queries', 'get-billing-readiness.ts')
const panel = () => read('features', 'documents', 'components', 'billing-readiness-panel.tsx')
const form = () => read('features', 'documents', 'components', 'billing-readiness-override-form.tsx')
const page = () => read('app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'page.tsx')

test('the action is a server-action module with one exported async function and nothing else', () => {
  const source = action()
  assert.match(source, /^'use server'/)
  const exported = source.split('\n').filter((line) => /^export /.test(line))
  assert.equal(exported.length, 1)
  assert.match(exported[0], /^export async function setBillingReadinessOverrideAction\(quoteId: string, override: boolean, _previous: ActionState, form: FormData\): Promise<ActionState> \{$/)
})

test('the action checks the id, then the session, then the permission, before its one database call', () => {
  const source = action()
  const uuid = source.indexOf('isUuid(quoteId)')
  const context = source.indexOf('await documentContext()')
  const permission = source.indexOf("roleHasPermission(role, 'company.manage')")
  const firstDb = source.search(/\bdb\s*\.\s*(from|rpc)\(/)
  assert.ok(uuid > -1 && context > uuid && permission > context && firstDb > permission)
  assert.equal((source.match(/\bdb\s*\.\s*(from|rpc)\(/g) ?? []).length, 1)
  assert.match(source, /db\.rpc\('billing_set_readiness_override', \{ p_quote_id: quoteId, p_override: override, p_reason: reason \}\)/)
  assert.doesNotMatch(source, /createClient\(|supabase\/admin|SUPABASE_SECRET|process\.env/)
})

test('the action reads only the reason, refreshes the pages, and says what happened in plain words', () => {
  const source = action()
  assert.deepEqual([...source.matchAll(/\bform\s*\.\s*(\w+)\(([^)]*)\)/g)].map((match) => `${match[1]}(${match[2].trim()})`), ["get('reason')"])
  assert.match(source, /revalidateDocumentPages\(\)/)
  assert.match(source, /failureState\(result\.error, /)
  assert.ok(source.includes("'Start decision saved.'"))
  assert.ok(source.includes("'Start decision removed.'"))
  assert.ok(source.includes("'Only an owner or admin can decide this.'"))
  assert.doesNotMatch(source, /completed|synced|handed off/i)
})

test('the query is server-only, reads through the one database function, maps its answer, and writes nothing', () => {
  const source = query()
  assert.match(source, /^import 'server-only'/)
  assert.match(source, /db\.rpc\('billing_readiness', \{ p_quote_id: quoteId \}\)/)
  assert.match(source, /roleHasPermission\(role, 'company\.manage'\)/)
  assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\(|supabase\/admin/)
  assert.doesNotMatch(source, /start_date\s*[<>]|balance\s*[<>=]/, 'the rule is never recomputed here: the database says')
  assert.match(source, /\/operations\/onboarding\//, 'it links to the onboarding record')
})

test('the panel renders nothing without a plan, shows the controls only to an owner or admin, and words the state through describeReadiness', () => {
  const source = panel()
  assert.doesNotMatch(source, /^'use client'/)
  assert.match(source, /if \(!view\) return null/)
  assert.match(source, /describeReadiness\(/)
  const control = source.indexOf('<BillingReadinessOverrideForm')
  const gate = source.lastIndexOf('view.canManage', control)
  assert.ok(control > -1 && gate > -1 && gate < control, 'the override form is rendered inside a canManage branch')
  assert.doesNotMatch(source, /completed|synced|handed off/i)
})

test('the override form is a client form that calls its action by hand, requires a reason to start anyway, and imports no server code', () => {
  const source = form()
  assert.match(source, /^'use client'/)
  assert.match(source, /setBillingReadinessOverrideAction\.bind\(null, quoteId, override\)/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /startTransition\(\(\) => run\(data\)\)/)
  assert.match(source, /required=\{override\}/)
  assert.match(source, /maxLength=\{500\}/)
  assert.doesNotMatch(source, /server-only|lib\/supabase|lib\/email|dangerouslySetInnerHTML/)
})

test('the quote page mounts the readiness panel after the billing plan panel', () => {
  const source = page()
  assert.match(source, /import \{ BillingReadinessPanel \} from '@\/features\/documents\/components\/billing-readiness-panel'/)
  assert.ok(source.indexOf('<BillingPlanPanel') > -1 && source.indexOf('<BillingReadinessPanel') > source.indexOf('<BillingPlanPanel'))
})

test('the new files are plain ASCII', () => {
  for (const [name, source] of [['billing-readiness.ts', action()], ['get-billing-readiness.ts', query()], ['billing-readiness-panel.tsx', panel()], ['billing-readiness-override-form.tsx', form()]] as const) {
    assert.doesNotMatch(source, /[^\n -~]/, `${name} is plain ASCII (use \\u escapes)`)
  }
})
