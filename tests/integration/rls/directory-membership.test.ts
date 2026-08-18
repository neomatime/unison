import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, giveAzureIdentity, signedInClient } from './helpers.ts'

// claim_directory_membership() (migration 20260818114505_claim_directory_membership.sql,
// tightened by 20260818124309_bind_directory_identity_email.sql) turns a
// verified Microsoft sign-in into a membership. As of the tightening
// migration, the predicate it enforces is, in effect:
//
//   exists (select 1 from auth.identities
//           where user_id = auth.uid() and provider = 'azure'
//             and email = lower(<caller's verified email>))
//
// i.e. it is not enough for the caller to have *any* azure identity -- that
// identity's own email claim must equal the caller's verified email. Fixtures
// cannot perform a real Microsoft sign-in, so they insert an auth.identities
// row directly (via giveAzureIdentity(), see helpers.ts) and prove the
// authorisation rules that way; the OAuth handshake itself is verified once
// in a browser in Task 7.
let org: string
const userIds: string[] = []
const DOMAIN = `dir-${randomUUID().slice(0, 8)}.test`

async function directoryUser(localPart: string, opts: { azure?: boolean } = {}) {
  const user = await createFixtureUser(null)
  userIds.push(user.id)
  await admin.auth.admin.updateUserById(user.id, { email: `${localPart}@${DOMAIN}`, email_confirm: true })
  if (opts.azure !== false) await giveAzureIdentity(user.id, `${localPart}@${DOMAIN}`)
  return { ...user, email: `${localPart}@${DOMAIN}` }
}

before(async () => {
  org = await createFixtureOrg('Directory')
  await admin.from('organizations').update({ email_domain: DOMAIN }).eq('id', org)
})

after(async () => {
  await cleanup([org], userIds)
})

test('a verified Microsoft account at a registered domain joins as a member', async () => {
  const user = await directoryUser('joiner')
  const client = await signedInClient(user.email, user.password)
  const { data, error } = await client.rpc('claim_directory_membership')
  assert.equal(error, null)
  assert.equal(data, org)

  const { data: rows } = await admin.from('memberships').select('role_id, status').eq('user_id', user.id)
  assert.deepEqual(rows, [{ role_id: 'member', status: 'active' }])
})

test('a second call is idempotent and mutates nothing', async () => {
  const user = await directoryUser('repeat')
  const client = await signedInClient(user.email, user.password)
  await client.rpc('claim_directory_membership')
  const { data: before } = await admin.from('memberships').select('id, role_id, status').eq('user_id', user.id)

  const { data, error } = await client.rpc('claim_directory_membership')
  assert.equal(error, null)
  assert.equal(data, org)

  const { data: after } = await admin.from('memberships').select('id, role_id, status').eq('user_id', user.id)
  assert.deepEqual(after, before, 'a repeat claim must not change the membership row')
})

test('an account without a Microsoft identity is refused', async () => {
  const user = await directoryUser('nodirectory', { azure: false })
  const client = await signedInClient(user.email, user.password)
  const { error } = await client.rpc('claim_directory_membership')
  assert.ok(error, 'expected a refusal')
  assert.match(error!.message, /directory identity/i)

  const { data: rows } = await admin.from('memberships').select('id').eq('user_id', user.id)
  assert.deepEqual(rows, [], 'no membership may be created')
})

// This is the spec the tightening migration (20260818124309) exists for.
// Before it, claim_directory_membership() only checked that *some* azure
// identity was linked to the caller's user_id -- it never examined that
// identity's own email. Identity linking could attach a Microsoft account
// with a completely unrelated address to a user_id that separately holds a
// confirmed @<registered-domain> email, and the old check would let it
// through on the strength of the confirmed email alone, never having
// actually verified anything about the linked Microsoft account. This proves
// the closed version: an azure identity that describes a different address
// entirely must not satisfy the check, even though it is unambiguously
// "present" for this user_id.
test('an azure identity for a different address does not satisfy the check', async () => {
  const user = await createFixtureUser(null)
  userIds.push(user.id)
  const email = `mismatched@${DOMAIN}`
  await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true })
  await giveAzureIdentity(user.id, `someone-else-${randomUUID().slice(0, 8)}@not-${DOMAIN}`)
  const client = await signedInClient(email, user.password)

  const { data, error } = await client.rpc('claim_directory_membership')
  assert.ok(error, 'expected a refusal')
  assert.match(error!.message, /directory identity/i)
  assert.equal(data, null)

  const { data: rows } = await admin.from('memberships').select('id').eq('user_id', user.id)
  assert.deepEqual(rows, [], 'no membership may be created')
})

test('a removed member is refused and NOT reactivated', async () => {
  const user = await directoryUser('removed')
  const client = await signedInClient(user.email, user.password)
  await client.rpc('claim_directory_membership')
  await admin.from('memberships').update({ status: 'removed' }).eq('user_id', user.id)

  const { error } = await client.rpc('claim_directory_membership')
  assert.ok(error, 'a revoked account must not regain access by signing in again')
  assert.match(error!.message, /revoked/i)

  const { data: rows } = await admin.from('memberships').select('status').eq('user_id', user.id)
  assert.deepEqual(rows, [{ status: 'removed' }], 'status must be untouched')
})

test('a suspended member is refused and NOT reactivated', async () => {
  const user = await directoryUser('suspended')
  const client = await signedInClient(user.email, user.password)
  await client.rpc('claim_directory_membership')
  await admin.from('memberships').update({ status: 'suspended' }).eq('user_id', user.id)

  const { error } = await client.rpc('claim_directory_membership')
  assert.ok(error)
  const { data: rows } = await admin.from('memberships').select('status').eq('user_id', user.id)
  assert.deepEqual(rows, [{ status: 'suspended' }])
})

test('an unregistered domain returns null rather than raising', async () => {
  const user = await createFixtureUser(null)
  userIds.push(user.id)
  await giveAzureIdentity(user.id, user.email)
  const client = await signedInClient(user.email, user.password)

  const { data, error } = await client.rpc('claim_directory_membership')
  assert.equal(error, null, 'an unknown domain is an ordinary outcome, not an error')
  assert.equal(data, null)
})

test('a suspended organization does not accept directory sign-in', async () => {
  const suspended = await createFixtureOrg('DirSuspended')
  const domain = `dir-${randomUUID().slice(0, 8)}.test`
  await admin.from('organizations').update({ email_domain: domain, status: 'suspended' }).eq('id', suspended)

  const user = await createFixtureUser(null)
  userIds.push(user.id)
  await admin.auth.admin.updateUserById(user.id, { email: `x@${domain}`, email_confirm: true })
  await giveAzureIdentity(user.id, `x@${domain}`)
  const client = await signedInClient(`x@${domain}`, user.password)

  const { data } = await client.rpc('claim_directory_membership')
  assert.equal(data, null)
  await cleanup([suspended], [])
})
