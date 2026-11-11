import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Source guards for the reminders panel of an invoice (accept to invoice, stage 3, task 5): the pause action, the query, the panel and
// the page that mounts it. Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const action = () => read('features', 'documents', 'actions', 'billing-reminders.ts')
const query = () => read('features', 'documents', 'queries', 'get-invoice-reminders.ts')
const panel = () => read('features', 'documents', 'components', 'billing-reminders-panel.tsx')
const form = () => read('features', 'documents', 'components', 'billing-reminders-pause-form.tsx')
const page = () => read('app', '(unison)', 'finance', 'invoices', '[invoiceId]', 'page.tsx')

test('the action is a server-action module with one exported async function and nothing else', () => {
  const source = action()
  assert.match(source, /^'use server'/)
  const exported = source.split('\n').filter((line) => /^export /.test(line))
  assert.equal(exported.length, 1)
  assert.match(exported[0], /^export async function setInvoiceRemindersPausedAction\(invoiceId: string, paused: boolean, _previous: ActionState, form: FormData\): Promise<ActionState> \{$/)
})

test('the action checks the id, then the session, then the permission, before its one database call', () => {
  const source = action()
  const uuid = source.indexOf('isUuid(invoiceId)')
  const context = source.indexOf('await documentContext()')
  const permission = source.indexOf("roleHasPermission(role, 'company.manage')")
  const firstDb = source.search(/\bdb\s*\.\s*(from|rpc)\(/)
  assert.ok(uuid > -1 && context > uuid && permission > context && firstDb > permission, 'id, session, permission, then the database')
  assert.equal((source.match(/\bdb\s*\.\s*(from|rpc)\(/g) ?? []).length, 1)
  assert.match(source, /db\.rpc\('billing_reminders_set_paused', \{ p_invoice_id: invoiceId, p_paused: paused, p_reason: reason \}\)/)
  assert.doesNotMatch(source, /createClient\(|supabase\/admin|SUPABASE_SECRET|process\.env/)
})

test('the action reads only the reason from the form and refreshes the pages', () => {
  const source = action()
  const reads = [...source.matchAll(/\bform\s*\.\s*(\w+)\(([^)]*)\)/g)].map((match) => `${match[1]}(${match[2].trim()})`)
  assert.deepEqual(reads, ["get('reason')"])
  assert.match(source, /revalidateDocumentPages\(\)/)
  assert.match(source, /failureState\(result\.error, /)
})

test('the action says what happened in plain words and never claims anything is paid', () => {
  const source = action()
  assert.ok(source.includes("'Reminders paused.'"))
  assert.ok(source.includes("'Reminders resumed.'"))
  assert.ok(source.includes("'Only an owner or admin can pause or resume reminders.'"))
  assert.doesNotMatch(source, /\bpaid\b/i)
})

test('the query is server-only, reads with the member client, reads only sent reminders, and writes nothing', () => {
  const source = query()
  assert.match(source, /^import 'server-only'/)
  assert.match(source, /\.from\('billing_reminders'\)/)
  assert.match(source, /\.not\('sent_at', 'is', null\)/, 'only reminders that went out')
  assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\(|supabase\/admin/)
  assert.match(source, /billing_plans_enabled/)
  assert.match(source, /billing_reminders_enabled/)
})

test('the panel is a server component that renders nothing for an invoice with no plan and shows the controls only to an owner or admin', () => {
  const source = panel()
  assert.doesNotMatch(source, /^'use client'/)
  assert.match(source, /if \(!view\) return null/)
  assert.match(source, /view\.canManage/)
  const control = source.indexOf('<BillingRemindersPauseForm')
  const gate = source.lastIndexOf('view.canManage', control)
  assert.ok(control > -1 && gate > -1 && gate < control, 'the pause form is rendered inside a canManage branch')
  assert.match(source, /describeReminders\(/)
  // The status value 'Partially Paid' is data, not wording: nothing the panel says to a person may claim a payment.
  assert.doesNotMatch(source.replace(/'Partially Paid'/g, ''), /\bpaid\b/i)
})

test('the pause form is a client form that calls its action by hand, requires a reason to pause, and imports no server code', () => {
  const source = form()
  assert.match(source, /^'use client'/)
  assert.match(source, /setInvoiceRemindersPausedAction\.bind\(null, invoiceId, paused\)/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /startTransition\(\(\) => run\(data\)\)/)
  assert.match(source, /required=\{paused\}/, 'a reason is required to pause and optional to resume')
  assert.match(source, /maxLength=\{500\}/)
  assert.doesNotMatch(source, /server-only|lib\/supabase|lib\/email|dangerouslySetInnerHTML/)
})

test('the invoice page mounts the reminders panel after the payments section', () => {
  const source = page()
  assert.match(source, /import \{ BillingRemindersPanel \} from '@\/features\/documents\/components\/billing-reminders-panel'/)
  assert.ok(source.indexOf('<PaymentsSection') > -1 && source.indexOf('<BillingRemindersPanel') > source.indexOf('<PaymentsSection'))
})

test('the new files are plain ASCII', () => {
  for (const [name, source] of [['billing-reminders.ts', action()], ['get-invoice-reminders.ts', query()], ['billing-reminders-panel.tsx', panel()], ['billing-reminders-pause-form.tsx', form()]] as const) {
    assert.doesNotMatch(source, /[^\n -~]/, `${name} is plain ASCII (use \\u escapes)`)
  }
})
