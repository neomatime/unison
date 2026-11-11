import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Source guards for the owner/admin switch of automatic sending (accept to invoice, stage 2, task 7). A near-copy of the billing
// plans switch and guarded the same way (tests/unit/billing-switch.test.ts is the model). Git on Windows may check files out with
// CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

const action = () => read('features', 'documents', 'actions', 'billing-auto-switch.ts')
const component = () => read('features', 'documents', 'components', 'billing-auto-send-switch.tsx')
const page = () => read('app', '(unison)', 'settings', 'company', 'page.tsx')
const folded = (source: string) => source.replace(/&apos;/g, "'").replace(/\s+/g, ' ')

const SUCCESS_ON = 'Automatic sending switched on. Each month of an approved billing plan is now issued and emailed on its date, after the same checks as the first invoice.'
const SUCCESS_OFF = 'Automatic sending switched off. Nothing more is issued or emailed automatically; invoices already issued stay as they are.'
const EXPLANATION =
  "Each day, every month of an approved billing plan that has come due is issued and emailed to the client with its PDF, bank details and payment reference. A month that fails its checks, or that is due together with another month, waits for you and you are told. The first invoice is still approved by hand."

test('the action is a server-action module with one exported async function and nothing else', () => {
  const source = action()
  assert.match(source, /^'use server'/)
  const exported = source.split('\n').filter((line) => /^export /.test(line))
  assert.equal(exported.length, 1)
  assert.match(exported[0], /^export async function setBillingAutoSendEnabledAction\(_previous: ActionState, form: FormData\): Promise<ActionState> \{$/)
  assert.match(source, /import type \{ ActionState \} from '\.\.\/types'/)
})

test('the action reads the session, then the permission, before its one database call', () => {
  const source = action()
  const context = source.indexOf('await documentContext()')
  const permission = source.indexOf("roleHasPermission(role, 'company.manage')")
  const firstDb = source.search(/\bdb\s*\.\s*(from|rpc)\(/)
  assert.ok(context > -1 && permission > -1 && firstDb > -1)
  assert.ok(context < permission && permission < firstDb)
  assert.match(source, /if \(!roleHasPermission\(role, 'company\.manage'\)\) return \{ error: 'Only an owner or admin can change this\.' \}/)
  assert.equal((source.match(/\bdb\s*\.\s*(from|rpc)\(/g) ?? []).length, 1)
  assert.doesNotMatch(source, /createClient\(|supabase\/admin|SUPABASE_SECRET|process\.env/)
})

test('the action reads only the enabled checkbox and writes only billing_auto_send_enabled, scoped to the organisation', () => {
  const source = action()
  const reads = [...source.matchAll(/\bform\s*\.\s*(\w+)\(([^)]*)\)/g)].map((match) => `${match[1]}(${match[2].trim()})`)
  assert.deepEqual(reads, ["has('enabled')"])
  assert.match(source, /const billing_auto_send_enabled = form\.has\('enabled'\)/)
  assert.match(source, /\.from\('organization_settings'\)\s*\.update\(\{ billing_auto_send_enabled \}\)\s*\.eq\('organization_id', organization\.id\)/)
  assert.doesNotMatch(source, /billing_auto_send_enabled_at/, 'the time is stamped by the database')
  assert.doesNotMatch(source, /billing_plans_enabled\b.*update|\.upsert\(|\.insert\(|\.delete\(/, 'it never writes the plans switch or the row')
})

test('switching on needs billing plans on: the update is conditioned on it and a miss says so', () => {
  const source = action()
  assert.match(source, /\.eq\('billing_plans_enabled', true\)/, 'only a row whose plans switch is on can be switched on')
  assert.match(source, /Turn on billing plans first/)
  assert.match(source, /Save the company details first\./)
})

test('a database error gives the generic message, never the raw one, and is told apart from a missing row', () => {
  const source = action()
  assert.match(source, /The setting could not be saved\. Please try again\./)
  assert.match(source, /if \(saved\.error\) \{\s+console\.error\('\[documents:billing-auto-switch\]', saved\.error\)\s+return \{ error: 'The setting could not be saved\. Please try again\.' \}\s+\}/)
  assert.doesNotMatch(source, /\.message|String\(saved\.error|saved\.error\.|JSON\.stringify/)
  assert.ok(source.indexOf('if (saved.error)') < source.indexOf('if (!saved.data?.length)'))
  assert.equal((source.match(/console\.error\(/g) ?? []).length, 1)
  assert.doesNotMatch(source, /documents:billing-switch'|documents:portal-switch/)
})

test('success refreshes the pages, then says what is now on or off, in exact words', () => {
  const source = action()
  const first = source.indexOf("revalidatePath('/settings/company')")
  const second = source.indexOf('revalidateDocumentPages()')
  const done = source.indexOf('return { success')
  assert.ok(first > -1 && second > first && done > second)
  assert.ok(source.includes(`'${SUCCESS_ON}'`))
  assert.ok(source.includes(`'${SUCCESS_OFF}'`))
  assert.ok(source.indexOf(SUCCESS_ON) < source.indexOf(SUCCESS_OFF))
})

test('the settings page renders the automatic-sending switch after the billing switch, with the stored values', () => {
  const source = page()
  assert.match(source, /import \{ BillingAutoSendSwitch \} from '@\/features\/documents\/components\/billing-auto-send-switch'/)
  const billing = source.indexOf('<BillingPlansSwitch ')
  const auto = source.indexOf('<BillingAutoSendSwitch ')
  assert.ok(billing > -1 && auto > billing)
  assert.match(source, /<BillingAutoSendSwitch enabled=\{settings\?\.billing_auto_send_enabled \?\? false\} plansEnabled=\{settings\?\.billing_plans_enabled \?\? false\} canEdit=\{canEdit\} \/>/)
})

test('the company settings type carries the optional automatic-sending switch', () => {
  assert.match(read('features', 'documents', 'types.ts'), /\n  billing_auto_send_enabled\?: boolean\n/)
})

test('the component is a client form that calls its action by hand and renders no raw HTML', () => {
  const source = component()
  assert.match(source, /^'use client'/)
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|server-only|lib\/supabase|lib\/email/)
  assert.match(source, /import \{ setBillingAutoSendEnabledAction \} from '\.\.\/actions\/billing-auto-switch'/)
  assert.match(source, /useActionState\(setBillingAutoSendEnabledAction, undefined\)/)
  assert.match(source, /export function BillingAutoSendSwitch\(\{ enabled, plansEnabled, canEdit \}: \{ enabled: boolean; plansEnabled: boolean; canEdit: boolean \}\)/)
  assert.doesNotMatch(source, /<form\s+action=/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /startTransition\(\(\) => run\(data\)\)/)
})

test('the checkbox is labelled, described by its explanation, and disabled for non-editors and while billing plans are off', () => {
  const source = component()
  assert.match(source, /<input\s+type="checkbox"\s+name="enabled"\s+defaultChecked=\{enabled\}\s+aria-describedby=\{helpId\}/)
  assert.match(source, /<span>Issue and email each month&apos;s invoice automatically<\/span>/)
  assert.match(source, /<FormSection title="Automatic sending" columns=\{1\}>/)
  assert.match(source, /<fieldset\s+disabled=\{!canEdit \|\| \(!plansEnabled && !enabled\)\}/, 'turning it off is always possible')
  assert.match(source, /<button\s+type="submit"\s+disabled=\{!canEdit \|\| \(!plansEnabled && !enabled\) \|\| pending\}/)
  assert.match(source, /Save automatic sending/)
  assert.match(source, /Turn on billing plans first\./)
  assert.match(source, /Only an owner or admin can change this\./)
})

test('the explanation is word for word and does not claim the first invoice is automatic', () => {
  const source = folded(component())
  assert.ok(source.includes(EXPLANATION))
  assert.match(source, /The first invoice is still approved by hand\./)
  assert.doesNotMatch(source, /\bpaid\b/i)
})

test('success is hidden once the checkbox changes again, and errors show in an alert', () => {
  const source = component()
  assert.match(source, /onChange=\{\(\) => setDirty\(true\)\}/)
  assert.match(source, /state\?\.success && !dirty && !pending/)
  assert.match(source, /<FormError message=\{state\?\.error\} \/>/)
})

test('the company details form is untouched: the switch is never merged into it', () => {
  for (const file of [['features', 'documents', 'components', 'company-details-form.tsx'], ['features', 'documents', 'fields.ts'], ['features', 'documents', 'actions', 'company.ts']]) {
    assert.doesNotMatch(read(...file), /billing_auto_send_enabled|BillingAutoSendSwitch|billing-auto/)
  }
})

test('the new files are plain ASCII', () => {
  for (const [name, source] of [['billing-auto-switch.ts', action()], ['billing-auto-send-switch.tsx', component()]] as const) {
    assert.doesNotMatch(source, /[^\n -~]/, `${name} is plain ASCII (use \\u escapes)`)
  }
})
