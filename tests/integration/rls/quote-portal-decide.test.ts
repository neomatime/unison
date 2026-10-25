import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureUser, signedInClient } from './helpers.ts'
import {
  anonymous, lineRows, linkRow, must, quoteRow, setLink, setQuote, setupPortalOrg, sha256, type PortalLink, type PortalMember, type PortalOrg,
} from './portal-fixtures.ts'

// Quote portal, slice 2, task 4: portal_decide, the one function that records a client's accept or decline. Every call
// goes through the service role, as the portal's server module will make it; every code comes from portal_issue_code
// and every page hash from portal_get_quote, so a decision here is made exactly as the client makes it. The service role
// otherwise only moves what a client cannot reach: it ages a code, sets failed attempts to reach the caps, edits a frozen
// line, archives a quote or moves a link's expiry. Refusals are returned values, never errors; the "writes nothing"
// checks compare everything a decision could write for the quote before and after the refused call.

let fx: PortalOrg
const extraUsers: string[] = []

before(async () => {
  fx = await setupPortalOrg('portal-decide')
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    // The member without a team profile is made here, so its login is removed here (its membership went with the organisation).
    if (extraUsers.length > 0) await cleanup([], extraUsers)
  }
})

const MINUTE = 60_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const CONSENT_ACCEPT = 'I confirm that I am authorised to act on behalf of the organisation and have reviewed and accept this quotation and its accompanying terms and conditions.'
const CONSENT_DECLINE = 'I confirm that I am authorised to decline this quotation on behalf of the organisation.'
const REASONS = ['Budget considerations', 'Timing is not right', 'Scope does not meet our requirements', 'Internal approval pending', 'Chose another provider', 'Other']
const SUCCESS_KEYS = [
  'ok', 'replay', 'decision', 'decided_at', 'quote_id', 'quote_number', 'client_name', 'recipient_email', 'signatory_name', 'signatory_position',
  'decline_reason', 'decline_comments', 'owner_name', 'notify_email',
].sort()
const RESPONSE_COLUMNS = [
  'id', 'organization_id', 'quote_id', 'link_id', 'decision', 'decided_at', 'signatory_name', 'signatory_position', 'signatory_organisation',
  'verified_email', 'consent_text', 'consent_given', 'code_verified_at', 'snapshot_hash', 'terms_sources', 'quote_number', 'quote_version',
  'ip_address', 'user_agent', 'decline_reason', 'decline_comments',
].sort()
const INVALID = { ok: false, reason: 'invalid' }
const NOT_OPEN = { ok: false, reason: 'not_open' }
const INCOMPLETE = { ok: false, reason: 'incomplete' }
const STALE = { ok: false, reason: 'stale' }
const THROTTLED = { ok: false, reason: 'throttled' }
const CODE_MISSING = { ok: false, reason: 'code_missing' }
const CODE_EXPIRED = { ok: false, reason: 'code_expired' }
const CODE_LOCKED = { ok: false, reason: 'code_locked' }
const codeWrong = (attemptsLeft: number) => ({ ok: false, reason: 'code_wrong', attempts_left: attemptsLeft })

const time = (value: string) => new Date(value).getTime()
const keysOf = (value: Record<string, unknown>) => Object.keys(value).sort()

const portal = async (token: string) => {
  const { data, error } = await admin.rpc('portal_get_quote', { p_token: token })
  assert.equal(error, null)
  return data as Record<string, any>
}
const issueCode = async (token: string) => {
  const { data, error } = await admin.rpc('portal_issue_code', { p_token: token })
  assert.equal(error, null)
  assert.equal(data.ok, true, `a code is issued: ${JSON.stringify(data)}`)
  return data.code as string
}
/** A six-digit code that is not the one given. */
const wrongCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')

/** What a decision is made from: the link's token, the hash of the page the client loaded and the code emailed to them. */
type Ready = { token: string; hash: string; code: string }
const ready = async (link: PortalLink): Promise<Ready> => {
  const page = await portal(link.token)
  assert.equal(page.state, 'open', 'the page is open')
  return { token: link.token, hash: page.snapshot_hash, code: await issueCode(link.token) }
}

/** Every argument of portal_decide for an accept, as the server action sends it. */
const acceptArgs = (r: Ready, overrides: Record<string, unknown> = {}) => ({
  p_token: r.token,
  p_code: r.code,
  p_decision: 'accepted',
  p_signatory_name: 'Pat Client',
  p_signatory_position: 'Managing Director',
  p_signatory_organisation: 'Portal Client (Pty) Ltd',
  p_consent_text: CONSENT_ACCEPT,
  p_consent: true,
  p_snapshot_hash: r.hash,
  p_decline_reason: null,
  p_decline_comments: null,
  p_ip: '203.0.113.7',
  p_user_agent: 'Mozilla/5.0 (portal decide test)',
  ...overrides,
})
const declineArgs = (r: Ready, overrides: Record<string, unknown> = {}) =>
  acceptArgs(r, { p_decision: 'declined', p_consent_text: CONSENT_DECLINE, ...overrides })

