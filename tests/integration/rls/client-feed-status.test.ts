import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test, { after } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'
import { anonymous, must, sha256 } from './portal-fixtures.ts'

// Quote portal, slice 3: get_hive_feed_status, what staff see about the HIVE client feed. It reads the same
// eligibility as the feed itself (private.client_accepted_quotes) and tells a member whether the gate is on, whether the
// organisation has a live key and when HIVE last read the feed, plus, for a client, whether it would appear in the feed
// and since when, and, for an owner or admin only, how many clients the gate would leave.
//
// Every organisation, client, quote, key and user here is the test's own. A key's last_used_at is set with the service
// role on the test's own keys; the status function only reads it, and the real HIVE key is never touched.

const orgIds: string[] = []
const userIds: string[] = []

after(async () => {
  await cleanup(orgIds, userIds)
})

const DAY = 86_400_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
/** Postgres keeps microseconds and the test's dates have milliseconds, so instants are compared, not spellings. */
const sameInstant = (actual: unknown, expected: unknown, message?: string) => {
  assert.equal(typeof actual, 'string', message)
  assert.equal(Date.parse(actual as string), Date.parse(expected as string), message)
}

type Row = Record<string, any>
type Role = 'owner' | 'admin' | 'member'
type Status = {
  gate_enabled: boolean
  has_live_key: boolean
  last_read_at: string | null
  client: null | { included: boolean; since: string | null }
  summary: null | { total_clients: number; with_accepted_quote: number }
}
const TOP_KEYS = ['client', 'gate_enabled', 'has_live_key', 'last_read_at', 'summary']
const keysOf = (value: object) => Object.keys(value).sort()

/** A throwaway organisation with a settings row (every setting at its default) and no key. */
const statusOrg = async (label: string) => {
  const orgId = await createFixtureOrg(label)
  orgIds.push(orgId)
  must(await admin.from('organization_settings').insert({ organization_id: orgId, legal_name: `Status ${label} (Pty) Ltd` }).select('id').single())
  return orgId
}
const signedIn = async (orgId: string | null, role: Role = 'member') => {
  const user = await createFixtureUser(orgId, role)
  userIds.push(user.id)
  return signedInClient(user.email, user.password)
}
const addClient = async (orgId: string, fields: Row = {}) =>
  must(await admin.from('clients').insert({ organization_id: orgId, name: `Status client ${randomUUID().slice(0, 8)}`, status: 'Active', ...fields })
    .select('*').single()) as Row
/** A quote written by the service role, which may insert any status; an explicit accepted_at is kept on insert. */
const addQuote = async (orgId: string, client: Row, status: string, fields: Row = {}) =>
  must(await admin.from('quotes').insert({
    organization_id: orgId, client_id: client.id, client_name: client.name, status,
    ...(status === 'Draft' ? {} : { quote_number: `FS-${randomUUID().slice(0, 8)}` }), ...fields,
  }).select('*').single()) as Row
const setGate = async (orgId: string, on: boolean) => {
  const { data, error } = await admin.from('organization_settings').update({ hive_feed_requires_accepted_quote: on })
    .eq('organization_id', orgId).select('hive_feed_requires_accepted_quote')
  assert.equal(error, null, error?.message)
  assert.deepEqual(data, [{ hive_feed_requires_accepted_quote: on }])
}
/** A key made by the operator function, with its row id (only the hash is stored, so the row is found by the hash). */
const newKey = async (orgId: string, name = 'RLS status test') => {
  const key = must(await admin.rpc('create_client_api_key', { p_organization_id: orgId, p_name: name })) as string
  const row = must(await admin.from('client_api_keys').select('id').eq('key_hash', sha256(key)).single())
  return { key, keyId: row.id as string }
}
const setKey = async (keyId: string, change: Row) => assert.equal((await admin.from('client_api_keys').update(change).eq('id', keyId)).error, null)

type Caller = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> }
const call = (caller: Caller, orgId: string, clientId?: string | null) =>
  caller.rpc('get_hive_feed_status', clientId === undefined ? { p_organization_id: orgId } : { p_organization_id: orgId, p_client_id: clientId })
const status = async (caller: Caller, orgId: string, clientId?: string | null) => {
  const { data, error } = await call(caller, orgId, clientId)
  assert.equal(error, null, error?.message)
  assert.ok(data, 'a status is returned')
  return data as Status
}
const refusedWith42501 = async (caller: Caller, orgId: string) => {
  const { data, error } = await call(caller, orgId)
  assert.equal(data, null, 'no data comes back')
  assert.equal(error?.code, '42501', error?.message)
}
/** How many clients the feed returns for a key, as the route calls it: through an anonymous client. */
const feedCount = async (key: string) => {
  const { data, error } = await anonymous.rpc('get_clients_for_api_key', { p_key: key, p_updated_since: null, p_cursor: null, p_limit: 500 })
  assert.equal(error, null, error?.message)
  return (data as { clients: unknown[] }).clients.length
}

