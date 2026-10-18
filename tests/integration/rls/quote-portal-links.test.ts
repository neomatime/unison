import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

// Quote portal, slice 1, task 2: the functions that create and revoke a client link, revise a quote, supersede the
// original when the revision is sent, and expire quotes nightly; and the guard that keeps "Superseded" automatic.
// Every sent quote here goes out through the real send_quote, so it has a real number; only then does the service
// role move dates or statuses a signed-in member cannot.

type U = { id: string; email: string; password: string }

let orgA: string // company details and the portal switched on
let orgB: string // company details, the portal left off
let memberA: U
let memberB: U
let memberAClient: SupabaseClient
let memberBClient: SupabaseClient
let clientA: string
let clientB: string

const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const refused = (error: { message: string; code?: string } | null, token: string, code?: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
  if (code) assert.equal(error.code, code, `${token} carries errcode ${code}`)
}
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const DAY = 86_400_000
const southAfricanToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' })
const addDays = (isoDate: string, days: number) => new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10)
const quoteRow = async (id: string) => must(await admin.from('quotes').select('*').eq('id', id).single()) as Record<string, any>
const linkRow = async (id: string) => must(await admin.from('quote_access_links').select('*').eq('id', id).single()) as Record<string, any>
const linksOf = async (quoteId: string) => must(await admin.from('quote_access_links').select('*').eq('quote_id', quoteId).order('created_at')) as Array<Record<string, any>>

type Line = { title: string; charge_kind?: 'once_off' | 'monthly' | null }

/** A draft made by a signed-in member, with its lines. */
const draftQuote = async (
  client: SupabaseClient = memberAClient,
  organizationId: string = orgA,
  clientId: string = clientA,
  lines: Line[] = [{ title: 'Advisory' }],
) => {
  const quote = must(await client.from('quotes').insert({ organization_id: organizationId, client_id: clientId, client_name: 'Portal Client' }).select('id').single())
  for (const [index, line] of lines.entries()) {
    const written = await client.from('quote_lines').insert({
      organization_id: organizationId, quote_id: quote.id, position: index + 1, title: line.title, quantity: 1, unit_price: 100, charge_kind: line.charge_kind ?? null,
    })
    assert.equal(written.error, null)
  }
  return quote.id as string
}
const send = (id: string, client: SupabaseClient = memberAClient) => client.rpc('send_quote', { p_id: id })
/** A quote sent through the real send_quote. */
const sentQuote = async (client: SupabaseClient = memberAClient, organizationId: string = orgA, clientId: string = clientA, lines?: Line[]) => {
  const id = await draftQuote(client, organizationId, clientId, lines)
  const { error } = await send(id, client)
  assert.equal(error, null)
  return id
}
const createLink = (quoteId: string, email: string, name: string | null = null, client: SupabaseClient = memberAClient) =>
  client.rpc('create_quote_access_link', { p_quote_id: quoteId, p_recipient_email: email, p_recipient_name: name })
/** A link that must be created; returns its row id and the raw token. */
const newLink = async (quoteId: string, email = 'client@example.test') => {
  const token = must(await createLink(quoteId, email)) as string
  const row = must(await admin.from('quote_access_links').select('id').eq('token_hash', sha256(token)).single())
  return { id: row.id as string, token }
}
const setQuote = async (id: string, change: Record<string, unknown>) => assert.equal((await admin.from('quotes').update(change).eq('id', id)).error, null)

before(async () => {
  orgA = await createFixtureOrg('portal-links-a')
  orgB = await createFixtureOrg('portal-links-b')
  memberA = await createFixtureUser(orgA, 'member')
  memberB = await createFixtureUser(orgB, 'member')
  memberAClient = await signedInClient(memberA.email, memberA.password)
  memberBClient = await signedInClient(memberB.email, memberB.password)
  clientA = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Portal Client A', status: 'Active' }).select('id').single()).id
  clientB = must(await admin.from('clients').insert({ organization_id: orgB, name: 'Portal Client B', status: 'Active' }).select('id').single()).id
  must(await admin.from('organization_settings').insert({ organization_id: orgA, legal_name: 'Portal A (Pty) Ltd', document_prefix: 'PLA', vat_rate: 15, quote_portal_enabled: true }).select('id').single())
  must(await admin.from('organization_settings').insert({ organization_id: orgB, legal_name: 'Portal B (Pty) Ltd', document_prefix: 'PLB', vat_rate: 15 }).select('id').single())
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [memberA?.id, memberB?.id].filter(Boolean))
})

