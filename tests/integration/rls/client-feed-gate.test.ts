import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'
import { anonymous, must, quoteRow, setQuote, setupPortalOrg, sha256, type PortalOrg } from './portal-fixtures.ts'

// Quote portal, slice 3: the HIVE client feed and its accepted-quote gate. get_clients_for_api_key is called exactly as
// app/api/v1/clients/route.ts calls it: through an anonymous client with p_key, p_updated_since, p_cursor and p_limit.
// Every key here is the test's own, made with create_client_api_key (service role) for a throwaway organisation: a call
// stamps the key's last_used_at, which tells the owner when HIVE last read the feed, so the real key is never used.
//
// The first group characterises the feed as it is today. It was written, and passed, before the gate's migration and
// must keep passing after it: with the setting at its default the feed is unchanged. The second group is the gate
// (organization_settings.hive_feed_requires_accepted_quote); each of its tests has an organisation of its own, so the
// feed it reads holds exactly the clients it made.

const orgIds: string[] = []
const userIds: string[] = []
let portalFx: PortalOrg | undefined

after(async () => {
  try {
    await portalFx?.teardown()
  } finally {
    await cleanup(orgIds, userIds)
  }
})

const DAY = 86_400_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

const CLIENT_KEYS = [
  'id', 'name', 'status', 'archived', 'industry', 'website', 'contactName', 'contactEmail', 'billingEmail', 'billingAddress', 'vatNumber',
  'contacts', 'createdAt', 'updatedAt',
].sort()
const ADDRESS_KEYS = ['line1', 'line2', 'city', 'postalCode', 'country'].sort()
const CONTACT_KEYS = ['id', 'fullName', 'email', 'phone', 'jobTitle', 'primary'].sort()
const keysOf = (value: object) => Object.keys(value).sort()
const sorted = (values: string[]) => [...values].sort()

type Row = Record<string, any>
type FeedClient = Row & { id: string; updatedAt: string }
type Feed = { clients: FeedClient[]; nextCursor: string | null }
type FeedArgs = { updatedSince?: string | null; cursor?: string | null; limit?: number }

/** One call of the feed, made as the route makes it. Null is the route's 401. */
const feed = async (key: string, { updatedSince = null, cursor = null, limit = 100 }: FeedArgs = {}) => {
  const { data, error } = await anonymous.rpc('get_clients_for_api_key', {
    p_key: key, p_updated_since: updatedSince, p_cursor: cursor, p_limit: limit,
  })
  assert.equal(error, null, error?.message)
  return data as Feed | null
}
const read = async (key: string, args: FeedArgs = {}) => {
  const page = await feed(key, args)
  assert.ok(page, 'the key is accepted')
  return page
}
/** Every page from the start, following nextCursor until it is null. */
const pages = async (key: string, limit: number) => {
  const result: Feed[] = []
  let cursor: string | null = null
  do {
    const page: Feed = await read(key, { cursor, limit })
    result.push(page)
    cursor = page.nextCursor
    assert.ok(result.length <= 10, 'paging ends')
  } while (cursor !== null)
  return result
}
const ids = (page: Feed) => page.clients.map((client) => client.id)

/** A key made by the operator function; only its hash is stored, so its row is found by the hash. */
const newKey = async (orgId: string) => {
  const key = must(await admin.rpc('create_client_api_key', { p_organization_id: orgId, p_name: 'RLS feed test' })) as string
  const row = must(await admin.from('client_api_keys').select('id').eq('key_hash', sha256(key)).single())
  return { key, keyId: row.id as string }
}
const keyRow = async (id: string) => must(await admin.from('client_api_keys').select('*').eq('id', id).single()) as Row

type FeedOrg = { orgId: string; key: string; keyId: string }
/** A throwaway organisation with a settings row (every setting at its default) and its own feed key. */
const feedOrg = async (label: string): Promise<FeedOrg> => {
  const orgId = await createFixtureOrg(label)
  orgIds.push(orgId)
  must(await admin.from('organization_settings').insert({ organization_id: orgId, legal_name: `Feed ${label} (Pty) Ltd` }).select('id').single())
  return { orgId, ...(await newKey(orgId)) }
}
/** A client written by the service role. Its own updated_at can be set on insert: only an update moves it. */
const addClient = async (orgId: string, fields: Row = {}) =>
  must(await admin.from('clients').insert({ organization_id: orgId, name: `Feed client ${randomUUID().slice(0, 8)}`, status: 'Active', ...fields })
    .select('*').single()) as Row