const decide = async (input: Record<string, unknown>) => {
  const { data, error } = await admin.rpc('portal_decide', input)
  assert.equal(error, null, error?.message)
  return data as Record<string, any>
}
const decideOk = async (input: Record<string, unknown>) => {
  const result = await decide(input)
  assert.equal(result.ok, true, `the decision is recorded: ${JSON.stringify(result)}`)
  return result
}

const codeRows = async (linkId: string) =>
  must(await admin.from('quote_access_codes').select('*').eq('link_id', linkId).order('created_at')) as Array<Record<string, any>>
const setCode = async (id: string, change: Record<string, unknown>) =>
  assert.equal((await admin.from('quote_access_codes').update(change).eq('id', id)).error, null)
/** A code issued long ago with the given failed attempts, written by the service role. */
const oldCode = async (linkId: string, attempts: number, minutesAgo = 180) => {
  const issuedAt = Date.now() - minutesAgo * MINUTE
  const salt = randomBytes(16).toString('hex')
  return must(await admin.from('quote_access_codes').insert({
    organization_id: fx.orgId, link_id: linkId, code_salt: salt, code_hash: sha256(`${salt}:000000`), attempts,
    created_at: new Date(issuedAt).toISOString(), expires_at: new Date(issuedAt + 10 * MINUTE).toISOString(),
  }).select('id').single()).id as string
}
const responses = async (quoteId: string) =>
  must(await admin.from('quote_responses').select('*').eq('quote_id', quoteId).order('decided_at')) as Array<Record<string, any>>
/** The timeline entries of one kind on one quote. */
const entries = async (quoteId: string, kind: string) =>
  must(await admin.from('activities').select('*').eq('quote_id', quoteId).eq('kind', kind)) as Array<Record<string, any>>
const auditRows = async (quoteId: string) =>
  must(await admin.from('audit_events').select('*').eq('resource', 'quotes').eq('resource_id', quoteId)) as Array<Record<string, any>>
/** How many times the audit trail saw the quote move into the status. */
const statusChanges = async (quoteId: string, status: string) =>
  (await auditRows(quoteId)).filter((row) => row.new_value?.status === status && row.old_value?.status !== status).length

/** Everything a decision could write for a quote and its links, to show that a refused call wrote none of it. */
const footprint = async (quoteId: string, linkIds: string[]) => ({
  quote: await quoteRow(quoteId),
  links: must(await admin.from('quote_access_links').select('*').in('id', linkIds).order('id')),
  codes: must(await admin.from('quote_access_codes').select('*').in('link_id', linkIds).order('id')),
  responses: await responses(quoteId),
  activities: must(await admin.from('activities').select('*').eq('quote_id', quoteId).order('id')),
  audit: (await auditRows(quoteId)).length,
})

test('an accepted decision records every field, sets Accepted and accepted_at, and writes quote.accepted with no actor', async () => {
  const quote = await fx.sentQuote({ owner_id: fx.owner.teamMemberId }, [{ title: 'Set-up', charge_kind: 'once_off' }, { title: 'Retainer', charge_kind: 'monthly' }])
  // The terms sources carry template and version ids; the page shows each layer and version only.
  const sources = [
    { layer: 'company', templateId: randomUUID(), versionId: randomUUID(), version: 3 },
    { layer: 'offering', templateId: randomUUID(), versionId: randomUUID(), version: 1 },
  ]
  await setQuote(quote, { terms_sources: sources })
  const link = await fx.newLink(quote, { email: 'Pat.Client@Example.TEST', name: 'Pat Client' })
  const r = await ready(link)
  assert.deepEqual((await portal(link.token)).record.terms_sources, [{ layer: 'company', version: 3 }, { layer: 'offering', version: 1 }])
  const linkBefore = await linkRow(link.id)

  const result = await decideOk(acceptArgs(r))
  const quoteAfter = await quoteRow(quote)

  assert.deepEqual(keysOf(result), SUCCESS_KEYS, 'the result has exactly the agreed keys')
  const { decided_at: decidedAt, ...outcome } = result
  assert.deepEqual(outcome, {
    ok: true, replay: false, decision: 'accepted', quote_id: quote, quote_number: quoteAfter.quote_number, client_name: 'Portal Client',
    recipient_email: 'pat.client@example.test', signatory_name: 'Pat Client', signatory_position: 'Managing Director',
    decline_reason: null, decline_comments: null, owner_name: 'Olive Owner', notify_email: fx.owner.email,
  })

  const rows = await responses(quote)
  assert.equal(rows.length, 1, 'one response')
  const [row] = rows
  assert.deepEqual(keysOf(row), RESPONSE_COLUMNS)
  const { id, decided_at: rowDecidedAt, code_verified_at: codeVerifiedAt, ...recorded } = row
  assert.match(id, UUID)
  assert.deepEqual(recorded, {
    organization_id: fx.orgId, quote_id: quote, link_id: link.id, decision: 'accepted',
    signatory_name: 'Pat Client', signatory_position: 'Managing Director', signatory_organisation: 'Portal Client (Pty) Ltd',
    verified_email: 'pat.client@example.test', consent_text: CONSENT_ACCEPT, consent_given: true,
    snapshot_hash: r.hash, terms_sources: sources, quote_number: quoteAfter.quote_number, quote_version: 1,
    ip_address: '203.0.113.7', user_agent: 'Mozilla/5.0 (portal decide test)', decline_reason: null, decline_comments: null,
  })
  assert.equal(time(rowDecidedAt), time(decidedAt), 'the result gives the recorded time')
  assert.equal(time(codeVerifiedAt), time(rowDecidedAt), 'the code was verified in the same transaction')

  assert.equal(quoteAfter.status, 'Accepted')
  assert.equal(time(quoteAfter.accepted_at), time(rowDecidedAt), 'accepted_at is the time of the decision')
  const accepted = await entries(quote, 'quote.accepted')
  assert.equal(accepted.length, 1, 'one quote.accepted entry')
  assert.equal(accepted[0].created_by, null, 'no actor: the client is not a member')

  const [code] = await codeRows(link.id)
  assert.equal(code.attempts, 0)
  assert.equal(time(code.consumed_at), time(rowDecidedAt), 'the code is consumed')
  assert.deepEqual(await linkRow(link.id), linkBefore, 'the link row is unchanged')

  const page = await portal(link.token)
  assert.equal(page.state, 'accepted')
  assert.equal(page.response.decision, 'accepted')
})