test('a link is 43 base64url characters and only its sha256 is stored', async () => {
  const quote = await sentQuote()
  const token = must(await createLink(quote, 'client@example.test', 'Pat Client')) as string
  assert.match(token, /^[A-Za-z0-9_-]{43}$/)

  const rows = await linksOf(quote)
  assert.equal(rows.length, 1)
  const row = rows[0]
  assert.equal(row.token_hash, sha256(token), 'the stored hash is the lower-case hex sha256 of the token')
  assert.match(row.token_hash, /^[0-9a-f]{64}$/)
  for (const [column, value] of Object.entries(row)) {
    assert.ok(!JSON.stringify(value ?? null).includes(token), `the raw token is not in ${column}`)
  }
  assert.equal(row.organization_id, orgA)
  assert.equal(row.recipient_name, 'Pat Client')
  assert.equal(row.created_by, memberA.id, 'the creator is the signed-in member')
  assert.equal(row.revoked_at, null)
  assert.equal(row.first_viewed_at, null)

  const again = must(await createLink(quote, 'client@example.test')) as string
  assert.notEqual(again, token, 'every call makes a new token')
})

test('the recipient is lower-cased and the expiry is the start of the next day in South Africa', async () => {
  const quote = await sentQuote()
  const { valid_until: validUntil } = await quoteRow(quote)
  const { id } = await newLink(quote, '  Pat.Client@Example.TEST ')
  const row = await linkRow(id)
  assert.equal(row.recipient_email, 'pat.client@example.test')
  assert.equal(new Date(row.expires_at).getTime(), new Date(`${validUntil}T00:00:00+02:00`).getTime() + DAY)

  const today = southAfricanToday()
  const dueToday = await sentQuote()
  await setQuote(dueToday, { valid_until: today })
  const { id: todayLink } = await newLink(dueToday)
  assert.equal(new Date((await linkRow(todayLink)).expires_at).getTime(), new Date(`${today}T00:00:00+02:00`).getTime() + DAY,
    'a quote valid until today stays reachable until midnight South African time')

  const dueYesterday = await sentQuote()
  await setQuote(dueYesterday, { valid_until: addDays(today, -1) })
  refused((await createLink(dueYesterday, 'client@example.test')).error, 'QUOTE_EXPIRED')
  assert.equal((await linksOf(dueYesterday)).length, 0)

  const undated = await sentQuote()
  await setQuote(undated, { valid_until: null })
  const createdAt = Date.now()
  const { id: undatedLink } = await newLink(undated)
  const expires = new Date((await linkRow(undatedLink)).expires_at).getTime()
  assert.ok(Math.abs(expires - (createdAt + 30 * DAY)) < 2 * 60_000, 'without a valid-until date a link lasts 30 days')
})

