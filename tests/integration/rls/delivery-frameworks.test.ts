import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgA: string
let orgB: string
let userA: { id: string; email: string; password: string }
let frameworkA: string

before(async () => {
  orgA = await createFixtureOrg('frameworks-a')
  orgB = await createFixtureOrg('frameworks-b')
  userA = await createFixtureUser(orgA, 'owner')

  const { data, error } = await admin
    .from('frameworks')
    .insert({ organization_id: orgB, name: 'Org B Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id')
    .single()
  if (error) throw error
  frameworkA = data.id
})

after(async () => {
  await cleanup([orgA, orgB], [userA.id])
})

test('a member cannot read another organization\'s frameworks', async () => {
  const client = await signedInClient(userA.email, userA.password)
  const { data, error } = await client.from('frameworks').select('id').eq('id', frameworkA)
  assert.equal(error, null)
  assert.deepEqual(data, [], 'org B framework must be invisible to an org A member')
})

test('a member cannot insert a framework into another organization', async () => {
  const client = await signedInClient(userA.email, userA.password)
  const { error } = await client
    .from('frameworks')
    .insert({ organization_id: orgB, name: 'Smuggled', type: 'Enterprise', version: 'v1.0' })
  assert.ok(error, 'insert into another org must be refused by RLS')
})

test('a phase cannot be attached to a framework in another organization', async () => {
  // organization_id is the caller's own, framework_id is org B's. RLS alone
  // would allow this; the composite FK is what rejects it.
  const client = await signedInClient(userA.email, userA.password)
  const { error } = await client
    .from('framework_phases')
    .insert({ framework_id: frameworkA, organization_id: orgA, name: 'Smuggled', position: 1 })
  assert.ok(error, 'cross-tenant phase must be refused')
})

test('no delete policy exists, so frameworks cannot be deleted', async () => {
  const client = await signedInClient(userA.email, userA.password)
  const { data: own, error: insertError } = await admin
    .from('frameworks')
    .insert({ organization_id: orgA, name: 'Deletable?', type: 'Enterprise', version: 'v1.0' })
    .select('id')
    .single()
  if (insertError) throw insertError

  await client.from('frameworks').delete().eq('id', own.id)

  const { data: still } = await admin.from('frameworks').select('id').eq('id', own.id)
  assert.equal(still?.length, 1, 'row must survive: no delete policy grants this')
})