test('a declined decision stores the reason and comments and sets Declined', async () => {
  const quote = await fx.sentQuote({ owner_id: fx.ownerWithoutLogin.teamMemberId })
  const link = await fx.newLink(quote)
  const r = await ready(link)

  const result = await decideOk(declineArgs(r, { p_decline_reason: 'Timing is not right', p_decline_comments: 'Next financial year,\nplease.' }))
  assert.equal(result.replay, false)
  assert.equal(result.decision, 'declined')
  assert.equal(result.decline_reason, 'Timing is not right')
  assert.equal(result.decline_comments, 'Next financial year,\nplease.')
  assert.equal(result.owner_name, 'Nora Nologin', 'an owner without a login is still named')
  assert.equal(result.notify_email, fx.ownerWithoutLogin.email, "and is told at the owner's own address")

  const [row, ...others] = await responses(quote)
  assert.equal(others.length, 0)
  assert.equal(row.decision, 'declined')
  assert.equal(row.consent_text, CONSENT_DECLINE)
  assert.equal(row.decline_reason, 'Timing is not right')
  assert.equal(row.decline_comments, 'Next financial year,\nplease.')
  assert.equal(row.link_id, link.id)

  const quoteAfter = await quoteRow(quote)
  assert.equal(quoteAfter.status, 'Declined')
  assert.equal(quoteAfter.accepted_at, null)
  assert.deepEqual(row.terms_sources, quoteAfter.terms_sources)
  const declined = await entries(quote, 'quote.declined')
  assert.equal(declined.length, 1, 'one quote.declined entry')
  assert.equal(declined[0].created_by, null, 'no actor')
  assert.deepEqual(await entries(quote, 'quote.accepted'), [])
  assert.ok((await codeRows(link.id))[0].consumed_at, 'the code is consumed')
})

test("the result names the owner, and the address to tell is the owner's, else the sender's, else none", async () => {
  // A member with a login and no team profile, to send a link that has no sender address.
  const user = await createFixtureUser(fx.orgId, 'member')
  extraUsers.push(user.id)
  assert.deepEqual(must(await admin.from('team_members').select('id').eq('organization_id', fx.orgId).eq('user_id', user.id)), [], 'no team profile')
  const noProfile: PortalMember = { userId: user.id, email: user.email, client: await signedInClient(user.email, user.password), teamMemberId: '' }

  const cases: Array<{ label: string; owner: string | null; by: PortalMember; ownerName: string | null; notify: string | null }> = [
    { label: 'owner with a login, sent by another member', owner: fx.owner.teamMemberId, by: fx.sender, ownerName: 'Olive Owner', notify: fx.owner.email },
    { label: 'owner without a login, sent by a member without a profile', owner: fx.ownerWithoutLogin.teamMemberId, by: noProfile, ownerName: 'Nora Nologin', notify: fx.ownerWithoutLogin.email },
    { label: 'no owner, sent by the sender', owner: null, by: fx.sender, ownerName: null, notify: fx.sender.email },
    { label: 'no owner, sent by the owner member', owner: null, by: fx.owner, ownerName: null, notify: fx.owner.email },
    { label: 'no owner, sent by a member without a profile', owner: null, by: noProfile, ownerName: null, notify: null },
  ]
  for (const { label, owner, by, ownerName, notify } of cases) {
    const quote = await fx.sentQuote({ owner_id: owner })
    assert.equal((await quoteRow(quote)).owner_id, owner, `${label}: the quote's owner`)
    const result = await decideOk(acceptArgs(await ready(await fx.newLink(quote, { by }))))
    assert.equal(result.owner_name, ownerName, `${label}: owner_name`)
    assert.equal(result.notify_email, notify, `${label}: notify_email`)
  }
})

