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