test('creation is refused when the switch is off, the quote is not Sent, the address is invalid, or the caller belongs to another organisation', async () => {
  const quote = await sentQuote()

  assert.equal((await admin.from('organization_settings').update({ quote_portal_enabled: false }).eq('organization_id', orgA)).error, null)
  try {
    refused((await createLink(quote, 'client@example.test')).error, 'QUOTE_PORTAL_OFF')
  } finally {
    assert.equal((await admin.from('organization_settings').update({ quote_portal_enabled: true }).eq('organization_id', orgA)).error, null)
  }

  refused((await createLink(await draftQuote(), 'client@example.test')).error, 'QUOTE_NOT_SENT')
  const accepted = await sentQuote()
  assert.equal((await memberAClient.from('quotes').update({ status: 'Accepted' }).eq('id', accepted)).error, null)
  refused((await createLink(accepted, 'client@example.test')).error, 'QUOTE_NOT_SENT')

  for (const bad of [
    '', '   ', 'not-an-address', 'a@b', 'a@example', 'two@example.com, three@example.com', 'two@example.com three@example.com',
    'a..b@example.com', '.a@example.com', 'a.@example.com', 'Name <a@example.com>', 'a@example.com\nBcc: x@example.com',
    'a@@example.com', `${'a'.repeat(250)}@example.com`, "a@example.com'; drop table quotes; --",
  ]) {
    refused((await createLink(quote, bad)).error, 'RECIPIENT_INVALID')
  }

  const outsider = await createLink(quote, 'client@example.test', null, memberBClient)
  refused(outsider.error, 'QUOTE_NOT_FOUND', '42501')
  const missing = await createLink(randomUUID(), 'client@example.test')
  refused(missing.error, 'QUOTE_NOT_FOUND', '42501')
  assert.equal(outsider.error?.message, missing.error?.message, 'another organisation cannot tell an existing quote from a missing one')

  const anon = await anonymous.rpc('create_quote_access_link', { p_quote_id: quote, p_recipient_email: 'client@example.test', p_recipient_name: null })
  assert.match(anon.error?.message ?? '', /permission denied/i, 'anon is refused on privilege')

  assert.equal((await linksOf(quote)).length, 0, 'no refused attempt left a link')
  assert.equal((await linksOf(accepted)).length, 0)
})

test('create_quote_access_link refuses an archived quote and leaves no link row', async () => {
  const quote = await sentQuote()
  await setQuote(quote, { archived_at: new Date().toISOString() })
  refused((await createLink(quote, 'client@example.test')).error, 'QUOTE_ARCHIVED_LINK', '23514')
  assert.equal((await linksOf(quote)).length, 0)
})

test('two recipients get two independent active links', async () => {
  const quote = await sentQuote()
  const first = await newLink(quote, 'first@example.test')
  const second = await newLink(quote, 'second@example.test')
  assert.notEqual(first.token, second.token)
  const rows = await linksOf(quote)
  assert.deepEqual(rows.map((row) => row.recipient_email).sort(), ['first@example.test', 'second@example.test'])
  assert.ok(rows.every((row) => row.revoked_at === null), 'both are active')

  assert.equal((await memberAClient.rpc('revoke_quote_access_link', { p_link_id: first.id })).error, null)
  assert.ok((await linkRow(first.id)).revoked_at, 'the first is revoked')
  assert.equal((await linkRow(second.id)).revoked_at, null, 'the second is untouched')
})

test("revoking is idempotent and cannot reach another organisation's link", async () => {
  const quote = await sentQuote()
  const link = await newLink(quote)

  const outsider = await memberBClient.rpc('revoke_quote_access_link', { p_link_id: link.id, p_reason: 'hostile' })
  refused(outsider.error, 'LINK_NOT_FOUND', '42501')
  const missing = await memberAClient.rpc('revoke_quote_access_link', { p_link_id: randomUUID() })
  refused(missing.error, 'LINK_NOT_FOUND', '42501')
  assert.equal(outsider.error?.message, missing.error?.message)
  assert.equal((await linkRow(link.id)).revoked_at, null, "another organisation's attempt changed nothing")

  assert.equal((await memberAClient.rpc('revoke_quote_access_link', { p_link_id: link.id, p_reason: 'wrong address' })).error, null)
  const first = await linkRow(link.id)
  assert.ok(first.revoked_at)
  assert.equal(first.revoked_reason, 'wrong address')

  assert.equal((await memberAClient.rpc('revoke_quote_access_link', { p_link_id: link.id, p_reason: 'second thoughts' })).error, null)
  const second = await linkRow(link.id)
  assert.equal(second.revoked_at, first.revoked_at, 'the original time stands')
  assert.equal(second.revoked_reason, 'wrong address', 'the original reason stands')

  const plain = await newLink(quote, 'other@example.test')
  assert.equal((await memberAClient.rpc('revoke_quote_access_link', { p_link_id: plain.id })).error, null)
  assert.equal((await linkRow(plain.id)).revoked_reason, 'revoked by staff', 'the default reason')

  const anon = await anonymous.rpc('revoke_quote_access_link', { p_link_id: link.id })
  assert.match(anon.error?.message ?? '', /permission denied/i)
})

