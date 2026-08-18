import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let org: string
let user: Awaited<ReturnType<typeof createFixtureUser>>
let client: Awaited<ReturnType<typeof signedInClient>>

before(async () => {
  org = await createFixtureOrg('Revocation')
  user = await createFixtureUser(org)
  await admin.from('clients').insert({ organization_id: org, name: 'Before Revocation' })
  client = await signedInClient(user.email, user.password)
})

after(async () => {
  await cleanup([org].filter(Boolean), [user?.id].filter(Boolean))
})

// This is the point of the whole architecture: is_member_of() does a live
// lookup against public.memberships on every request rather than trusting a
// role baked into the JWT at sign-in time. Reusing the SAME already-signed-in
// client and its SAME access token (no re-sign-in) is what makes this test
// meaningful -- a JWT-claims design would still show the row here, because
// the token itself never changed, and access would only disappear after the
// token was refreshed or expired. Proving it disappears instantly, on the
// same token, is what distinguishes "revocation takes effect now" from
// "revocation takes effect eventually."
test('access disappears the moment membership is revoked, without a token refresh', async () => {
  const before = await client.from('clients').select('name')
  assert.equal(before.error, null)
  assert.deepEqual(before.data?.map((row) => row.name), ['Before Revocation'])

  const { error: revokeError } = await admin
    .from('memberships')
    .update({ status: 'removed' })
    .eq('organization_id', org)
    .eq('user_id', user.id)
  assert.equal(revokeError, null)

  // Same client, same token -- no signInWithPassword, no token refresh.
  const after = await client.from('clients').select('name')
  assert.equal(after.error, null)
  assert.deepEqual(after.data, [])
})