test('two identical decisions sent at once record one response, one status change and one timeline entry', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  const r = await ready(link)

  const results = await Promise.all([decide(acceptArgs(r)), decide(acceptArgs(r))])
  assert.deepEqual(results.map((result) => result.ok), [true, true], JSON.stringify(results))
  assert.deepEqual(results.map((result) => result.replay).sort(), [false, true], 'one recorded, one replayed')
  assert.deepEqual({ ...results[0], replay: null }, { ...results[1], replay: null }, 'the replay is the recorded outcome')

  assert.equal((await responses(quote)).length, 1, 'one response')
  assert.equal((await quoteRow(quote)).status, 'Accepted')
  assert.equal(await statusChanges(quote, 'Accepted'), 1, 'one status change')
  assert.equal((await entries(quote, 'quote.accepted')).length, 1, 'one timeline entry')
  const [code] = await codeRows(link.id)
  assert.equal(code.attempts, 0)
  assert.ok(code.consumed_at)
})

test('a decline after an accept on the same link returns the accepted outcome and writes nothing', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  const r = await ready(link)
  const accepted = await decideOk(acceptArgs(r))
  const before = await footprint(quote, [link.id])

  const again = await decide(declineArgs(r, { p_decline_reason: 'Other', p_decline_comments: 'We changed our minds.' }))
  assert.equal(again.replay, true)
  assert.deepEqual({ ...again, replay: false }, accepted, 'the recorded accept, not the decline')
  assert.deepEqual(await footprint(quote, [link.id]), before, 'nothing was written')
})

test('a wrong code is refused and the attempt is kept', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  const r = await ready(link)

  assert.deepEqual(await decide(acceptArgs(r, { p_code: wrongCode(r.code) })), codeWrong(4))
  const [code] = await codeRows(link.id)
  assert.equal(code.attempts, 1, 'the failed attempt is counted and kept')
  assert.equal(code.consumed_at, null)
  assert.equal((await quoteRow(quote)).status, 'Sent')
  assert.deepEqual(await responses(quote), [])
})

test('the fifth wrong code leaves none, and the right code is then code_locked', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  const r = await ready(link)

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.deepEqual(await decide(acceptArgs(r, { p_code: wrongCode(r.code) })), codeWrong(5 - attempt), `wrong code ${attempt}`)
  }
  const before = await footprint(quote, [link.id])
  assert.equal(before.codes[0].attempts, 5)
  assert.deepEqual(await decide(acceptArgs(r)), CODE_LOCKED, 'the right code after five wrong ones')
  assert.deepEqual(await decide(acceptArgs(r, { p_code: wrongCode(r.code) })), CODE_LOCKED, 'a sixth wrong one')
  assert.deepEqual(await footprint(quote, [link.id]), before, 'nothing more is counted or written')
})

test('a new code works after a lock', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  const r = await ready(link)
  for (let attempt = 1; attempt <= 5; attempt += 1) await decide(acceptArgs(r, { p_code: wrongCode(r.code) }))
  assert.deepEqual(await decide(acceptArgs(r)), CODE_LOCKED)

  const fresh = await issueCode(link.token)
  await decideOk(acceptArgs({ ...r, code: fresh }))
  const [locked, used] = await codeRows(link.id)
  assert.equal(locked.attempts, 5)
  assert.equal(locked.consumed_at, null, 'the locked code is never consumed')
  assert.equal(used.attempts, 0)
  assert.ok(used.consumed_at, 'the new code is')
  assert.equal((await quoteRow(quote)).status, 'Accepted')
})

test('an expired code is code_expired and not counted', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  const r = await ready(link)
  const [row] = await codeRows(link.id)
  await setCode(row.id, {
    created_at: new Date(time(row.created_at) - 11 * MINUTE).toISOString(),
    expires_at: new Date(time(row.expires_at) - 11 * MINUTE).toISOString(),
  })
  const before = await footprint(quote, [link.id])

  assert.deepEqual(await decide(acceptArgs(r)), CODE_EXPIRED, 'the right code, expired')
  assert.deepEqual(await decide(acceptArgs(r, { p_code: wrongCode(r.code) })), CODE_EXPIRED, 'a wrong code against an expired one')
  assert.deepEqual(await footprint(quote, [link.id]), before, 'not counted, nothing written')
})

