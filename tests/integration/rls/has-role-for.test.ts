import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser } from './helpers.ts'

let orgId: string
let owner: { id: string; email: string; password: string }
let member: { id: string; email: string; password: string }
// A second owner, otherwise unreferenced by any assertion below. Without it,
// the "a suspended membership does not match" test's suspend of `owner` is
// blocked by memberships_enforce_last_owner (migration
// 20260817165156_last_owner_guard.sql, "an organization must always have at
// least one active owner"): the update is rejected, the row stays active,
// and the test fails not because the predicate is wrong but because the
// fixture tried an update the schema was always going to refuse. Confirmed
// live: has_role_for correctly flips to false the moment a suspend actually
// succeeds (i.e. when a second active owner exists to keep the guard happy).
let coOwner: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }

before(async () => {
  orgId = await createFixtureOrg('has-role-for')
  owner = await createFixtureUser(orgId, 'owner')
  member = await createFixtureUser(orgId, 'member')
  coOwner = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('has-role-for-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')
})

after(async () => {
  await cleanup(
    [orgId, outsiderOrg].filter(Boolean),
    [owner?.id, member?.id, coOwner?.id, outsider?.id].filter(Boolean) as string[],
  )
})

async function hasRoleFor(org: string, actor: string, roles: string[]) {
  const { data, error } = await admin.rpc('has_role_for', { org, actor, roles })
  assert.equal(error, null)
  return data
}

test('an active owner matches', async () => {
  assert.equal(await hasRoleFor(orgId, owner.id, ['owner', 'admin']), true)
})

test('a member does not match an owner-or-admin question', async () => {
  assert.equal(await hasRoleFor(orgId, member.id, ['owner', 'admin']), false)
})

test('membership of another organization does not carry over', async () => {
  assert.equal(await hasRoleFor(orgId, outsider.id, ['owner', 'admin']), false)
})

test('a suspended membership does not match', async () => {
  // The whole point of resolving membership live rather than from a JWT claim
  // is that revocation takes effect on the next call, not on the next login.
  await admin.from('memberships').update({ status: 'suspended' })
    .eq('organization_id', orgId).eq('user_id', owner.id)
  assert.equal(await hasRoleFor(orgId, owner.id, ['owner', 'admin']), false)

  await admin.from('memberships').update({ status: 'active' })
    .eq('organization_id', orgId).eq('user_id', owner.id)
  assert.equal(await hasRoleFor(orgId, owner.id, ['owner', 'admin']), true)
})

test('a null actor matches nothing', async () => {
  // Task 2 rejects a null p_actor_id before it reaches here, but the predicate
  // must not answer "true" for an absent actor under any circumstances.
  const { data, error } = await admin.rpc('has_role_for', {
    org: orgId, actor: null, roles: ['owner', 'admin'],
  })
  assert.equal(error, null)
  assert.notEqual(data, true)
})
