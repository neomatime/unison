import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser } from './helpers.ts'

let orgId: string
let owner: { id: string; email: string; password: string }
let coOwner: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let frameworkId: string

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
    [owner?.id, coOwner?.id, outsider?.id].filter(Boolean) as string[],
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
  const doomed = await createFixtureUser(orgId, 'member')
  const { data: project, error } = await insertProject(doomed.id)
  assert.equal(error, null)

  const { error: deleteError } = await admin.from('memberships')
    .delete().eq('organization_id', orgId).eq('user_id', doomed.id)
  assert.equal(deleteError, null)

  const { data: after } = await admin
    .from('projects').select('owner_id, organization_id').eq('id', project!.id).single()
  assert.equal(after!.owner_id, null)
  assert.equal(after!.organization_id, orgId, 'organization_id must survive the null')

  await admin.auth.admin.deleteUser(doomed.id)
})

test('list_organization_members returns members with names and statuses', async () => {
  const { data, error } = await admin.rpc('list_organization_members', { p_organization_id: orgId })
  assert.equal(error, null)
  const rows = (data ?? []) as Array<{ user_id: string; email: string; status: string }>
  const found = rows.find((row) => row.user_id === owner.id)
  assert.ok(found, 'the owner must appear in their own organisation')
  assert.equal(found!.email, owner.email)
  assert.ok(rows.every((row) => typeof row.status === 'string'))
})

test('list_organization_members refuses an organisation the caller is not in', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error: signInError } = await client.auth.signInWithPassword({
    email: outsider.email, password: outsider.password,
  })
  assert.equal(signInError, null)

  const { error } = await client.rpc('list_organization_members', { p_organization_id: orgId })
  assert.ok(error, 'membership of another organisation must not be readable')
  assert.match(error!.message, /not a member/i)
})