test('no code, and a used code, are code_missing', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  const page = await portal(link.token)
  const r: Ready = { token: link.token, hash: page.snapshot_hash, code: '123456' }
  const before = await footprint(quote, [link.id])
  assert.deepEqual(await decide(acceptArgs(r)), CODE_MISSING, 'no code was ever issued')
  assert.deepEqual(await footprint(quote, [link.id]), before)

  // A code is consumed only by a decision on its own link, which then replays; the service role marks one used to
  // reach this branch on its own.
  const code = await issueCode(link.token)
  const [row] = await codeRows(link.id)
  await setCode(row.id, { consumed_at: new Date().toISOString() })
  const used = await footprint(quote, [link.id])
  assert.deepEqual(await decide(acceptArgs({ ...r, code })), CODE_MISSING, 'the newest code is used')
  assert.deepEqual(await footprint(quote, [link.id]), used)
})

test('an older code is wrong once a newer one exists', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  const hash = (await portal(link.token)).snapshot_hash
  const older = await issueCode(link.token)
  let newer = await issueCode(link.token)
  while (newer === older) newer = await issueCode(link.token)

  assert.deepEqual(await decide(acceptArgs({ token: link.token, hash, code: older })), codeWrong(4))
  const [olderRow, newerRow] = await codeRows(link.id)
  assert.equal(newerRow.attempts, 1, 'the attempt counts against the newest code')
  assert.equal(olderRow.attempts, 0)
  assert.equal(olderRow.consumed_at, null)
  assert.equal((await quoteRow(quote)).status, 'Sent')

  await decideOk(acceptArgs({ token: link.token, hash, code: newer }))
})

test('a code issued for one link cannot decide another link of the same quote', async () => {
  const quote = await fx.sentQuote()
  const first = await fx.newLink(quote)
  const second = await fx.newLink(quote, { email: 'second@example.test' })
  const r1 = await ready(first)
  const hash = (await portal(second.token)).snapshot_hash

  assert.deepEqual(await decide(acceptArgs({ token: second.token, hash, code: r1.code })), CODE_MISSING, 'the second link has no code of its own')
  let code2 = await issueCode(second.token)
  while (code2 === r1.code) code2 = await issueCode(second.token)
  assert.deepEqual(await decide(acceptArgs({ token: second.token, hash, code: r1.code })), codeWrong(4), "the first link's code is wrong for the second")
  const [firstCode] = await codeRows(first.id)
  assert.equal(firstCode.attempts, 0, "the first link's code is untouched")
  assert.equal(firstCode.consumed_at, null)
  assert.deepEqual(await responses(quote), [])

  const result = await decideOk(acceptArgs(r1))
  assert.equal((await responses(quote))[0].link_id, first.id, 'the first code decides only for its own link')
  assert.equal(result.quote_id, quote)
})

test('10 failures in the hour, or 30 in all, throttle even a correct code', async () => {
  // In the hour: two codes with 10 failed attempts between them throttle the newest, correct code; 9 do not.
  const hourlyQuote = await fx.sentQuote()
  const hourly = await fx.newLink(hourlyQuote)
  const hash = (await portal(hourly.token)).snapshot_hash
  await issueCode(hourly.token)
  await issueCode(hourly.token)
  const code = await issueCode(hourly.token)
  const [first, second] = await codeRows(hourly.id)
  await setCode(first.id, { attempts: 5 })
  await setCode(second.id, { attempts: 5 })
  const before = await footprint(hourlyQuote, [hourly.id])
  assert.deepEqual(await decide(acceptArgs({ token: hourly.token, hash, code })), THROTTLED, '10 failed attempts in the hour')
  assert.deepEqual(await footprint(hourlyQuote, [hourly.id]), before, 'the throttled call wrote nothing')
  await setCode(second.id, { attempts: 4 })
  await decideOk(acceptArgs({ token: hourly.token, hash, code }))

  // In all: 30 failed attempts on codes from earlier hours throttle a fresh, correct code; 29 do not.
  const lifetimeQuote = await fx.sentQuote()
  const lifetime = await fx.newLink(lifetimeQuote)
  const r = await ready(lifetime)
  const old: string[] = []
  for (let index = 0; index < 6; index += 1) old.push(await oldCode(lifetime.id, 5))
  const beforeAll = await footprint(lifetimeQuote, [lifetime.id])
  assert.deepEqual(await decide(acceptArgs(r)), THROTTLED, '30 failed attempts in all, none of them in the hour')
  assert.deepEqual(await footprint(lifetimeQuote, [lifetime.id]), beforeAll)
  await setCode(old[0], { attempts: 4 })
  await decideOk(acceptArgs(r))
})

test('a changed quote is stale and nothing is counted or written', async () => {
  const quote = await fx.sentQuote({}, [{ title: 'Set-up' }, { title: 'Retainer', description: 'Monthly support' }])
  const link = await fx.newLink(quote)
  const r = await ready(link)
  const line = (await lineRows(quote)).find((row) => row.title === 'Retainer')!
  assert.equal((await admin.from('quote_lines').update({ description: 'Monthly support, changed' }).eq('id', line.id)).error, null)
  const before = await footprint(quote, [link.id])

  assert.deepEqual(await decide(acceptArgs(r)), STALE, 'a line changed after the page loaded')
  assert.deepEqual(await decide(acceptArgs(r, { p_code: wrongCode(r.code) })), STALE, 'a wrong code on a stale page is not counted')
  assert.deepEqual(await footprint(quote, [link.id]), before, 'nothing counted, nothing written')

  // Reloaded, the page carries the new hash and the same code decides.
  const page = await portal(link.token)
  assert.notEqual(page.snapshot_hash, r.hash)
  await decideOk(acceptArgs({ ...r, hash: page.snapshot_hash }))
  assert.equal((await responses(quote))[0].snapshot_hash, page.snapshot_hash)
})

