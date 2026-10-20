import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Source guards for the owner/admin switch of the quote portal (slice 1, task 10). Git on Windows may check
// files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

const action = () => read('features', 'documents', 'actions', 'portal-switch.ts')
const component = () => read('features', 'documents', 'components', 'quote-portal-switch.tsx')
const page = () => read('app', '(unison)', 'settings', 'company', 'page.tsx')

const SUCCESS_ON = 'Client portal switched on. New quote emails carry a secure link.'
const SUCCESS_OFF = 'Client portal switched off. Quote emails go out as before; links already sent keep working until you revoke them.'
const EXPLANATION = 'When on, emailed quotes carry a secure link to a private page. Turn it on only when you are ready for clients to see it.'

test('the switch action is a server-action module with one exported async function and nothing else', () => {
  const source = action()
  assert.match(source, /^'use server'/, 'it must be a server-action module')
  const exported = source.split('\n').filter((line) => /^export /.test(line))
  assert.equal(exported.length, 1, 'one export')
  assert.match(exported[0], /^export async function setQuotePortalEnabledAction\(_previous: ActionState, form: FormData\): Promise<ActionState> \{$/)
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

test('the action reads only the enabled checkbox and writes only quote_portal_enabled, scoped to the organisation', () => {
  const source = action()
  const reads = [...source.matchAll(/\bform\s*\.\s*(\w+)\(([^)]*)\)/g)].map((match) => `${match[1]}(${match[2].trim()})`)
  assert.deepEqual(reads, ["has('enabled')"], 'present means true; no other field is read from the form')
  assert.match(source, /const quote_portal_enabled = form\.has\('enabled'\)/)
  assert.match(source, /\.from\('organization_settings'\)\s*\.update\(\{ quote_portal_enabled \}\)\s*\.eq\('organization_id', organization\.id\)\s*\.select\('id'\)/)
  assert.doesNotMatch(source, /\.upsert\(|\.insert\(|\.delete\(/, 'a switch never creates or removes the settings row')
})

test('no row updated asks for the company details first; a database error gives a generic message, never the raw one', () => {
  const source = action()
  assert.match(source, /Save the company details first\./)
  assert.match(source, /The setting could not be saved\. Please try again\./)
  assert.match(source, /if \(saved\.error\) \{\s+console\.error\('\[documents:portal-switch\]', saved\.error\)\s+return \{ error: 'The setting could not be saved\. Please try again\.' \}\s+\}/, 'the detail goes to the server log, the user sees the generic sentence')
  assert.match(source, /if \(!saved\.data\?\.length\) return \{ error: 'Save the company details first\.' \}/)
  assert.doesNotMatch(source, /\.message|String\(saved\.error|saved\.error\.|JSON\.stringify/, 'the raw database message is never returned')
  // The error check comes first so that an error (which also has no rows) is not reported as a missing row.
  assert.ok(source.indexOf('if (saved.error)') < source.indexOf('if (!saved.data?.length)'), 'a failure is told apart from a missing row')
})

test('success refreshes the company page and the document pages, then says what is now on or off, in exact words', () => {
  const source = action()
  const write = source.indexOf(".update({ quote_portal_enabled })")
  const first = source.indexOf("revalidatePath('/settings/company')")
  const second = source.indexOf('revalidateDocumentPages()')
  const done = source.indexOf('return { success')
  assert.ok(write > -1 && first > write && second > first && done > second, 'write, then both revalidations, then the success state')
  assert.match(source, /import \{ revalidatePath \} from 'next\/cache'/)
  assert.match(source, /import \{ revalidateDocumentPages \} from '\.\.\/revalidate'/)
  assert.match(source, /return \{ success: quote_portal_enabled \? '[^']+' : '[^']+' \}/)
  assert.ok(source.includes(`'${SUCCESS_ON}'`), 'the switched-on sentence')
  assert.ok(source.includes(`'${SUCCESS_OFF}'`), 'the switched-off sentence')
  assert.ok(source.indexOf(SUCCESS_ON) < source.indexOf(SUCCESS_OFF), 'on first, then off, matching the ternary')
})

test('the settings page renders the switch after the company form and passes the stored value and canEdit', () => {
  const source = page()
  assert.doesNotMatch(source, /^\s*['"]use client['"]/, 'the page stays a server route')
  assert.match(source, /import \{ QuotePortalSwitch \} from '@\/features\/documents\/components\/quote-portal-switch'/)
  const form = source.indexOf('<CompanyDetailsForm ')
  const toggle = source.indexOf('<QuotePortalSwitch ')
  assert.ok(form > -1 && toggle > form, 'the switch is a sibling below the company form')
  assert.match(source, /<QuotePortalSwitch enabled=\{settings\?\.quote_portal_enabled \?\? false\} canEdit=\{canEdit\} \/>/)
  assert.match(source, /return \(\s*<>\s*<CompanyDetailsForm [^>]*\/>\s*<QuotePortalSwitch [^>]*\/>\s*<\/>\s*\)/, 'both are children of one fragment')
  assert.match(source, /<CompanyDetailsForm settings=\{settings\} canEdit=\{canEdit\} termsManaged=\{managed\} \/>/, 'the company form is wired as before')
})

test('the switch component is a client form that calls its own action by hand and renders no raw HTML', () => {
  const source = component()
  assert.match(source, /^'use client'/)
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/, 'text is never rendered as HTML')
  assert.match(source, /import \{ setQuotePortalEnabledAction \} from '\.\.\/actions\/portal-switch'/)
  assert.match(source, /useActionState\(setQuotePortalEnabledAction, undefined\)/)
  assert.match(source, /export function QuotePortalSwitch\(\{ enabled, canEdit \}: \{ enabled: boolean; canEdit: boolean \}\)/)
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
  assert.match(source, /<label [^>]*>\s*<input\s[\s\S]*?\/>\s*<span>Send quotes with a secure client link<\/span>\s*<\/label>/, 'the checkbox is labelled')
  assert.match(source, /<fieldset\s+disabled=\{!canEdit\}/)
  assert.match(source, /<button\s+type="submit"\s+disabled=\{!canEdit \|\| pending\}/, 'Save is disabled for non-editors and while saving')
  assert.match(source, /!canEdit \? \(\s*<p role="note"[^>]*>\s*Only an owner or admin can change this\.\s*<\/p>\s*\) : null/, 'the same note the company form uses')
})

test('the explanation says what the switch does and, honestly, that it gates new links only', () => {
  const source = component()
  assert.ok(source.includes(EXPLANATION), 'the sentence from the brief, word for word')
  assert.match(source, /Turning it off (stops|means) new [^.]*\./, 'off stops new links')
  assert.match(source, /links already sent keep working/, 'already-issued links keep working when it is turned off')
  assert.match(source, /revoke[^.]*from (the|each) quote/, 'and can be revoked from the quote')
  assert.doesNotMatch(source, /kill switch/i, 'plain, calm language')
})

test('success is hidden once the checkbox changes again, and errors show in an alert', () => {
  const source = component()
  assert.match(source, /onChange=\{\(\) => setDirty\(true\)\}/)
  assert.match(source, /setDirty\(false\)/)
  assert.match(source, /state\?\.success && !dirty && !pending/)
  assert.match(source, /<FormError message=\{state\?\.error\} \/>/)
  assert.match(source, /<p role="status"/)
})

test('the company details form and its field list are untouched: the switch is never merged into them', () => {
  for (const file of [
    ['features', 'documents', 'components', 'company-details-form.tsx'],
    ['features', 'documents', 'fields.ts'],
    ['features', 'documents', 'actions', 'company.ts'],
  ]) {
    const source = read(...file)
    assert.doesNotMatch(source, /quote_portal_enabled|QuotePortalSwitch|portal-switch|name="enabled"/, `${file.join('/')} knows nothing of the switch`)
  }
})
