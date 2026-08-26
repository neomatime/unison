import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgA: string
let orgB: string
let userA: { id: string; email: string; password: string }
let frameworkA: string
let phaseA: string
let otherFrameworkPhase: string
let clientB: string

before(async () => {
  orgA = await createFixtureOrg('projects-a')
  orgB = await createFixtureOrg('projects-b')
  userA = await createFixtureUser(orgA, 'owner')

  const { data: fwA, error: fwAError } = await admin
    .from('frameworks').insert({ organization_id: orgA, name: 'A Framework' }).select('id').single()
  if (fwAError) throw fwAError
  frameworkA = fwA.id

  const { data: phase, error: phaseError } = await admin
    .from('framework_phases')
    .insert({ framework_id: frameworkA, organization_id: orgA, name: 'Build', position: 1 })
    .select('id').single()
  if (phaseError) throw phaseError
  phaseA = phase.id

  const { data: fwOther, error: fwOtherError } = await admin
    .from('frameworks').insert({ organization_id: orgA, name: 'Other Framework' }).select('id').single()
  if (fwOtherError) throw fwOtherError
  const { data: otherPhase, error: otherPhaseError } = await admin
    .from('framework_phases')
    .insert({ framework_id: fwOther.id, organization_id: orgA, name: 'Welcome', position: 1 })
    .select('id').single()
  if (otherPhaseError) throw otherPhaseError
  otherFrameworkPhase = otherPhase.id

  const { data: client, error: clientError } = await admin
    .from('clients')
    .insert({ organization_id: orgB, name: 'Org B Client', status: 'Active', health: 'Healthy' })
    .select('id').single()
  if (clientError) throw clientError
  clientB = client.id
})

after(async () => {
  await cleanup([orgA, orgB], [userA.id])
})

test('a member can create a project in their own organization', async () => {
  const client = await signedInClient(userA.email, userA.password)
  const { error } = await client.from('projects').insert({
    organization_id: orgA, name: 'Own Project', framework_id: frameworkA, phase_id: phaseA,
  })
  assert.equal(error, null)
})

test('a project cannot reference a client in another organization', async () => {
  // This is the hole RLS alone leaves open: organization_id is the caller's,
  // so the insert policy passes. Only the composite FK rejects it.
  const client = await signedInClient(userA.email, userA.password)
  const { error } = await client.from('projects').insert({
    organization_id: orgA, name: 'Cross-tenant', framework_id: frameworkA, client_id: clientB,
  })
  assert.ok(error, 'cross-tenant client_id must be refused')
  assert.match(error.message, /foreign key|violates/i)
})

test('a project cannot sit in a phase from a different framework', async () => {
  const client = await signedInClient(userA.email, userA.password)
  const { error } = await client.from('projects').insert({
    organization_id: orgA, name: 'Wrong phase', framework_id: frameworkA, phase_id: otherFrameworkPhase,
  })
  assert.ok(error, 'phase from another framework must be refused')
})

test('progress outside 0-100 is refused', async () => {
  const client = await signedInClient(userA.email, userA.password)
  const { error } = await client.from('projects').insert({
    organization_id: orgA, name: 'Bad progress', framework_id: frameworkA, progress: 140,
  })
  assert.ok(error, 'check constraint must reject progress above 100')
})

test('a member cannot read another organization\'s projects', async () => {
  const { data: orgBFramework, error: orgBFrameworkError } = await admin
    .from('frameworks').insert({ organization_id: orgB, name: 'B Framework' }).select('id').single()
  if (orgBFrameworkError) throw orgBFrameworkError

  const { data: theirs, error: insertError } = await admin
    .from('projects')
    .insert({ organization_id: orgB, name: 'Org B Project', framework_id: orgBFramework.id })
    .select('id').single()
  if (insertError) throw insertError

  const client = await signedInClient(userA.email, userA.password)
  const { data } = await client.from('projects').select('id').eq('id', theirs.id)
  assert.deepEqual(data, [], 'org B project must be invisible')
})