const clientRow = async (id: string) => must(await admin.from('clients').select('*').eq('id', id).single()) as Row
/**
 * A quote written by the service role, which may insert any status; an explicit accepted_at is kept on insert. Only a
 * draft gets a draft number, so any other status is given a number of its own.
 */
const addQuote = async (orgId: string, client: Row, status: string, fields: Row = {}) =>
  must(await admin.from('quotes').insert({
    organization_id: orgId, client_id: client.id, client_name: client.name, status,
    ...(status === 'Draft' ? {} : { quote_number: `FG-${randomUUID().slice(0, 8)}` }), ...fields,
  }).select('*').single()) as Row
/** Turns the gate on or off for an organisation through the service role (who else may is the first gate test's subject). */
const setGate = async (orgId: string, on: boolean) => {
  const { data, error } = await admin.from('organization_settings').update({ hive_feed_requires_accepted_quote: on })
    .eq('organization_id', orgId).select('hive_feed_requires_accepted_quote')
  assert.equal(error, null, error?.message)
  assert.deepEqual(data, [{ hive_feed_requires_accepted_quote: on }])
}

// ---------------------------------------------------------------------------------------------------------------------
// Characterisation: one organisation with five clients a day apart (one archived, one with every field and a contact),
// a second organisation with a client of its own, a live key and a revoked key.
// ---------------------------------------------------------------------------------------------------------------------

let main: FeedOrg
let mainRows: Row[]
let fullRow: Row
let archivedRow: Row
let contactRow: Row
let otherClientId: string
let revoked: { key: string; keyId: string }

before(async () => {
  main = await feedOrg('feed')
  const at = (days: number) => ({ created_at: ago(days * DAY), updated_at: ago(days * DAY) })
  fullRow = await addClient(main.orgId, {
    name: 'Feed Full Client', industry: 'Mining', website: 'https://full.example.test', contact_name: 'Fiona Full',
    contact_email: 'fiona@full.example.test', billing_email: 'accounts@full.example.test', address_line1: '1 Main Road',
    address_line2: 'Suite 2', city: 'Johannesburg', postal_code: '2001', country: 'South Africa', vat_number: '4123456789', ...at(5),
  })
  contactRow = must(await admin.from('contacts').insert({
    organization_id: main.orgId, client_id: fullRow.id, full_name: 'Paula Primary', email: 'paula@full.example.test', phone: '+27 11 555 0100',
    job_title: 'Finance Director', is_primary: true,
  }).select('*').single()) as Row
  archivedRow = await addClient(main.orgId, { name: 'Feed Archived Client', archived_at: ago(3 * DAY), ...at(3) })
  mainRows = [
    fullRow,
    await addClient(main.orgId, { name: 'Feed Client Four', ...at(4) }),
    archivedRow,
    await addClient(main.orgId, { name: 'Feed Client Two', ...at(2) }),
    await addClient(main.orgId, { name: 'Feed Client One', ...at(1) }),
  ]

  const otherOrg = await createFixtureOrg('feed-other')
  orgIds.push(otherOrg)
  otherClientId = (await addClient(otherOrg, { name: 'Feed Client One' })).id

  revoked = await newKey(main.orgId)
  assert.equal((await admin.rpc('revoke_client_api_key', { p_key_id: revoked.keyId })).error, null)
})

