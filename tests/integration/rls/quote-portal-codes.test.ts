import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test, { after, before } from 'node:test'

import { admin } from './helpers.ts'
import { anonymous, lineRows, linkRow, must, quoteRow, setLink, setQuote, setupPortalOrg, sha256, type PortalOrg } from './portal-fixtures.ts'

// Quote portal, slice 2, task 3: the snapshot hash and the response flag on the viewable payload, and
// portal_issue_code, which mints the six-digit confirmation code for an open link. Everything is called through the
// service role, as the portal's server module will call it. The code is kept only as sha256(salt || ':' || code) with its
// own salt, expires ten minutes after issue, and a link gets at most 5 codes an hour and none while its failed attempts
// reach 10 in the hour or 30 in all. Response rows are written here by the service role (the decide function comes in
// task 4); codes are aged and their attempts set by the service role to reach the caps.

let fx: PortalOrg

before(async () => {
  fx = await setupPortalOrg('portal-codes')
})

after(async () => {
  await fx?.teardown()
})

const MINUTE = 60_000
const HEX64 = /^[0-9a-f]{64}$/
const CODE_COLUMNS = ['id', 'organization_id', 'link_id', 'code_salt', 'code_hash', 'created_at', 'expires_at', 'attempts', 'consumed_at'].sort()
const ISSUED_KEYS = ['ok', 'code', 'expires_at', 'recipient_email', 'quote_number', 'client_name'].sort()
const CONSENT = 'I confirm that I am authorised to act on behalf of the organisation and have reviewed and accept this quotation and its accompanying terms and conditions.'
const THROTTLED = { ok: false, reason: 'throttled' }

const time = (value: string) => new Date(value).getTime()
const keysOf = (value: Record<string, unknown>) => Object.keys(value).sort()

const portal = async (token: string | null) => {
  const { data, error } = await admin.rpc('portal_get_quote', { p_token: token })
  assert.equal(error, null)
  return data as Record<string, any>
}
const issue = async (token: string | null) => {
  const { data, error } = await admin.rpc('portal_issue_code', { p_token: token })
  assert.equal(error, null)
  return data as Record<string, any>
}
const issueOk = async (token: string) => {
  const result = await issue(token)
  assert.equal(result.ok, true, `a code is issued: ${JSON.stringify(result)}`)
  return result
}
const codeRows = async (linkId: string) =>
  must(await admin.from('quote_access_codes').select('*').eq('link_id', linkId).order('created_at')) as Array<Record<string, any>>
const setCode = async (id: string, change: Record<string, unknown>) =>
  assert.equal((await admin.from('quote_access_codes').update(change).eq('id', id)).error, null)
/** Moves every code of a link back by the given minutes, so it was issued that much earlier. */
const ageCodes = async (linkId: string, minutes: number) => {
  for (const row of await codeRows(linkId)) {
    await setCode(row.id, {
      created_at: new Date(time(row.created_at) - minutes * MINUTE).toISOString(),
      expires_at: new Date(time(row.expires_at) - minutes * MINUTE).toISOString(),
    })
  }
}
/** A code issued long ago with the given failed attempts, written by the service role. */
const oldCode = async (linkId: string, attempts: number, minutesAgo = 180) => {
  const issuedAt = Date.now() - minutesAgo * MINUTE
  const salt = randomBytes(16).toString('hex')
  must(await admin.from('quote_access_codes').insert({
    organization_id: fx.orgId, link_id: linkId, code_salt: salt, code_hash: sha256(`${salt}:000000`), attempts,
    created_at: new Date(issuedAt).toISOString(), expires_at: new Date(issuedAt + 10 * MINUTE).toISOString(),
  }).select('id').single())
}
/** A decision recorded for a link, written by the service role as the decide function will. */
const recordResponse = async (quoteId: string, linkId: string, decision: 'accepted' | 'declined', snapshotHash: string) =>
  must(await admin.from('quote_responses').insert({
    organization_id: fx.orgId, quote_id: quoteId, link_id: linkId, decision, signatory_name: 'Pat Client', signatory_position: 'Director',
    signatory_organisation: 'Portal Client (Pty) Ltd', verified_email: 'client@example.test', consent_text: CONSENT, consent_given: true,
    code_verified_at: new Date().toISOString(), snapshot_hash: snapshotHash, quote_number: (await quoteRow(quoteId)).quote_number, quote_version: 1,
  }).select('*').single()) as Record<string, any>
