import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

// Task 9b closed a real vulnerability: memberships_update's USING/WITH CHECK
// only require owner-or-admin, so without the enforce_membership_role_change
// trigger an admin could update their own membership row's role_id straight
// to 'owner' and lock out the real owner. Nothing else in this suite
// exercises that trigger, so a regression here (e.g. the trigger being
// dropped, or narrowed to only fire on some rows) would go unnoticed without
// this test.
let org: string
let adminUser: Awaited<ReturnType<typeof createFixtureUser>>
let adminClient: Awaited<ReturnType<typeof signedInClient>>

before(async () => {
  org = await createFixtureOrg('Escalation')
  adminUser = await createFixtureUser(org, 'admin')
  adminClient = await signedInClient(adminUser.email, adminUser.password)
})

after(async () => {
  await cleanup([org].filter(Boolean), [adminUser?.id].filter(Boolean))
})

// If enforce_membership_role_change were dropped, this update would succeed
// (memberships_update's policy alone permits an admin to update any row in
// their org, role_id included) and adminUser would come out as 'owner'.
test('an admin cannot escalate their own membership to owner', async () => {
  const { error } = await adminClient
    .from('memberships')
    .update({ role_id: 'owner' })
    .eq('organization_id', org)
    .eq('user_id', adminUser.id)

  assert.ok(error, 'expected the trigger to block the role change')
  assert.equal(error!.code, '42501')
  assert.match(error!.message, /only an owner may change role_id/i)

  const { data, error: checkError } = await admin
    .from('memberships')
    .select('role_id')
    .eq('organization_id', org)
    .eq('user_id', adminUser.id)
    .single()
  assert.equal(checkError, null)
  assert.equal(data?.role_id, 'admin')
})
