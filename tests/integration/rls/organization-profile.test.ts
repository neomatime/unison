import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let firstOrganization: string
let secondOrganization: string
let owner: Awaited<ReturnType<typeof createFixtureUser>>
let member: Awaited<ReturnType<typeof createFixtureUser>>
let ownerClient: Awaited<ReturnType<typeof signedInClient>>
let memberClient: Awaited<ReturnType<typeof signedInClient>>

before(async () => {
  firstOrganization = await createFixtureOrg('OrganisationProfileA')
  secondOrganization = await createFixtureOrg('OrganisationProfileB')
  owner = await createFixtureUser(firstOrganization, 'owner')
  member = await createFixtureUser(firstOrganization, 'member')
  ownerClient = await signedInClient(owner.email, owner.password)
  memberClient = await signedInClient(member.email, member.password)
})

after(async () => {
  await cleanup(
    [firstOrganization, secondOrganization].filter(Boolean),
    [owner?.id, member?.id].filter(Boolean),
  )
})

test('an active member can read only their own organisation profile', async () => {
  const { data, error } = await memberClient
    .from('organizations')
    .select('id, name, slug, status, created_at, updated_at, email_domain, tier')

  assert.equal(error, null)
  assert.deepEqual(data?.map((row) => row.id), [firstOrganization])

  const { data: foreignRows, error: foreignError } = await memberClient
    .from('organizations')
    .select('id')
    .eq('id', secondOrganization)

  assert.equal(foreignError, null)
  assert.deepEqual(foreignRows, [])
})

test('a regular member cannot update organisation details', async () => {
  const { data, error } = await memberClient
    .from('organizations')
    .update({ name: 'Member must not save this' })
    .eq('id', firstOrganization)
    .select('id')

  assert.equal(error, null)
  assert.deepEqual(data, [])
})

test('an owner can persist an organisation-name update but cannot reach another tenant', async () => {
  const nextName = 'RLS Organisation Profile Updated'
  const { data, error } = await ownerClient
    .from('organizations')
    .update({ name: nextName })
    .eq('id', firstOrganization)
    .select('id')

  assert.equal(error, null)
  assert.deepEqual(data?.map((row) => row.id), [firstOrganization])

  const { data: foreignRows, error: foreignError } = await ownerClient
    .from('organizations')
    .update({ name: 'Cross-tenant update must not save' })
    .eq('id', secondOrganization)
    .select('id')

  assert.equal(foreignError, null)
  assert.deepEqual(foreignRows, [])

  const { data: persisted, error: persistedError } = await admin
    .from('organizations')
    .select('name')
    .eq('id', firstOrganization)
    .single()

  assert.equal(persistedError, null)
  assert.equal(persisted?.name, nextName)
})
