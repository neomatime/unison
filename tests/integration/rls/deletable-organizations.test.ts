import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

// Regression coverage for Task 16 fix round 1: before migration
// 20260816232306_deletable_organizations.sql, an organization with any
// `clients` rows could never be deleted through any path -- deleting it
// cascaded into deleting its clients, which fired clients_audit (an AFTER
// DELETE trigger inserting into audit_events), whose insert referenced an
// organization already gone from that statement's perspective and raised
// 23503, rolling back the whole delete. Confirmed empirically against this
// same live database, by temporarily reverting the migration's DDL and
// re-running this exact test: it failed with `foreign key constraint
// "audit_events_organization_id_fkey"`, then passed once the fix was
// restored. See task-16-report.md, "Fix round 1", for the reverted-schema
// failure output.
let org: string
let owner: Awaited<ReturnType<typeof createFixtureUser>>
let ownerClient: Awaited<ReturnType<typeof signedInClient>>
let clientRowId: string

before(async () => {
  org = await createFixtureOrg('Deletable')
  owner = await createFixtureUser(org, 'owner')
  const { data, error } = await admin.from('clients').insert({ organization_id: org, name: 'Row To Cascade' }).select('id').single()
  if (error) throw error
  clientRowId = data.id as string
  ownerClient = await signedInClient(owner.email, owner.password)
})

// No `after` cleanup here: a passing first test deletes the organization and
// user itself as the thing under test. If it fails partway, the second test
// still runs and the module-level `after` below handles whatever is left
// over, same as every other spec in this suite.
after(async () => {
  await cleanup([org].filter(Boolean), [owner?.id].filter(Boolean))
})

test('an owner can delete their organization even though it has clients rows', async () => {
  const { error } = await ownerClient.rpc('delete_organization', { target_org: org })
  assert.equal(error, null, `expected delete_organization to succeed, got: ${JSON.stringify(error)}`)

  const { data: orgRow } = await admin.from('organizations').select('id').eq('id', org)
  assert.deepEqual(orgRow, [], 'organization row should be gone')

  const { data: clientRow } = await admin.from('clients').select('id').eq('id', clientRowId)
  assert.deepEqual(clientRow, [], 'the clients row should have been cascade-deleted along with the organization')

  // The point of fix round 1: the deletion itself, and who did it, must be
  // recoverable after the organization is gone. organization_id is null
  // (the row it pointed to no longer exists) but the event survives.
  const { data: deletionEvent, error: eventError } = await admin
    .from('audit_events')
    .select('actor_id, action, resource, resource_id, old_value, organization_id')
    .eq('resource', 'organizations')
    .eq('resource_id', org)
    .eq('action', 'delete')
    .single()
  assert.equal(eventError, null)
  assert.equal(deletionEvent?.organization_id, null)
  assert.equal(deletionEvent?.actor_id, owner.id)
  assert.equal((deletionEvent?.old_value as { id?: string } | null)?.id, org)
})

test('a non-owner cannot delete the organization', async () => {
  const memberOrg = await createFixtureOrg('DeletableNonOwner')
  const member = await createFixtureUser(memberOrg, 'member')
  const memberClient = await signedInClient(member.email, member.password)

  const { error } = await memberClient.rpc('delete_organization', { target_org: memberOrg })
  assert.ok(error, 'expected a non-owner to be rejected')
  assert.equal(error!.code, '42501')
  assert.match(error!.message, /only an owner may delete their organization/i)

  const { data: stillThere } = await admin.from('organizations').select('id').eq('id', memberOrg)
  assert.equal(stillThere?.length, 1, 'organization must still exist')

  await cleanup([memberOrg], [member.id])
})