test('moving the quote to Expired, Superseded, Accepted (by hand) or archiving it, or revoking the link, after the page loaded is refused and writes nothing', async () => {
  for (const token of [null, '', 'x', `${'a'.repeat(42)}=`, randomBytes(32).toString('base64url')]) {
    assert.deepEqual(await decide(acceptArgs({ token: token as string, hash: 'a'.repeat(64), code: '123456' })), INVALID, `token ${JSON.stringify(token)}`)
  }

  const cases: Array<{ label: string; act: (quote: string, link: PortalLink) => Promise<void>; expected: typeof INVALID }> = [
    { label: 'Expired by staff', act: (quote) => fx.setStatus(quote, 'Expired'), expected: NOT_OPEN },
    { label: 'Accepted by hand', act: (quote) => fx.setStatus(quote, 'Accepted'), expected: NOT_OPEN },
    { label: 'Declined by hand', act: (quote) => fx.setStatus(quote, 'Declined'), expected: NOT_OPEN },
    {
      label: 'Superseded by a sent revision',
      act: async (quote) => assert.equal((await fx.sender.client.rpc('send_quote', { p_id: await fx.revise(quote) })).error, null),
      expected: NOT_OPEN,
    },
    { label: 'archived', act: (quote) => setQuote(quote, { archived_at: new Date().toISOString() }), expected: INVALID },
    {
      label: 'link revoked by staff',
      act: async (_quote, link) => assert.equal((await fx.sender.client.rpc('revoke_quote_access_link', { p_link_id: link.id })).error, null),
      expected: INVALID,
    },
    {
      label: 'link past its expiry',
      act: async (_quote, link) => setLink(link.id, { expires_at: new Date(time((await linkRow(link.id)).created_at) - 1000).toISOString() }),
      expected: NOT_OPEN,
    },
  ]
  for (const { label, act, expected } of cases) {
    const quote = await fx.sentQuote()
    const link = await fx.newLink(quote)
    const r = await ready(link)
    await act(quote, link)
    const state = (await portal(link.token)).state
    assert.notEqual(state, 'open', `${label} is not open`)
    const before = await footprint(quote, [link.id])
    const result = await decide(acceptArgs(r))
    assert.deepEqual(result, expected, label)
    assert.deepEqual(result, state === 'invalid' ? INVALID : NOT_OPEN, `${label}: follows portal_get_quote's ${state}`)
    assert.deepEqual(await footprint(quote, [link.id]), before, `${label}: nothing was written`)
  }
})

test('an accept and a decline from two links at once record exactly one response', async () => {
  const quote = await fx.sentQuote()
  const first = await fx.newLink(quote)
  const second = await fx.newLink(quote, { email: 'second@example.test' })
  const r1 = await ready(first)
  const r2 = await ready(second)

  const results = await Promise.all([decide(acceptArgs(r1)), decide(declineArgs(r2, { p_decline_reason: 'Budget considerations' }))])
  const winners = results.filter((result) => result.ok === true)
  assert.equal(winners.length, 1, `exactly one decision is recorded: ${JSON.stringify(results)}`)
  const [winner] = winners
  assert.equal(winner.replay, false)
  assert.deepEqual(results.find((result) => result.ok !== true), NOT_OPEN, 'the other finds the quote decided')

  const rows = await responses(quote)
  assert.equal(rows.length, 1, 'one response')
  assert.equal(rows[0].decision, winner.decision)
  const quoteAfter = await quoteRow(quote)
  assert.equal(quoteAfter.status, winner.decision === 'accepted' ? 'Accepted' : 'Declined')
  assert.equal((await entries(quote, 'quote.accepted')).length, winner.decision === 'accepted' ? 1 : 0)
  assert.equal((await entries(quote, 'quote.declined')).length, winner.decision === 'declined' ? 1 : 0)
  const loserLink = winner.decision === 'accepted' ? second : first
  const [loserCode] = await codeRows(loserLink.id)
  assert.equal(loserCode.attempts, 0, "the other link's code is not counted")
  assert.equal(loserCode.consumed_at, null, 'nor consumed')
})

