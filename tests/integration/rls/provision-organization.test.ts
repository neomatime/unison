import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { randomUUID } from 'node:crypto'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let himarkId: string
let himarkAdmin: { id: string; email: string; password: string }
let himarkMember: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
const provisioned: string[] = []

before(async () => {
  const { data, error } = await admin
    .from('organizations').select('id').eq('slug', 'himark').single()
  if (error) throw error
  himarkId = data.id

  himarkAdmin = await createFixtureUser(himarkId, 'admin')
  himarkMember = await createFixtureUser(himarkId, 'member')
  outsiderOrg = await createFixtureOrg('provision-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')
})

after(async () => {
  await cleanup(
    [outsiderOrg, ...provisioned].filter(Boolean),
    [himarkAdmin?.id, himarkMember?.id, outsider?.id].filter(Boolean) as string[],
  )
})

function args(name: string) {
  return {
    p_name: name,
    p_slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`,
    p_admin_email: `admin-${randomUUID()}@client.test`,
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  }
}

test('a HIMARK admin provisions an organization with frameworks and an owner invitation', async () => {
  const client = await signedInClient(himarkAdmin.email, himarkAdmin.password)
  const payload = args('RLS Provision Alpha')
  const { data: orgId, error } = await client.rpc('provision_organization', payload)
  assert.equal(error, null)
  assert.ok(orgId)
  provisioned.push(orgId as string)

  const { data: frameworks } = await admin
    .from('frameworks').select('id, name').eq('organization_id', orgId)
  assert.equal(frameworks?.length, 6, 'every tenant needs frameworks or New Project cannot submit')

  const onboarding = frameworks!.find((f) => f.name === 'Client Onboarding')!
  const { data: onboardingPhases } = await admin
    .from('framework_phases').select('id').eq('framework_id', onboarding.id)
  assert.equal(onboardingPhases?.length, 6)

  const other = frameworks!.find((f) => f.name === 'Product Launch')!
  const { data: otherPhases } = await admin
    .from('framework_phases').select('id').eq('framework_id', other.id)
  assert.equal(otherPhases?.length, 8)

  const { data: invites } = await admin
    .from('invitations')
    .select('email, role_id, status, token_hash, expires_at, invited_by')
    .eq('organization_id', orgId)
  assert.equal(invites?.length, 1)
  assert.equal(invites![0].role_id, 'owner')
  assert.equal(invites![0].status, 'pending')
  assert.equal(invites![0].email, payload.p_admin_email.toLowerCase())

  // The token is the only way into a tenant that starts with zero
  // memberships -- Task 3 depends on it round-tripping byte-for-byte, not
  // just being present.
  assert.equal(invites![0].token_hash, payload.p_token_hash)
  assert.equal(
    new Date(invites![0].expires_at as string).getTime(),
    new Date(payload.p_expires_at).getTime(),
  )
  assert.equal(invites![0].invited_by, himarkAdmin.id)
})

test('the provisioned organization carries no email_domain', async () => {
  // Populating it would let anyone at that domain auto-join through
  // claim_directory_membership if Entra ever went multi-tenant.
  const { data } = await admin
    .from('organizations').select('email_domain').eq('id', provisioned[0]).single()
  assert.equal(data?.email_domain, null)
})

test('a HIMARK member who is not owner or admin is refused', async () => {
  const client = await signedInClient(himarkMember.email, himarkMember.password)
  const { error } = await client.rpc('provision_organization', args('RLS Provision Member'))
  assert.ok(error, 'a plain member must not be able to create tenants')
  assert.match(error.message, /HIMARK administrator/i)
})

test('an owner of another organization is refused', async () => {
  const client = await signedInClient(outsider.email, outsider.password)
  const { error } = await client.rpc('provision_organization', args('RLS Provision Outsider'))
  assert.ok(error, 'owning some organization must not confer provisioning rights')
  assert.match(error!.message, /HIMARK administrator/i)
})

test('the provisioned organization is invisible to an outsider', async () => {
  const client = await signedInClient(outsider.email, outsider.password)
  const { data } = await client.from('organizations').select('id').eq('id', provisioned[0])
  assert.deepEqual(data, [], 'a new tenant must not leak to other organizations')
})

test('a HIMARK admin lists the tenants their own RLS hides from them', async () => {
  const client = await signedInClient(himarkAdmin.email, himarkAdmin.password)

  // The premise: organizations_select is is_member_of(id), and a HIMARK
  // administrator is not a member of the tenants they provision. A plain
  // select must come back empty, or the function has nothing to do.
  const { data: direct } = await client.from('organizations').select('id').eq('id', provisioned[0])
  assert.deepEqual(direct, [], 'the register cannot be built from a direct select')

  const { data, error } = await client.rpc('list_provisioned_organizations')
  assert.equal(error, null)
  const rows = (data ?? []) as Array<{ id: string; status: string; admin_email: string | null }>
  const row = rows.find((organization) => organization.id === provisioned[0])
  assert.ok(row, 'the provisioned tenant must reach the internal register')

  const { data: invitation } = await admin
    .from('invitations').select('email')
    .eq('organization_id', provisioned[0]).eq('role_id', 'owner').single()
  assert.equal(row.admin_email, invitation!.email, 'the Primary Admin column is the owner invitation')
  assert.equal(row.status, 'active')
})

test('a HIMARK member who is not owner or admin cannot list organizations', async () => {
  const client = await signedInClient(himarkMember.email, himarkMember.password)
  const { error } = await client.rpc('list_provisioned_organizations')
  assert.ok(error, 'the read counterpart must carry the same authorisation as provisioning')
  assert.match(error.message, /HIMARK administrator/i)
})

test('an owner of another organization cannot list organizations', async () => {
  const client = await signedInClient(outsider.email, outsider.password)
  const { error } = await client.rpc('list_provisioned_organizations')
  assert.ok(error, 'owning some organization must not confer sight of every tenant')
  assert.match(error!.message, /HIMARK administrator/i)
})

test('reissue supersedes the pending invitation rather than duplicating it', async () => {
  const client = await signedInClient(himarkAdmin.email, himarkAdmin.password)
  const orgId = provisioned[0]

  const { data: before } = await admin
    .from('invitations').select('id, email, status')
    .eq('organization_id', orgId).eq('status', 'pending')
  assert.equal(before?.length, 1)
  const email = before![0].email

  const newTokenHash = '\\x' + randomUUID().replace(/-/g, '').repeat(2)
  const newExpiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const { error } = await client.rpc('reissue_invitation', {
    p_organization_id: orgId,
    p_email: email,
    p_token_hash: newTokenHash,
    p_expires_at: newExpiresAt,
  })
  assert.equal(error, null, 'the partial unique index must not reject the new row')

  const { data: pendingAfter } = await admin
    .from('invitations')
    .select('id, token_hash, role_id, invited_by, expires_at')
    .eq('organization_id', orgId).eq('status', 'pending')
  assert.equal(pendingAfter?.length, 1, 'exactly one invitation may be pending per address')

  // Task 3 depends on the reissued token round-tripping byte-for-byte, the
  // same guarantee the provisioning test above pins for the original token.
  assert.equal(pendingAfter![0].token_hash, newTokenHash)
  assert.equal(pendingAfter![0].role_id, 'owner')
  assert.equal(pendingAfter![0].invited_by, himarkAdmin.id)
  assert.equal(
    new Date(pendingAfter![0].expires_at as string).getTime(),
    new Date(newExpiresAt).getTime(),
  )

  const { data: expired } = await admin
    .from('invitations').select('id').eq('organization_id', orgId).eq('status', 'expired')
  assert.equal(expired?.length, 1, 'the old one is expired, not deleted')
})

test('an outsider cannot reissue an invitation into a tenant', async () => {
  const client = await signedInClient(outsider.email, outsider.password)
  const { error } = await client.rpc('reissue_invitation', {
    p_organization_id: provisioned[0],
    p_email: 'someone@client.test',
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.ok(error, 'reissue must carry the same authorisation as provisioning')
  assert.match(error!.message, /HIMARK administrator/i)
})

test('a HIMARK member who is not owner or admin cannot reissue an invitation', async () => {
  const client = await signedInClient(himarkMember.email, himarkMember.password)
  const { error } = await client.rpc('reissue_invitation', {
    p_organization_id: provisioned[0],
    p_email: 'someone-else@client.test',
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.ok(error, 'a plain HIMARK member must not be able to reissue invitations')
  assert.match(error!.message, /HIMARK administrator/i)
})

test('a HIMARK admin cannot reissue an invitation into HIMARK itself', async () => {
  const client = await signedInClient(himarkAdmin.email, himarkAdmin.password)
  const { error } = await client.rpc('reissue_invitation', {
    p_organization_id: himarkId,
    p_email: himarkAdmin.email,
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.ok(error, 'this recovery path must never mint an owner invitation into HIMARK itself')
  assert.match(error!.message, /HIMARK's own organization/i)
})

test('a HIMARK admin cannot reissue an invitation for an address that was never invited', async () => {
  const client = await signedInClient(himarkAdmin.email, himarkAdmin.password)
  const { error } = await client.rpc('reissue_invitation', {
    p_organization_id: provisioned[0],
    p_email: `never-invited-${randomUUID()}@client.test`,
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.ok(error, 'reissue must only replace an invitation provision_organization already created')
  assert.match(error!.message, /no prior owner invitation/i)
})
