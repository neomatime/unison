import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

// Quote portal, slice 1, task 3: the read side an unauthenticated link holder reaches, through the service role
// only. portal_get_quote returns the frozen quote for a valid link (or exactly { state: 'invalid' }), and never
// writes; portal_record_view stamps the link's viewed times and touches nothing else; private.quote_snapshot is
// the frozen record both share. Fixtures follow quote-portal-links.test.ts: every quote goes out through the real
// send_quote and every link through the real create_quote_access_link; the service role only moves what a member
// cannot (dates, archiving, pointers).

type U = { id: string; email: string; password: string }

let orgA: string
let memberA: U
let memberAClient: SupabaseClient
let clientA: string
let otherClientA: string // a second client of orgA
let ownerA: string // a team member of orgA who owns a quote

const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const DAY = 86_400_000
const southAfricanToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' })
const addDays = (isoDate: string, days: number) => new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10)
const time = (value: string | null) => (value === null ? null : new Date(value).getTime())
const keysOf = (value: Record<string, unknown>) => Object.keys(value).sort()

const quoteRow = async (id: string) => must(await admin.from('quotes').select('*').eq('id', id).single()) as Record<string, any>
const linkRow = async (id: string) => must(await admin.from('quote_access_links').select('*').eq('id', id).single()) as Record<string, any>
const lineRows = async (quoteId: string) => must(await admin.from('quote_lines').select('*').eq('quote_id', quoteId).order('position')) as Array<Record<string, any>>
const auditCount = async (quoteId: string) => {
  const { count, error } = await admin.from('audit_events').select('id', { count: 'exact', head: true }).eq('resource', 'quotes').eq('resource_id', quoteId)
  assert.equal(error, null)
  return count
}

const RECORD_KEYS = [
  'quote_number', 'status', 'issue_date', 'valid_until', 'currency', 'client_name', 'contact_name', 'client_ref', 'project_name',
  'project_description', 'project_ref', 'vat_rate', 'subtotal', 'tax_amount', 'total_amount', 'terms', 'service_inclusions',
  'terms_sources', 'bill_to', 'issuer', 'sent_at', 'accepted_at',
].sort()
const LINE_KEYS = ['id', 'position', 'title', 'description', 'quantity', 'unit_price', 'vat_code', 'line_amount', 'charge_kind'].sort()
const RESULT_KEYS = ['state', 'expires_at', 'recipient_email', 'recipient_name', 'record', 'lines', 'version', 'replaces_number', 'owner'].sort()
// Expired and superseded (Ruling 18): no lines, no recipient and no link expiry.
const SHORT_RESULT_KEYS = ['state', 'record', 'version', 'replaces_number', 'owner'].sort()
const SHORT_RECORD_KEYS = ['client_name', 'quote_number', 'valid_until']
const FORBIDDEN_KEYS = ['organization_id', 'owner_id', 'notes', 'token_hash', 'client_id', 'quote_id']
const DEFAULT_TERMS = 'Portal read terms: payment within 30 days of acceptance.'