test("with the setting at its default every client of the key's organisation is returned in id order with exactly the documented keys", async () => {
  const page = await read(main.key)
  assert.deepEqual(keysOf(page), ['clients', 'nextCursor'])
  assert.equal(page.nextCursor, null)
  assert.deepEqual(ids(page), sorted(mainRows.map((row) => row.id)), "the organisation's five clients, in id order")
  assert.ok(!ids(page).includes(otherClientId), "the other organisation's client is not returned")

  for (const client of page.clients) {
    const row = mainRows.find((candidate) => candidate.id === client.id)!
    assert.deepEqual(keysOf(client), CLIENT_KEYS)
    assert.deepEqual(keysOf(client.billingAddress), ADDRESS_KEYS)
    assert.equal(client.archived, row.id === archivedRow.id, 'only the archived client is archived')
    assert.equal(client.updatedAt, row.updated_at, "updatedAt is the client's own updated_at")
    assert.equal(client.createdAt, row.created_at)
    if (row.id !== fullRow.id) assert.deepEqual(client.contacts, [])
  }

  assert.deepEqual(page.clients.find((client) => client.id === fullRow.id), {
    id: fullRow.id,
    name: 'Feed Full Client',
    status: 'Active',
    archived: false,
    industry: 'Mining',
    website: 'https://full.example.test',
    contactName: 'Fiona Full',
    contactEmail: 'fiona@full.example.test',
    billingEmail: 'accounts@full.example.test',
    billingAddress: { line1: '1 Main Road', line2: 'Suite 2', city: 'Johannesburg', postalCode: '2001', country: 'South Africa' },
    vatNumber: '4123456789',
    contacts: [{
      id: contactRow.id, fullName: 'Paula Primary', email: 'paula@full.example.test', phone: '+27 11 555 0100', jobTitle: 'Finance Director',
      primary: true,
    }],
    createdAt: fullRow.created_at,
    updatedAt: fullRow.updated_at,
  })
  assert.deepEqual(keysOf(page.clients.find((client) => client.id === fullRow.id)!.contacts[0]), CONTACT_KEYS)
})

test('updated_since keeps clients whose own updated_at is at or after it', async () => {
  const oldestFirst = [...mainRows].sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
  const cutoff = oldestFirst[2].updated_at as string

  const atOrAfter = await read(main.key, { updatedSince: cutoff })
  assert.deepEqual(ids(atOrAfter), sorted(oldestFirst.slice(2).map((row) => row.id)), 'a client updated exactly at the cutoff is kept')
  for (const client of atOrAfter.clients) {
    assert.equal(client.updatedAt, mainRows.find((row) => row.id === client.id)!.updated_at)
  }

  const justAfter = new Date(Date.parse(cutoff) + 1).toISOString()
  assert.deepEqual(ids(await read(main.key, { updatedSince: justAfter })), sorted(oldestFirst.slice(3).map((row) => row.id)))
  assert.deepEqual(await read(main.key, { updatedSince: new Date(Date.now() + DAY).toISOString() }), { clients: [], nextCursor: null })
})

test('a limit pages by id and nextCursor is null exactly at the end', async () => {
  const all = sorted(mainRows.map((row) => row.id))

  const byTwo = await pages(main.key, 2)
  assert.deepEqual(byTwo.map(ids), [all.slice(0, 2), all.slice(2, 4), all.slice(4)], 'pages of 2, 2 and 1, with no repeats')
  assert.deepEqual(byTwo.map((page) => page.nextCursor), [all[1], all[3], null])

  const byFive = await pages(main.key, 5)
  assert.deepEqual(byFive.map(ids), [all], 'a page that holds exactly the rest has no next cursor')
  assert.equal(byFive[0].nextCursor, null)

  assert.deepEqual(ids(await read(main.key, { cursor: all[2] })), all.slice(3), 'a cursor starts after the given id')
})

test("an unknown, an empty and a revoked key give null, and a live key's last_used_at is stamped", async () => {
  assert.equal(await feed(`unk_${randomBytes(32).toString('hex')}`), null)
  assert.equal(await feed(''), null)
  assert.equal(await feed(revoked.key), null)
  const revokedAfter = await keyRow(revoked.keyId)
  assert.notEqual(revokedAfter.revoked_at, null)
  assert.equal(revokedAfter.last_used_at, null, 'a refused key is not stamped')

  const stampedBefore = (await keyRow(main.keyId)).last_used_at as string | null
  await read(main.key)
  const stamped = (await keyRow(main.keyId)).last_used_at as string | null
  assert.notEqual(stamped, null)
  assert.notEqual(stamped, stampedBefore, 'the call moves last_used_at')
  assert.ok(Math.abs(Date.parse(stamped!) - Date.now()) < 5 * 60_000, 'last_used_at is the time of the call')
})

// ---------------------------------------------------------------------------------------------------------------------
// The gate: with the setting on, a client is in the feed only while it has a non-archived Accepted quote in the same
// organisation, and its time in the feed is the later of its own updated_at and its latest acceptance.
// ---------------------------------------------------------------------------------------------------------------------