test('a plain member cannot switch the portal on', async () => {
  const changed = await memberBClient.from('organization_settings').update({ quote_portal_enabled: true }).eq('organization_id', orgB).select('organization_id')
  assert.deepEqual(changed.data, [], 'row level security hides the row from an update')
  const stored = must(await admin.from('organization_settings').select('quote_portal_enabled').eq('organization_id', orgB).single())
  assert.equal(stored.quote_portal_enabled, false)
})

test('revise_quote copies lines with their charge kind and links back', async () => {
  const lines: Line[] = [{ title: 'Set-up', charge_kind: 'once_off' }, { title: 'Retainer', charge_kind: 'monthly' }, { title: 'Legacy', charge_kind: null }]
  const original = await sentQuote(memberAClient, orgA, clientA, lines)
  const { data: revision, error } = await memberAClient.rpc('revise_quote', { p_id: original })
  assert.equal(error, null)
  assert.notEqual(revision, original)

  const copy = await quoteRow(revision)
  assert.equal(copy.status, 'Draft')
  assert.equal(copy.supersedes_quote_id, original)
  assert.match(copy.quote_number, /^DRAFT-[0-9a-f]{8}$/, 'the revision gets its own number when it is sent')
  assert.equal(copy.client_id, clientA)
  const copied = must(await admin.from('quote_lines').select('title, charge_kind').eq('quote_id', revision).order('position')) as Array<Record<string, any>>
  assert.deepEqual(copied, [{ title: 'Set-up', charge_kind: 'once_off' }, { title: 'Retainer', charge_kind: 'monthly' }, { title: 'Legacy', charge_kind: null }])
  assert.equal((await quoteRow(original)).status, 'Sent', 'the original stays Sent until the revision is sent')

  refused((await memberBClient.rpc('revise_quote', { p_id: original })).error, 'QUOTE_NOT_FOUND', '42501')
  const anon = await anonymous.rpc('revise_quote', { p_id: original })
  assert.match(anon.error?.message ?? '', /permission denied/i)
})

test('revise_quote copies service_inclusions, terms_sources, terms_edited and the offerings onto the draft', async () => {
  const original = await sentQuote()
  const sources = [{ template_id: randomUUID(), version_id: randomUUID(), version: 3, target: 'retainer:growth' }]
  await setQuote(original, { service_inclusions: 'Monthly strategy session\nQuarterly review', terms_sources: sources, terms_edited: true })
  const offeringRows = [
    { organization_id: orgA, quote_id: original, position: 1, offering_kind: 'retainer', offering_key: 'growth' },
    { organization_id: orgA, quote_id: original, position: 2, offering_kind: 'support', offering_key: 'website_care' },
  ]
  assert.equal((await admin.from('quote_offerings').insert(offeringRows)).error, null)
  const offeringsOf = async (quoteId: string) =>
    must(await admin.from('quote_offerings').select('id, organization_id, position, offering_kind, offering_key').eq('quote_id', quoteId).order('position')) as Array<Record<string, any>>
  const sourceBefore = await offeringsOf(original)
  const source = await quoteRow(original)

  const revision = must(await memberAClient.rpc('revise_quote', { p_id: original })) as string
  const draft = await quoteRow(revision)
  assert.equal(draft.status, 'Draft')
  assert.equal(draft.service_inclusions, 'Monthly strategy session\nQuarterly review')
  assert.deepEqual(draft.terms_sources, sources)
  assert.equal(draft.terms_edited, true)
  assert.equal(draft.terms, source.terms, 'the terms text comes along as before')

  const copied = await offeringsOf(revision)
  const shape = (rows: Array<Record<string, any>>) => rows.map(({ organization_id, position, offering_kind, offering_key }) => ({ organization_id, position, offering_kind, offering_key }))
  assert.deepEqual(shape(copied), shape(sourceBefore), 'the draft has the same offerings, in the same order')
  assert.ok(copied.every((row) => !sourceBefore.some((other) => other.id === row.id)), 'they are its own rows')
  assert.deepEqual(await offeringsOf(original), sourceBefore, "the source's offerings are unchanged")
  const sourceAfter = await quoteRow(original)
  assert.equal(sourceAfter.service_inclusions, source.service_inclusions)
  assert.deepEqual(sourceAfter.terms_sources, source.terms_sources)
  assert.equal(sourceAfter.terms_edited, true)

  // The plain duplicate keeps its behaviour: the terms text only.
  const duplicate = must(await memberAClient.rpc('duplicate_quote', { p_id: original })) as string
  const plain = await quoteRow(duplicate)
  assert.equal(plain.service_inclusions, null)
  assert.equal(plain.terms_sources, null)
  assert.equal(plain.terms_edited, false)
  assert.deepEqual(await offeringsOf(duplicate), [])
})

