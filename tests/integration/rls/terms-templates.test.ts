import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let owner: U
let adminUser: U
let member: U
let outsider: U
let ownerClient: SupabaseClient
let adminClient: SupabaseClient
let memberClient: SupabaseClient
let outsiderClient: SupabaseClient

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const refused = (error: { message: string } | null, token: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
}

let counter = 0
/** A fresh support template in orgA, created by an admin. */
async function newTemplate(client: SupabaseClient = adminClient, org: string = orgA): Promise<string> {
  counter += 1
  return must(await client.rpc('create_terms_template', { p_org: org, p_target_kind: 'support', p_target_key: `terms_test_${counter}`, p_applies_to: 'quote', p_title: `Terms test ${counter}` })) as string
}
const save = (template: string, body: string, effective: string | null = '2026-10-12', client: SupabaseClient = adminClient, inclusions = '') =>
  client.rpc('save_terms_draft', { p_template: template, p_body: body, p_inclusions: inclusions, p_effective_from: effective, p_change_note: null })
async function approved(template: string, body = 'Clause one.\nClause two.'): Promise<string> {
  const id = must(await save(template, body)) as string
  assert.equal((await adminClient.rpc('approve_terms_version', { p_version: id })).error, null)
  return id
}
const versionsOf = async (template: string, client: SupabaseClient = admin) =>
  must(await client.from('terms_template_versions').select('*').eq('template_id', template).order('version')) as Record<string, any>[]

before(async () => {
  orgA = await createFixtureOrg('terms-a')
  orgB = await createFixtureOrg('terms-b')
  owner = await createFixtureUser(orgA, 'owner')
  adminUser = await createFixtureUser(orgA, 'admin')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  ownerClient = await signedInClient(owner.email, owner.password)
  adminClient = await signedInClient(adminUser.email, adminUser.password)
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [owner?.id, adminUser?.id, member?.id, outsider?.id].filter(Boolean))
})

test('an owner and an admin can create a template; a member and an outsider cannot', async () => {
  await newTemplate(ownerClient)
  await newTemplate(adminClient)
  const asMember = await memberClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: 'member_try', p_applies_to: 'quote', p_title: 'No' })
  refused(asMember.error, 'TERMS_FORBIDDEN')
  const asOutsider = await outsiderClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: 'outsider_try', p_applies_to: 'quote', p_title: 'No' })
  refused(asOutsider.error, 'TERMS_NOT_FOUND')
})

test('a template is unique per target and document type, and its target must be well formed', async () => {
  const key = `dup_${Date.now()}`
  assert.equal((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'retainer', p_target_key: key, p_applies_to: 'quote', p_title: 'First' })).error, null)
  refused((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'retainer', p_target_key: key, p_applies_to: 'quote', p_title: 'Again' })).error, 'TERMS_TEMPLATE_EXISTS')
  assert.equal((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'retainer', p_target_key: key, p_applies_to: 'invoice', p_title: 'Other type' })).error, null, 'the same target for another document type is a different template')
  refused((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'company', p_target_key: 'x', p_applies_to: 'quote', p_title: 'Bad' })).error, 'TERMS_TARGET_INVALID')
  refused((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: null, p_applies_to: 'quote', p_title: 'Bad' })).error, 'TERMS_TARGET_INVALID')
  refused((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: 'Has Spaces', p_applies_to: 'quote', p_title: 'Bad' })).error, 'TERMS_TARGET_INVALID')
  refused((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: 'ok_key', p_applies_to: 'nope', p_title: 'Bad' })).error, 'TERMS_TARGET_INVALID')
  refused((await adminClient.rpc('create_terms_template', { p_org: orgA, p_target_kind: 'support', p_target_key: 'ok_key2', p_applies_to: 'quote', p_title: '   ' })).error, 'TERMS_TARGET_INVALID')
})

test('saving a draft creates version 1, then updates the same draft; Windows line endings become plain ones', async () => {
  const template = await newTemplate()
  const first = must(await save(template, 'One\r\nTwo\r\n')) as string
  const second = must(await save(template, 'One\r\nTwo\r\nThree', '2026-11-01', adminClient, 'Lead\r\nRoadmap')) as string
  assert.equal(second, first, 'the draft is updated in place')
  const rows = await versionsOf(template)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].version, 1)
  assert.equal(rows[0].status, 'draft')
  assert.equal(rows[0].body, 'One\nTwo\nThree')
  assert.equal(rows[0].inclusions, 'Lead\nRoadmap')
  assert.equal(rows[0].effective_from, '2026-11-01')
  assert.equal(rows[0].created_by, adminUser.id)
  assert.ok(rows[0].updated_at, 'a draft records when it was last saved')
})

