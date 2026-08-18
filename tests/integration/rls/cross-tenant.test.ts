import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgA: string
let orgB: string
let userA: Awaited<ReturnType<typeof createFixtureUser>>
let clientA: Awaited<ReturnType<typeof signedInClient>>
let rowBId: string

before(async () => {
  orgA = await createFixtureOrg('A')
  orgB = await createFixtureOrg('B')
  userA = await createFixtureUser(orgA)
  await admin.from('clients').insert({ organization_id: orgA, name: 'Visible To A' })
  const { data: rowB, error } = await admin
    .from('clients')
    .insert({ organization_id: orgB, name: 'Belongs To B' })
    .select('id')
    .single()
  if (error) throw error
  rowBId = rowB.id as string
  clientA = await signedInClient(userA.email, userA.password)
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [userA?.id].filter(Boolean))
})

// If clients_select's `is_member_of(organization_id)` check were dropped (or
// replaced with `true`), this would return both rows instead of one.
test('a member sees only their own organization rows', async () => {
  const { data, error } = await clientA.from('clients').select('name')
  assert.equal(error, null)
  assert.deepEqual(data?.map((row) => row.name), ['Visible To A'])
})

// Same policy, different attack shape: explicitly filtering for the other
// org's id must not bypass the RLS predicate PostgREST ANDs onto every
// query. Without the policy this would return B's row.
test('a direct read of another org id returns nothing rather than erroring', async () => {
  const { data, error } = await clientA.from('clients').select('name').eq('organization_id', orgB)
  assert.equal(error, null)
  assert.deepEqual(data, [])
})

// If clients_insert's WITH CHECK were dropped, this insert would succeed and
// a row belonging to A's session would land inside B's organization.
test('inserting into another organization is rejected', async () => {
  const { error } = await clientA.from('clients').insert({ organization_id: orgB, name: 'Smuggled' })
  assert.ok(error, 'expected the insert to violate the RLS check')
  assert.match(error!.message, /row-level security/i)

  const { data: smuggled } = await admin
    .from('clients')
    .select('id')
    .eq('organization_id', orgB)
    .eq('name', 'Smuggled')
  assert.deepEqual(smuggled, [], 'no smuggled row should exist in B, regardless of what the client response said')
})

// Empirically verified against the live database (not assumed): `clients`
// has RLS enabled with no delete policy at all. Postgres/PostgREST do not
// raise an error for that -- the DELETE's WHERE clause matches zero rows for
// the authenticated role (RLS filters the row set to nothing before the
// delete predicate even runs) and the statement reports success with zero
// rows affected. So the observable, meaningful assertion is not "an error is
// raised" -- it demonstrably is not -- but "the row is still there
// afterwards", checked via the admin (RLS-bypassing) client as ground truth.
// If a delete policy were ever added with a permissive `using` clause, this
// row would actually be gone and the test would fail.
test('deleting produces no error but does not remove the row', async () => {
  const { error } = await clientA.from('clients').delete().eq('organization_id', orgA)
  assert.equal(error, null)

  const { data: stillThere, error: checkError } = await admin
    .from('clients')
    .select('id, name')
    .eq('organization_id', orgA)
  assert.equal(checkError, null)
  assert.deepEqual(stillThere?.map((row) => row.name), ['Visible To A'])
})

// Belt-and-braces on the fixture itself: B's row must never have moved or
// disappeared as a side effect of any of the above.
test('org B row is untouched throughout', async () => {
  const { data, error } = await admin.from('clients').select('id, name').eq('id', rowBId).single()
  assert.equal(error, null)
  assert.equal(data?.name, 'Belongs To B')
})