test('refuses an Accepted or draft source', async () => {
  refused((await memberAClient.rpc('revise_quote', { p_id: await draftQuote() })).error, 'QUOTE_CANNOT_REVISE')
  const accepted = await sentQuote()
  assert.equal((await memberAClient.from('quotes').update({ status: 'Accepted' }).eq('id', accepted)).error, null)
  refused((await memberAClient.rpc('revise_quote', { p_id: accepted })).error, 'QUOTE_CANNOT_REVISE')
  const superseded = await sentQuote()
  await setQuote(superseded, { status: 'Superseded' })
  refused((await memberAClient.rpc('revise_quote', { p_id: superseded })).error, 'QUOTE_CANNOT_REVISE')

  for (const status of ['Declined', 'Expired']) {
    const source = await sentQuote()
    assert.equal((await memberAClient.from('quotes').update({ status }).eq('id', source)).error, null)
    const { data, error } = await memberAClient.rpc('revise_quote', { p_id: source })
    assert.equal(error, null, `a ${status} quote can be revised`)
    assert.equal((await quoteRow(data)).supersedes_quote_id, source)
  }
})

test('sending the revision supersedes a Sent original and revokes its links', async () => {
  const original = await sentQuote()
  const active = await newLink(original, 'active@example.test')
  const earlier = await newLink(original, 'earlier@example.test')
  assert.equal((await memberAClient.rpc('revoke_quote_access_link', { p_link_id: earlier.id, p_reason: 'wrong address' })).error, null)
  const earlierRevoked = await linkRow(earlier.id)
  const beforeSend = await quoteRow(original)

  const revision = must(await memberAClient.rpc('revise_quote', { p_id: original })) as string
  const { data, error } = await send(revision)
  assert.equal(error, null)
  assert.match(data.number, /^PLA-Q-\d{4}-\d{5}$/)

  const afterSend = await quoteRow(original)
  assert.equal(afterSend.status, 'Superseded')
  assert.equal(afterSend.quote_number, beforeSend.quote_number, 'the original keeps its number')
  assert.equal(afterSend.sent_at, beforeSend.sent_at)
  assert.equal(Number(afterSend.total_amount), Number(beforeSend.total_amount))
  const sent = await quoteRow(revision)
  assert.equal(sent.status, 'Sent')
  assert.equal(sent.supersedes_quote_id, original, 'the revision still points back')

  const revoked = await linkRow(active.id)
  assert.ok(revoked.revoked_at)
  assert.equal(revoked.revoked_reason, 'superseded')
  const untouched = await linkRow(earlier.id)
  assert.equal(untouched.revoked_at, earlierRevoked.revoked_at, 'an already revoked link keeps its time')
  assert.equal(untouched.revoked_reason, 'wrong address', 'and its reason')
  refused((await createLink(original, 'late@example.test')).error, 'QUOTE_NOT_SENT')
})

test('an Accepted, Declined or Expired original keeps its status when its revision is sent', async () => {
  for (const status of ['Accepted', 'Declined', 'Expired']) {
    const original = await sentQuote()
    const link = await newLink(original)
    // An Accepted quote cannot be revised, so its revision is made while it is still Sent.
    const revision = must(await memberAClient.rpc('revise_quote', { p_id: original })) as string
    assert.equal((await memberAClient.from('quotes').update({ status }).eq('id', original)).error, null)
    assert.equal((await send(revision)).error, null)
    assert.equal((await quoteRow(original)).status, status, `the ${status} original keeps its status`)
    assert.equal((await linkRow(link.id)).revoked_at, null, `the ${status} original's link is left alone`)
    const sent = await quoteRow(revision)
    assert.equal(sent.status, 'Sent')
    assert.equal(sent.supersedes_quote_id, original, 'the revision still points back')
  }
})