test('a member cannot read a draft but an admin can; a member cannot write one', async () => {
  const template = await newTemplate()
  must(await save(template, 'Draft text'))
  assert.equal((await versionsOf(template, memberClient)).length, 0, 'drafts are hidden from members')
  assert.equal((await versionsOf(template, adminClient)).length, 1)
  refused((await save(template, 'Member edit', '2026-10-12', memberClient)).error, 'TERMS_FORBIDDEN')
  const templates = must(await memberClient.from('terms_templates').select('id').eq('id', template)) as unknown[]
  assert.equal(templates.length, 1, 'members can see that the template exists')
})

test('approval needs wording, an effective date and valid placeholders, and records who approved and when', async () => {
  const template = await newTemplate()
  const id = must(await save(template, '', null)) as string
  refused((await adminClient.rpc('approve_terms_version', { p_version: id })).error, 'TERMS_EMPTY')
  must(await save(template, 'Some terms', null))
  refused((await adminClient.rpc('approve_terms_version', { p_version: id })).error, 'TERMS_EFFECTIVE_REQUIRED')
  for (const bad of ['{{unknown_name}}', '{{ monthly_fee }}', '{{Monthly_Fee}}', 'half open {{ here']) {
    must(await save(template, bad, '2026-10-12'))
    refused((await adminClient.rpc('approve_terms_version', { p_version: id })).error, 'TERMS_PLACEHOLDER_UNKNOWN')
  }
  must(await save(template, 'Good {{monthly_fee}} and {{payment_days}}', '2026-10-12', adminClient, 'Fine {{valid_days}}'))
  refused((await memberClient.rpc('approve_terms_version', { p_version: id })).error, 'TERMS_FORBIDDEN')
  refused((await outsiderClient.rpc('approve_terms_version', { p_version: id })).error, 'TERMS_NOT_FOUND')
  assert.equal((await adminClient.rpc('approve_terms_version', { p_version: id })).error, null)
  const row = (await versionsOf(template))[0]
  assert.equal(row.status, 'approved')
  assert.equal(row.approved_by, adminUser.id)
  assert.ok(row.approved_at)
  refused((await adminClient.rpc('approve_terms_version', { p_version: id })).error, 'TERMS_NOT_DRAFT')
  assert.equal((await versionsOf(template, memberClient)).length, 1, 'members see the approved version')
})

