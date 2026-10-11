import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let memberA: U
let memberB: U

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const profile = (organization_id: string, email: string, full_name = 'Link Test') =>
  admin.from('team_members').insert({ organization_id, full_name, email }).select('id, user_id').single()
const linkedTo = async (id: string) => must(await admin.from('team_members').select('user_id').eq('id', id).single()).user_id

before(async () => {
  orgA = await createFixtureOrg('team-link-a')
  orgB = await createFixtureOrg('team-link-b')
  memberA = await createFixtureUser(orgA, 'member')
  memberB = await createFixtureUser(orgB, 'member')
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [memberA?.id, memberB?.id].filter(Boolean))
})

test('a new profile is linked to the active member with the same email, ignoring case', async () => {
  const created = must(await profile(orgA, memberA.email.toUpperCase()))
  assert.equal(created.user_id, memberA.id)
  assert.equal(await linkedTo(created.id), memberA.id)
})

test('a profile with an email nobody signs in with stays unlinked', async () => {
  const created = must(await profile(orgA, `nobody-${Date.now()}@example.test`))
  assert.equal(created.user_id, null)
})

test('a profile is never linked to a member of another organisation', async () => {
  const created = must(await profile(orgA, memberB.email))
  assert.equal(created.user_id, null)
})

test('changing an unlinked profile\'s email to a member\'s email links it', async () => {
  const created = must(await profile(orgB, `before-${Date.now()}@example.test`))
  assert.equal(created.user_id, null)
  assert.equal((await admin.from('team_members').update({ email: memberB.email }).eq('id', created.id)).error, null)
  assert.equal(await linkedTo(created.id), memberB.id)
})

test('a profile waiting for someone is linked when they become an active member', async () => {
  // memberB exists as a sign-in but is not a member of organisation A (the earlier test left a profile with their email; start clean).
  await admin.from('team_members').delete().eq('organization_id', orgA).eq('email', memberB.email)
  const waiting = must(await profile(orgA, memberB.email))
  assert.equal(waiting.user_id, null)
  assert.equal((await admin.from('memberships').insert({ organization_id: orgA, user_id: memberB.id, role_id: 'member', status: 'active' })).error, null)
  assert.equal(await linkedTo(waiting.id), memberB.id)
})

test('a suspended member is not linked, and is linked once active', async () => {
  const other = await createFixtureUser(orgB, 'member')
  try {
    assert.equal((await admin.from('memberships').insert({ organization_id: orgA, user_id: other.id, role_id: 'member', status: 'suspended' })).error, null)
    const created = must(await profile(orgA, other.email))
    assert.equal(created.user_id, null)
    assert.equal((await admin.from('memberships').update({ status: 'active' }).eq('organization_id', orgA).eq('user_id', other.id)).error, null)
    assert.equal(await linkedTo(created.id), other.id)
  } finally {
    await admin.from('team_members').delete().eq('organization_id', orgA).eq('email', other.email)
    await admin.from('memberships').delete().eq('organization_id', orgA).eq('user_id', other.id)
    await cleanup([], [other.id])
  }
})