test("mark_expired_quotes expires only this organisation's overdue Sent quotes and revokes their links", async () => {
  const today = southAfricanToday()
  const yesterday = addDays(today, -1)

  const overdue = await sentQuote()
  const overdueLink = await newLink(overdue)
  await setQuote(overdue, { valid_until: yesterday })
  const dueToday = await sentQuote()
  await setQuote(dueToday, { valid_until: today })
  const accepted = await sentQuote()
  assert.equal((await memberAClient.from('quotes').update({ status: 'Accepted' }).eq('id', accepted)).error, null)
  await setQuote(accepted, { valid_until: yesterday })
  const archived = await sentQuote()
  await setQuote(archived, { valid_until: yesterday, archived_at: new Date().toISOString() })

  const otherOrg = await sentQuote(memberBClient, orgB, clientB)
  await setQuote(otherOrg, { valid_until: yesterday })
  const otherLink = must(await admin.from('quote_access_links').insert({
    organization_id: orgB, quote_id: otherOrg, token_hash: sha256(randomUUID()), recipient_email: 'b@example.test', expires_at: new Date(Date.now() + DAY).toISOString(),
  }).select('id').single()).id as string

  const due = must(await admin.from('quotes').select('id').eq('organization_id', orgA).eq('status', 'Sent').is('archived_at', null).lt('valid_until', today)) as Array<{ id: string }>
  assert.ok(due.some((row) => row.id === overdue))

  const { data: count, error } = await admin.rpc('mark_expired_quotes', { p_organization_id: orgA })
  assert.equal(error, null)
  assert.equal(count, due.length, 'the count is the number of quotes expired')
  for (const row of due) assert.equal((await quoteRow(row.id)).status, 'Expired')

  const expiredLink = await linkRow(overdueLink.id)
  assert.ok(expiredLink.revoked_at)
  assert.equal(expiredLink.revoked_reason, 'expired')
  assert.equal((await quoteRow(dueToday)).status, 'Sent', 'a quote valid until today is not expired')
  assert.equal((await quoteRow(accepted)).status, 'Accepted')
  assert.equal((await quoteRow(archived)).status, 'Sent', 'an archived quote is left alone')
  assert.equal((await quoteRow(otherOrg)).status, 'Sent', 'another organisation is left alone')
  assert.equal((await linkRow(otherLink)).revoked_at, null)

  const again = await admin.rpc('mark_expired_quotes', { p_organization_id: orgA })
  assert.equal(again.error, null)
  assert.equal(again.data, 0, 'a second run finds nothing')
})

// mark_expired_quotes is for pg_cron and the service role only.
test('a member cannot call it', async () => {
  const overdue = await sentQuote()
  await setQuote(overdue, { valid_until: addDays(southAfricanToday(), -1) })
  for (const client of [memberAClient, anonymous]) {
    const result = await client.rpc('mark_expired_quotes', { p_organization_id: orgA })
    assert.ok(result.error, 'refused')
    assert.match(result.error.message, /permission denied/i, 'refused on privilege')
  }
  assert.equal((await quoteRow(overdue)).status, 'Sent', 'nothing was expired')
})

test('duplicate_quote keeps charge_kind', async () => {
  const source = await draftQuote(memberAClient, orgA, clientA, [{ title: 'Build', charge_kind: 'once_off' }, { title: 'Support', charge_kind: 'monthly' }, { title: 'Old', charge_kind: null }])
  const { data, error } = await memberAClient.rpc('duplicate_quote', { p_id: source })
  assert.equal(error, null)
  const copied = must(await admin.from('quote_lines').select('title, charge_kind').eq('quote_id', data).order('position')) as Array<Record<string, any>>
  assert.deepEqual(copied, [{ title: 'Build', charge_kind: 'once_off' }, { title: 'Support', charge_kind: 'monthly' }, { title: 'Old', charge_kind: null }])
  assert.equal((await quoteRow(data)).supersedes_quote_id, null, 'a plain duplicate is not a revision')
  refused((await memberBClient.rpc('duplicate_quote', { p_id: source })).error, 'QUOTE_NOT_FOUND', '42501')
  const anon = await anonymous.rpc('duplicate_quote', { p_id: source })
  assert.match(anon.error?.message ?? '', /permission denied/i, 'anon is still refused after the function was replaced')
})