const auditCount = async (quoteId: string) => {
  const { count, error } = await admin.from('audit_events').select('id', { count: 'exact', head: true }).eq('resource', 'quotes').eq('resource_id', quoteId)
  assert.equal(error, null)
  return count
}

test('the viewable payload carries snapshot_hash and response', async () => {
  const quote = await fx.sentQuote({}, [{ title: 'Set-up', charge_kind: 'once_off' }, { title: 'Retainer', charge_kind: 'monthly' }])
  const link = await fx.newLink(quote)

  const reads = [await portal(link.token), await portal(link.token), await portal(link.token)]
  for (const read of reads) {
    assert.equal(read.state, 'open')
    assert.match(read.snapshot_hash, HEX64, 'the hash is 64 lower-case hex characters')
    assert.ok('response' in read, 'response is present')
    assert.equal(read.response, null, 'no decision yet')
  }
  assert.equal(reads[1].snapshot_hash, reads[0].snapshot_hash, 'the same hash on every read')
  assert.equal(reads[2].snapshot_hash, reads[0].snapshot_hash)

  const other = await portal((await fx.newLink(await fx.sentQuote())).token)
  assert.match(other.snapshot_hash, HEX64)
  assert.notEqual(other.snapshot_hash, reads[0].snapshot_hash, 'another quote has another hash')

  // Accepted by hand (staff): the record changed, so the hash did; there is no response record for either link.
  const second = await fx.newLink(quote, { email: 'second@example.test' })
  await fx.setStatus(quote, 'Accepted')
  const accepted = await portal(link.token)
  assert.equal(accepted.state, 'accepted')
  assert.match(accepted.snapshot_hash, HEX64)
  assert.notEqual(accepted.snapshot_hash, reads[0].snapshot_hash, 'the status and accepted_at are part of the snapshot')
  assert.equal(accepted.response, null, 'marked by staff: no response')

  // A response recorded for this link appears on this link only, as exactly { decision, decided_at }.
  const response = await recordResponse(quote, link.id, 'accepted', accepted.snapshot_hash)
  const withResponse = await portal(link.token)
  assert.deepEqual(Object.keys(withResponse.response).sort(), ['decided_at', 'decision'])
  assert.equal(withResponse.response.decision, 'accepted')
  assert.equal(time(withResponse.response.decided_at), time(response.decided_at))
  assert.equal(withResponse.snapshot_hash, accepted.snapshot_hash, 'recording a response does not change the snapshot')
  const secondRead = await portal(second.token)
  assert.equal(secondRead.state, 'accepted')
  assert.equal(secondRead.response, null, "another link's decision is not this link's response")

  // Declined, with a declined response.
  const declinedQuote = await fx.sentQuote()
  const declinedLink = await fx.newLink(declinedQuote)
  await fx.setStatus(declinedQuote, 'Declined')
  const declined = await portal(declinedLink.token)
  assert.equal(declined.state, 'declined')
  assert.match(declined.snapshot_hash, HEX64)
  assert.equal(declined.response, null)
  await recordResponse(declinedQuote, declinedLink.id, 'declined', declined.snapshot_hash)
  assert.equal((await portal(declinedLink.token)).response.decision, 'declined')
})

