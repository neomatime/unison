import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

// framework_versions and delivery_item_phase_history are written by AFTER
// UPDATE triggers on frameworks and delivery_items. Those tables grant
// signed-in users SELECT only, so the trigger functions must run with their
// owner's rights: as security invoker, every real framework edit and every
// delivery-item phase change by an app user failed with 42501, and both
// history tables stayed empty forever.

let orgId: string
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let frameworkId: string
let phaseA: string
let phaseB: string
let itemId: string

before(async () => {
  orgId = await createFixtureOrg('history-triggers')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('history-triggers-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const framework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'HT Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (framework.error) throw framework.error
  frameworkId = framework.data.id

  const phases = await admin.from('framework_phases')
    .insert([
      { organization_id: orgId, framework_id: frameworkId, name: 'Plan', position: 1 },
      { organization_id: orgId, framework_id: frameworkId, name: 'Build', position: 2 },
    ])
    .select('id, position').order('position')
  if (phases.error) throw phases.error
  phaseA = phases.data[0].id
  phaseB = phases.data[1].id

  const project = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'HT Project', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (project.error) throw project.error

  const item = await admin.from('delivery_items')
    .insert({
      organization_id: orgId, project_id: project.data.id, framework_id: frameworkId,
      level: 1, name: 'HT Item', current_phase_id: phaseA,
    })
    .select('id').single()
  if (item.error) throw item.error
  itemId = item.data.id
})

after(async () => { await cleanup([orgId, outsiderOrg], [member.id, outsider.id]) })

async function versionRows() {
  const { data, error } = await admin.from('framework_versions').select('id, changed_by, snapshot').eq('framework_id', frameworkId)
  assert.equal(error, null)
  return data!
}

async function phaseRows() {
  const { data, error } = await admin.from('delivery_item_phase_history')
    .select('id, from_phase_id, to_phase_id, changed_by').eq('delivery_item_id', itemId)
  assert.equal(error, null)
  return data!
}

test('a member can edit a framework, and the change is recorded in its version history', async () => {
  const client = await signedInClient(member.email, member.password)

  const { data, error } = await client.from('frameworks')
    .update({ level_1_label: 'Epic' }).eq('id', frameworkId).select('id')
  assert.equal(error, null, 'a real framework edit must not be refused by the history trigger')
  assert.equal(data!.length, 1)

  const rows = await versionRows()
  assert.equal(rows.length, 1, 'one version row per changed save')
  assert.equal(rows[0].changed_by, member.id, 'the version records who made the change')
  assert.equal((rows[0].snapshot as { level_1_label: string | null }).level_1_label, null, 'the snapshot is the row as it was before the change')
})

test('saving a framework with no change records no version', async () => {
  const client = await signedInClient(member.email, member.password)
  const before = (await versionRows()).length

  const { error } = await client.from('frameworks')
    .update({ level_1_label: 'Epic' }).eq('id', frameworkId).select('id')
  assert.equal(error, null)

  assert.equal((await versionRows()).length, before, 'an identical save must not add a version')
})

test('a member can change a delivery item phase, and the move is recorded in its phase history', async () => {
  const client = await signedInClient(member.email, member.password)

  const { data, error } = await client.from('delivery_items')
    .update({ current_phase_id: phaseB }).eq('id', itemId).select('id')
  assert.equal(error, null, 'a phase change must not be refused by the history trigger')
  assert.equal(data!.length, 1)

  const rows = await phaseRows()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].from_phase_id, phaseA)
  assert.equal(rows[0].to_phase_id, phaseB)
  assert.equal(rows[0].changed_by, member.id)
})

test('an outsider can neither edit the framework nor move the delivery item, and no history is written', async () => {
  const client = await signedInClient(outsider.email, outsider.password)
  const versionsBefore = (await versionRows()).length
  const phasesBefore = (await phaseRows()).length

  const framework = await client.from('frameworks')
    .update({ level_1_label: 'Hijacked' }).eq('id', frameworkId).select('id')
  assert.equal(framework.error, null)
  assert.deepEqual(framework.data, [], "another organisation's framework must match no rows")

  const item = await client.from('delivery_items')
    .update({ current_phase_id: phaseA }).eq('id', itemId).select('id')
  assert.equal(item.error, null)
  assert.deepEqual(item.data, [], "another organisation's delivery item must match no rows")

  assert.equal((await versionRows()).length, versionsBefore)
  assert.equal((await phaseRows()).length, phasesBefore)
})

test('a member still cannot write the history tables directly', async () => {
  // The fix must be the trigger functions running with their owner's rights,
  // not an INSERT policy: a policy would let any member forge history.
  const client = await signedInClient(member.email, member.password)

  const version = await client.from('framework_versions')
    .insert({ organization_id: orgId, framework_id: frameworkId, version: 'v9', snapshot: {}, changed_by: member.id })
  assert.ok(version.error, 'a member must not be able to insert a version row')
  assert.equal(version.error!.code, '42501')

  const phase = await client.from('delivery_item_phase_history')
    .insert({ organization_id: orgId, delivery_item_id: itemId, from_phase_id: phaseA, to_phase_id: phaseB, changed_by: member.id })
  assert.ok(phase.error, 'a member must not be able to insert a phase-history row')
  assert.equal(phase.error!.code, '42501')
})