test('the setting is false by default; a member cannot change it and an owner and an admin can', async () => {
  const org = await feedOrg('feed-setting')
  const setting = async () => must(await admin.from('organization_settings').select('hive_feed_requires_accepted_quote')
    .eq('organization_id', org.orgId).single()).hive_feed_requires_accepted_quote as boolean
  assert.equal(await setting(), false, 'a settings row written without it has the gate off')

  const signedIn = async (role: 'owner' | 'admin' | 'member') => {
    const user = await createFixtureUser(org.orgId, role)
    userIds.push(user.id)
    return signedInClient(user.email, user.password)
  }
  const member = await signedIn('member')
  const owner = await signedIn('owner')
  const orgAdmin = await signedIn('admin')
  const change = (client: typeof member, on: boolean) => client.from('organization_settings').update({ hive_feed_requires_accepted_quote: on })
    .eq('organization_id', org.orgId).select('hive_feed_requires_accepted_quote')

  const byMember = await change(member, true)
  assert.ok(byMember.error !== null || byMember.data?.length === 0, 'the member changes no row')
  assert.equal(await setting(), false)

  const byOwner = await change(owner, true)
  assert.equal(byOwner.error, null)
  assert.deepEqual(byOwner.data, [{ hive_feed_requires_accepted_quote: true }])
  assert.equal(await setting(), true)

  const byAdmin = await change(orgAdmin, false)
  assert.equal(byAdmin.error, null)
  assert.deepEqual(byAdmin.data, [{ hive_feed_requires_accepted_quote: false }])
  assert.equal(await setting(), false)
})

test('with the setting on only clients with a non-archived Accepted quote are returned', async () => {
  // The portal fixture: its member sends a quote through the real send_quote and then marks it Accepted by hand.
  portalFx = await setupPortalOrg('feed-gate')
  const fx = portalFx
  const { key } = await newKey(fx.orgId)

  const byHand = await fx.sentQuote()
  await fx.setStatus(byHand, 'Accepted')
  const handQuote = await quoteRow(byHand)
  assert.equal(handQuote.status, 'Accepted')
  assert.notEqual(handQuote.accepted_at, null)

  const inserted = await addClient(fx.orgId, { name: 'Gate Inserted Accepted' })
  await addQuote(fx.orgId, inserted, 'Accepted', { accepted_at: ago(DAY) })

  const moved = await addClient(fx.orgId, { name: 'Gate Service Accepted' })
  const movedQuote = await addQuote(fx.orgId, moved, 'Sent')
  await setQuote(movedQuote.id, { status: 'Accepted' })
  assert.notEqual((await quoteRow(movedQuote.id)).accepted_at, null)

  const ineligible: string[] = []
  for (const status of ['Sent', 'Declined', 'Expired', 'Superseded', 'Draft']) {
    const client = await addClient(fx.orgId, { name: `Gate ${status} Only` })
    assert.equal((await addQuote(fx.orgId, client, status)).status, status)
    ineligible.push(client.id)
  }
  const archivedAccepted = await addClient(fx.orgId, { name: 'Gate Archived Accepted' })
  await addQuote(fx.orgId, archivedAccepted, 'Accepted', { accepted_at: ago(DAY), archived_at: ago(DAY / 2) })
  // No quote of its own: every Accepted quote in the organisation belongs to another client.
  const noQuote = await addClient(fx.orgId, { name: 'Gate No Quote' })
  // Another organisation has a client of the same name with an Accepted quote.
  const sameName = await addClient(fx.orgId, { name: 'Gate Same Name' })
  const otherOrg = await createFixtureOrg('feed-gate-other')
  orgIds.push(otherOrg)
  const otherClient = await addClient(otherOrg, { name: 'Gate Same Name' })
  await addQuote(otherOrg, otherClient, 'Accepted', { accepted_at: ago(DAY) })
  ineligible.push(archivedAccepted.id, noQuote.id, sameName.id)

  const eligible = [fx.clientId, inserted.id, moved.id]
  assert.deepEqual(ids(await read(key)), sorted([...eligible, ...ineligible]), 'with the setting off every client is returned')

  await setGate(fx.orgId, true)
  const gated = await read(key)
  assert.deepEqual(ids(gated), sorted(eligible), 'Accepted by hand, inserted Accepted and moved to Accepted count; nothing else does')
  assert.equal(gated.nextCursor, null)
})