test('an approved version cannot be edited or deleted by a signed-in role, and the service role can only archive it', async () => {
  const template = await newTemplate()
  const id = await approved(template)
  for (const client of [adminClient, ownerClient, memberClient]) {
    const edit = await client.from('terms_template_versions').update({ body: 'changed' }).eq('id', id)
    assert.match(edit.error?.message ?? '', /permission denied/i, 'no direct update privilege')
    const del = await client.from('terms_template_versions').delete().eq('id', id)
    assert.match(del.error?.message ?? '', /permission denied/i, 'no direct delete privilege')
  }
  refused((await admin.from('terms_template_versions').update({ body: 'changed' }).eq('id', id)).error, 'TERMS_VERSION_IMMUTABLE')
  refused((await admin.from('terms_template_versions').update({ effective_from: '2030-01-01' }).eq('id', id)).error, 'TERMS_VERSION_IMMUTABLE')
  refused((await admin.from('terms_template_versions').update({ approved_by: owner.id }).eq('id', id)).error, 'TERMS_VERSION_IMMUTABLE')
  assert.equal((await admin.from('terms_template_versions').update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', id)).error, null)
  refused((await admin.from('terms_template_versions').update({ status: 'approved', archived_at: null }).eq('id', id)).error, 'TERMS_VERSION_IMMUTABLE')
  refused((await admin.from('terms_template_versions').update({ body: 'changed again' }).eq('id', id)).error, 'TERMS_VERSION_IMMUTABLE')
  assert.equal((await versionsOf(template))[0].body, 'Clause one.\nClause two.')
})

test('version numbers rise, a new draft sits beside the approved version, and a draft can be discarded', async () => {
  const template = await newTemplate()
  await approved(template)
  const draft = must(await save(template, 'Second wording')) as string
  const rows = await versionsOf(template)
  assert.deepEqual(rows.map((row) => [row.version, row.status]), [[1, 'approved'], [2, 'draft']])
  assert.equal((await adminClient.rpc('discard_terms_draft', { p_template: template })).error, null)
  assert.equal((await versionsOf(template)).length, 1)
  refused((await adminClient.rpc('discard_terms_draft', { p_template: template })).error, 'TERMS_NOT_DRAFT')
  refused((await memberClient.rpc('discard_terms_draft', { p_template: template })).error, 'TERMS_FORBIDDEN')
  assert.equal(rows[1].id, draft)
  assert.equal(rows[1].version, 2)
})

test('restore copies an approved or archived version into a new draft with no effective date, and refuses when a draft exists', async () => {
  const template = await newTemplate()
  const first = await approved(template, 'Original wording')
  const second = must(await save(template, 'Newer wording')) as string
  assert.equal((await adminClient.rpc('approve_terms_version', { p_version: second })).error, null)
  must(await save(template, 'A draft in progress'))
  refused((await adminClient.rpc('restore_terms_version', { p_version: first })).error, 'TERMS_DRAFT_EXISTS')
  assert.equal((await adminClient.rpc('discard_terms_draft', { p_template: template })).error, null)
  const restored = must(await adminClient.rpc('restore_terms_version', { p_version: first })) as string
  const rows = await versionsOf(template)
  const draft = rows.find((row) => row.id === restored)!
  assert.equal(draft.version, 3)
  assert.equal(draft.status, 'draft')
  assert.equal(draft.body, 'Original wording')
  assert.equal(draft.effective_from, null)
  assert.equal(draft.change_note, 'Restored from version 1')
  assert.equal(rows.find((row) => row.id === first)!.status, 'approved', 'the original is untouched')
  refused((await memberClient.rpc('restore_terms_version', { p_version: first })).error, 'TERMS_FORBIDDEN')
  refused((await adminClient.rpc('restore_terms_version', { p_version: restored })).error, 'TERMS_NOT_APPROVED')
})

test('archive needs an approved version and an owner or admin; members still see an archived version', async () => {
  const template = await newTemplate()
  const id = await approved(template)
  refused((await memberClient.rpc('archive_terms_version', { p_version: id })).error, 'TERMS_FORBIDDEN')
  assert.equal((await ownerClient.rpc('archive_terms_version', { p_version: id })).error, null)
  refused((await adminClient.rpc('archive_terms_version', { p_version: id })).error, 'TERMS_NOT_APPROVED')
  const seen = await versionsOf(template, memberClient)
  assert.deepEqual(seen.map((row) => row.status), ['archived'])
  assert.ok(seen[0].archived_at)
  const draft = must(await save(template, 'Draft again')) as string
  refused((await adminClient.rpc('archive_terms_version', { p_version: draft })).error, 'TERMS_NOT_APPROVED')
})

test('a template in another organisation is invisible and its functions refuse', async () => {
  const template = await newTemplate()
  const id = await approved(template)
  assert.equal((must(await outsiderClient.from('terms_templates').select('id').eq('id', template)) as unknown[]).length, 0)
  assert.equal((must(await outsiderClient.from('terms_template_versions').select('id').eq('id', id)) as unknown[]).length, 0)
  refused((await save(template, 'Hack', '2026-10-12', outsiderClient)).error, 'TERMS_NOT_FOUND')
  refused((await outsiderClient.rpc('archive_terms_version', { p_version: id })).error, 'TERMS_NOT_FOUND')
  refused((await outsiderClient.rpc('restore_terms_version', { p_version: id })).error, 'TERMS_NOT_FOUND')
  refused((await outsiderClient.rpc('discard_terms_draft', { p_template: template })).error, 'TERMS_NOT_FOUND')
  refused((await adminClient.rpc('approve_terms_version', { p_version: '00000000-0000-4000-8000-0000000000aa' })).error, 'TERMS_NOT_FOUND')
})

test('the size limits are enforced', async () => {
  const template = await newTemplate()
  refused((await save(template, 'x'.repeat(20001))).error, 'TERMS_TOO_LONG')
  refused((await save(template, 'ok', '2026-10-12', adminClient, 'y'.repeat(10001))).error, 'TERMS_TOO_LONG')
  const note = await adminClient.rpc('save_terms_draft', { p_template: template, p_body: 'ok', p_inclusions: '', p_effective_from: '2026-10-12', p_change_note: 'n'.repeat(501) })
  refused(note.error, 'TERMS_TOO_LONG')
  assert.equal((await save(template, 'x'.repeat(20000))).error, null, '20,000 characters is allowed')
})

test('deleting a user who created and approved a version leaves the version in place with those references cleared', async () => {
  const temp = await createFixtureUser(orgA, 'admin')
  // The temp user is not in the fixture list that cleanup() removes, so it is deleted here even if an assertion fails.
  let removed = false
  try {
    const tempClient = await signedInClient(temp.email, temp.password)
    const template = await newTemplate(tempClient)
    const id = must(await save(template, 'Clause one.', '2026-10-12', tempClient)) as string
    assert.equal((await tempClient.rpc('approve_terms_version', { p_version: id })).error, null)
    const before = (await versionsOf(template))[0]
    assert.equal(before.created_by, temp.id)
    assert.equal(before.approved_by, temp.id)
    const deleted = await admin.auth.admin.deleteUser(temp.id)
    assert.equal(deleted.error, null)
    removed = true
    const after = (await versionsOf(template))[0]
    assert.equal(after.status, 'approved')
    assert.equal(after.created_by, null)
    assert.equal(after.approved_by, null)
  } finally {
    if (!removed) {
      const { error } = await admin.auth.admin.deleteUser(temp.id)
      if (error && !/not.?found/i.test(error.message)) console.error('could not remove the temporary user:', error.message)
    }
  }
})
