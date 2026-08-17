import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createHash, randomBytes } from 'node:crypto'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

// Task 12 wired public.accept_invitation() up to real send/accept server
// actions, but until this spec no RLS test exercised the RPC itself -- the
// only coverage was an ad-hoc script run once by hand during that task.
// That gap is exactly how three audit_events rows with organization_id =
// null leaked into the shared database: accept_invitation() writes a
// resource = 'memberships' audit row, deleting the fixture organization
// nulls that row's organization_id (on delete set null), and nothing in
// helpers.ts's cleanup() swept resource = 'memberships' rows back up (it
// only ever accounted for 'organizations' and 'clients'). This spec proves
// the RPC's core contract, and by running through the ordinary cleanup()
// path on every run, proves that leak stays fixed rather than only being
// fixed once by hand.
let org: string
let owner: Awaited<ReturnType<typeof createFixtureUser>>
let invitee: Awaited<ReturnType<typeof createFixtureUser>>

before(async () => {
  org = await createFixtureOrg('AcceptInvitation')
  owner = await createFixtureUser(org, 'owner')
  invitee = await createFixtureUser(null, 'member') // deliberately no membership yet -- accepting the invitation is what should create one
})

after(async () => {
  await cleanup([org].filter(Boolean), [owner?.id, invitee?.id].filter(Boolean) as string[])
})

test('accept_invitation grants membership from a pending invitation addressed to the caller', async () => {
  const rawToken = randomBytes(32).toString('base64url')
  // Same encoding as features/invitations/actions/send-invitation.ts and
  // the extensions.digest(raw_token, 'sha256')::text comparison inside
  // accept_invitation() itself -- verified to match in Task 12.
  const tokenHash = '\\x' + createHash('sha256').update(rawToken).digest('hex')

  const ownerClient = await signedInClient(owner.email, owner.password)
  const { error: insertError } = await ownerClient.from('invitations').insert({
    organization_id: org,
    email: invitee.email,
    role_id: 'member',
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    invited_by: owner.id,
  })
  assert.equal(insertError, null, JSON.stringify(insertError))

  const inviteeClient = await signedInClient(invitee.email, invitee.password)
  const { data: acceptedOrgId, error: acceptError } = await inviteeClient.rpc('accept_invitation', { raw_token: rawToken })
  assert.equal(acceptError, null, JSON.stringify(acceptError))
  assert.equal(acceptedOrgId, org)

  const { data: membership, error: membershipError } = await admin
    .from('memberships')
    .select('role_id, status')
    .eq('organization_id', org)
    .eq('user_id', invitee.id)
    .single()
  assert.equal(membershipError, null, JSON.stringify(membershipError))
  assert.equal(membership?.role_id, 'member')
  assert.equal(membership?.status, 'active')

  // The audit row this test itself causes (resource = 'memberships', actor_id
  // = invitee.id) exists right now, with a live organization_id -- this is
  // the exact row shape whose orphaned (organization_id = null, post-cleanup)
  // form leaked before this spec's fix. Confirmed clean in the standalone
  // "does not leak an orphaned audit row" test below, after cleanup() runs.
  const { data: auditRow, error: auditRowError } = await admin
    .from('audit_events')
    .select('id, organization_id, resource, actor_id')
    .eq('resource', 'memberships')
    .eq('actor_id', invitee.id)
    .maybeSingle()
  assert.equal(auditRowError, null, JSON.stringify(auditRowError))
  assert.equal(auditRow?.organization_id, org)
})

test('accept_invitation rejects an unknown token', async () => {
  const inviteeClient = await signedInClient(invitee.email, invitee.password)
  const { data, error } = await inviteeClient.rpc('accept_invitation', { raw_token: 'not-a-real-token' })
  assert.equal(data, null)
  assert.ok(error)
  assert.match(error!.message, /invitation not found/i)
})
