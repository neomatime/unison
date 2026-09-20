import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgId: string
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let frameworkId: string
let projectId: string
let approvalId: string
let outsiderFrameworkId: string
let outsiderProjectId: string

before(async () => {
  orgId = await createFixtureOrg('governance-artefacts')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('governance-artefacts-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const framework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'GA Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (framework.error) throw framework.error
  frameworkId = framework.data.id

  const project = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'GA Project', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (project.error) throw project.error
  projectId = project.data.id

  const approval = await admin.from('approvals')
    .insert({ organization_id: orgId, project_id: projectId, title: 'GA Approval' })
    .select('id').single()
  if (approval.error) throw approval.error
  approvalId = approval.data.id

  const outsiderFramework = await admin.from('frameworks')
    .insert({ organization_id: outsiderOrg, name: 'GA Outsider Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (outsiderFramework.error) throw outsiderFramework.error
  outsiderFrameworkId = outsiderFramework.data.id

  const outsiderProject = await admin.from('projects')
    .insert({ organization_id: outsiderOrg, name: 'GA Outsider Project', status: 'Active', health: 'On Track', framework_id: outsiderFrameworkId })
    .select('id').single()
  if (outsiderProject.error) throw outsiderProject.error
  outsiderProjectId = outsiderProject.data.id
})

after(async () => { await cleanup([orgId, outsiderOrg], [member.id, outsider.id]) })

function artefact(over: Record<string, unknown> = {}) {
  return {
    organization_id: orgId,
    project_id: projectId,
    name: 'Test report',
    external_url: 'https://example.com/report',
    ...over,
  }
}

test('a project-scoped artefact with an external url is accepted', async () => {
  const { data, error } = await admin.from('governance_artefacts').insert(artefact()).select('id').single()
  assert.equal(error, null)
  await admin.from('governance_artefacts').delete().eq('id', data!.id)
})

test('a framework-scoped artefact is accepted', async () => {
  const { data, error } = await admin.from('governance_artefacts')
    .insert(artefact({ project_id: null, framework_id: frameworkId })).select('id').single()
  assert.equal(error, null)
  await admin.from('governance_artefacts').delete().eq('id', data!.id)
})

test('an approval-scoped artefact is accepted', async () => {
  const { data, error } = await admin.from('governance_artefacts')
    .insert(artefact({ project_id: null, approval_id: approvalId })).select('id').single()
  assert.equal(error, null)
  await admin.from('governance_artefacts').delete().eq('id', data!.id)
})

test('an artefact needs a stored file or an external url', async () => {
  const { error } = await admin.from('governance_artefacts')
    .insert(artefact({ external_url: null })).select('id').single()

  assert.ok(error, 'an artefact with neither storage_path nor external_url must be refused')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /check constraint "governance_artefacts_check"/)
})

test('an artefact needs a project, framework or approval scope', async () => {
  const { error } = await admin.from('governance_artefacts')
    .insert(artefact({ project_id: null })).select('id').single()

  assert.ok(error, 'an artefact scoped to nothing must be refused')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /check constraint "governance_artefacts_check1"/)
})

test('a cross-tenant project is unrepresentable', async () => {
  const { error } = await admin.from('governance_artefacts')
    .insert(artefact({ project_id: outsiderProjectId })).select('id').single()

  assert.ok(error, "an artefact on another organisation's project must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /governance_artefacts_project_id_organization_id_fkey/)
})

test('a cross-tenant framework is unrepresentable', async () => {
  const { error } = await admin.from('governance_artefacts')
    .insert(artefact({ project_id: null, framework_id: outsiderFrameworkId })).select('id').single()

  assert.ok(error, "an artefact on another organisation's framework must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /governance_artefacts_framework_id_organization_id_fkey/)
})

test('an outsider can neither read, write nor delete', async () => {
  const seeded = await admin.from('governance_artefacts').insert(artefact()).select('id').single()
  assert.equal(seeded.error, null)

  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('governance_artefacts').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [], "another organisation's evidence must not be visible")

  const write = await client.from('governance_artefacts').insert(artefact()).select('id').single()
  assert.ok(write.error, 'an outsider must not be able to write')
  assert.equal(write.error!.code, '42501')

  const update = await client.from('governance_artefacts').update({ name: 'Hijacked' }).eq('id', seeded.data!.id).select('id')
  assert.equal(update.error, null)
  assert.deepEqual(update.data, [], "an outsider's update must match no rows")

  const remove = await client.from('governance_artefacts').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null, 'RLS silently deletes zero rows rather than erroring')
  assert.deepEqual(remove.data, [])
  const stillThere = await admin.from('governance_artefacts').select('id, name').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1, "the outsider's delete must not have removed the row")
  assert.equal(stillThere.data![0].name, 'Test report', "the outsider's update must not have changed the row")

  await admin.from('governance_artefacts').delete().eq('id', seeded.data!.id)
})

test('a member of the organisation can read, write, update and delete', async () => {
  const client = await signedInClient(member.email, member.password)

  const created = await client.from('governance_artefacts').insert(artefact()).select('id').single()
  assert.equal(created.error, null)

  const read = await client.from('governance_artefacts').select('id').eq('id', created.data!.id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  const updated = await client.from('governance_artefacts')
    .update({ notes: 'Signed off' }).eq('id', created.data!.id).select('notes').single()
  assert.equal(updated.error, null)
  assert.equal(updated.data!.notes, 'Signed off')

  const removed = await client.from('governance_artefacts').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)

  const after = await client.from('governance_artefacts').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [], 'the deleted artefact must be gone')
})