test('snapshot_hash changes when a frozen line changes', async () => {
  const quote = await fx.sentQuote({}, [{ title: 'Set-up' }, { title: 'Retainer', description: 'Monthly support' }])
  const link = await fx.newLink(quote)
  const before = await portal(link.token)
  const line = (await lineRows(quote)).find((row) => row.title === 'Retainer')!

  // A member cannot touch a line of a Sent quote; the service role can (the freeze trigger lets it through).
  const refused = await fx.sender.client.from('quote_lines').update({ description: 'Changed' }).eq('id', line.id)
  assert.match(refused.error?.message ?? '', /QUOTE_FROZEN/, 'the line is frozen for members')

  assert.equal((await admin.from('quote_lines').update({ description: 'Monthly support, changed' }).eq('id', line.id)).error, null)
  const changed = await portal(link.token)
  assert.equal(changed.lines.find((row: Record<string, any>) => row.id === line.id).description, 'Monthly support, changed')
  assert.match(changed.snapshot_hash, HEX64)
  assert.notEqual(changed.snapshot_hash, before.snapshot_hash, 'a changed line changes the hash')

  // Put back, the content is what it was and so is the hash (the quote's updated_at moved, but it is not in the snapshot).
  assert.equal((await admin.from('quote_lines').update({ description: 'Monthly support' }).eq('id', line.id)).error, null)
  assert.equal((await portal(link.token)).snapshot_hash, before.snapshot_hash, 'the hash is of the content alone')
})

test('a code is six digits, stored hashed with its own salt, and the plain code is in no column', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote, { email: 'Pat.Client@Example.TEST', name: 'Pat Client' })

  const result = await issueOk(link.token)
  assert.deepEqual(keysOf(result), ISSUED_KEYS, 'the result carries no ids, salt or hash')
  assert.match(result.code, /^[0-9]{6}$/, 'six digits')
  assert.equal(result.recipient_email, 'pat.client@example.test', "the link's own recipient")
  assert.equal(result.quote_number, (await quoteRow(quote)).quote_number)
  assert.equal(result.client_name, 'Portal Client')

  const rows = await codeRows(link.id)
  assert.equal(rows.length, 1, 'one code row')
  const [row] = rows
  assert.deepEqual(keysOf(row), CODE_COLUMNS, 'no column was added to hold the code')
  assert.equal(row.organization_id, fx.orgId)
  assert.equal(row.link_id, link.id)
  assert.equal(row.attempts, 0)
  assert.equal(row.consumed_at, null)
  assert.match(row.code_salt, /^[0-9a-f]{32,}$/, 'a random salt')
  assert.equal(row.code_hash, sha256(`${row.code_salt}:${result.code}`), "the hash is sha256(salt || ':' || code)")
  for (const [column, value] of Object.entries(row)) {
    assert.notEqual(String(value), result.code, `the code is not stored in ${column}`)
    assert.notEqual(value, sha256(result.code), `the unsalted hash is not stored in ${column}`)
  }
})

test('it expires ten minutes after issue', async () => {
  const link = await fx.newLink(await fx.sentQuote())
  const result = await issueOk(link.token)
  const [row] = await codeRows(link.id)
  assert.equal(time(result.expires_at), time(row.expires_at), 'the result gives the stored expiry')
  // Measured against the database's own clock (created_at), so a skewed local clock cannot fail it.
  assert.ok(Math.abs(time(row.expires_at) - time(row.created_at) - 10 * MINUTE) < 5000, 'ten minutes after issue')
})

test('two codes for one link have different salts', async () => {
  const link = await fx.newLink(await fx.sentQuote())
  const first = await issueOk(link.token)
  const second = await issueOk(link.token)
  const rows = await codeRows(link.id)
  assert.equal(rows.length, 2)
  assert.notEqual(rows[0].code_salt, rows[1].code_salt, 'each code has its own salt')
  assert.notEqual(rows[0].code_hash, rows[1].code_hash)
  for (const code of [first.code, second.code]) {
    assert.match(code, /^[0-9]{6}$/)
    assert.equal(rows.filter((row) => row.code_hash === sha256(`${row.code_salt}:${code}`)).length, 1, 'each code matches its own row')
  }
})