test('an Accepted quote moved back to Sent makes its client leave the feed; moved forward again it returns', async () => {
  const org = await feedOrg('feed-revert')
  const client = await addClient(org.orgId, { name: 'Revert Client', created_at: ago(3 * DAY), updated_at: ago(3 * DAY) })
  const quote = await addQuote(org.orgId, client, 'Accepted', { accepted_at: ago(2 * DAY) })
  const control = await addClient(org.orgId, { name: 'Revert Control' })
  await addQuote(org.orgId, control, 'Accepted', { accepted_at: ago(DAY) })
  await setGate(org.orgId, true)
  assert.deepEqual(ids(await read(org.key)), sorted([client.id, control.id]))

  await setQuote(quote.id, { status: 'Sent' })
  assert.equal((await quoteRow(quote.id)).accepted_at, null)
  assert.deepEqual(ids(await read(org.key)), [control.id], 'moved back to Sent, the client leaves the feed')

  await setQuote(quote.id, { status: 'Accepted' })
  const acceptedAgain = (await quoteRow(quote.id)).accepted_at as string
  assert.notEqual(acceptedAgain, null)
  const back = await read(org.key)
  assert.deepEqual(ids(back), sorted([client.id, control.id]), 'Accepted again, it returns')
  assert.equal(back.clients.find((row) => row.id === client.id)!.updatedAt, acceptedAgain, 'its time in the feed is the new acceptance')
})

test("a client accepted after HIVE's last pull is returned by an updated_since pull even though its own row did not change, with updatedAt equal to the acceptance time; with the setting off that pull does not return it", async () => {
  const org = await feedOrg('feed-incremental')
  const lastPull = ago(DAY)
  const late = await addClient(org.orgId, { name: 'Accepted After Pull', created_at: ago(3 * DAY), updated_at: ago(2 * DAY) })
  const lateQuote = await addQuote(org.orgId, late, 'Accepted', { accepted_at: ago(DAY / 24) })
  const early = await addClient(org.orgId, { name: 'Accepted Before Pull', created_at: ago(3 * DAY), updated_at: ago(2 * DAY) })
  await addQuote(org.orgId, early, 'Accepted', { accepted_at: ago(1.5 * DAY) })
  assert.equal((await clientRow(late.id)).updated_at, late.updated_at, "writing the quote did not change the client's row")
  assert.ok(Date.parse(late.updated_at) < Date.parse(lastPull) && Date.parse(lateQuote.accepted_at) > Date.parse(lastPull))

  const emptyPull = { clients: [], nextCursor: null }
  assert.deepEqual(await read(org.key, { updatedSince: lastPull }), emptyPull, 'with the setting off the pull does not return it')

  await setGate(org.orgId, true)
  const pull = await read(org.key, { updatedSince: lastPull })
  assert.deepEqual(ids(pull), [late.id], 'only the client accepted after the pull')
  assert.equal(pull.clients[0].updatedAt, lateQuote.accepted_at, 'its updatedAt is the acceptance time')

  await setGate(org.orgId, false)
  assert.deepEqual(await read(org.key, { updatedSince: lastPull }), emptyPull, 'with the setting off again the pull does not return it')
})

