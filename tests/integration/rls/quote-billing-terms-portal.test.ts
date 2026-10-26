import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { ok, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin } from './helpers.ts'
import { must, quoteRow } from './portal-fixtures.ts'

// Accept to invoice, stage 1, task 7: the start date and term reach the client's page through private.quote_snapshot, and only for a
// quote that has them. A quote without them must give the jsonb it gives today (so the same hash), which is why the first test
// writes down today's key set as a literal: it passed against the database before the migration and must keep passing after it.
// The hash of two different quotes cannot be compared (their line ids and timestamps differ), so the proof is: the same quote,
// read twice, hashes the same; the same quote with its terms taken off hashes differently from the quote with them.
// Everything is read the way the portal's server module reads it: portal_get_quote, as the service role. The organisation has the
// billing switch OFF (the default), so nothing here depends on it.

let fx: BillingOrg

before(async () => {
  fx = await setupBillingOrg('portal-terms', { billing: false })
})

after(async () => {
  await fx?.teardown()
})

/** The keys of the frozen record today, from 20261018102500_quote_portal_read_fixes.sql, sorted. */
const TODAY_RECORD_KEYS = [
  'accepted_at', 'bill_to', 'client_name', 'client_ref', 'contact_name', 'currency', 'issue_date', 'issuer', 'project_description',
  'project_name', 'project_ref', 'quote_number', 'sent_at', 'service_inclusions', 'status', 'subtotal', 'tax_amount', 'terms',
  'terms_sources', 'total_amount', 'valid_until', 'vat_rate',
].sort()
const TODAY_LINE_KEYS = ['charge_kind', 'description', 'id', 'line_amount', 'position', 'quantity', 'title', 'unit_price', 'vat_code'].sort()
const WITH_TERMS_KEYS = [...TODAY_RECORD_KEYS, 'start_date', 'term_months'].sort()
const TERMS = { startDate: '2031-03-01', termMonths: 6 }
const NO_TERMS = { startDate: null, termMonths: null } as const

type Page = Record<string, any>
const keysOf = (value: Record<string, unknown>) => Object.keys(value).sort()

/** The page as the portal reads it: a fresh link to the quote, then portal_get_quote through the service role. */
const pageOf = async (quote: string, token?: string): Promise<{ page: Page; token: string }> => {
  const link = token ? { token } : await fx.newLink(quote)
  const page = must(await admin.rpc('portal_get_quote', { p_token: link.token })) as Page
  return { page, token: link.token }
}

test("a sent quote without terms: the portal record has exactly today's keys (no start_date, no term_months)", async () => {
  const quote = await fx.sentBillingQuote(NO_TERMS)
  const { page } = await pageOf(quote)
  assert.equal(page.state, 'open')
  assert.deepEqual(keysOf(page.record), TODAY_RECORD_KEYS, 'the record has exactly the keys it has today')
  assert.equal('start_date' in page.record, false, 'no start_date key, not even a null one')
  assert.equal('term_months' in page.record, false, 'no term_months key, not even a null one')
  assert.ok(page.lines.length > 0)
  for (const line of page.lines) assert.deepEqual(keysOf(line), TODAY_LINE_KEYS, 'the lines are unchanged')
  assert.match(page.snapshot_hash, /^[0-9a-f]{64}$/)
})

test('with terms the record has exactly those two extra keys and the hash differs from the same quote without them', async () => {
  const quote = await fx.sentBillingQuote(TERMS)
  const { page: withTerms, token } = await pageOf(quote)
  assert.equal(withTerms.state, 'open')
  assert.deepEqual(keysOf(withTerms.record), WITH_TERMS_KEYS, 'today\'s keys plus start_date and term_months, nothing else')
  assert.equal(withTerms.record.start_date, '2031-03-01', 'the start date as the date text')
  assert.equal(withTerms.record.term_months, 6, 'the term as a number')
  assert.equal(typeof withTerms.record.term_months, 'number')
  for (const line of withTerms.lines) assert.deepEqual(keysOf(line), TODAY_LINE_KEYS, 'the lines are unchanged')

  // The same quote with its terms taken off (the service role may; a member may not, once the quote is sent).
  ok(await admin.from('quotes').update({ start_date: null, term_months: null }).eq('id', quote), 'the terms are taken off')
  try {
    const { page: without } = await pageOf(quote, token)
    assert.deepEqual(keysOf(without.record), TODAY_RECORD_KEYS, 'without terms the record is back to today\'s keys')
    assert.notEqual(without.snapshot_hash, withTerms.snapshot_hash, 'the hash differs: the terms are part of what the client saw')
    assert.deepEqual({ ...withTerms.record, start_date: undefined, term_months: undefined }, { ...without.record, start_date: undefined, term_months: undefined }, 'and nothing else in the record moved')
  } finally {
    ok(await admin.from('quotes').update({ start_date: '2031-03-01', term_months: 6 }).eq('id', quote), 'the terms are put back')
  }
  const { page: back } = await pageOf(quote, token)
  assert.equal(back.snapshot_hash, withTerms.snapshot_hash, 'with the terms put back the hash is the one the page first showed')
  assert.equal((await quoteRow(quote)).start_date, '2031-03-01')
})

test('the hash of an unchanged quote is stable across reads', async () => {
  const noTerms = await fx.sentBillingQuote(NO_TERMS)
  const first = await pageOf(noTerms)
  const second = await pageOf(noTerms, first.token)
  const third = await pageOf(noTerms)
  assert.equal(second.page.snapshot_hash, first.page.snapshot_hash, 'a quote without terms: the same hash on the next read')
  assert.equal(third.page.snapshot_hash, first.page.snapshot_hash, 'and through another link')

  const withTerms = await fx.sentBillingQuote(TERMS)
  const a = await pageOf(withTerms)
  const b = await pageOf(withTerms, a.token)
  assert.equal(b.page.snapshot_hash, a.page.snapshot_hash, 'a quote with terms: the same hash on the next read')
})

test("a decision made with the page's hash still succeeds for a quote with terms", async () => {
  const quote = await fx.sentBillingQuote(TERMS)
  const { page: before } = await pageOf(quote)
  // acceptedOnPortal reads the page, asks for a code and decides with the page's snapshot_hash, and asserts every step is ok.
  const { responseId } = await fx.acceptedOnPortal(quote)
  assert.equal((await quoteRow(quote)).status, 'Accepted', 'the quote is accepted')
  // The hash the decision recorded is the one every link to the quote showed before it: portal_decide recomputed the same snapshot.
  const response = must(await admin.from('quote_responses').select('snapshot_hash').eq('id', responseId).single())
  assert.equal(response.snapshot_hash, before.snapshot_hash, 'the recorded hash is the hash of the page with the terms on it')
})
