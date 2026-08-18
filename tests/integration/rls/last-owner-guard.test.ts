import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

// Final fix wave: memberships_update's USING/WITH CHECK only require
// owner-or-admin, and enforce_membership_role_change only guards *who* may
// move role_id -- neither stops an admin from setting the last active
// owner's own membership status to 'removed', nor the last owner from doing
// it to themselves. Once that happens, nothing can ever grant 'owner' again
// (granting owner itself requires being an owner), and the organization is
// permanently unrecoverable without service-role access. See migration
// 20260817165156_last_owner_guard.sql (public.enforce_last_owner_guard /
// memberships_enforce_last_owner) for the fix.
//
// Two organizations, set up once in module-level before/after, each covering
// two of the four required scenarios:
//   - orgWithAdmin: an admin cannot remove the last (only) owner, but can
//     still remove an ordinary member.
//   - orgWithTwoOwners / orgWithOneOwner: an owner can step down when a
//     second active owner exists, but the last owner cannot demote
//     themselves.
let orgWithAdmin: string
let owner: Awaited<ReturnType<typeof createFixtureUser>>
let adminUser: Awaited<ReturnType<typeof createFixtureUser>>
let member: Awaited<ReturnType<typeof createFixtureUser>>
let adminClient: Awaited<ReturnType<typeof signedInClient>>

let orgWithTwoOwners: string
let ownerA: Awaited<ReturnType<typeof createFixtureUser>>
let ownerB: Awaited<ReturnType<typeof createFixtureUser>>
let ownerAClient: Awaited<ReturnType<typeof signedInClient>>

let orgWithOneOwner: string
let soleOwner: Awaited<ReturnType<typeof createFixtureUser>>
let soleOwnerClient: Awaited<ReturnType<typeof signedInClient>>

before(async () => {
  orgWithAdmin = await createFixtureOrg('LastOwnerAdmin')
  owner = await createFixtureUser(orgWithAdmin, 'owner')
  adminUser = await createFixtureUser(orgWithAdmin, 'admin')
  member = await createFixtureUser(orgWithAdmin, 'member')
  adminClient = await signedInClient(adminUser.email, adminUser.password)

  orgWithTwoOwners = await createFixtureOrg('LastOwnerTwoOwners')
  ownerA = await createFixtureUser(orgWithTwoOwners, 'owner')
  ownerB = await createFixtureUser(orgWithTwoOwners, 'owner')
  ownerAClient = await signedInClient(ownerA.email, ownerA.password)

  orgWithOneOwner = await createFixtureOrg('LastOwnerSole')
  soleOwner = await createFixtureUser(orgWithOneOwner, 'owner')
  soleOwnerClient = await signedInClient(soleOwner.email, soleOwner.password)
})

after(async () => {
  await cleanup(
    [orgWithAdmin, orgWithTwoOwners, orgWithOneOwner].filter(Boolean),
    [owner?.id, adminUser?.id, member?.id, ownerA?.id, ownerB?.id, soleOwner?.id].filter(Boolean),
  )
})

// If enforce_last_owner_guard were dropped (or narrowed to only fire on
// role_id changes, like enforce_membership_role_change does), this update
// would succeed -- memberships_update's policy alone permits an admin to
// change status on any row in their org, owner included -- and the
// organization would be left with no active owner, permanently.
test('an admin cannot remove the last owner', async () => {
  const { error } = await adminClient
    .from('memberships')
    .update({ status: 'removed' })
    .eq('organization_id', orgWithAdmin)
    .eq('user_id', owner.id)

  assert.ok(error, 'expected the guard to block the update')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /at least one active owner/i)

  const { data, error: checkError } = await admin
    .from('memberships')
    .select('status')
    .eq('organization_id', orgWithAdmin)
    .eq('user_id', owner.id)
    .single()
  assert.equal(checkError, null)
  assert.equal(data?.status, 'active')
})

// The guard must not be so broad that it blocks ordinary membership
// management -- removing a non-owner never touches the active-owner count,
// so this must succeed exactly as it did before the guard existed.
test('an admin can still remove an ordinary member', async () => {
  const { error } = await adminClient
    .from('memberships')
    .update({ status: 'removed' })
    .eq('organization_id', orgWithAdmin)
    .eq('user_id', member.id)

  assert.equal(error, null, `expected the update to succeed, got: ${JSON.stringify(error)}`)

  const { data, error: checkError } = await admin
    .from('memberships')
    .select('status')
    .eq('organization_id', orgWithAdmin)
    .eq('user_id', member.id)
    .single()
  assert.equal(checkError, null)
  assert.equal(data?.status, 'removed')
})

// A second active owner existing is exactly what makes this safe: the
// guard's exists-check (excluding the row being updated) finds ownerB, so
// ownerA stepping down must not be blocked.
test('an owner can step down when a second active owner exists', async () => {
  const { error } = await ownerAClient
    .from('memberships')
    .update({ status: 'removed' })
    .eq('organization_id', orgWithTwoOwners)
    .eq('user_id', ownerA.id)

  assert.equal(error, null, `expected the update to succeed, got: ${JSON.stringify(error)}`)

  const { data, error: checkError } = await admin
    .from('memberships')
    .select('status')
    .eq('organization_id', orgWithTwoOwners)
    .eq('user_id', ownerA.id)
    .single()
  assert.equal(checkError, null)
  assert.equal(data?.status, 'removed')

  // ownerB must be untouched -- proves the guard didn't have some
  // side effect on the row it found, only on the row being updated.
  const { data: ownerBRow, error: ownerBError } = await admin
    .from('memberships')
    .select('status, role_id')
    .eq('organization_id', orgWithTwoOwners)
    .eq('user_id', ownerB.id)
    .single()
  assert.equal(ownerBError, null)
  assert.deepEqual(ownerBRow, { status: 'active', role_id: 'owner' })
})

// The symmetric case to the admin test above: the actor doesn't matter, only
// whether the update would leave zero active owners. The sole owner
// demoting themselves is exactly that, whether they intend it or not.
test('the last owner cannot demote themselves', async () => {
  const { error } = await soleOwnerClient
    .from('memberships')
    .update({ status: 'removed' })
    .eq('organization_id', orgWithOneOwner)
    .eq('user_id', soleOwner.id)

  assert.ok(error, 'expected the guard to block the update')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /at least one active owner/i)

  const { data, error: checkError } = await admin
    .from('memberships')
    .select('status, role_id')
    .eq('organization_id', orgWithOneOwner)
    .eq('user_id', soleOwner.id)
    .single()
  assert.equal(checkError, null)
  assert.deepEqual(data, { status: 'active', role_id: 'owner' })
})