/** Every key in the JSON that names an id, with its path. */
const idKeys = (value: unknown, path = ''): string[] => {
  if (Array.isArray(value)) return value.flatMap((item, index) => idKeys(item, `${path}[${index}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => [...(/(^id$|_id$|Id$)/.test(key) ? [`${path}.${key}`] : []), ...idKeys(inner, `${path}.${key}`)])
  }
  return []
}

type Line = { title: string; position?: number; charge_kind?: 'once_off' | 'monthly' | null; description?: string }

/** A draft made by a signed-in member, with its lines. */
const draftQuote = async (fields: Record<string, unknown> = {}, lines: Line[] = [{ title: 'Advisory' }]) => {
  const quote = must(await memberAClient.from('quotes').insert({ organization_id: orgA, client_id: clientA, client_name: 'Portal Client', ...fields }).select('id').single())
  for (const [index, line] of lines.entries()) {
    const written = await memberAClient.from('quote_lines').insert({
      organization_id: orgA, quote_id: quote.id, position: line.position ?? index + 1, title: line.title, description: line.description ?? null,
      quantity: 1, unit_price: 100, charge_kind: line.charge_kind ?? null,
    })
    assert.equal(written.error, null)
  }
  return quote.id as string
}
const send = (id: string) => memberAClient.rpc('send_quote', { p_id: id })
/** A quote sent through the real send_quote. */
const sentQuote = async (fields: Record<string, unknown> = {}, lines?: Line[]) => {
  const id = await draftQuote(fields, lines)
  const { error } = await send(id)
  assert.equal(error, null)
  return id
}
/** A link made through the real create_quote_access_link; returns its row id and the raw token. */
const newLink = async (quoteId: string, email = 'client@example.test', name: string | null = null) => {
  const token = must(await memberAClient.rpc('create_quote_access_link', { p_quote_id: quoteId, p_recipient_email: email, p_recipient_name: name })) as string
  const row = must(await admin.from('quote_access_links').select('id').eq('token_hash', sha256(token)).single())
  return { id: row.id as string, token }
}
const revise = async (id: string) => must(await memberAClient.rpc('revise_quote', { p_id: id })) as string
const setQuote = async (id: string, change: Record<string, unknown>) => assert.equal((await admin.from('quotes').update(change).eq('id', id)).error, null)
const setLink = async (id: string, change: Record<string, unknown>) => assert.equal((await admin.from('quote_access_links').update(change).eq('id', id)).error, null)
const setStatusAsMember = async (id: string, status: string) => assert.equal((await memberAClient.from('quotes').update({ status }).eq('id', id)).error, null)

/** portal_get_quote through the service role, as the portal's server module will call it. */
const portal = async (token: string | null) => {
  const { data, error } = await admin.rpc('portal_get_quote', { p_token: token })
  assert.equal(error, null)
  return data as Record<string, any>
}
const recordView = async (token: string | null) => {
  const { data, error } = await admin.rpc('portal_record_view', { p_token: token })
  assert.equal(error, null)
  assert.equal(data, null)
}
const assertInvalid = (result: Record<string, any>, label = 'invalid') => {
  assert.deepEqual(result, { state: 'invalid' }, label)
  assert.equal(JSON.stringify(result), '{"state":"invalid"}', `${label}: exactly the invalid shape and nothing else`)
}
/** Expired and superseded: the number, client and valid-until only; no lines, no terms, no recipient, no link expiry. */
const assertShort = async (result: Record<string, any>, state: 'expired' | 'superseded', quoteId: string) => {
  assert.equal(result.state, state)
  assert.deepEqual(keysOf(result), SHORT_RESULT_KEYS, `${state} carries no lines, recipient or expiry keys`)
  for (const key of ['lines', 'recipient_email', 'recipient_name', 'expires_at']) assert.equal(result[key], undefined, `${state} has no ${key}`)
  assert.deepEqual(keysOf(result.record), SHORT_RECORD_KEYS)
  const row = await quoteRow(quoteId)
  assert.deepEqual(result.record, { quote_number: row.quote_number, client_name: row.client_name, valid_until: row.valid_until })
  const json = JSON.stringify(result)
  assert.ok(!json.includes('"terms'), `${state} carries no terms`)
  assert.ok(!json.includes(DEFAULT_TERMS), `${state} carries no terms text`)
  assert.ok(!json.includes('"lines"'), `${state} carries no lines`)
  assert.ok(!json.includes('@example.test'), `${state} carries no recipient address`)
}

before(async () => {
  orgA = await createFixtureOrg('portal-read-a')
  memberA = await createFixtureUser(orgA, 'member')
  memberAClient = await signedInClient(memberA.email, memberA.password)
  clientA = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Portal Read Client', status: 'Active' }).select('id').single()).id
  otherClientA = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Portal Read Other Client', status: 'Active' }).select('id').single()).id
  must(await admin.from('organization_settings').insert({
    organization_id: orgA, legal_name: 'Portal Read (Pty) Ltd', document_prefix: 'PRD', vat_rate: 15, quote_portal_enabled: true,
    default_quote_terms: DEFAULT_TERMS, email: 'hello@portal-read.test', website: 'https://portal-read.test',
  }).select('id').single())
  ownerA = must(await admin.from('team_members').insert({
    organization_id: orgA, full_name: 'Olive Owner', email: 'olive.owner@portal-read.test', job_title: 'Client Director',
  }).select('id').single()).id
})

after(async () => {
  await cleanup([orgA].filter(Boolean), [memberA?.id].filter(Boolean))
})

test('an open link returns the frozen record, lines and owner, and nothing internal', async () => {
  const notes = 'INTERNAL margin note: do not show the client'
  const quote = await sentQuote(
    {
      owner_id: ownerA, notes, contact_name: 'Pat Client', client_ref: 'PO-1234', project_name: 'Growth programme',
      project_description: 'A twelve-month programme.', project_ref: 'PRJ-9',
    },
    // Inserted out of order: the lines come back by position.
    [
      { title: 'Retainer', position: 2, charge_kind: 'monthly', description: 'Includes 40 credits a month' },
      { title: 'Set-up', position: 1, charge_kind: 'once_off' },
      { title: 'Legacy', position: 3, charge_kind: null },
    ],
  )
  const templateId = randomUUID()
  const versionId = randomUUID()
  await setQuote(quote, {
    service_inclusions: 'Monthly strategy session',
    terms_sources: [{ layer: 'base', templateId, versionId, version: 2 }, { layer: 'retainer', templateId: randomUUID(), versionId: randomUUID(), version: 1 }],
  })
  const { id: linkId, token } = await newLink(quote, 'Pat.Client@Example.TEST', 'Pat Client')

  const result = await portal(token)
  assert.equal(result.state, 'open')
  assert.deepEqual(keysOf(result), RESULT_KEYS)
  const link = await linkRow(linkId)
  assert.equal(time(result.expires_at), time(link.expires_at))
  assert.equal(result.recipient_email, 'pat.client@example.test')
  assert.equal(result.recipient_name, 'Pat Client')
  assert.equal(result.version, 1)
  assert.equal(result.replaces_number, null)
  assert.deepEqual(result.owner, { name: 'Olive Owner', email: 'olive.owner@portal-read.test', job_title: 'Client Director' })

  // The record: exactly the frozen columns, equal to the stored quote.
  const row = await quoteRow(quote)
  assert.deepEqual(keysOf(result.record), RECORD_KEYS)
  for (const key of RECORD_KEYS) {
    if (key === 'terms_sources') continue
    if (key === 'sent_at' || key === 'accepted_at') assert.equal(time(result.record[key]), time(row[key]), key)
    else assert.deepEqual(result.record[key], row[key], key)
  }
  assert.equal(result.record.status, 'Sent')
  assert.match(result.record.sent_at, /\+00:00$/, 'the snapshot renders sent_at in UTC whatever the session time zone (Ruling 16)')
  assert.equal(result.record.terms, DEFAULT_TERMS)
  assert.equal(result.record.service_inclusions, 'Monthly strategy session')
  assert.equal(result.record.contact_name, 'Pat Client')
  assert.equal(result.record.issuer.legal_name, 'Portal Read (Pty) Ltd')
  assert.equal(result.record.bill_to.name, 'Portal Read Client')
  assert.deepEqual(result.record.terms_sources, [{ layer: 'base', version: 2 }, { layer: 'retainer', version: 1 }],
    'the template versions, in order, without their database ids')

  // The lines: exactly the line columns, by position, equal to the stored lines.
  const stored = await lineRows(quote)
  assert.equal(result.lines.length, 3)
  for (const line of result.lines) assert.deepEqual(keysOf(line), LINE_KEYS)
  assert.deepEqual(result.lines.map((line: Record<string, any>) => line.title), ['Set-up', 'Retainer', 'Legacy'])
  assert.deepEqual(result.lines, stored.map((line) => Object.fromEntries(LINE_KEYS.map((key) => [key, line[key]]))))
  assert.deepEqual(result.lines.map((line: Record<string, any>) => line.charge_kind), ['once_off', 'monthly', null])

  // Nothing internal anywhere in the JSON.
  const json = JSON.stringify(result)
  for (const key of FORBIDDEN_KEYS) assert.ok(!json.includes(`"${key}"`), `no ${key} key`)
  assert.ok(!json.includes(notes), 'the internal notes are not there')
  for (const [label, value] of Object.entries({ orgA, quote, clientA, ownerA, member: memberA.id, templateId, versionId, linkId })) {
    assert.ok(!json.includes(value), `the ${label} id is not there`)
  }
  assert.ok(!json.includes(token), 'the token is not echoed')
  assert.ok(!json.includes(sha256(token)), 'the token hash is not there')
  assert.deepEqual(idKeys(result), result.lines.map((_: unknown, index: number) => `.lines[${index}].id`), 'the only ids are the line ids')

  // A quote without an owner carries owner null.
  const unowned = await sentQuote()
  const plain = await portal((await newLink(unowned)).token)
  assert.equal(plain.state, 'open')
  assert.equal(plain.owner, null)
  assert.deepEqual(keysOf(plain), RESULT_KEYS, 'owner and replaces_number are present even when null')
})

test('unknown, malformed and hostile tokens are all invalid', async () => {
  const quote = await sentQuote()
  const { token } = await newLink(quote)
  assert.equal((await portal(token)).state, 'open', 'the real token works')
  assert.notEqual(token.toUpperCase(), token)

  const hostile: Array<[string, string | null]> = [
    ['null', null],
    ['empty', ''],
    ['one character', 'x'],
    ['42 characters', token.slice(0, 42)],
    ['44 characters', `${token}A`],
    ['43 characters with a space', `${token.slice(0, 21)} ${token.slice(22)}`],
    ['leading space', ` ${token.slice(1)}`],
    ['trailing newline', `${token}\n`],
    ['padded', `${token}=`],
    ['standard base64 alphabet', `${token.slice(0, 42)}+`],
    ['sql', "'; drop table quotes; --"],
    ['sql padded to 43', "'; drop table quotes; --".padEnd(43, 'a')],
    ['upper-cased', token.toUpperCase()],
    ['the stored hash', sha256(token)],
    ['unknown but well formed', randomBytes(32).toString('base64url')],
  ]
  for (const [label, candidate] of hostile) {
    if (label === 'unknown but well formed') assert.match(candidate!, /^[A-Za-z0-9_-]{43}$/)
    assertInvalid(await portal(candidate), label)
  }

  const revoked = await newLink(quote, 'revoked@example.test')
  assert.equal((await memberAClient.rpc('revoke_quote_access_link', { p_link_id: revoked.id, p_reason: 'wrong address' })).error, null)
  assertInvalid(await portal(revoked.token), 'revoked')
  assert.equal((await portal(token)).state, 'open', 'the other link is untouched')
})

test('state follows the quote and the link', async () => {
  // Revoked by staff: invalid.
  const revokedQuote = await sentQuote()
  const revoked = await newLink(revokedQuote)
  assert.equal((await memberAClient.rpc('revoke_quote_access_link', { p_link_id: revoked.id })).error, null)
  assertInvalid(await portal(revoked.token), 'revoked by staff')

  // expires_at passed (taken from the database clock, so the local clock cannot skew it): expired; still in the future: open.
  const pastQuote = await sentQuote()
  const past = await newLink(pastQuote)
  const createdAt = time((await linkRow(past.id)).created_at)!
  await setLink(past.id, { expires_at: new Date(createdAt + 60 * 60_000).toISOString() })
  assert.equal((await portal(past.token)).state, 'open', 'a link before its expiry is open')
  await setLink(past.id, { expires_at: new Date(createdAt - 1000).toISOString() })
  await assertShort(await portal(past.token), 'expired', pastQuote)

  // The quote marked Expired: expired.
  const expiredQuote = await sentQuote()
  const expired = await newLink(expiredQuote)
  await setStatusAsMember(expiredQuote, 'Expired')
  await assertShort(await portal(expired.token), 'expired', expiredQuote)

  // The nightly job expires the quote and revokes the link with reason 'expired': expired, not invalid.
  const overdueQuote = await sentQuote()
  const overdue = await newLink(overdueQuote)
  await setQuote(overdueQuote, { valid_until: addDays(southAfricanToday(), -1) })
  const marked = await admin.rpc('mark_expired_quotes', { p_organization_id: orgA })
  assert.equal(marked.error, null)
  assert.ok((marked.data as number) >= 1)
  const overdueLink = await linkRow(overdue.id)
  assert.equal(overdueLink.revoked_reason, 'expired')
  assert.equal((await quoteRow(overdueQuote)).status, 'Expired')
  await assertShort(await portal(overdue.token), 'expired', overdueQuote)

  // A link revoked with reason 'expired' never opens, even while its quote is still Sent and its date is ahead.
  const strayQuote = await sentQuote()
  const stray = await newLink(strayQuote)
  await setLink(stray.id, { revoked_at: new Date().toISOString(), revoked_reason: 'expired' })
  await assertShort(await portal(stray.token), 'expired', strayQuote)

  // Accepted and Declined: the full record, with accepted_at for an accepted quote.
  const acceptedQuote = await sentQuote()
  const accepted = await newLink(acceptedQuote)
  await setStatusAsMember(acceptedQuote, 'Accepted')
  const acceptedResult = await portal(accepted.token)
  assert.equal(acceptedResult.state, 'accepted')
  assert.deepEqual(keysOf(acceptedResult), RESULT_KEYS)
  assert.equal(acceptedResult.record.status, 'Accepted')
  assert.ok(acceptedResult.record.accepted_at, 'accepted_at is carried')
  assert.match(acceptedResult.record.accepted_at, /\+00:00$/)
  assert.equal(time(acceptedResult.record.accepted_at), time((await quoteRow(acceptedQuote)).accepted_at))
  assert.equal(acceptedResult.lines.length, 1)

  const declinedQuote = await sentQuote()
  const declined = await newLink(declinedQuote)
  await setStatusAsMember(declinedQuote, 'Declined')
  const declinedResult = await portal(declined.token)
  assert.equal(declinedResult.state, 'declined')
  assert.deepEqual(keysOf(declinedResult), RESULT_KEYS)
  assert.equal(declinedResult.record.status, 'Declined')
  assert.equal(declinedResult.record.accepted_at, null)
  assert.equal(declinedResult.lines.length, 1)

  // The superseded original: superseded, although sending the revision revoked its link.
  const original = await sentQuote()
  const originalLink = await newLink(original)
  assert.equal((await send(await revise(original))).error, null)
  const revokedBySupersede = await linkRow(originalLink.id)
  assert.ok(revokedBySupersede.revoked_at)
  assert.equal(revokedBySupersede.revoked_reason, 'superseded')
  await assertShort(await portal(originalLink.token), 'superseded', original)
})

// Ruling 13: a revoked link keeps a state only when the system revoked it for the state its quote is in.
test('a link staff revoked stays invalid after its quote is superseded, and only system revocations keep a state', async () => {
  const original = await sentQuote({ owner_id: ownerA })
  const wrongAddress = await newLink(original, 'wrong@example.test', 'Wrong Person')
  assert.equal((await memberAClient.rpc('revoke_quote_access_link', { p_link_id: wrongAddress.id })).error, null)
  const notSent = await newLink(original, 'bounced@example.test')
  assert.equal((await memberAClient.rpc('revoke_quote_access_link', { p_link_id: notSent.id, p_reason: 'email not sent' })).error, null)
  const live = await newLink(original, 'right@example.test')
  assert.equal((await send(await revise(original))).error, null)
  assert.equal((await quoteRow(original)).status, 'Superseded')
  assert.equal((await linkRow(wrongAddress.id)).revoked_reason, 'revoked by staff', 'the supersede left the earlier reason alone')
  assert.equal((await linkRow(notSent.id)).revoked_reason, 'email not sent')
  assert.equal((await linkRow(live.id)).revoked_reason, 'superseded')

  assertInvalid(await portal(wrongAddress.token), 'staff-revoked, then superseded')
  assertInvalid(await portal(notSent.token), "revoked 'email not sent', then superseded")
  await assertShort(await portal(live.token), 'superseded', original)
  for (const link of [wrongAddress, notSent]) {
    await recordView(link.token)
    const row = await linkRow(link.id)
    assert.equal(row.first_viewed_at, null, 'a revoked link is never stamped')
    assert.equal(row.last_viewed_at, null)
  }

  // 'superseded' on a quote that is not Superseded: invalid, whatever the quote's status.
  const sent = await sentQuote()
  const fakeSuperseded = await newLink(sent)
  await setLink(fakeSuperseded.id, { revoked_at: new Date().toISOString(), revoked_reason: 'superseded' })
  assertInvalid(await portal(fakeSuperseded.token), "'superseded' on a Sent quote")
  const acceptedQuote = await sentQuote()
  const acceptedLink = await newLink(acceptedQuote)
  await setStatusAsMember(acceptedQuote, 'Accepted')
  await setLink(acceptedLink.id, { revoked_at: new Date().toISOString(), revoked_reason: 'superseded' })
  assertInvalid(await portal(acceptedLink.token), "'superseded' on an Accepted quote")

  // A revocation with no reason at all is invalid.
  const unexplained = await newLink(sent, 'unexplained@example.test')
  await setLink(unexplained.id, { revoked_at: new Date().toISOString(), revoked_reason: null })
  assertInvalid(await portal(unexplained.token), 'revoked without a reason')

  // 'expired' on an Expired quote: expired.
  const expiredQuote = await sentQuote()
  const expiredLink = await newLink(expiredQuote)
  await setStatusAsMember(expiredQuote, 'Expired')
  await setLink(expiredLink.id, { revoked_at: new Date().toISOString(), revoked_reason: 'expired' })
  await assertShort(await portal(expiredLink.token), 'expired', expiredQuote)

  // A link on a draft (only the service role could make one) is invalid and never stamped.
  const draft = await draftQuote()
  const draftToken = randomBytes(32).toString('base64url')
  const draftLink = must(await admin.from('quote_access_links').insert({
    organization_id: orgA, quote_id: draft, token_hash: sha256(draftToken), recipient_email: 'draft@example.test', expires_at: new Date(Date.now() + DAY).toISOString(),
  }).select('id').single()).id as string
  assertInvalid(await portal(draftToken), 'a link on a Draft quote')
  await recordView(draftToken)
  assert.equal((await linkRow(draftLink)).first_viewed_at, null)
})

// Ruling 13: Accepted and Declined come before any date check; the quote's status is authoritative.
test('an accepted or declined quote is still shown after its link has expired', async () => {
  for (const [status, state] of [['Accepted', 'accepted'], ['Declined', 'declined']] as const) {
    const quote = await sentQuote()
    const link = await newLink(quote)
    await setStatusAsMember(quote, status)
    await setLink(link.id, { expires_at: new Date(time((await linkRow(link.id)).created_at)! - 1000).toISOString() })
    const result = await portal(link.token)
    assert.equal(result.state, state, `a ${status} quote past its link's expiry reads ${state}`)
    assert.deepEqual(keysOf(result), RESULT_KEYS)
    assert.deepEqual(keysOf(result.record), RECORD_KEYS)
    assert.equal(result.record.status, status)
    assert.equal(result.lines.length, 1)
    assert.deepEqual(keysOf(result.lines[0]), LINE_KEYS)
    await recordView(link.token)
    assert.ok((await linkRow(link.id)).first_viewed_at, `a ${status} link past its expiry is still stamped`)
  }
})

