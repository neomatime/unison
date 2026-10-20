import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

// Quote portal, slice 2, task 1: the two tables the accept/decline functions build on. Nothing here has a function
// behind it yet, so the service role writes the fixtures and the signed-in roles are only asked what the privilege
// layer, the policies, the constraints and the append-only triggers let them do.
//
// TRUNCATE is not covered here: PostgREST exposes no TRUNCATE and this suite holds no direct database connection, so
// the BEFORE TRUNCATE trigger was checked once, with a direct SQL statement, when the migration was applied.

type U = { id: string; email: string; password: string }
type Fixture = { quoteId: string; quoteNumber: string; linkId: string }

let orgA: string
let orgB: string
let memberA: U
let memberB: U
let memberClient: SupabaseClient
let memberBClient: SupabaseClient
const extraOrgs: string[] = []

const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const hex64 = () => createHash('sha256').update(randomUUID()).digest('hex')
const inOneDay = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const CONSENT = 'I confirm that I am authorised to act on behalf of the organisation and have reviewed and accept this quotation and its accompanying terms and conditions.'
const REASONS = ['Budget considerations', 'Timing is not right', 'Scope does not meet our requirements', 'Internal approval pending', 'Chose another provider', 'Other']

/** A refusal by the named code, and by the named constraint or message, so a row cannot be refused for the wrong reason. */
const refused = (result: { error: { code?: string; message: string } | null }, code: string, message: RegExp, label: string) => {
  assert.equal(result.error?.code, code, `${label}: ${result.error?.message}`)
  assert.match(result.error?.message ?? '', message, label)
}

/** A Sent quote and a link to it, written by the service role (the tables do not care how a quote got to Sent). */
const fixture = async (organizationId: string): Promise<Fixture> => {
  const quote = must(await admin.from('quotes').insert({
    organization_id: organizationId, client_name: 'Portal Client', quote_number: `RLS-Q-${randomUUID().slice(0, 8)}`, status: 'Sent',
  }).select('id,quote_number').single())
  return { quoteId: quote.id as string, quoteNumber: quote.quote_number as string, linkId: await newLink(organizationId, quote.id as string) }
}
const newLink = async (organizationId: string, quoteId: string) =>
  must(await admin.from('quote_access_links').insert({
    organization_id: organizationId, quote_id: quoteId, token_hash: hex64(), recipient_email: 'client@example.test', expires_at: inOneDay(),
  }).select('id').single()).id as string

const responseFields = (organizationId: string, fx: Fixture, overrides: Record<string, unknown> = {}) => ({
  organization_id: organizationId,
  quote_id: fx.quoteId,
  link_id: fx.linkId,
  decision: 'accepted',
  signatory_name: 'Pat Client',
  signatory_position: 'Managing Director',
  signatory_organisation: 'Portal Client (Pty) Ltd',
  verified_email: 'client@example.test',
  consent_text: CONSENT,
  consent_given: true,
  code_verified_at: new Date().toISOString(),
  snapshot_hash: hex64(),
  terms_sources: [{ layer: 'base', version: 2 }],
  quote_number: fx.quoteNumber,
  quote_version: 1,
  ip_address: '203.0.113.7',
  user_agent: 'Mozilla/5.0 (test)',
  ...overrides,
})
const insertResponse = (organizationId: string, fx: Fixture, overrides: Record<string, unknown> = {}) =>
  admin.from('quote_responses').insert(responseFields(organizationId, fx, overrides)).select('id').single()
const insertCode = (organizationId: string, linkId: string, overrides: Record<string, unknown> = {}) =>
  admin.from('quote_access_codes').insert({
    organization_id: organizationId, link_id: linkId, code_salt: hex64(), code_hash: hex64(), expires_at: inOneDay(), ...overrides,
  }).select('id').single()

const responseIds = async (ids: string[]) => must(await admin.from('quote_responses').select('id').in('id', ids)).map((row) => row.id as string)
const codeIds = async (ids: string[]) => must(await admin.from('quote_access_codes').select('id').in('id', ids)).map((row) => row.id as string)
const linkIds = async (ids: string[]) => must(await admin.from('quote_access_links').select('id').in('id', ids)).map((row) => row.id as string)

before(async () => {
  orgA = await createFixtureOrg('portal-decisions-a')
  orgB = await createFixtureOrg('portal-decisions-b')
  memberA = await createFixtureUser(orgA, 'member')
  memberB = await createFixtureUser(orgB, 'member')
  memberClient = await signedInClient(memberA.email, memberA.password)
  memberBClient = await signedInClient(memberB.email, memberB.password)
})

after(async () => {
  await cleanup([orgA, orgB, ...extraOrgs].filter(Boolean), [memberA?.id, memberB?.id].filter(Boolean))
})

