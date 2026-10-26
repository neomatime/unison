import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Source guards for the owner/admin switch of billing plans (accept to invoice, stage 1, task 8). It is a near-copy
// of the client portal switch and is guarded the same way. Git on Windows may check files out with CRLF line
// endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

const action = () => read('features', 'documents', 'actions', 'billing-switch.ts')
const component = () => read('features', 'documents', 'components', 'billing-plans-switch.tsx')
const page = () => read('app', '(unison)', 'settings', 'company', 'page.tsx')
// What the reader sees: JSX folds a line break and its indentation into one space, and &apos; is an apostrophe.
const folded = (source: string) => source.replace(/&apos;/g, "'").replace(/\s+/g, ' ')

const SUCCESS_ON = 'Billing plans switched on. A quote accepted on the portal now gets a billing plan and a draft first invoice for approval.'
const SUCCESS_OFF = 'Billing plans switched off. Nothing new is created and nothing more is approved; existing plans stay on their quotes.'
const EXPLANATION =
  "When on, a quote accepted on the client portal moves its sales record to Won, gets a billing plan and a draft first invoice, and the owner is told. An owner or admin approves the first invoice before it is emailed. Monthly invoices are not sent automatically yet: create each month's invoice from the quote page."

test('the switch action is a server-action module with one exported async function and nothing else', () => {
  const source = action()
  assert.match(source, /^'use server'/, 'it must be a server-action module')
  const exported = source.split('\n').filter((line) => /^export /.test(line))
  assert.equal(exported.length, 1, 'one export')
  assert.match(exported[0], /^export async function setBillingPlansEnabledAction\(_previous: ActionState, form: FormData\): Promise<ActionState> \{$/)
  assert.match(source, /import type \{ ActionState \} from '\.\.\/types'/)
})

test('the action reads the session first and refuses anyone without company.manage before it touches the database', () => {
  const source = action()
  const context = source.indexOf('await documentContext()')
  const permission = source.indexOf("roleHasPermission(role, 'company.manage')")
  const firstDb = source.search(/\bdb\s*\.\s*(from|rpc)\(/)
  assert.ok(context > -1 && permission > -1 && firstDb > -1, 'context, permission check and database use must all be present')
  assert.ok(context < permission && permission < firstDb, 'documentContext(), then the permission check, then the first database call')
  assert.match(source, /if \(!roleHasPermission\(role, 'company\.manage'\)\) return \{ error: 'Only an owner or admin can change this\.' \}/)
  assert.equal((source.match(/\bdb\s*\.\s*(from|rpc)\(/g) ?? []).length, 1, 'exactly one database call, after the check')
  assert.doesNotMatch(source, /createClient\(|supabase\/admin|SUPABASE_SECRET|process\.env/, 'the action uses the signed-in client only')
})

test('the action reads only the enabled checkbox and writes only billing_plans_enabled, scoped to the organisation', () => {
  const source = action()
  const reads = [...source.matchAll(/\bform\s*\.\s*(\w+)\(([^)]*)\)/g)].map((match) => `${match[1]}(${match[2].trim()})`)
  assert.deepEqual(reads, ["has('enabled')"], 'present means true; no other field is read from the form')
  assert.match(source, /const billing_plans_enabled = form\.has\('enabled'\)/)
  assert.match(source, /\.from\('organization_settings'\)\s*\.update\(\{ billing_plans_enabled \}\)\s*\.eq\('organization_id', organization\.id\)\s*\.select\('id'\)/)
  assert.doesNotMatch(source, /billing_plans_enabled_at/, 'the time is stamped by the database; the action never writes it')
  assert.doesNotMatch(source, /\.upsert\(|\.insert\(|\.delete\(/, 'a switch never creates or removes the settings row')
})

test('no row updated asks for the company details first; a database error gives a generic message, never the raw one', () => {
  const source = action()
  assert.match(source, /Save the company details first\./)
  assert.match(source, /The setting could not be saved\. Please try again\./)
  assert.match(source, /if \(saved\.error\) \{\s+console\.error\('\[documents:billing-switch\]', saved\.error\)\s+return \{ error: 'The setting could not be saved\. Please try again\.' \}\s+\}/, 'the detail goes to the server log, the user sees the generic sentence')
  assert.match(source, /if \(!saved\.data\?\.length\) return \{ error: 'Save the company details first\.' \}/)
  assert.doesNotMatch(source, /\.message|String\(saved\.error|saved\.error\.|JSON\.stringify/, 'the raw database message is never returned')
  // The error check comes first so that an error (which also has no rows) is not reported as a missing row.
  assert.ok(source.indexOf('if (saved.error)') < source.indexOf('if (!saved.data?.length)'), 'a failure is told apart from a missing row')
})

test('success refreshes the company page and the document pages, then says what is now on or off, in exact words', () => {
  const source = action()
  const write = source.indexOf('.update({ billing_plans_enabled })')
  const first = source.indexOf("revalidatePath('/settings/company')")
  const second = source.indexOf('revalidateDocumentPages()')
  const done = source.indexOf('return { success')
  assert.ok(write > -1 && first > write && second > first && done > second, 'write, then both revalidations, then the success state')
  assert.match(source, /import \{ revalidatePath \} from 'next\/cache'/)
  assert.match(source, /import \{ revalidateDocumentPages \} from '\.\.\/revalidate'/)
  assert.match(source, /return \{ success: billing_plans_enabled \? '[^']+' : '[^']+' \}/)
  assert.ok(source.includes(`'${SUCCESS_ON}'`), 'the switched-on sentence')
  assert.ok(source.includes(`'${SUCCESS_OFF}'`), 'the switched-off sentence')
  assert.ok(source.indexOf(SUCCESS_ON) < source.indexOf(SUCCESS_OFF), 'on first, then off, matching the ternary')
})

test('the action logs under its own tag and not the portal switch tag', () => {
  const source = action()
  assert.equal((source.match(/console\.error\(/g) ?? []).length, 1, 'one log line')
  assert.doesNotMatch(source, /documents:portal-switch/)
})

test('the settings page renders the billing switch after the portal switch and passes the stored value and canEdit', () => {
  const source = page()
  assert.doesNotMatch(source, /^\s*['"]use client['"]/, 'the page stays a server route')
  assert.match(source, /import \{ BillingPlansSwitch \} from '@\/features\/documents\/components\/billing-plans-switch'/)
  const form = source.indexOf('<CompanyDetailsForm ')
  const portal = source.indexOf('<QuotePortalSwitch ')
  const billing = source.indexOf('<BillingPlansSwitch ')
  assert.ok(form > -1 && portal > form && billing > portal, 'the company form, then the portal switch, then the billing switch')
  assert.match(source, /<BillingPlansSwitch enabled=\{settings\?\.billing_plans_enabled \?\? false\} canEdit=\{canEdit\} \/>/)
  assert.match(
    source,
    /return \(\s*<>\s*<CompanyDetailsForm [^>]*\/>\s*<QuotePortalSwitch [^>]*\/>\s*<BillingPlansSwitch [^>]*\/>\s*<\/>\s*\)/,
    'all three are children of one fragment',
  )
  assert.match(source, /<QuotePortalSwitch enabled=\{settings\?\.quote_portal_enabled \?\? false\} canEdit=\{canEdit\} \/>/, 'the portal switch is wired as before')
  assert.match(source, /<CompanyDetailsForm settings=\{settings\} canEdit=\{canEdit\} termsManaged=\{managed\} \/>/, 'the company form is wired as before')
})

test('the company settings type carries the optional billing switch and the settings query still reads every column', () => {
  assert.match(read('features', 'documents', 'types.ts'), /\n  billing_plans_enabled\?: boolean\n/)
  assert.match(read('features', 'documents', 'types.ts'), /\n  quote_portal_enabled\?: boolean\n/, 'the portal switch is still there')
  assert.match(
    read('features', 'documents', 'queries', 'get-company-settings.ts'),
    /\.from\('organization_settings'\)\.select\('\*'\)\.eq\('organization_id', organization\.id\)\.maybeSingle\(\)/,
    'select * means the new column reaches the page without a second query',
  )
})

test('the switch component is a client form that calls its own action by hand and renders no raw HTML', () => {
  const source = component()
  assert.match(source, /^'use client'/)
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/, 'text is never rendered as HTML')
  assert.match(source, /import \{ setBillingPlansEnabledAction \} from '\.\.\/actions\/billing-switch'/)
  assert.match(source, /useActionState\(setBillingPlansEnabledAction, undefined\)/)
  assert.match(source, /export function BillingPlansSwitch\(\{ enabled, canEdit \}: \{ enabled: boolean; canEdit: boolean \}\)/)
  assert.doesNotMatch(source, /<form\s+action=/, 'React resets a <form action> after it runs')
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /startTransition\(\(\) => run\(data\)\)/)
  assert.doesNotMatch(source, /server-only|lib\/supabase|lib\/email/, 'a client component imports no server code')
})

test('the switch is one labelled checkbox named enabled, described by its explanation, and disabled for non-editors', () => {
  const source = component()
  assert.match(source, /<input\s+type="checkbox"\s+name="enabled"\s+defaultChecked=\{enabled\}\s+aria-describedby=\{helpId\}/, 'a checkbox named enabled, described by the explanation')
  assert.match(source, /const helpId = useId\(\)/)
  assert.match(source, /<p id=\{helpId\}/, 'the explanation carries the id the checkbox points at')
  assert.match(source, /<label [^>]*>\s*<input\s[\s\S]*?\/>\s*<span>Create a billing plan when a client accepts a quote<\/span>\s*<\/label>/, 'the checkbox is labelled')
  assert.match(source, /<FormSection title="Billing plans" columns=\{1\}>/)
  assert.match(source, /<fieldset\s+disabled=\{!canEdit\}/)
  assert.match(source, /<button\s+type="submit"\s+disabled=\{!canEdit \|\| pending\}/, 'Save is disabled for non-editors and while saving')
  assert.match(source, /Save billing setting/, 'the button says what it saves')
  assert.doesNotMatch(source, /Save client portal setting/, 'and is not the portal switch button')
  assert.match(source, /!canEdit \? \(\s*<p role="note"[^>]*>\s*Only an owner or admin can change this\.\s*<\/p>\s*\) : null/, 'the same note the company form uses')
})

test('the explanation says what the switch does and, honestly, what is still done by hand', () => {
  const source = folded(component())
  assert.ok(source.includes(EXPLANATION), 'the sentences from the brief, word for word')
  assert.match(source, /An owner or admin approves the first invoice before it is emailed\./, 'the first invoice is approved, not sent on its own')
  assert.match(source, /Monthly invoices are not sent automatically yet: create each month's invoice from the quote page\./, 'monthly invoices are still made by hand')
  assert.doesNotMatch(source, /kill switch/i, 'plain, calm language')
})

test('the explanation does not depend on the switch: enabled only sets the checkbox', () => {
  const source = component()
  assert.match(source, /defaultChecked=\{enabled\}/)
  // Take out the three places the word belongs (the signature, the input name and defaultChecked): nothing may be left,
  // so no text is added or hidden by it.
  const rest = source
    .replace('export function BillingPlansSwitch({ enabled, canEdit }: { enabled: boolean; canEdit: boolean })', '')
    .replace('name="enabled"', '')
    .replace('defaultChecked={enabled}', '')
  assert.doesNotMatch(rest, /\benabled\b/, 'enabled sets the checkbox and nothing else')
})

test('success is hidden once the checkbox changes again, and errors show in an alert', () => {
  const source = component()
  assert.match(source, /onChange=\{\(\) => setDirty\(true\)\}/)
  assert.match(source, /setDirty\(false\)/)
  assert.match(source, /state\?\.success && !dirty && !pending/)
  assert.match(source, /<FormError message=\{state\?\.error\} \/>/)
  assert.match(source, /<p role="status"/)
})

test('the company details form and its field list are untouched: the billing switch is never merged into them', () => {
  for (const file of [
    ['features', 'documents', 'components', 'company-details-form.tsx'],
    ['features', 'documents', 'fields.ts'],
    ['features', 'documents', 'actions', 'company.ts'],
  ]) {
    const source = read(...file)
    assert.doesNotMatch(source, /billing_plans_enabled|BillingPlansSwitch|billing-switch|billing-plans-switch|name="enabled"/, `${file.join('/')} knows nothing of the billing switch`)
  }
})

test('the new files hold no raw invisible or non-ASCII characters', () => {
  for (const [name, source] of [['billing-switch.ts', action()], ['billing-plans-switch.tsx', component()]] as const) {
    assert.doesNotMatch(source, /[^\n -~]/, `${name} is plain ASCII (use \\u escapes)`)
  }
})