// Ruling 17: replaces_number names only a numbered predecessor of the same client; the version still counts it.
test('replaces_number names only a numbered predecessor of the same client', async () => {
  const original = await sentQuote()
  const forOtherClient = await draftQuote({ client_id: otherClientA, client_name: 'Portal Read Other Client' })
  assert.equal((await memberAClient.from('quotes').update({ supersedes_quote_id: original }).eq('id', forOtherClient)).error, null)
  assert.equal((await send(forOtherClient)).error, null)
  const crossClient = await portal((await newLink(forOtherClient)).token)
  assert.equal(crossClient.state, 'open')
  assert.equal(crossClient.version, 2, 'the version still counts the predecessor')
  assert.equal(crossClient.replaces_number, null, "another client's quote number is not shown")

  const unnumbered = await draftQuote()
  const next = await draftQuote()
  assert.equal((await memberAClient.from('quotes').update({ supersedes_quote_id: unnumbered }).eq('id', next)).error, null)
  assert.equal((await send(next)).error, null)
  assert.match((await quoteRow(unnumbered)).quote_number, /^DRAFT-/)
  const fromDraft = await portal((await newLink(next)).token)
  assert.equal(fromDraft.state, 'open')
  assert.equal(fromDraft.version, 2)
  assert.equal(fromDraft.replaces_number, null, 'a DRAFT- number is not shown')
})