test('the sixth request in an hour is throttled and the fifth is not', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  for (let request = 1; request <= 5; request += 1) await issueOk(link.token)
  assert.deepEqual(await issue(link.token), THROTTLED, 'the sixth request in the hour')
  assert.equal((await codeRows(link.id)).length, 5, 'the refused request wrote no code')

  // The limit is per link: another link to the same quote still gets a code.
  await issueOk((await fx.newLink(quote, { email: 'other@example.test' })).token)

  // Codes issued more than an hour ago do not count.
  await ageCodes(link.id, 61)
  await issueOk(link.token)
  assert.equal((await codeRows(link.id)).length, 6)

  // Requests at the same moment are counted one after another: seven at once give five codes.
  const busy = await fx.newLink(quote, { email: 'busy@example.test' })
  const results = await Promise.all(Array.from({ length: 7 }, () => issue(busy.token)))
  assert.equal(results.filter((result) => result.ok === true).length, 5, 'five codes')
  assert.deepEqual(results.filter((result) => result.ok !== true), [THROTTLED, THROTTLED], 'two throttled')
  assert.equal((await codeRows(busy.id)).length, 5)
})

test('failed attempts of 10 in the hour, and of 30 in all, throttle new codes', async () => {
  const quote = await fx.sentQuote()

  // In the hour: 9 failed attempts still allow a code; 10 do not.
  const hourly = await fx.newLink(quote)
  await issueOk(hourly.token)
  await issueOk(hourly.token)
  const [first, second] = await codeRows(hourly.id)
  await setCode(first.id, { attempts: 5 })
  await setCode(second.id, { attempts: 4 })
  await issueOk(hourly.token)
  await setCode(second.id, { attempts: 5 })
  assert.deepEqual(await issue(hourly.token), THROTTLED, '10 failed attempts in the hour')
  assert.equal((await codeRows(hourly.id)).length, 3, 'the refused request wrote no code')
  await ageCodes(hourly.id, 61)
  await issueOk(hourly.token)

  // In all: 29 failed attempts on codes from earlier hours still allow a code; 30 do not.
  const lifetime = await fx.newLink(quote, { email: 'lifetime@example.test' })
  for (const attempts of [5, 5, 5, 5, 5, 4]) await oldCode(lifetime.id, attempts)
  await issueOk(lifetime.token)
  const older = (await codeRows(lifetime.id)).find((row) => row.attempts === 4)!
  await setCode(older.id, { attempts: 5 })
  assert.deepEqual(await issue(lifetime.token), THROTTLED, '30 failed attempts in all, none of them in the hour')
  assert.equal((await codeRows(lifetime.id)).length, 7)

  // The caps are per link.
  await issueOk((await fx.newLink(quote, { email: 'fresh@example.test' })).token)
})

test('invalid, revoked and unknown tokens give invalid; an expired link, an Expired, Superseded, Accepted or Declined quote and an archived quote give not_open or invalid exactly as portal_get_quote does', async () => {
  const INVALID = { ok: false, reason: 'invalid' }
  const NOT_OPEN = { ok: false, reason: 'not_open' }
  for (const token of [null, '', 'x', `${'a'.repeat(42)}=`, randomBytes(32).toString('base64url')]) {
    assert.deepEqual(await issue(token), INVALID, `token ${JSON.stringify(token)}`)
  }

  const cases: Array<{ label: string; link: { id: string; token: string }; expected: typeof INVALID }> = []

  const revokedQuote = await fx.sentQuote()
  const revoked = await fx.newLink(revokedQuote)
  assert.equal((await fx.sender.client.rpc('revoke_quote_access_link', { p_link_id: revoked.id })).error, null)
  cases.push({ label: 'revoked by staff', link: revoked, expected: INVALID })

  const archivedQuote = await fx.sentQuote()
  const archived = await fx.newLink(archivedQuote)
  await setQuote(archivedQuote, { archived_at: new Date().toISOString() })
  cases.push({ label: 'archived quote', link: archived, expected: INVALID })

  const pastQuote = await fx.sentQuote()
  const past = await fx.newLink(pastQuote)
  await setLink(past.id, { expires_at: new Date(time((await linkRow(past.id)).created_at) - 1000).toISOString() })
  cases.push({ label: 'link past its expiry', link: past, expected: NOT_OPEN })

  for (const status of ['Expired', 'Accepted', 'Declined']) {
    const quote = await fx.sentQuote()
    const link = await fx.newLink(quote)
    await fx.setStatus(quote, status)
    cases.push({ label: `${status} quote`, link, expected: NOT_OPEN })
  }

  const original = await fx.sentQuote()
  const superseded = await fx.newLink(original)
  assert.equal((await fx.sender.client.rpc('send_quote', { p_id: await fx.revise(original) })).error, null)
  cases.push({ label: 'Superseded quote', link: superseded, expected: NOT_OPEN })

  for (const { label, link, expected } of cases) {
    const state = (await portal(link.token)).state
    assert.notEqual(state, 'open', `${label} is not open`)
    const result = await issue(link.token)
    assert.deepEqual(result, state === 'invalid' ? INVALID : NOT_OPEN, `${label}: follows portal_get_quote's ${state}`)
    assert.deepEqual(result, expected, label)
    assert.deepEqual(await codeRows(link.id), [], `${label}: no code was written`)
  }
})

