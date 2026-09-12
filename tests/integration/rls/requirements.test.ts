import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgId: string
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let frameworkId: string
let projectId: string
let outsiderProjectId: string
// Declared at module scope (not inside the test body) so `after` can always
// reach it for cleanup, even if the test that creates it fails before its own
// teardown runs -- see the "removing a member sets owner_id null..." spec below.
let removable: { id: string; email: string; password: string } | undefined

before(async () => {
  orgId = await createFixtureOrg('requirements')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('requirements-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const framework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'REQ Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (framework.error) throw framework.error
  frameworkId = framework.data.id

  const project = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'REQ Project', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (project.error) throw project.error
  projectId = project.data.id

  const outsiderFramework = await admin.from('frameworks')
    .insert({ organization_id: outsiderOrg, name: 'REQ Outsider Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (outsiderFramework.error) throw outsiderFramework.error

  const outsiderProject = await admin.from('projects')
    .insert({ organization_id: outsiderOrg, name: 'REQ Outsider Project', status: 'Active', health: 'On Track', framework_id: outsiderFramework.data.id })
    .select('id').single()
  if (outsiderProject.error) throw outsiderProject.error
  outsiderProjectId = outsiderProject.data.id
})

after(async () => {
  await cleanup([orgId, outsiderOrg], [member.id, outsider.id, removable?.id].filter(Boolean) as string[])
})

function requirement(over: Record<string, unknown> = {}) {
  return { organization_id: orgId, project_id: projectId, title: 'A requirement', ...over }
}

test('a valid requirement is accepted', async () => {
  const { data, error } = await admin.from('requirements').insert(requirement()).select('id').single()
  assert.equal(error, null)
  await admin.from('requirements').delete().eq('id', data!.id)
})

test('a cross-tenant project is unrepresentable', async () => {
  const { error } = await admin.from('requirements')
    .insert(requirement({ project_id: outsiderProjectId })).select('id').single()

  assert.ok(error, 'a requirement on another organisation\'s project must be refused')
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirements_project_fkey/)
})

test('an owner outside the organisation is refused', async () => {
  const { error } = await admin.from('requirements')
    .insert(requirement({ owner_id: outsider.id })).select('id').single()

  assert.ok(error, 'an owner from another organisation must be refused')
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirements_owner_fkey/)
})

test('an invalid priority is refused', async () => {
  const { error } = await admin.from('requirements')
    .insert(requirement({ priority: 'Urgent' })).select('id').single()

  assert.ok(error, 'a priority outside the fixed vocabulary must be refused')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /requirements_priority_check/)
})

test('an invalid status is refused', async () => {
  const { error } = await admin.from('requirements')
    .insert(requirement({ status: 'Rejected' })).select('id').single()

  assert.ok(error, 'a status outside the fixed vocabulary must be refused')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /requirements_status_check/)
})

test('an outsider can neither read, write nor delete', async () => {
  const seeded = await admin.from('requirements').insert(requirement()).select('id').single()
  assert.equal(seeded.error, null)

  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('requirements').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [], "another organisation's requirements must not be visible")

  const write = await client.from('requirements').insert(requirement()).select('id').single()
  assert.ok(write.error, 'an outsider must not be able to write')
  assert.equal(write.error!.code, '42501')

  const remove = await client.from('requirements').delete().eq('id', seeded.data!.id)
  assert.equal(remove.error, null, 'RLS silently deletes zero rows rather than erroring')
  const stillThere = await admin.from('requirements').select('id').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1, "the outsider's delete must not have removed the row")

  await admin.from('requirements').delete().eq('id', seeded.data!.id)
})

test('a member of the organisation can read, write and delete', async () => {
  const client = await signedInClient(member.email, member.password)

  const created = await client.from('requirements').insert(requirement()).select('id').single()
  assert.equal(created.error, null)

  const read = await client.from('requirements').select('id').eq('id', created.data!.id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  const updated = await client.from('requirements').update({ status: 'Approved' }).eq('id', created.data!.id).select('status').single()
  assert.equal(updated.error, null)
  assert.equal(updated.data!.status, 'Approved')

  const removed = await client.from('requirements').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)

  const after = await client.from('requirements').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [], 'the deleted requirement must be gone')
})

test('removing a member sets owner_id null rather than orphaning the row', async () => {
  removable = await createFixtureUser(orgId, 'admin')
  const created = await admin.from('requirements')
    .insert(requirement({ owner_id: removable.id })).select('id, owner_id').single()
  assert.equal(created.error, null)
  assert.equal(created.data!.owner_id, removable.id)

  const { error: deleteError } = await admin.from('memberships')
    .delete().eq('organization_id', orgId).eq('user_id', removable.id)
  assert.equal(deleteError, null)

  const after = await admin.from('requirements').select('owner_id').eq('id', created.data!.id).single()
  assert.equal(after.error, null)
  assert.equal(after.data!.owner_id, null, 'the requirement must survive with ownership cleared, not orphaned or deleted')

  await admin.from('requirements').delete().eq('id', created.data!.id)
})