test('a signed-in member cannot change supersedes_quote_id once a quote has gone out', async () => {
  const other = await sentQuote()
  const sent = await sentQuote()
  refused((await memberAClient.from('quotes').update({ supersedes_quote_id: other }).eq('id', sent)).error, 'QUOTE_SUPERSEDED_AUTOMATIC', '23514')
  const accepted = await sentQuote()
  assert.equal((await memberAClient.from('quotes').update({ status: 'Accepted' }).eq('id', accepted)).error, null)
  refused((await memberAClient.from('quotes').update({ supersedes_quote_id: other }).eq('id', accepted)).error, 'QUOTE_SUPERSEDED_AUTOMATIC', '23514')

  const revision = must(await memberAClient.rpc('revise_quote', { p_id: other })) as string
  assert.equal((await send(revision)).error, null)
  refused((await memberAClient.from('quotes').update({ supersedes_quote_id: null }).eq('id', revision)).error, 'QUOTE_SUPERSEDED_AUTOMATIC', '23514')
  assert.equal((await quoteRow(revision)).supersedes_quote_id, other, 'a sent revision keeps its pointer')
  assert.equal((await quoteRow(sent)).supersedes_quote_id, null)
  assert.equal((await quoteRow(accepted)).supersedes_quote_id, null)
})

test('a signed-in member cannot set a quote to Superseded or move a Superseded quote back', async () => {
  const sent = await sentQuote()
  refused((await memberAClient.from('quotes').update({ status: 'Superseded' }).eq('id', sent)).error, 'QUOTE_SUPERSEDED_AUTOMATIC', '23514')
  assert.equal((await quoteRow(sent)).status, 'Sent')

  const superseded = await sentQuote()
  await setQuote(superseded, { status: 'Superseded' })
  for (const status of ['Sent', 'Accepted', 'Declined', 'Expired']) {
    refused((await memberAClient.from('quotes').update({ status }).eq('id', superseded)).error, 'QUOTE_SUPERSEDED_AUTOMATIC', '23514')
  }
  assert.equal((await quoteRow(superseded)).status, 'Superseded')
  assert.equal((await memberAClient.from('quotes').update({ notes: 'still a note' }).eq('id', superseded)).error, null, 'notes on a superseded quote can still change')
})

test('the service role, the supersede trigger and a draft are not held to the guard', async () => {
  const other = await sentQuote()
  const sent = await sentQuote()
  await setQuote(sent, { supersedes_quote_id: other })
  await setQuote(sent, { status: 'Superseded' })
  await setQuote(sent, { status: 'Sent' })
  const ground = await quoteRow(sent)
  assert.equal(ground.status, 'Sent')
  assert.equal(ground.supersedes_quote_id, other)

  // A member may point their own draft at the quote it replaces; sending it then supersedes the original
  // through the definer trigger, which the guard does not stop.
  const original = await sentQuote()
  const link = await newLink(original)
  const draft = await draftQuote()
  assert.equal((await memberAClient.from('quotes').update({ supersedes_quote_id: original }).eq('id', draft)).error, null)
  assert.equal((await memberAClient.from('quotes').update({ supersedes_quote_id: null }).eq('id', draft)).error, null, 'and change it again while it is a draft')
  assert.equal((await memberAClient.from('quotes').update({ supersedes_quote_id: original }).eq('id', draft)).error, null)
  assert.equal((await send(draft)).error, null)
  assert.equal((await quoteRow(original)).status, 'Superseded')
  assert.equal((await linkRow(link.id)).revoked_reason, 'superseded')
})
