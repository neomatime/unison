import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgId: string
let owner: { id: string; email: string; password: string }
let coOwner: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let frameworkId: string
// Declared at module scope (not inside the test body) so `after` can always
// reach it for cleanup, even if the test that creates it fails before its own
// teardown runs -- see the "deleting a membership..." spec below.
let doomed: { id: string; email: string; password: string } | undefined

before(async () => {
  orgId = await createFixtureOrg('project-owner')
  owner = await createFixtureUser(orgId, 'owner')
  // A second owner so the last-owner guard does not block status changes below.
  coOwner = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('project-owner-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const { data, error } = await admin
    .from('frameworks')
    .insert({ organization_id: orgId, name: 'Owner Test Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id')
    .single()
  if (error) throw error
  frameworkId = data.id
})

after(async () => {
  await cleanup(
    [orgId, outsiderOrg].filter(Boolean),
    [owner?.id, coOwner?.id, outsider?.id, doomed?.id].filter(Boolean) as string[],
  )
})

async function insertProject(ownerId: string | null) {
  return admin.from('projects').insert({
    organization_id: orgId,
    name: `Owner spec ${Date.now()}-${Math.random()}`,
    framework_id: frameworkId,
    owner_id: ownerId,
  }).select('id, owner_id, organization_id').single()
}

test('a project can be owned by an active member of the same organisation', async () => {
  const { data, error } = await insertProject(owner.id)
  assert.equal(error, null)
  assert.equal(data!.owner_id, owner.id)
})

test('an owner from another organisation is refused by the constraint', async () => {
  // The point of the composite key: this is refused by Postgres, not by
  // application code, so no code path can reach around it.
  const { error } = await insertProject(outsider.id)
  assert.ok(error, 'a cross-tenant owner must be unrepresentable')
  assert.equal(error!.code, '23503', 'expected a foreign key violation')
})

test('a member whose status is removed remains a valid owner', async () => {
  // Offboarding sets status rather than deleting the row, and ownership is
  // accountability for work already done. Nulling it would erase who was
  // responsible; the picker hides removed members, the record does not.
  const { error: statusError } = await admin.from('memberships')
    .update({ status: 'removed' }).eq('organization_id', orgId).eq('user_id', coOwner.id)
  assert.equal(statusError, null)

  const { data, error } = await insertProject(coOwner.id)
  assert.equal(error, null)
  assert.equal(data!.owner_id, coOwner.id)

  await admin.from('memberships').update({ status: 'active' })
    .eq('organization_id', orgId).eq('user_id', coOwner.id)
})

test('deleting a membership nulls the owner and leaves organization_id intact', async () => {
  // This is the assertion that catches a missing column list on
  // `on delete set null`: without it Postgres nulls organization_id too, which
  // is `not null`, and the delete fails instead of nulling one column.
  doomed = await createFixtureUser(orgId, 'member')
  const { data: project, error } = await insertProject(doomed.id)
  assert.equal(error, null)

  const { error: deleteError } = await admin.from('memberships')
    .delete().eq('organization_id', orgId).eq('user_id', doomed.id)
  assert.equal(deleteError, null)

  const { data: after } = await admin
    .from('projects').select('owner_id, organization_id').eq('id', project!.id).single()
  assert.equal(after!.owner_id, null)
  assert.equal(after!.organization_id, orgId, 'organization_id must survive the null')

  // No ad-hoc deleteUser call here -- `doomed` is cleaned up by the module's
  // `after()` hook regardless of whether the assertions above pass or throw.
})

// Exercises the service_role bypass (parity with list_provisioned_organizations,
// see supabase/migrations/20260826163312_list_provisioned_organizations.sql):
// service_role already holds the GoTrue Admin API, so this raises no
// privilege ceiling. It does NOT exercise `authenticated` -- see the next
// test for that, which is the role every production caller actually uses.
test('list_organization_members returns members with names and statuses (service-role bypass)', async () => {
  const { data, error } = await admin.rpc('list_organization_members', { p_organization_id: orgId })
  assert.equal(error, null)
  const rows = (data ?? []) as Array<{ user_id: string; email: string; status: string }>
  const found = rows.find((row) => row.user_id === owner.id)
  assert.ok(found, 'the owner must appear in their own organisation')
  assert.equal(found!.email, owner.email)
  assert.ok(rows.every((row) => typeof row.status === 'string'))
})

// The production caller (listOrganizationMembers(), later tasks) always runs
// as `authenticated` through a signed-in session, never through service_role.
// This is the spec that actually proves is_member_of(), the grant to
// `authenticated`, and the `revoke ... from public, anon` are all wired
// correctly -- the service-role spec above cannot catch a regression in any
// of those, because it never reaches is_member_of() at all.
test('a signed-in member can list their own organisation members', async () => {
  const client = await signedInClient(owner.email, owner.password)
  const { data, error } = await client.rpc('list_organization_members', { p_organization_id: orgId })
  assert.equal(error, null)
  const rows = (data ?? []) as Array<{ user_id: string; email: string; status: string }>
  const found = rows.find((row) => row.user_id === owner.id)
  assert.ok(found, 'the owner must appear in their own organisation')
  assert.equal(found!.email, owner.email)
  assert.ok(rows.every((row) => typeof row.status === 'string'))
})

// Covers the fix for the docstring overstatement flagged in Task 2 review:
// list_organization_members used to select only raw_user_meta_data->>'full_name',
// so a member whose provider populated `name` but not `full_name` would come
// back with a null name here while lib/auth/display-name.ts's
// resolveDisplayName() (used by the shell) still finds `name` and shows it --
// two different names for the same person. Migration 20260905200000 makes the
// function select coalesce(full_name, name), matching resolveDisplayName's own
// precedence.
test('a member named only by the "name" claim is still named, not blank', async () => {
  const named = await createFixtureUser(orgId, 'member')
  const { error: metadataError } = await admin.auth.admin.updateUserById(named.id, {
    user_metadata: { name: 'Given Name' },
  })
  assert.equal(metadataError, null)

  const { data, error } = await admin.rpc('list_organization_members', { p_organization_id: orgId })
  assert.equal(error, null)
  const rows = (data ?? []) as Array<{ user_id: string; full_name: string | null }>
  const found = rows.find((row) => row.user_id === named.id)
  assert.ok(found, 'the member must appear in their own organisation')
  assert.equal(found!.full_name, 'Given Name')

  await admin.auth.admin.deleteUser(named.id)
})

test('list_organization_members refuses an organisation the caller is not in', async () => {
  const client = await signedInClient(outsider.email, outsider.password)

  const { error } = await client.rpc('list_organization_members', { p_organization_id: orgId })
  assert.ok(error, 'membership of another organisation must not be readable')
  assert.match(error!.message, /not a member/i)
})
