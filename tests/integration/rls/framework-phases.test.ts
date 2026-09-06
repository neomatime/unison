import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgId: string
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let frameworkId: string
let phaseIds: string[]

before(async () => {
  orgId = await createFixtureOrg('framework-phases')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('framework-phases-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const { data: framework, error } = await admin
    .from('frameworks')
    .insert({ organization_id: orgId, name: 'Reorder Test Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id')
    .single()
  if (error) throw error
  frameworkId = framework.id

  const { data: phases, error: phaseError } = await admin
    .from('framework_phases')
    .insert([
      { organization_id: orgId, framework_id: frameworkId, name: 'Alpha', position: 1 },
      { organization_id: orgId, framework_id: frameworkId, name: 'Beta', position: 2 },
      { organization_id: orgId, framework_id: frameworkId, name: 'Gamma', position: 3 },
    ])
    .select('id, position')
    .order('position')
  if (phaseError) throw phaseError
  phaseIds = phases.map((row) => row.id)
})

after(async () => { await cleanup([orgId, outsiderOrg], [member.id, outsider.id]) })

test('a member reorders phases and positions stay contiguous in the given order', async () => {
  const client = await signedInClient(member.email, member.password)
  const reversed = [...phaseIds].reverse()

  const { error } = await client.rpc('reorder_framework_phases', {
    p_framework_id: frameworkId,
    p_phase_ids: reversed,
  })
  assert.equal(error, null)

  const { data, error: readError } = await client
    .from('framework_phases')
    .select('id, position')
    .eq('framework_id', frameworkId)
    .order('position')
  assert.equal(readError, null)
  assert.deepEqual(data!.map((row) => row.id), reversed)
  assert.deepEqual(data!.map((row) => row.position), [1, 2, 3])
})

test('a member of another organisation cannot reorder this framework', async () => {
  const client = await signedInClient(outsider.email, outsider.password)
  const { error } = await client.rpc('reorder_framework_phases', {
    p_framework_id: frameworkId,
    p_phase_ids: phaseIds,
  })
  assert.ok(error, 'an outsider must be refused')
  assert.equal(error!.code, '42501')
})

test('a list missing a phase is refused', async () => {
  const client = await signedInClient(member.email, member.password)
  const { error } = await client.rpc('reorder_framework_phases', {
    p_framework_id: frameworkId,
    p_phase_ids: phaseIds.slice(0, 2),
  })
  assert.ok(error)
  assert.equal(error!.code, '22023')
})

test('a list with a duplicated phase is refused', async () => {
  const client = await signedInClient(member.email, member.password)
  const { error } = await client.rpc('reorder_framework_phases', {
    p_framework_id: frameworkId,
    p_phase_ids: [phaseIds[0], phaseIds[0], phaseIds[1]],
  })
  assert.ok(error)
  assert.equal(error!.code, '22023')
})

test('a list containing a phase from another framework is refused', async () => {
  const { data: other, error: otherError } = await admin
    .from('frameworks')
    .insert({ organization_id: orgId, name: 'Other Framework', type: 'Operations', version: 'v1.0' })
    .select('id')
    .single()
  if (otherError) throw otherError
  const { data: strayPhase, error: strayError } = await admin
    .from('framework_phases')
    .insert({ organization_id: orgId, framework_id: other.id, name: 'Stray', position: 1 })
    .select('id')
    .single()
  if (strayError) throw strayError

  const client = await signedInClient(member.email, member.password)
  const { error } = await client.rpc('reorder_framework_phases', {
    p_framework_id: frameworkId,
    p_phase_ids: [...phaseIds.slice(0, 2), strayPhase.id],
  })
  assert.ok(error)
  assert.equal(error!.code, '22023')
})

test('an archived phase remains a valid phase for a project already in it', async () => {
  const { data: project, error: projectError } = await admin
    .from('projects')
    .insert({
      organization_id: orgId,
      name: 'Archived Phase Project',
      status: 'Active',
      health: 'On Track',
      framework_id: frameworkId,
      phase_id: phaseIds[0],
    })
    .select('id')
    .single()
  if (projectError) throw projectError

  const client = await signedInClient(member.email, member.password)
  const { error } = await client
    .from('framework_phases')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', phaseIds[0])
  assert.equal(error, null)

  // The foreign key is on (framework_id, id); archived_at must not affect it.
  const { data: after, error: afterError } = await admin
    .from('projects')
    .select('phase_id')
    .eq('id', project.id)
    .single()
  assert.equal(afterError, null)
  assert.equal(after!.phase_id, phaseIds[0], 'archiving a phase must not blank any project')
})