test('an archived quote reads as invalid, before every other rule, and is never stamped', async () => {
  const quote = await sentQuote()
  const link = await newLink(quote)
  assert.equal((await portal(link.token)).state, 'open')
  await setQuote(quote, { archived_at: new Date().toISOString() })
  assertInvalid(await portal(link.token), 'archived Sent')
  await recordView(link.token)
  const row = await linkRow(link.id)
  assert.equal(row.first_viewed_at, null)
  assert.equal(row.last_viewed_at, null)

  // Archived wins over Superseded and Accepted.
  const original = await sentQuote()
  const originalLink = await newLink(original)
  assert.equal((await send(await revise(original))).error, null)
  assert.equal((await portal(originalLink.token)).state, 'superseded')
  await setQuote(original, { archived_at: new Date().toISOString() })
  assertInvalid(await portal(originalLink.token), 'archived Superseded')

  const acceptedQuote = await sentQuote()
  const accepted = await newLink(acceptedQuote)
  await setStatusAsMember(acceptedQuote, 'Accepted')
  await setQuote(acceptedQuote, { archived_at: new Date().toISOString() })
  assertInvalid(await portal(accepted.token), 'archived Accepted')
  await recordView(accepted.token)
  assert.equal((await linkRow(accepted.id)).first_viewed_at, null)
})