test('a non-member and anon are refused', async () => {
  const orgA = await statusOrg('status-refuse-a')
  const orgB = await statusOrg('status-refuse-b')
  const memberA = await signedIn(orgA)
  const memberB = await signedIn(orgB)
  const noOrganisation = await signedIn(null)

  await status(memberA, orgA) // the same call by a member of the organisation is answered
  await refusedWith42501(memberB, orgA)
  await refusedWith42501(memberA, orgB)
  await refusedWith42501(noOrganisation, orgA)
  await refusedWith42501(memberA, randomUUID())
  await refusedWith42501(anonymous, orgA)
})

test('a member gets the status and a client line but no summary; an owner and an admin also get the summary', async () => {
  const orgId = await statusOrg('status-roles')
  const accepted = await addClient(orgId)
  await addQuote(orgId, accepted, 'Accepted', { accepted_at: ago(DAY) })
  await addClient(orgId)
  const member = await signedIn(orgId, 'member')
  const owner = await signedIn(orgId, 'owner')
  const orgAdmin = await signedIn(orgId, 'admin')

  const asMember = await status(member, orgId, accepted.id)
  assert.deepEqual(keysOf(asMember), TOP_KEYS)
  assert.deepEqual(asMember, {
    gate_enabled: false, has_live_key: false, last_read_at: null, client: { included: true, since: null }, summary: null,
  })

  for (const staff of [owner, orgAdmin]) {
    const result = await status(staff, orgId, accepted.id)
    assert.deepEqual(keysOf(result), TOP_KEYS)
    assert.deepEqual(result.client, { included: true, since: null })
    assert.deepEqual(result.summary, { total_clients: 2, with_accepted_quote: 1 })
    assert.equal(typeof result.summary!.total_clients, 'number')
    assert.equal(typeof result.summary!.with_accepted_quote, 'number')
  }

  // Without a client the line is null, and the summary is still there for staff and still missing for a member.
  assert.deepEqual(await status(member, orgId), { gate_enabled: false, has_live_key: false, last_read_at: null, client: null, summary: null })
  assert.equal((await status(owner, orgId)).client, null)
  assert.deepEqual((await status(owner, orgId)).summary, { total_clients: 2, with_accepted_quote: 1 })
})

test('with the gate off every client is included and has no since date', async () => {
  const orgId = await statusOrg('status-gate-off')
  const member = await signedIn(orgId)
  const withQuote = await addClient(orgId)
  await addQuote(orgId, withQuote, 'Accepted', { accepted_at: ago(2 * DAY) })
  const withoutQuote = await addClient(orgId)
  const archived = await addClient(orgId, { archived_at: ago(DAY) })

  for (const client of [withQuote, withoutQuote, archived]) {
    const result = await status(member, orgId, client.id)
    assert.equal(result.gate_enabled, false)
    assert.deepEqual(result.client, { included: true, since: null })
  }
})

test('with the gate on a client without an accepted quote is not included, and one with accepted quotes is included since the earliest accepted_at of its non-archived Accepted quotes', async () => {
  const orgId = await statusOrg('status-gate-on')
  const member = await signedIn(orgId)
  const none = await addClient(orgId)
  const accepted = await addClient(orgId)
  // The earliest Accepted quote is archived, so it does not set the date; the earliest that counts is two days old.
  await addQuote(orgId, accepted, 'Accepted', { accepted_at: ago(4 * DAY), archived_at: ago(3 * DAY) })
  await addQuote(orgId, accepted, 'Accepted', { accepted_at: ago(DAY) })
  const earliest = await addQuote(orgId, accepted, 'Accepted', { accepted_at: ago(2 * DAY) })
  await addQuote(orgId, accepted, 'Sent')
  const single = await addClient(orgId)
  const singleQuote = await addQuote(orgId, single, 'Accepted', { accepted_at: ago(DAY / 2) })

  await setGate(orgId, true)
  const result = await status(member, orgId, accepted.id)
  assert.equal(result.gate_enabled, true)
  assert.equal(result.client!.included, true)
  sameInstant(result.client!.since, earliest.accepted_at, 'since is the earliest accepted_at that counts')

  const onlyOne = await status(member, orgId, single.id)
  assert.equal(onlyOne.client!.included, true)
  sameInstant(onlyOne.client!.since, singleQuote.accepted_at)

  assert.deepEqual((await status(member, orgId, none.id)).client, { included: false, since: null })

  // Turned off again, the same clients are all included and none has a date.
  await setGate(orgId, false)
  for (const client of [none, accepted, single]) assert.deepEqual((await status(member, orgId, client.id)).client, { included: true, since: null })
})

