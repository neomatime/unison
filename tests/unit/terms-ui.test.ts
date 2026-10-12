import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { documentErrorMessage } from '../../features/documents/errors.ts'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

const TOKENS = ['TERMS_TEMPLATE_EXISTS', 'TERMS_TARGET_INVALID', 'TERMS_NOT_FOUND', 'TERMS_NOT_DRAFT', 'TERMS_NOT_APPROVED', 'TERMS_DRAFT_EXISTS', 'TERMS_EMPTY', 'TERMS_EFFECTIVE_REQUIRED', 'TERMS_PLACEHOLDER_UNKNOWN', 'TERMS_TOO_LONG', 'TERMS_FORBIDDEN', 'TERMS_VERSION_IMMUTABLE']

test('every terms refusal the database can raise has a plain message', () => {
  const sql = read('supabase', 'migrations', '20261012160000_commercial_terms.sql')
  for (const token of TOKENS) {
    assert.ok(sql.includes(`'${token}'`), `${token} is raised by the migration`)
    assert.ok(documentErrorMessage(token), `${token} has a message`)
  }
  assert.match(documentErrorMessage('TERMS_PLACEHOLDER_UNKNOWN')!, /\{\{monthly_fee\}\}/, 'the message names the allowed placeholders')
})

test('the terms actions send ids and text to the database functions and never write a table directly', () => {
  const actions = read('features', 'terms', 'actions', 'terms.ts')
  assert.match(actions, /^'use server'/)
  for (const fn of ['create_terms_template', 'save_terms_draft', 'discard_terms_draft', 'approve_terms_version', 'archive_terms_version', 'restore_terms_version']) {
    assert.ok(actions.includes(`rpc('${fn}'`), `${fn} is called`)
  }
  assert.doesNotMatch(actions, /\.from\(['"]terms_/, 'no direct table writes')
  assert.match(actions, /isUuid\(templateId\)/)
  assert.match(actions, /isUuid\(versionId\)/)
  assert.match(actions, /isValidIsoDate\(effective\)/)
  assert.match(actions, /text\(form, 'intent'\) === 'approve'/, 'approve saves first, then approves')
  assert.match(actions, /Your draft was saved, but it was not approved/, 'a refused approval says the draft is kept')
})

test('the queries read only the organisation of the signed-in user and the preview never uses a draft of another template', () => {
  const list = read('features', 'terms', 'queries', 'list-terms-templates.ts')
  const get = read('features', 'terms', 'queries', 'get-terms-template.ts')
  const preview = read('features', 'terms', 'queries', 'load-preview.ts')
  for (const source of [list, get, preview]) assert.match(source, /^import 'server-only'/)
  for (const source of [list, get]) assert.match(source, /\.eq\('organization_id', organization\.id\)/)
  assert.match(preview, /\.eq\('status', 'approved'\)/, 'the company layer is taken from approved versions only')
  assert.match(preview, /currentVersion\(/)
  assert.match(get, /updatedAt: row\.updated_at/, 'the saved time of a draft is carried to the page')
})

test('the two settings pages exist, check the id before loading, and are linked from the organisation profile', () => {
  const list = read('app', '(unison)', 'settings', 'terms', 'page.tsx')
  assert.match(list, /TermsListScreen/)
  const detail = read('app', '(unison)', 'settings', 'terms', '[templateId]', 'page.tsx')
  assert.match(detail, /isUuid\(templateId\)/)
  assert.match(detail, /notFound\(\)/)
  assert.match(detail, /await params/)
  assert.match(detail, /await searchParams/)
  const profile = read('features', 'organizations', 'components', 'organization-profile-screen.tsx')
  assert.match(profile, /href="\/settings\/terms"/)
  assert.match(profile, /Commercial terms/)
})

test('the list shows the groups and statuses, and only an owner or admin sees the New template form', () => {
  const screen = read('features', 'terms', 'components', 'terms-list-screen.tsx')
  assert.match(screen, /const canManage = role === 'owner' \|\| role === 'admin'/)
  assert.match(screen, /\{canManage \? <NewTemplateForm \/> : null\}/)
  assert.match(screen, /No approved terms/)
  assert.match(screen, /Draft pending/)
  assert.match(screen, /groupTemplates\(/)
  assert.match(screen, /href=\{`\/settings\/terms\/\$\{template\.id\}`\}/)
  const form = read('features', 'terms', 'components', 'new-template-form.tsx')
  assert.match(form, /createTermsTemplateAction/)
  assert.doesNotMatch(form, /value="company"/, 'company templates are seeded, not created by hand')
  assert.doesNotMatch(form, /What the template is for/, 'the accessible names are the visible labels')
  for (const name of ['For', 'Key', 'Applies to', 'Title']) assert.ok(form.includes(`aria-label="${name}"`), `${name} control is named like its label`)
  assert.doesNotMatch(screen, /ml-0|ml-2/, 'the badges carry no conflicting left margins')
  const preview = read('features', 'terms', 'components', 'terms-preview.tsx')
  assert.doesNotMatch(preview, /key=\{line\}/, 'identical lines must not share a key')
  assert.equal((preview.match(/key=\{`\$\{index\}-\$\{line\}`\}/g) ?? []).length, 3)
  const detail = read('app', '(unison)', 'settings', 'terms', '[templateId]', 'page.tsx')
  assert.match(detail, /version\?: string \| string\[\]/)
  assert.match(detail, /typeof version === 'string' && isUuid\(version\)/)
})

test('the outcome message of a save or approve survives the page refresh that follows it, while the fields still reset to a new starting text', () => {
  const screen = read('features', 'terms', 'components', 'terms-template-screen.tsx')
  const editor = read('features', 'terms', 'components', 'draft-editor.tsx')
  assert.match(screen, /<DraftEditor\s+key=\{template\.id\}/, 'the editor is keyed by the template only')
  assert.doesNotMatch(screen, /key=\{`\$\{draft/, 'the key never follows the draft, which a save or approve creates or removes')
  assert.match(editor, /useActionState\(saveTermsDraftAction\.bind\(null, templateId\)/, 'the message state lives in the stable component')
  assert.match(editor, /state\?\.error/)
  assert.match(editor, /state\?\.success/)
  assert.match(editor, /const startKey = JSON\.stringify\(\[start\.body, start\.inclusions, start\.effectiveFrom, start\.changeNote\]\)/)
  assert.match(editor, /if \(seenStart !== startKey\) \{[^}]*setBody\(start\.body\)[^}]*setInclusions\(start\.inclusions\)[^}]*setFieldsKey/s, 'the fields resync when the starting text changes')
  assert.match(editor, /setEffective\(start\.effectiveFrom \?\? ''\)/, 'the effective date resyncs too')
  assert.match(editor, /<label key=\{`note-\$\{fieldsKey\}`\}/)
})

test('the template page offers editing, approving, archiving and restoring to owners and admins only, and never an edit on an approved version', () => {
  const screen = read('features', 'terms', 'components', 'terms-template-screen.tsx')
  assert.match(screen, /const canManage = role === 'owner' \|\| role === 'admin'/)
  assert.match(screen, /archiveTermsVersionAction\.bind\(null, /)
  assert.match(screen, /restoreTermsVersionAction\.bind\(null, /)
  assert.match(screen, /discardTermsDraftAction\.bind\(null, /)
  assert.match(screen, /An approved version cannot be edited/)
  assert.match(screen, /\{canManage \?/)
  assert.match(screen, /canManage && item\.status !== 'draft' && !draft \? \(\s*<ActionButton action=\{restoreTermsVersionAction/, 'Restore is for owners and admins, only when no draft exists')
  assert.match(screen, /canManage && item\.status === 'approved' \? \(\s*<ActionButton action=\{archiveTermsVersionAction/, 'Archive is for owners and admins, on approved versions')
  assert.match(screen, /canManage \? \(\s*<WorkspaceSection\s+title=\{draft \? 'Draft' : 'Write a new version'\}/, 'the editor section is for owners and admins')
  assert.match(screen, /targetKind=\{template\.targetKind\}/)
  assert.match(screen, /currentEffectiveFrom=\{current\?\.effectiveFrom \?\? null\}/)
  assert.match(screen, /new Intl\.DateTimeFormat\('en-ZA', \{ timeZone: 'Africa\/Johannesburg', dateStyle: 'medium', timeStyle: 'short' \}\)/, 'the saved time is shown in South African time')
  assert.match(screen, /savedTime\.format\(new Date\(draft\.updatedAt\)\)/)
  assert.match(screen, /savedAt=\{savedAt\}/, 'the saved time reaches the editor')
  assert.match(screen, /new Intl\.DateTimeFormat\('en-CA', \{ timeZone: 'Africa\/Johannesburg' \}\)/, 'version dates are South African calendar days')
  assert.doesNotMatch(screen, /\.slice\(0, 10\)/, 'a UTC date is never cut out of a timestamp')
  const editor = read('features', 'terms', 'components', 'draft-editor.tsx')
  assert.match(editor, /name="intent" value="save"/)
  assert.match(editor, /name="intent" value="approve"/)
  assert.match(editor, /placeholderProblems\(/, 'the editor warns about an unknown placeholder as you type')
  assert.match(editor, /startTransition\(\(\) => run\(data\)\)/, 'a failed save keeps what was typed')
  assert.match(editor, /submitter/, 'the clicked button decides save or approve')
  assert.match(editor, /Last saved \$\{savedAt\}\./)
  assert.match(editor, /hasDraft && savedAt/)
  const preview = read('features', 'terms', 'components', 'terms-preview.tsx')
  assert.match(preview, /Left out/)
  assert.match(preview, /Service inclusions/)
})

test('the editor warns, without blocking, about retainer-only placeholders in other templates and about a date that cannot replace the version in force', () => {
  const editor = read('features', 'terms', 'components', 'draft-editor.tsx')
  assert.match(editor, /const RETAINER_ONLY = \['monthly_fee', 'monthly_credits', 'initiative_limit'\]/)
  assert.match(editor, /targetKind === 'retainer' \? \[\] : placeholdersIn\(body \+ '\\n' \+ inclusions\)\.filter\(\(name\) => RETAINER_ONLY\.includes\(name\)\)/)
  assert.match(editor, /only available to retainer templates/)
  assert.match(editor, /left out of documents/)
  assert.match(editor, /disabled=\{pending \|\| problems\.length > 0\}/, 'only an unknown placeholder blocks approval, the retainer-only note does not')
  assert.match(editor, /const backDated = effective !== '' && currentEffectiveFrom !== null && effective <= currentEffectiveFrom/)
  assert.match(editor, /This date is not later than the version in force \(effective \{formatDocumentDate\(currentEffectiveFrom\)\}\), so this version will not replace it\./)
  assert.match(editor, /name="effectiveFrom" type="date" value=\{effective\} onChange=/, 'the date is controlled but still submitted with the form')
})

test('the list also shows the pending version, and a template whose only version is future-dated is flagged', () => {
  const screen = read('features', 'terms', 'components', 'terms-list-screen.tsx')
  assert.match(screen, /status\.kind === 'current' && status\.upcoming/)
  assert.match(screen, /Next: version \$\{status\.upcoming\.version\} effective/)
  assert.match(screen, /status\.kind === 'upcoming' \? <span[^>]*>Not in force yet<\/span>/)
})