test("updatedAt is the later of the client's updated_at and its latest accepted_at, and the response keys are identical to the setting-off keys", async () => {
  const org = await feedOrg('feed-updated-at')
  // Edited after its acceptance: its own updated_at is the later.
  const edited = await addClient(org.orgId, {
    name: 'Edited After Acceptance', contact_name: 'Eddie Edited', address_line1: '9 Side Street', created_at: ago(5 * DAY), updated_at: ago(DAY / 2),
  })
  must(await admin.from('contacts').insert({
    organization_id: org.orgId, client_id: edited.id, full_name: 'Erin Contact', email: 'erin@edited.example.test', is_primary: true,
  }).select('id').single())
  await addQuote(org.orgId, edited, 'Accepted', { accepted_at: ago(3 * DAY) })
  // Accepted twice since its last edit: the later acceptance is its time. An archived acceptance after both does not count.
  const accepted = await addClient(org.orgId, { name: 'Accepted Since Edit', created_at: ago(5 * DAY), updated_at: ago(5 * DAY) })
  await addQuote(org.orgId, accepted, 'Accepted', { accepted_at: ago(2 * DAY) })
  const latest = await addQuote(org.orgId, accepted, 'Accepted', { accepted_at: ago(DAY) })
  await addQuote(org.orgId, accepted, 'Accepted', { accepted_at: ago(DAY / 24), archived_at: ago(DAY / 48) })
  const notEligible = await addClient(org.orgId, { name: 'Never Accepted' })

  const off = await read(org.key)
  assert.deepEqual(ids(off), sorted([edited.id, accepted.id, notEligible.id]))
  await setGate(org.orgId, true)
  const on = await read(org.key)
  assert.deepEqual(keysOf(on), keysOf(off))
  assert.deepEqual(ids(on), sorted([edited.id, accepted.id]))

  for (const client of on.clients) {
    const before = off.clients.find((row) => row.id === client.id)!
    assert.deepEqual(keysOf(client), CLIENT_KEYS)
    assert.deepEqual(keysOf(client), keysOf(before))
    assert.deepEqual(keysOf(client.billingAddress), keysOf(before.billingAddress))
    assert.deepEqual(client.contacts.map(keysOf), before.contacts.map(keysOf))
    assert.deepEqual({ ...client, updatedAt: null }, { ...before, updatedAt: null }, 'every field but updatedAt is unchanged')
  }
  assert.equal(on.clients.find((row) => row.id === edited.id)!.contacts.length, 1)
  assert.deepEqual(keysOf(on.clients.find((row) => row.id === edited.id)!.contacts[0]), CONTACT_KEYS)

  assert.equal(on.clients.find((row) => row.id === edited.id)!.updatedAt, edited.updated_at, 'edited after its acceptance: its own updated_at')
  assert.equal(on.clients.find((row) => row.id === accepted.id)!.updatedAt, latest.accepted_at, 'accepted since its edit: its latest acceptance')
  assert.equal(off.clients.find((row) => row.id === accepted.id)!.updatedAt, accepted.updated_at, 'with the setting off: its own updated_at')
})

test('cursor paging across a mix of eligible and ineligible clients returns every eligible client once and nextCursor is null at the end', async () => {
  const org = await feedOrg('feed-paging')
  // Ids chosen in order so the ineligible clients sit between eligible ones and at the very end.
  const ordered = sorted(Array.from({ length: 6 }, () => randomUUID()))
  const eligible = [ordered[0], ordered[2], ordered[3], ordered[4]]
  for (const [index, id] of ordered.entries()) {
    const client = await addClient(org.orgId, { id, name: `Paging Client ${index + 1}` })
    if (eligible.includes(id)) await addQuote(org.orgId, client, 'Accepted', { accepted_at: ago(DAY) })
    else if (index === 1) await addQuote(org.orgId, client, 'Sent')
  }
  await setGate(org.orgId, true)

  const byTwo = await pages(org.key, 2)
  assert.deepEqual(byTwo.map(ids), [[ordered[0], ordered[2]], [ordered[3], ordered[4]]])
  assert.deepEqual(byTwo.map((page) => page.nextCursor), [ordered[2], null], 'no cursor after the last eligible client')

  const byThree = await pages(org.key, 3)
  assert.deepEqual(byThree.map(ids), [[ordered[0], ordered[2], ordered[3]], [ordered[4]]])
  assert.deepEqual(byThree.map((page) => page.nextCursor), [ordered[3], null])

  assert.deepEqual([...byTwo, ...byThree].flatMap(ids).filter((id) => !eligible.includes(id)), [], 'no ineligible client on any page')
})

test('turning the setting off again restores the full feed', async () => {
  const org = await feedOrg('feed-restore')
  const eligible = await addClient(org.orgId, { name: 'Restore Eligible', created_at: ago(4 * DAY), updated_at: ago(3 * DAY) })
  await addQuote(org.orgId, eligible, 'Accepted', { accepted_at: ago(DAY) })
  await addClient(org.orgId, { name: 'Restore Other' })
  await addClient(org.orgId, { name: 'Restore Archived', archived_at: ago(DAY) })

  const original = await read(org.key)
  assert.equal(original.clients.length, 3)
  await setGate(org.orgId, true)
  assert.deepEqual(ids(await read(org.key)), [eligible.id])
  await setGate(org.orgId, false)
  assert.deepEqual(await read(org.key), original, 'the same clients, fields and times as before the setting was turned on')
})