test('reopening: a link that already decided stays used, a second unused link can decide again, a new response row is appended and the first is unchanged', async () => {
  const quote = await fx.sentQuote()
  const used = await fx.newLink(quote)
  const unused = await fx.newLink(quote, { email: 'unused@example.test' })
  const rUsed = await ready(used)
  const first = await decideOk(acceptArgs(rUsed))
  const [firstRow] = await responses(quote)

  await fx.setStatus(quote, 'Sent')
  assert.equal((await portal(used.token)).state, 'open', 'reopened by staff')

  // The used link answers with its own recorded decision, though the quote is open again.
  const replay = await decide(declineArgs(rUsed, { p_decline_reason: 'Other' }))
  assert.deepEqual(replay, { ...first, replay: true }, 'the used link replays its accept')

  const second = await decideOk(declineArgs(await ready(unused), { p_decline_reason: 'Other', p_decline_comments: 'Changed our minds.' }))
  assert.equal(second.replay, false)
  assert.equal(second.decision, 'declined')

  const rows = await responses(quote)
  assert.equal(rows.length, 2, 'a second response row is appended')
  assert.deepEqual(rows.find((row) => row.id === firstRow.id), firstRow, 'the first is unchanged')
  const appended = rows.find((row) => row.id !== firstRow.id)!
  assert.equal(appended.link_id, unused.id)
  assert.equal(appended.decision, 'declined')
  assert.equal((await quoteRow(quote)).status, 'Declined')
  assert.equal((await entries(quote, 'quote.declined')).length, 1)
})

test('incomplete input is refused without counting an attempt', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  const r = await ready(link)
  const cases: Array<[string, Record<string, unknown>]> = [
    ['a decision outside the two', acceptArgs(r, { p_decision: 'Accepted' })],
    ['no decision', acceptArgs(r, { p_decision: null })],
    ['a blank name', acceptArgs(r, { p_signatory_name: '   ' })],
    ['no name', acceptArgs(r, { p_signatory_name: null })],
    ['a one-character name', acceptArgs(r, { p_signatory_name: 'P' })],
    ['a one-character name inside spaces', acceptArgs(r, { p_signatory_name: '   P   ' })],
    ['a 121-character name', acceptArgs(r, { p_signatory_name: 'P'.repeat(121) })],
    ['a name containing a newline', acceptArgs(r, { p_signatory_name: 'Pat\nClient' })],
    ['a name containing a tab', acceptArgs(r, { p_signatory_name: 'Pat\tClient' })],
    ['a name carrying a mail header', acceptArgs(r, { p_signatory_name: 'Pat\r\nBcc: x@y.test' })],
    ['a one-character position', acceptArgs(r, { p_signatory_position: 'D' })],
    ['a 121-character position', acceptArgs(r, { p_signatory_position: 'D'.repeat(121) })],
    ['a position containing a control character', acceptArgs(r, { p_signatory_position: 'Director\u0007' })],
    ['a one-character organisation', acceptArgs(r, { p_signatory_organisation: 'O' })],
    ['a 161-character organisation', acceptArgs(r, { p_signatory_organisation: 'O'.repeat(161) })],
    ['an organisation containing a C1 control', acceptArgs(r, { p_signatory_organisation: 'Portal\u0085Client' })],
    ['consent false', acceptArgs(r, { p_consent: false })],
    ['consent missing', acceptArgs(r, { p_consent: null })],
    ['consent text empty', acceptArgs(r, { p_consent_text: '' })],
    ['consent text of 19 characters', acceptArgs(r, { p_consent_text: 'c'.repeat(19) })],
    ['consent text of 501 characters', acceptArgs(r, { p_consent_text: 'c'.repeat(501) })],
    ['a reason on an accept', acceptArgs(r, { p_decline_reason: 'Other' })],
    ['comments on an accept', acceptArgs(r, { p_decline_comments: 'Looking forward to it.' })],
    ['a reason outside the six', declineArgs(r, { p_decline_reason: 'Too expensive' })],
    ['a reason in another case', declineArgs(r, { p_decline_reason: 'other' })],
    ['an empty reason', declineArgs(r, { p_decline_reason: '' })],
    ['2001-character comments', declineArgs(r, { p_decline_comments: 'c'.repeat(2001) })],
    ['comments carrying a carriage return', declineArgs(r, { p_decline_comments: 'Thanks\r\nBcc: x@y.test' })],
    ['comments containing a control character', declineArgs(r, { p_decline_comments: 'Thanks\u001b[31m' })],
    ['a 5-digit code', acceptArgs(r, { p_code: r.code.slice(1) })],
    ['a 7-digit code', acceptArgs(r, { p_code: `${r.code}0` })],
    ['a code with a space', acceptArgs(r, { p_code: ` ${r.code}` })],
    ['no code', acceptArgs(r, { p_code: null })],
    ['a hash with upper case', acceptArgs(r, { p_snapshot_hash: r.hash.toUpperCase() })],
    ['a 63-character hash', acceptArgs(r, { p_snapshot_hash: r.hash.slice(1) })],
    ['no hash', acceptArgs(r, { p_snapshot_hash: null })],
  ]
  const before = await footprint(quote, [link.id])
  for (const [label, input] of cases) assert.deepEqual(await decide(input), INCOMPLETE, label)
  assert.deepEqual(await footprint(quote, [link.id]), before, 'no attempt was counted and nothing was written')

  // The same code then decides, at the lengths' edges; the three single-line fields are kept trimmed.
  await decideOk(acceptArgs(r, { p_signatory_name: '  Al  ', p_signatory_position: 'D'.repeat(120), p_signatory_organisation: 'O'.repeat(160) }))
  const [row] = await responses(quote)
  assert.equal(row.signatory_name, 'Al')
  assert.equal(row.signatory_position, 'D'.repeat(120))
  assert.equal(row.signatory_organisation, 'O'.repeat(160))
})