test('version and replaces_number follow the chain', async () => {
  const original = await sentQuote()
  const originalLink = await newLink(original)
  const first = await portal(originalLink.token)
  assert.equal(first.version, 1)
  assert.equal(first.replaces_number, null)
  assert.equal(first.owner, null)

  const revision = await revise(original)
  assert.equal((await send(revision)).error, null)
  const revisionLink = await newLink(revision)
  const second = await portal(revisionLink.token)
  assert.equal(second.state, 'open')
  assert.equal(second.version, 2)
  assert.equal(second.replaces_number, (await quoteRow(original)).quote_number)

  const third = await revise(revision)
  assert.equal((await send(third)).error, null)
  const thirdResult = await portal((await newLink(third)).token)
  assert.equal(thirdResult.version, 3)
  assert.equal(thirdResult.replaces_number, (await quoteRow(revision)).quote_number)

  // The superseded links keep their own place in the chain.
  const firstAgain = await portal(originalLink.token)
  assert.equal(firstAgain.state, 'superseded')
  assert.equal(firstAgain.version, 1)
  assert.equal(firstAgain.replaces_number, null)
  const secondAgain = await portal(revisionLink.token)
  assert.equal(secondAgain.state, 'superseded')
  assert.equal(secondAgain.version, 2)
  assert.equal(secondAgain.replaces_number, (await quoteRow(original)).quote_number)
})

