import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

// Quote portal, slice 2, task 2: the two entries the quote timeline gains. A quote that becomes Declined writes
// 'quote.declined' (log_quote_milestones, beside the existing sent and accepted entries); a Sent original that its
// revision replaces writes 'quote.superseded' (quotes_supersede_original). Fixtures follow quote-portal-links.test.ts:
// every quote goes out through the real send_quote and every revision through the real revise_quote, a signed-in member
// sets a status by hand, and the service role moves only what a member cannot. Because a member is signed in,
// activity_actor gives that member as the author of each entry.

type U = { id: string; email: string; password: string }

let orgA: string
let memberA: U
let memberAClient: SupabaseClient
let clientA: string
let clientA2: string // a second client of orgA, for a revision whose client was changed

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const quoteRow = async (id: string) => must(await admin.from('quotes').select('*').eq('id', id).single()) as Record<string, any>
/** The timeline entries of one kind on one quote, oldest first. */
const entries = async (quoteId: string, kind: string) =>
  must(await admin.from('activities').select('*').eq('quote_id', quoteId).eq('kind', kind).order('created_at')) as Array<Record<string, any>>
const setStatus = async (id: string, status: string) => assert.equal((await memberAClient.from('quotes').update({ status }).eq('id', id)).error, null)
/** An entry is dated when it was written, not left empty or back-dated. */
const isRecent = (value: string) => Math.abs(new Date(value).getTime() - Date.now()) < 60_000

/** A draft made by a signed-in member, with one line. */
const draftQuote = async (clientId: string = clientA) => {
  const quote = must(await memberAClient.from('quotes').insert({ organization_id: orgA, client_id: clientId, client_name: 'Timeline Client' }).select('id').single())
  const written = await memberAClient.from('quote_lines').insert({ organization_id: orgA, quote_id: quote.id, position: 1, title: 'Advisory', quantity: 1, unit_price: 100 })
  assert.equal(written.error, null)
  return quote.id as string
}
/** A quote sent through the real send_quote. */
const sentQuote = async () => {
  const id = await draftQuote()
  const { error } = await memberAClient.rpc('send_quote', { p_id: id })
  assert.equal(error, null)
  return id
}
const revise = async (id: string) => must(await memberAClient.rpc('revise_quote', { p_id: id })) as string

before(async () => {
  orgA = await createFixtureOrg('portal-timeline-a')
  memberA = await createFixtureUser(orgA, 'member')
  memberAClient = await signedInClient(memberA.email, memberA.password)
  clientA = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Timeline Client A', status: 'Active' }).select('id').single()).id
  clientA2 = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Timeline Client A2', status: 'Active' }).select('id').single()).id
  must(await admin.from('organization_settings').insert({ organization_id: orgA, legal_name: 'Timeline A (Pty) Ltd', document_prefix: 'TLA', vat_rate: 15 }).select('id').single())
})

after(async () => {
  await cleanup([orgA].filter(Boolean), [memberA?.id].filter(Boolean))
})

test('a hand-set Declined writes one quote.declined entry by the member', async () => {
  const quote = await sentQuote()
  const { quote_number: number } = await quoteRow(quote)
  assert.deepEqual(await entries(quote, 'quote.declined'), [], 'a Sent quote has no declined entry')

  await setStatus(quote, 'Declined')
  const written = await entries(quote, 'quote.declined')
  assert.equal(written.length, 1, 'one entry')
  const [entry] = written
  assert.equal(entry.subject, `Quote ${number} declined`)
  assert.equal(entry.created_by, memberA.id, 'the signed-in member is the author')
  assert.equal(entry.organization_id, orgA)
  assert.equal(entry.quote_id, quote)
  assert.ok(isRecent(entry.occurred_at), 'dated when it was declined')

  assert.equal((await memberAClient.from('quotes').update({ notes: 'an edit that keeps it Declined' }).eq('id', quote)).error, null)
  assert.equal((await entries(quote, 'quote.declined')).length, 1, 'an edit that keeps the status writes nothing')
  assert.deepEqual(await entries(quote, 'quote.accepted'), [], 'declining is not accepting')
})