test("an archived Accepted quote and another client's Accepted quote do not count", async () => {
  const orgId = await statusOrg('status-ineligible')
  const member = await signedIn(orgId)
  await setGate(orgId, true)

  const archivedOnly = await addClient(orgId)
  await addQuote(orgId, archivedOnly, 'Accepted', { accepted_at: ago(DAY), archived_at: ago(DAY / 2) })
  // Another client of the same organisation has an Accepted quote of its own; this one has no quote.
  const bystander = await addClient(orgId)
  const neighbour = await addClient(orgId)
  await addQuote(orgId, neighbour, 'Accepted', { accepted_at: ago(DAY) })
  // Every other status leaves a client out.
  const others: Row[] = []
  for (const quoteStatus of ['Draft', 'Sent', 'Declined', 'Expired', 'Superseded']) {
    const client = await addClient(orgId)
    await addQuote(orgId, client, quoteStatus)
    others.push(client)
  }
  // Another organisation has a client of the same name with an Accepted quote.
  const sameName = await addClient(orgId, { name: 'Status Same Name' })
  const otherOrg = await statusOrg('status-ineligible-other')
  const otherClient = await addClient(otherOrg, { name: 'Status Same Name' })
  await addQuote(otherOrg, otherClient, 'Accepted', { accepted_at: ago(DAY) })

  for (const client of [archivedOnly, bystander, ...others, sameName]) {
    assert.deepEqual((await status(member, orgId, client.id)).client, { included: false, since: null }, `${client.name} is not included`)
  }
  assert.equal((await status(member, orgId, neighbour.id)).client!.included, true, 'the neighbour, with a quote of its own, is')
})

test('last_read_at is the latest last_used_at over live keys, null when never used, and a revoked key is ignored; has_live_key is false with no live key', async () => {
  const orgId = await statusOrg('status-keys')
  const otherOrg = await statusOrg('status-keys-other')
  const member = await signedIn(orgId)

  assert.deepEqual(await status(member, orgId), { gate_enabled: false, has_live_key: false, last_read_at: null, client: null, summary: null }, 'no key at all')

  const first = await newKey(orgId)
  const neverUsed = await status(member, orgId)
  assert.equal(neverUsed.has_live_key, true)
  assert.equal(neverUsed.last_read_at, null, 'a live key that was never used')

  await setKey(first.keyId, { last_used_at: ago(2 * 3_600_000) })
  const second = await newKey(orgId)
  const latest = ago(3_600_000)
  await setKey(second.keyId, { last_used_at: latest })
  const third = await newKey(orgId)
  await setKey(third.keyId, { last_used_at: ago(600_000) })
  assert.equal((await admin.rpc('revoke_client_api_key', { p_key_id: third.keyId })).error, null)
  const revokedRow = must(await admin.from('client_api_keys').select('last_used_at, revoked_at').eq('id', third.keyId).single())
  assert.notEqual(revokedRow.revoked_at, null)
  assert.notEqual(revokedRow.last_used_at, null, 'the revoked key still has a later last_used_at')
  // Another organisation's key, read just now, is not this organisation's read.
  const foreign = await newKey(otherOrg)
  await setKey(foreign.keyId, { last_used_at: new Date().toISOString() })

  const result = await status(member, orgId)
  assert.equal(result.has_live_key, true)
  sameInstant(result.last_read_at, latest, 'the latest of the live keys, not the revoked key and not another organisation')

  // Only revoked keys left: nothing is live and nothing counts as a read.
  for (const key of [first, second]) assert.equal((await admin.rpc('revoke_client_api_key', { p_key_id: key.keyId })).error, null)
  const revokedAll = await status(member, orgId)
  assert.equal(revokedAll.has_live_key, false)
  assert.equal(revokedAll.last_read_at, null)
})

test('a client id of another organisation, or one that does not exist, gives client null', async () => {
  const orgId = await statusOrg('status-foreign')
  const otherOrg = await statusOrg('status-foreign-other')
  const owner = await signedIn(orgId, 'owner')
  const own = await addClient(orgId)
  await addQuote(orgId, own, 'Accepted', { accepted_at: ago(DAY) })
  const foreign = await addClient(otherOrg)
  await addQuote(otherOrg, foreign, 'Accepted', { accepted_at: ago(DAY) })
  await setGate(orgId, true)

  const without = await status(owner, orgId)
  assert.equal(without.client, null)
  for (const clientId of [foreign.id, randomUUID(), null]) {
    const result = await status(owner, orgId, clientId)
    assert.equal(result.client, null, `client ${clientId}`)
    assert.deepEqual(result, without, 'the rest of the answer is the same as without a client, and holds nothing of the other organisation')
  }
  assert.ok(!JSON.stringify(without).includes(foreign.id))
  assert.equal((await status(owner, orgId, own.id)).client?.included, true, 'its own client is still answered')
})