test("a member reads their organisation's responses, never another's, and cannot write one", async () => {
  const fxA = await fixture(orgA)
  const fxB = await fixture(orgB)
  const responseA = must(await insertResponse(orgA, fxA)).id as string
  const responseB = must(await insertResponse(orgB, fxB)).id as string

  const own = must(await memberClient.from('quote_responses').select('id,quote_id,link_id,decision,signatory_name,verified_email').in('id', [responseA, responseB]))
  assert.deepEqual(own, [{ id: responseA, quote_id: fxA.quoteId, link_id: fxA.linkId, decision: 'accepted', signatory_name: 'Pat Client', verified_email: 'client@example.test' }],
    "only the member's own organisation's response comes back")
  const other = await memberBClient.from('quote_responses').select('id').in('id', [responseA, responseB])
  assert.deepEqual(other.data, [{ id: responseB }], "the other organisation's member sees only theirs")

  const written = await memberClient.from('quote_responses').insert(responseFields(orgA, fxA, { link_id: await newLink(orgA, fxA.quoteId) }))
  refused(written, '42501', /permission denied for table quote_responses/, 'a member cannot insert a response')
  const changed = await memberClient.from('quote_responses').update({ signatory_name: 'Someone Else' }).eq('id', responseA)
  refused(changed, '42501', /permission denied for table quote_responses/, 'a member cannot update a response')
  const removed = await memberClient.from('quote_responses').delete().eq('id', responseA)
  refused(removed, '42501', /permission denied for table quote_responses/, 'a member cannot delete a response')

  const ground = must(await admin.from('quote_responses').select('signatory_name').eq('id', responseA).single())
  assert.equal(ground.signatory_name, 'Pat Client', 'the response is untouched')
})

test('anon has no privileges on quote_responses and quote_access_codes', async () => {
  const NIL = '00000000-0000-0000-0000-000000000000'
  for (const table of ['quote_responses', 'quote_access_codes'] as const) {
    const denied = new RegExp(`permission denied for table ${table}\\b`)
    refused(await anonymous.from(table).select('id').limit(1), '42501', denied, `select on ${table}`)
    refused(await anonymous.from(table).insert({ organization_id: NIL }), '42501', denied, `insert on ${table}`)
    refused(await anonymous.from(table).update({ organization_id: NIL }).eq('id', NIL), '42501', denied, `update on ${table}`)
    refused(await anonymous.from(table).delete().eq('id', NIL), '42501', denied, `delete on ${table}`)
  }
})

test('a member cannot read quote_access_codes at all', async () => {
  const fx = await fixture(orgA)
  const code = must(await insertCode(orgA, fx.linkId)).id as string

  const read = await memberClient.from('quote_access_codes').select('id').eq('link_id', fx.linkId)
  refused(read, '42501', /permission denied for table quote_access_codes/, 'a member is refused, not shown an empty list')
  assert.equal(read.data, null)
  const written = await memberClient.from('quote_access_codes').insert({ organization_id: orgA, link_id: fx.linkId, code_salt: 'x', code_hash: 'y', expires_at: inOneDay() })
  refused(written, '42501', /permission denied for table quote_access_codes/, 'a member cannot insert a code')
  refused(await memberClient.from('quote_access_codes').update({ attempts: 5 }).eq('id', code), '42501', /permission denied for table quote_access_codes/, 'a member cannot update a code')
  refused(await memberClient.from('quote_access_codes').delete().eq('id', code), '42501', /permission denied for table quote_access_codes/, 'a member cannot delete a code')

  const ground = must(await admin.from('quote_access_codes').select('id,attempts,consumed_at').eq('link_id', fx.linkId))
  assert.deepEqual(ground, [{ id: code, attempts: 0, consumed_at: null }], 'the code is there and untouched, so the refusal was the privilege')
})

test('a response cannot be updated or deleted, even by the service role', async () => {
  const fx = await fixture(orgA)
  const response = must(await insertResponse(orgA, fx)).id as string
  const written = must(await admin.from('quote_responses').select('*').eq('id', response).single())

  refused(await admin.from('quote_responses').update({ signatory_name: 'Rewritten' }).eq('id', response), '23514', /QUOTE_RESPONSE_APPEND_ONLY/, 'update')
  refused(await admin.from('quote_responses').update({ decision: 'declined' }).eq('id', response), '23514', /QUOTE_RESPONSE_APPEND_ONLY/, 'update of the decision')
  refused(await admin.from('quote_responses').update({ signatory_name: written.signatory_name }).eq('id', response), '23514', /QUOTE_RESPONSE_APPEND_ONLY/, 'even an update that changes nothing')
  refused(await admin.from('quote_responses').delete().eq('id', response), '23514', /QUOTE_RESPONSE_APPEND_ONLY/, 'delete')

  assert.deepEqual(must(await admin.from('quote_responses').select('*').eq('id', response).single()), written, 'the row is exactly as it was written')
})