test('a supersedes cycle still returns, with a bounded version', async () => {
  // Only drafts can form a cycle; the service role rewrites two Sent quotes' pointers to reach one here.
  const a = await sentQuote()
  const b = await sentQuote()
  const link = await newLink(a)
  await setQuote(a, { supersedes_quote_id: b })
  await setQuote(b, { supersedes_quote_id: a })
  try {
    const result = await portal(link.token)
    assert.equal(result.state, 'open')
    assert.ok(Number.isInteger(result.version) && result.version >= 1 && result.version <= 50, 'the version is bounded')
    assert.equal(result.version, 2, 'each quote in the cycle is counted once')
    assert.equal(result.replaces_number, (await quoteRow(b)).quote_number)
    await recordView(link.token)
    assert.ok((await linkRow(link.id)).first_viewed_at, 'viewing terminates too')
  } finally {
    await setQuote(b, { supersedes_quote_id: null })
  }
})

test('reading changes nothing', async () => {
  const quote = await sentQuote({ owner_id: ownerA })
  const link = await newLink(quote)
  const quoteBefore = await quoteRow(quote)
  const linesBefore = await lineRows(quote)
  const linkBefore = await linkRow(link.id)
  const auditBefore = await auditCount(quote)

  for (let call = 0; call < 5; call += 1) assert.equal((await portal(link.token)).state, 'open')

  assert.deepEqual(await quoteRow(quote), quoteBefore, 'the quote row, updated_at included, is identical')
  assert.deepEqual(await lineRows(quote), linesBefore, 'the lines are identical')
  const linkAfter = await linkRow(link.id)
  assert.deepEqual(linkAfter, linkBefore, 'the link row is identical')
  assert.equal(linkAfter.first_viewed_at, null, 'reading does not stamp "opened"')
  assert.equal(linkAfter.last_viewed_at, null)
  assert.equal(await auditCount(quote), auditBefore, 'no audit event was written for the quote')
})