test('the summary counts do not depend on the gate', async () => {
  const orgId = await statusOrg('status-summary')
  const { key } = await newKey(orgId)
  const owner = await signedIn(orgId, 'owner')
  const empty = await status(owner, orgId)
  assert.deepEqual(empty.summary, { total_clients: 0, with_accepted_quote: 0 }, 'no clients yet')

  const twice = await addClient(orgId)
  await addQuote(orgId, twice, 'Accepted', { accepted_at: ago(2 * DAY) })
  await addQuote(orgId, twice, 'Accepted', { accepted_at: ago(DAY) })
  // An archived client is in the feed with the gate off, and with an Accepted quote it is in it with the gate on.
  const archived = await addClient(orgId, { archived_at: ago(DAY) })
  await addQuote(orgId, archived, 'Accepted', { accepted_at: ago(DAY) })
  const sentOnly = await addClient(orgId)
  await addQuote(orgId, sentOnly, 'Sent')
  const archivedQuote = await addClient(orgId)
  await addQuote(orgId, archivedQuote, 'Accepted', { accepted_at: ago(DAY), archived_at: ago(DAY / 2) })
  await addClient(orgId)
  const expected = { total_clients: 5, with_accepted_quote: 2 }

  const off = await status(owner, orgId)
  assert.equal(off.gate_enabled, false)
  assert.deepEqual(off.summary, expected)
  assert.equal(await feedCount(key), expected.total_clients, 'with the gate off the feed returns every client')

  await setGate(orgId, true)
  const on = await status(owner, orgId)
  assert.equal(on.gate_enabled, true)
  assert.deepEqual(on.summary, expected, 'the same counts with the gate on')
  assert.equal(await feedCount(key), expected.with_accepted_quote, 'with the gate on the feed returns what the summary says')
})

test('the function leaks no key, no key hash and no name', async () => {
  const orgId = await statusOrg('status-leak')
  const owner = await signedIn(orgId, 'owner')
  const member = await signedIn(orgId, 'member')
  const probe = 'Leak Probe Key Name'
  const { key, keyId } = await newKey(orgId, probe)
  const usedAt = ago(3_600_000)
  await setKey(keyId, { last_used_at: usedAt })
  const client = await addClient(orgId)

  for (const caller of [member, owner]) {
    const result = await status(caller, orgId, client.id)
    assert.deepEqual(keysOf(result), TOP_KEYS, 'the returned key set')
    assert.deepEqual(keysOf(result.client!), ['included', 'since'])
    sameInstant(result.last_read_at, usedAt)
    const text = JSON.stringify(result)
    for (const secret of [key, sha256(key), probe, keyId]) assert.ok(!text.includes(secret), 'nothing of the key is returned')
  }
  assert.deepEqual(keysOf((await status(owner, orgId)).summary!), ['total_clients', 'with_accepted_quote'])
})

test('the migration closes the function to anon, grants it to authenticated only, pins the search path and uses the one definition of eligibility', () => {
  const file = readFileSync(join(process.cwd(), 'supabase/migrations/20261025101000_hive_feed_status.sql'), 'utf8')
  const sql = file.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n')
  const signature = 'public\\.get_hive_feed_status\\(uuid, uuid\\)'

  assert.match(sql, /create or replace function public\.get_hive_feed_status\(\s*p_organization_id uuid,\s*p_client_id uuid default null\s*\)/)
  assert.match(sql, /\bstable\b/)
  assert.match(sql, /\bsecurity definer\b/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, new RegExp(`revoke execute on function ${signature} from public, anon;`))
  assert.match(sql, new RegExp(`grant execute on function ${signature} to authenticated;`))
  assert.equal((sql.match(/\bgrant\b/g) ?? []).length, 1, 'one grant only')
  assert.match(sql, /errcode = '42501'/)
  assert.match(sql, /public\.is_member_of\(p_organization_id\)/)
  assert.match(sql, /public\.has_role\(p_organization_id, array\['owner', 'admin'\]\)/)

  assert.match(sql, /private\.client_accepted_quotes\(/)
  assert.doesNotMatch(sql, /public\.quotes|'Accepted'|accepted_at/, 'eligibility is not re-derived from the quotes table')
  assert.doesNotMatch(sql, /key_hash|\bk\.name\b/, 'no key hash and no key name is read')
})