test('deleting the quote, and deleting the organisation, removes its responses and codes', async () => {
  // The quote: its links, codes and response go with it.
  const fx = await fixture(orgA)
  const response = must(await insertResponse(orgA, fx)).id as string
  const code = must(await insertCode(orgA, fx.linkId)).id as string
  assert.deepEqual(await responseIds([response]), [response])
  assert.deepEqual(await codeIds([code]), [code])
  const quoteDeleted = await admin.from('quotes').delete().eq('id', fx.quoteId)
  assert.equal(quoteDeleted.error, null, 'a quote with a response can be deleted')
  assert.deepEqual(await responseIds([response]), [], 'the response went with its quote')
  assert.deepEqual(await codeIds([code]), [], 'the code went with its link')
  assert.deepEqual(await linkIds([fx.linkId]), [], 'the link went with its quote')

  // The organisation, through the same function the fixture cleanup uses.
  const orgC = await createFixtureOrg('portal-decisions-c')
  extraOrgs.push(orgC)
  const fxC = await fixture(orgC)
  const secondLink = await newLink(orgC, fxC.quoteId)
  const responseC = must(await insertResponse(orgC, fxC)).id as string
  const responseC2 = must(await insertResponse(orgC, { ...fxC, linkId: secondLink }, { decision: 'declined', decline_reason: 'Other', decline_comments: 'Not now' })).id as string
  const codeC = must(await insertCode(orgC, fxC.linkId)).id as string
  assert.deepEqual((await responseIds([responseC, responseC2])).sort(), [responseC, responseC2].sort())
  const orgDeleted = await admin.rpc('delete_organization', { target_org: orgC })
  assert.equal(orgDeleted.error, null, 'an organisation with responses can be deleted')
  assert.deepEqual(await responseIds([responseC, responseC2]), [], "the organisation's responses went with it")
  assert.deepEqual(await codeIds([codeC]), [], "the organisation's codes went with it")
  assert.deepEqual(must(await admin.from('organizations').select('id').eq('id', orgC)), [], 'the organisation is gone')
})

test('a link that has a response cannot be deleted on its own', async () => {
  const fx = await fixture(orgA)
  const response = must(await insertResponse(orgA, fx)).id as string

  // The reference is deferred, so the refusal comes when the statement commits.
  const alone = await admin.from('quote_access_links').delete().eq('id', fx.linkId)
  refused(alone, '23503', /quote_responses_link_id_fkey/, 'the link is held by its response')
  assert.deepEqual(await linkIds([fx.linkId]), [fx.linkId], 'the link is still there')
  assert.deepEqual(await responseIds([response]), [response], 'and so is the response')

  // Deleting the quote removes the link and the response in one transaction, so the deferred check finds nothing.
  assert.equal((await admin.from('quotes').delete().eq('id', fx.quoteId)).error, null)
  assert.deepEqual(await linkIds([fx.linkId]), [])
  assert.deepEqual(await responseIds([response]), [])
})

test('one decision per link', async () => {
  const fx = await fixture(orgA)
  must(await insertResponse(orgA, fx))
  refused(await insertResponse(orgA, fx), '23505', /quote_responses_link_id_key/, 'a second accept on the same link')
  refused(await insertResponse(orgA, fx, { decision: 'declined' }), '23505', /quote_responses_link_id_key/, 'a decline on a link that already accepted')

  // The limit is per link, not per quote: a fresh link to the same quote can carry its own response (a reopened quote).
  const fresh = { ...fx, linkId: await newLink(orgA, fx.quoteId) }
  assert.equal((await insertResponse(orgA, fresh, { decision: 'declined' })).error, null, 'another link on the quote can decide')
})

test('decline fields are refused on an accepted response', async () => {
  const fx = await fixture(orgA)
  const next = async () => ({ ...fx, linkId: await newLink(orgA, fx.quoteId) })
  const pattern = /quote_responses_decline_fields_check/
  refused(await insertResponse(orgA, await next(), { decline_reason: 'Other' }), '23514', pattern, 'a reason on an accepted response')
  refused(await insertResponse(orgA, await next(), { decline_comments: 'We changed our minds' }), '23514', pattern, 'comments on an accepted response')
  refused(await insertResponse(orgA, await next(), { decline_reason: 'Other', decline_comments: 'No' }), '23514', pattern, 'both on an accepted response')

  assert.equal((await insertResponse(orgA, await next())).error, null, 'an accept without them is fine')
  assert.equal((await insertResponse(orgA, await next(), { decision: 'declined', decline_reason: 'Budget considerations', decline_comments: 'Next year' })).error, null, 'a decline may carry both')
  assert.equal((await insertResponse(orgA, await next(), { decision: 'declined', decline_reason: null, decline_comments: null })).error, null, 'a decline may carry neither')
  assert.equal((await insertResponse(orgA, await next(), { decision: 'declined', decline_reason: null, decline_comments: 'Just comments' })).error, null, 'a decline may carry only comments')
})