test('portal_record_view stamps first once and last every time, and ignores invalid, revoked and expired links', async () => {
  const quote = await sentQuote()
  const link = await newLink(quote)
  const quoteBefore = await quoteRow(quote)
  const auditBefore = await auditCount(quote)

  await recordView(link.token)
  const first = await linkRow(link.id)
  assert.ok(first.first_viewed_at, 'first_viewed_at is stamped')
  assert.equal(first.last_viewed_at, first.first_viewed_at, 'the first view sets both')
  await recordView(link.token)
  const second = await linkRow(link.id)
  assert.equal(second.first_viewed_at, first.first_viewed_at, 'first_viewed_at is set once')
  assert.ok(time(second.last_viewed_at)! > time(first.last_viewed_at)!, 'last_viewed_at moves on every view')
  const { first_viewed_at: _f, last_viewed_at: _l, ...rest } = second
  const { first_viewed_at: _f0, last_viewed_at: _l0, ...restBefore } = first
  assert.deepEqual(rest, restBefore, 'nothing else on the link changes')
  assert.deepEqual(await quoteRow(quote), quoteBefore, 'the quote row, updated_at included, is untouched')
  assert.equal(await auditCount(quote), auditBefore, 'no audit event was written for the quote')
  assert.equal((await portal(link.token)).state, 'open', 'a viewed link stays open')

  // Accepted and declined links are stamped too.
  for (const status of ['Accepted', 'Declined']) {
    const decided = await sentQuote()
    const decidedLink = await newLink(decided)
    await setStatusAsMember(decided, status)
    await recordView(decidedLink.token)
    assert.ok((await linkRow(decidedLink.id)).first_viewed_at, `a ${status} link is stamped`)
  }

  // Invalid tokens: no error and nothing stamped.
  for (const candidate of [null, '', 'x', link.token.toUpperCase(), `${link.token}=`, "'; drop table quote_access_links; --", randomBytes(32).toString('base64url')]) {
    await recordView(candidate)
  }
  assert.deepEqual(await linkRow(link.id), second, 'invalid tokens touched nothing')

  // Revoked, expired by date, expired by status, expired by the nightly job and superseded: never stamped.
  const ignored: Array<{ id: string; token: string; label: string }> = []
  const revokedQuote = await sentQuote()
  const revoked = await newLink(revokedQuote)
  assert.equal((await memberAClient.rpc('revoke_quote_access_link', { p_link_id: revoked.id })).error, null)
  ignored.push({ ...revoked, label: 'revoked' })

  const pastQuote = await sentQuote()
  const past = await newLink(pastQuote)
  await setLink(past.id, { expires_at: new Date(time((await linkRow(past.id)).created_at)! - 1000).toISOString() })
  ignored.push({ ...past, label: 'past its expiry' })

  const expiredQuote = await sentQuote()
  const expired = await newLink(expiredQuote)
  await setStatusAsMember(expiredQuote, 'Expired')
  ignored.push({ ...expired, label: 'quote Expired' })

  const strayQuote = await sentQuote()
  const stray = await newLink(strayQuote)
  await setLink(stray.id, { revoked_at: new Date().toISOString(), revoked_reason: 'expired' })
  ignored.push({ ...stray, label: "revoked with reason 'expired'" })

  const original = await sentQuote()
  const originalLink = await newLink(original)
  assert.equal((await send(await revise(original))).error, null)
  ignored.push({ ...originalLink, label: 'superseded' })

  for (const { id, token, label } of ignored) {
    await recordView(token)
    const row = await linkRow(id)
    assert.equal(row.first_viewed_at, null, `${label}: first_viewed_at stays null`)
    assert.equal(row.last_viewed_at, null, `${label}: last_viewed_at stays null`)
  }
})

test('neither a member nor anon can call either function', async () => {
  const quote = await sentQuote()
  const link = await newLink(quote)
  for (const [label, client] of [['member', memberAClient], ['anon', anonymous]] as const) {
    for (const fn of ['portal_get_quote', 'portal_record_view']) {
      const result = await client.rpc(fn, { p_token: link.token })
      assert.ok(result.error, `${label} is refused ${fn}`)
      assert.match(result.error.message, /permission denied/i, `${label} is refused ${fn} on privilege`)
      assert.equal(result.data, null)
    }
    const snapshot = await client.schema('private').rpc('quote_snapshot', { p_quote_id: quote })
    assert.ok(snapshot.error, `${label} cannot reach private.quote_snapshot`)
    assert.equal(snapshot.data, null)
  }
  const viaService = await admin.schema('private').rpc('quote_snapshot', { p_quote_id: quote })
  assert.ok(viaService.error, 'the private schema is not exposed through the data API, even to the service role')
  assert.equal(viaService.data, null)

  const row = await linkRow(link.id)
  assert.equal(row.first_viewed_at, null, 'the refused record_view calls stamped nothing')
  assert.equal(row.last_viewed_at, null)
  assert.equal((await portal(link.token)).state, 'open', 'the service role still can')
})