test('hostile text is stored exactly as given and nothing in the result is altered', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  const r = await ready(link)
  const name = "O'Brien <b>"
  const position = 'Director & "Chief" </td><script>alert(1)</script>'
  const organisation = "Acme'); drop table public.quote_responses; --"
  const opening = '<img src=x onerror=alert(1)>\nBcc: x@y.test\n\u202egnp.exe\tend '
  const comments = opening + 'z'.repeat(2000 - opening.length)
  assert.equal(comments.length, 2000)
  const userAgent = 'Mozilla/5.0 '.repeat(100)

  const result = await decideOk(declineArgs(r, {
    p_signatory_name: name, p_signatory_position: position, p_signatory_organisation: organisation,
    p_decline_reason: 'Other', p_decline_comments: comments,
    p_ip: '203.0.113.7, '.repeat(10), p_user_agent: userAgent,
  }))
  assert.equal(result.signatory_name, name)
  assert.equal(result.signatory_position, position)
  assert.equal(result.decline_comments, comments)
  assert.equal(result.decline_reason, 'Other')

  const [row] = await responses(quote)
  assert.equal(row.signatory_name, name)
  assert.equal(row.signatory_position, position)
  assert.equal(row.signatory_organisation, organisation)
  assert.equal(row.decline_comments, comments, 'the comments, bidi override and markup included, are stored as given')
  assert.equal(row.ip_address, null, 'an address over 64 characters is dropped, not refused')
  assert.equal(row.user_agent, userAgent.slice(0, 300), 'the user agent is cut to 300 characters')
  assert.equal((await quoteRow(quote)).status, 'Declined')
})

test("a decision is recorded against its own link's quote and organisation", async () => {
  const quoteA = await fx.sentQuote()
  const quoteB = await fx.sentQuote()
  const linkA = await fx.newLink(quoteA)
  const linkB = await fx.newLink(quoteB)
  const rA = await ready(linkA)
  const hashB = (await portal(linkB.token)).snapshot_hash
  let codeB = await issueCode(linkB.token)
  while (codeB === rA.code) codeB = await issueCode(linkB.token)
  const beforeA = await footprint(quoteA, [linkA.id])

  // Quote A's page and code cannot decide through quote B's link.
  assert.deepEqual(await decide(acceptArgs({ token: linkB.token, hash: rA.hash, code: rA.code })), STALE, "A's page is not B's")
  assert.deepEqual(await decide(acceptArgs({ token: linkB.token, hash: hashB, code: rA.code })), codeWrong(4), "A's code is not B's")

  const result = await decideOk(acceptArgs({ token: linkB.token, hash: hashB, code: codeB }))
  assert.equal(result.quote_id, quoteB)
  const [row] = await responses(quoteB)
  assert.deepEqual([row.quote_id, row.link_id, row.organization_id], [quoteB, linkB.id, fx.orgId])
  assert.deepEqual(await footprint(quoteA, [linkA.id]), beforeA, 'quote A and its link are untouched')

  // Every response written in this file belongs to its link's own quote and organisation.
  const all = must(await admin.from('quote_responses').select('quote_id,organization_id,link_id').eq('organization_id', fx.orgId)) as Array<Record<string, any>>
  const links = must(await admin.from('quote_access_links').select('id,quote_id,organization_id').in('id', all.map((item) => item.link_id))) as Array<Record<string, any>>
  for (const item of all) {
    const owner = links.find((candidate) => candidate.id === item.link_id)!
    assert.deepEqual([item.quote_id, item.organization_id], [owner.quote_id, owner.organization_id], `response on link ${item.link_id}`)
  }
})

test('neither a member nor anon can call portal_decide', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  const r = await ready(link)
  const before = await footprint(quote, [link.id])
  for (const [label, client] of [['member', fx.sender.client], ['anon', anonymous]] as const) {
    const result = await client.rpc('portal_decide', acceptArgs(r))
    assert.ok(result.error, `${label} is refused`)
    assert.match(result.error.message, /permission denied/i, `${label} is refused on privilege`)
    assert.equal(result.data, null)
  }
  assert.deepEqual(await footprint(quote, [link.id]), before, 'the refused calls wrote nothing')
  await decideOk(acceptArgs(r))
})

test('every reason in the list is accepted on a decline', async () => {
  for (const reason of REASONS) {
    const quote = await fx.sentQuote()
    const result = await decideOk(declineArgs(await ready(await fx.newLink(quote)), { p_decline_reason: reason }))
    assert.equal(result.decline_reason, reason)
  }
})