test('a decision outside accepted and declined, and a reason outside the six, are refused', async () => {
  const fx = await fixture(orgA)
  const next = async () => ({ ...fx, linkId: await newLink(orgA, fx.quoteId) })
  for (const decision of ['approved', 'Accepted', 'DECLINED', 'withdrawn', '']) {
    refused(await insertResponse(orgA, await next(), { decision }), '23514', /quote_responses_decision_check/, `${JSON.stringify(decision)} is not a decision`)
  }
  for (const reason of ['Too expensive', 'budget considerations', 'Budget considerations ', 'Other reason', '']) {
    refused(await insertResponse(orgA, await next(), { decision: 'declined', decline_reason: reason }), '23514', /quote_responses_decline_reason_check/, `${JSON.stringify(reason)} is not a reason`)
  }
  for (const reason of REASONS) {
    const stored = await insertResponse(orgA, await next(), { decision: 'declined', decline_reason: reason })
    assert.equal(stored.error, null, `${reason} is accepted`)
  }
})

test('a response needs the consent flag, a 64-character hex snapshot hash, bounded evidence and a quote of the same organisation', async () => {
  const fx = await fixture(orgA)
  const next = async () => ({ ...fx, linkId: await newLink(orgA, fx.quoteId) })

  refused(await insertResponse(orgA, await next(), { consent_given: false }), '23514', /quote_responses_consent_given_check/, 'consent not given')
  refused(await insertResponse(orgA, await next(), { consent_given: null }), '23502', /consent_given/, 'consent missing')
  refused(await insertResponse(orgA, await next(), { consent_text: null }), '23502', /consent_text/, 'no consent wording')
  for (const hash of [hex64().toUpperCase(), hex64().slice(1), `${hex64()}0`, `${hex64().slice(1)}g`, '']) {
    refused(await insertResponse(orgA, await next(), { snapshot_hash: hash }), '23514', /quote_responses_snapshot_hash_check/, `${JSON.stringify(hash)} is not a snapshot hash`)
  }
  refused(await insertResponse(orgA, await next(), { snapshot_hash: null }), '23502', /snapshot_hash/, 'no snapshot hash')
  refused(await insertResponse(orgA, await next(), { ip_address: 'x'.repeat(65) }), '23514', /quote_responses_ip_address_check/, 'an address over 64 characters')
  refused(await insertResponse(orgA, await next(), { user_agent: 'x'.repeat(301) }), '23514', /quote_responses_user_agent_check/, 'a user agent over 300 characters')

  assert.equal((await insertResponse(orgA, await next(), { ip_address: 'x'.repeat(64), user_agent: 'x'.repeat(300) })).error, null, 'the limits themselves are allowed')
  assert.equal((await insertResponse(orgA, await next(), { ip_address: null, user_agent: null, terms_sources: null })).error, null, 'evidence and terms sources are optional')

  const otherQuote = await fixture(orgB)
  refused(await insertResponse(orgA, { ...otherQuote, linkId: await newLink(orgA, fx.quoteId) }), '23503', /quote_responses_quote_id_organization_id_fkey/, "another organisation's quote")
})

test('attempts cannot exceed 5, and a code always expires', async () => {
  const fx = await fixture(orgA)
  const fresh = must(await admin.from('quote_access_codes').select('attempts,consumed_at,created_at').eq('id', must(await insertCode(orgA, fx.linkId)).id).single())
  assert.equal(fresh.attempts, 0, 'a code starts with no attempts')
  assert.equal(fresh.consumed_at, null, 'and is not consumed')
  assert.ok(fresh.created_at, 'and is stamped')

  for (const attempts of [0, 1, 4, 5]) assert.equal((await insertCode(orgA, fx.linkId, { attempts })).error, null, `${attempts} attempts is accepted`)
  for (const attempts of [6, 100, -1]) refused(await insertCode(orgA, fx.linkId, { attempts }), '23514', /quote_access_codes_attempts_check/, `${attempts} attempts is refused`)

  const code = must(await insertCode(orgA, fx.linkId)).id as string
  assert.equal((await admin.from('quote_access_codes').update({ attempts: 5 }).eq('id', code)).error, null, 'the count can be raised to 5')
  refused(await admin.from('quote_access_codes').update({ attempts: 6 }).eq('id', code), '23514', /quote_access_codes_attempts_check/, 'but not to 6')
  refused(await insertCode(orgA, fx.linkId, { expires_at: null }), '23502', /expires_at/, 'a code always expires')
})
