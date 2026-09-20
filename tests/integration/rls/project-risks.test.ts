import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgId: string
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let projectId: string
let outsiderProjectId: string
// Module scope so `after` can always reach it for cleanup, even if the test that
// creates it fails before its own teardown runs.
let removable: { id: string; email: string; password: string } | undefined

before(async () => {
  orgId = await createFixtureOrg('project-risks')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('project-risks-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const framework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'RSK Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (framework.error) throw framework.error

  const project = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'RSK Project', status: 'Active', health: 'On Track', framework_id: framework.data.id })
    .select('id').single()
  if (project.error) throw project.error
  projectId = project.data.id

  const outsiderFramework = await admin.from('frameworks')
    .insert({ organization_id: outsiderOrg, name: 'RSK Outsider Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (outsiderFramework.error) throw outsiderFramework.error

  const outsiderProject = await admin.from('projects')
    .insert({ organization_id: outsiderOrg, name: 'RSK Outsider Project', status: 'Active', health: 'On Track', framework_id: outsiderFramework.data.id })
    .select('id').single()
  if (outsiderProject.error) throw outsiderProject.error
  outsiderProjectId = outsiderProject.data.id
})

after(async () => {
  await cleanup([orgId, outsiderOrg], [member.id, outsider.id, removable?.id].filter(Boolean) as string[])
})

function risk(over: Record<string, unknown> = {}) {
  return { organization_id: orgId, project_id: projectId, title: 'A risk', ...over }
}

test('a valid risk is accepted and takes its documented defaults', async () => {
  const { data, error } = await admin.from('project_risks').insert(risk()).select('id, probability, impact, status, owner_id').single()
  assert.equal(error, null)
  assert.equal(data!.probability, 'Possible')
  assert.equal(data!.impact, 'Moderate')
  assert.equal(data!.status, 'Open')
  assert.equal(data!.owner_id, null)
  await admin.from('project_risks').delete().eq('id', data!.id)
})

test('a cross-tenant project is unrepresentable', async () => {
  const { error } = await admin.from('project_risks')
    .insert(risk({ project_id: outsiderProjectId })).select('id').single()

  assert.ok(error, "a risk on another organisation's project must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /project_risks_project_id_organization_id_fkey/)
})

test('an owner outside the organisation is refused', async () => {
  const { error } = await admin.from('project_risks')
    .insert(risk({ owner_id: outsider.id })).select('id').single()

  assert.ok(error, 'an owner from another organisation must be refused')
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /project_risks_organization_id_owner_id_fkey/)
})

for (const [column, bad, constraint] of [
  ['probability', 'Certain', 'project_risks_probability_check'],
  ['impact', 'Catastrophic', 'project_risks_impact_check'],
  ['status', 'Resolved', 'project_risks_status_check'],
] as const) {
  test(`an invalid ${column} is refused`, async () => {
    const { error } = await admin.from('project_risks')
      .insert(risk({ [column]: bad })).select('id').single()

    assert.ok(error, `a ${column} outside the fixed vocabulary must be refused`)
    assert.equal(error!.code, '23514')
    assert.match(error!.message, new RegExp(constraint))
  })
}

test('a member can move a risk through every status in the vocabulary', async () => {
  const client = await signedInClient(member.email, member.password)
  const created = await client.from('project_risks').insert(risk()).select('id').single()
  assert.equal(created.error, null)

  // Hoisted: reading `created.data` inside the loop makes `moved` circular for the
  // type checker (TS7022, 'moved' implicitly has type 'any').
  const createdId = created.data!.id
  for (const status of ['Mitigating', 'Accepted', 'Closed', 'Open']) {
    const moved = await client.from('project_risks')
      .update({ status }).eq('id', createdId).select('status').single()
    assert.equal(moved.error, null, `status ${status} must be reachable`)
    assert.equal(moved.data!.status, status)
  }

  await admin.from('project_risks').delete().eq('id', created.data!.id)
})

test('an outsider can neither read, write nor delete', async () => {
  const seeded = await admin.from('project_risks').insert(risk()).select('id').single()
  assert.equal(seeded.error, null)

  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('project_risks').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [], "another organisation's risks must not be visible")

  const write = await client.from('project_risks').insert(risk()).select('id').single()
  assert.ok(write.error, 'an outsider must not be able to write')
  assert.equal(write.error!.code, '42501')

  const update = await client.from('project_risks').update({ title: 'Hijacked' }).eq('id', seeded.data!.id).select('id')
  assert.equal(update.error, null)
  assert.deepEqual(update.data, [], "an outsider's update must match no rows")

  const remove = await client.from('project_risks').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null, 'RLS silently deletes zero rows rather than erroring')
  assert.deepEqual(remove.data, [])
  const stillThere = await admin.from('project_risks').select('id, title').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1, "the outsider's delete must not have removed the row")
  assert.equal(stillThere.data![0].title, 'A risk', "the outsider's update must not have changed the row")

  await admin.from('project_risks').delete().eq('id', seeded.data!.id)
})

test('a member of the organisation can read, write, update and delete', async () => {
  const client = await signedInClient(member.email, member.password)

  const created = await client.from('project_risks').insert(risk()).select('id').single()
  assert.equal(created.error, null)

  const read = await client.from('project_risks').select('id').eq('id', created.data!.id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  const updated = await client.from('project_risks')
    .update({ mitigation: 'Add a fallback supplier' }).eq('id', created.data!.id).select('mitigation').single()
  assert.equal(updated.error, null)
  assert.equal(updated.data!.mitigation, 'Add a fallback supplier')

  const removed = await client.from('project_risks').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)

  const after = await client.from('project_risks').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [], 'the deleted risk must be gone')
})

test('removing a member sets owner_id null rather than orphaning the row', async () => {
  removable = await createFixtureUser(orgId, 'admin')
  const created = await admin.from('project_risks')
    .insert(risk({ owner_id: removable.id })).select('id, owner_id').single()
  assert.equal(created.error, null)
  assert.equal(created.data!.owner_id, removable.id)

  const { error: deleteError } = await admin.from('memberships')
    .delete().eq('organization_id', orgId).eq('user_id', removable.id)
  assert.equal(deleteError, null)

  const after = await admin.from('project_risks').select('owner_id').eq('id', created.data!.id).single()
  assert.equal(after.error, null)
  assert.equal(after.data!.owner_id, null, 'the risk must survive with ownership cleared, not orphaned or deleted')

  await admin.from('project_risks').delete().eq('id', created.data!.id)
})