test('Declined, reopened to Sent and declined again writes a second entry', async () => {
  const quote = await sentQuote()
  await setStatus(quote, 'Declined')
  assert.equal((await entries(quote, 'quote.declined')).length, 1)

  await setStatus(quote, 'Sent')
  assert.equal((await entries(quote, 'quote.declined')).length, 1, 'reopening writes no declined entry')

  await setStatus(quote, 'Declined')
  const declined = await entries(quote, 'quote.declined')
  assert.equal(declined.length, 2, 'the second decline is its own event')
  assert.ok(declined.every((entry) => entry.created_by === memberA.id))
})

test('a quote written as Declined, and one declined with no signed-in user, each get an entry with no author', async () => {
  // A service-role write has no signed-in user, which is how the portal will decline a quote.
  const inserted = must(await admin.from('quotes').insert({
    organization_id: orgA, quote_number: `TL-DECLINED-${randomUUID().slice(0, 8)}`, client_name: 'Timeline Client', status: 'Declined',
  }).select('id, quote_number').single())
  const created = await entries(inserted.id, 'quote.declined')
  assert.equal(created.length, 1, 'a quote written as Declined gets one entry')
  assert.equal(created[0].subject, `Quote ${inserted.quote_number} declined`)
  assert.equal(created[0].created_by, null, 'a service-role write has no author')

  const quote = await sentQuote()
  assert.equal((await admin.from('quotes').update({ status: 'Declined' }).eq('id', quote)).error, null)
  const updated = await entries(quote, 'quote.declined')
  assert.equal(updated.length, 1, 'a Sent quote declined by the service role gets one entry')
  assert.equal(updated[0].created_by, null)
})

test('sending a revision writes quote.superseded on the original, naming the revision', async () => {
  const original = await sentQuote()
  const { quote_number: originalNumber } = await quoteRow(original)
  const revision = await revise(original)
  assert.deepEqual(await entries(original, 'quote.superseded'), [], 'nothing is written while the revision is a draft')

  const { error } = await memberAClient.rpc('send_quote', { p_id: revision })
  assert.equal(error, null)
  const { quote_number: revisionNumber, status } = await quoteRow(revision)
  assert.equal(status, 'Sent')
  assert.match(revisionNumber, /^TLA-Q-\d{4}-\d{5}$/, 'the revision has its real number by now')

  assert.equal((await quoteRow(original)).status, 'Superseded')
  const written = await entries(original, 'quote.superseded')
  assert.equal(written.length, 1, 'one entry')
  const [entry] = written
  assert.equal(entry.subject, `Quote ${originalNumber} replaced by ${revisionNumber}`)
  assert.equal(entry.created_by, memberA.id)
  assert.equal(entry.organization_id, orgA)
  assert.equal(entry.quote_id, original, 'it sits on the original')
  assert.ok(isRecent(entry.occurred_at))
  assert.deepEqual(await entries(revision, 'quote.superseded'), [], 'the revision gets none')
  assert.deepEqual(await entries(original, 'quote.declined'), [], 'being superseded is not being declined')
})

test('an Accepted original that is revised gets no superseded entry', async () => {
  const original = await sentQuote()
  // An Accepted quote cannot be revised, so its revision is made while it is still Sent.
  const revision = await revise(original)
  await setStatus(original, 'Accepted')
  const { error } = await memberAClient.rpc('send_quote', { p_id: revision })
  assert.equal(error, null)

  assert.equal((await quoteRow(original)).status, 'Accepted', 'the original keeps its status')
  assert.deepEqual(await entries(original, 'quote.superseded'), [])
  assert.deepEqual(await entries(revision, 'quote.superseded'), [])
})

test('a revision for a different client supersedes nothing and writes no entry', async () => {
  const original = await sentQuote()
  const revision = await revise(original)
  const moved = await memberAClient.from('quotes').update({ client_id: clientA2, client_name: 'Timeline Client A2' }).eq('id', revision)
  assert.equal(moved.error, null)
  const { error } = await memberAClient.rpc('send_quote', { p_id: revision })
  assert.equal(error, null)

  assert.equal((await quoteRow(revision)).status, 'Sent')
  assert.equal((await quoteRow(original)).status, 'Sent', "the other client's original is not superseded")
  assert.deepEqual(await entries(original, 'quote.superseded'), [])
  assert.deepEqual(await entries(revision, 'quote.superseded'), [])
})