test('a link that already carries a decision gives already_decided, and another link of the quote still gets a code', async () => {
  // A reopened quote: decided through one link, then moved back to Sent by staff.
  const quote = await fx.sentQuote()
  const used = await fx.newLink(quote)
  const unused = await fx.newLink(quote, { email: 'unused@example.test' })
  await fx.setStatus(quote, 'Accepted')
  await recordResponse(quote, used.id, 'accepted', (await portal(used.token)).snapshot_hash)
  await fx.setStatus(quote, 'Sent')
  assert.equal((await portal(used.token)).state, 'open')

  assert.deepEqual(await issue(used.token), { ok: false, reason: 'already_decided' })
  assert.deepEqual(await codeRows(used.id), [], 'no code was written')
  await issueOk(unused.token)
})

test('issuing a code changes nothing but the codes table', async () => {
  const quote = await fx.sentQuote({ owner_id: fx.owner.teamMemberId })
  const link = await fx.newLink(quote)
  const quoteBefore = await quoteRow(quote)
  const linesBefore = await lineRows(quote)
  const linkBefore = await linkRow(link.id)
  const auditBefore = await auditCount(quote)
  const payloadBefore = await portal(link.token)

  await issueOk(link.token)
  await issueOk(link.token)

  assert.deepEqual(await quoteRow(quote), quoteBefore, 'the quote row, updated_at included, is identical')
  assert.deepEqual(await lineRows(quote), linesBefore, 'the lines are identical')
  assert.deepEqual(await linkRow(link.id), linkBefore, 'the link row is identical')
  assert.equal(await auditCount(quote), auditBefore, 'no audit event was written for the quote')
  assert.deepEqual(must(await admin.from('quote_responses').select('id').eq('quote_id', quote)), [], 'no response was written')
  assert.deepEqual(await portal(link.token), payloadBefore, 'the payload, its hash included, is unchanged')
  assert.equal((await codeRows(link.id)).length, 2, 'only the two codes were written')
})

test('neither a member nor anon can call portal_issue_code', async () => {
  const quote = await fx.sentQuote()
  const link = await fx.newLink(quote)
  for (const [label, client] of [['member', fx.sender.client], ['anon', anonymous]] as const) {
    const result = await client.rpc('portal_issue_code', { p_token: link.token })
    assert.ok(result.error, `${label} is refused`)
    assert.match(result.error.message, /permission denied/i, `${label} is refused on privilege`)
    assert.equal(result.data, null)
    const hash = await client.schema('private').rpc('quote_snapshot_hash', { p_quote_id: quote })
    assert.ok(hash.error, `${label} cannot reach private.quote_snapshot_hash`)
    assert.equal(hash.data, null)
  }
  assert.deepEqual(await codeRows(link.id), [], 'the refused calls wrote no code')
  await issueOk(link.token)
})
