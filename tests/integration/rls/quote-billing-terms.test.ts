import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { documentErrorMessage } from '../../../features/documents/errors.ts'
import { ok, refused, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin } from './helpers.ts'
import { must, quoteRow, type Line } from './portal-fixtures.ts'

// Accept to invoice, stage 1, task 6: the start date and term on a quote, and the send rule that goes with them. A quote is
// written by a signed-in member and sent through the real send_quote; rows are read back through the service role. fx has the
// billing switch on, off has it off (the default of a new organisation).

let fx: BillingOrg
let off: BillingOrg

before(async () => {
  fx = await setupBillingOrg('quote-terms-on')
  off = await setupBillingOrg('quote-terms-off', { billing: false })
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    await off?.teardown()
  }
})

const SETUP: Line = { title: 'Setup', charge_kind: 'once_off' }
const RETAINER: Line = { title: 'Retainer', charge_kind: 'monthly' }
const AUDIT: Line = { title: 'Audit' } // no charge kind
const TERMS = { start_date: '2031-03-01', term_months: 6 }

const send = (org: BillingOrg, quote: string) => org.sender.client.rpc('send_quote', { p_id: quote })
const stillDraft = async (quote: string) => {
  const row = await quoteRow(quote)
  assert.equal(row.status, 'Draft', 'a refused send leaves the quote a draft')
  assert.match(row.quote_number, /^DRAFT-/, 'and without a number')
}
const terms = async (quote: string) => {
  const row = await quoteRow(quote)
  return { start_date: row.start_date, term_months: row.term_months }
}

test('with the switch on a quote with a monthly line cannot be sent without a start date and term, or with a line that has no charge kind; once-off-only quotes send without either', async () => {
  // A monthly line and no terms: refused, with the sentence the page shows.
  const noTerms = await fx.draftQuote({}, [SETUP, RETAINER])
  const first = await send(fx, noTerms)
  refused(first.error, 'QUOTE_BILLING_TERMS_REQUIRED')
  assert.equal(documentErrorMessage(first.error?.message), 'Add a start date and a term in months before sending: this quote has a monthly charge.')
  await stillDraft(noTerms)

  // Terms but a line with no charge kind next to a monthly one.
  const noKind = await fx.draftQuote(TERMS, [AUDIT, RETAINER])
  const second = await send(fx, noKind)
  refused(second.error, 'QUOTE_CHARGE_KINDS_INCOMPLETE')
  assert.equal(documentErrorMessage(second.error?.message), 'Give every line a charge kind, once-off or monthly, before sending: this quote has a monthly charge.')
  await stillDraft(noKind)

  // Both missing: the terms are asked for first.
  const neither = await fx.draftQuote({}, [AUDIT, RETAINER])
  refused((await send(fx, neither)).error, 'QUOTE_BILLING_TERMS_REQUIRED')
  await stillDraft(neither)

  // The existing checks come first: no lines is still the lines sentence.
  const empty = await fx.draftQuote({}, [])
  refused((await send(fx, empty)).error, 'QUOTE_NEEDS_LINES')

  // Giving the first quote its terms, as the form does, lets it go.
  ok(await fx.sender.client.from('quotes').update(TERMS).eq('id', noTerms), 'the member adds the terms to the draft')
  ok(await send(fx, noTerms), 'the quote with terms is sent')
  const sent = await quoteRow(noTerms)
  assert.equal(sent.status, 'Sent')
  assert.match(sent.quote_number, /^PFX-/)
  assert.deepEqual({ start_date: sent.start_date, term_months: sent.term_months }, TERMS, 'the terms are on the sent quote')

  // Giving the second quote's line a kind lets it go.
  const unkinded = must(await admin.from('quote_lines').select('id').eq('quote_id', noKind).eq('title', 'Audit').single())
  ok(await fx.sender.client.from('quote_lines').update({ charge_kind: 'once_off' }).eq('id', unkinded.id), 'the member gives the line a kind')
  ok(await send(fx, noKind), 'the quote whose lines all have a kind is sent')
  assert.equal((await quoteRow(noKind)).status, 'Sent')

  // Once-off only, with or without kinds, and no terms: the rule does not apply.
  const onceOff = await fx.draftQuote({}, [SETUP, { title: 'Review', charge_kind: 'once_off' }])
  ok(await send(fx, onceOff), 'a once-off-only quote without terms is sent')
  assert.deepEqual(await terms(onceOff), { start_date: null, term_months: null })
  const kindless = await fx.draftQuote({}, [AUDIT, { title: 'Report' }])
  ok(await send(fx, kindless), 'a quote with no monthly line and no kinds is sent')
  assert.equal((await quoteRow(kindless)).status, 'Sent')

  // Terms on a once-off-only quote are kept as typed: the rule asks for them, it never forbids them.
  const onceOffWithTerms = await fx.draftQuote(TERMS, [SETUP])
  ok(await send(fx, onceOffWithTerms), 'a once-off-only quote with terms is sent')
  assert.deepEqual(await terms(onceOffWithTerms), TERMS)
})

test('with the switch off every quote sends exactly as before', async () => {
  // The quote shapes the switch-on test refuses all go out, with their terms and lines untouched.
  const noTerms = await off.draftQuote({}, [SETUP, RETAINER])
  ok(await send(off, noTerms), 'a monthly line without terms')
  const noKind = await off.draftQuote(TERMS, [AUDIT, RETAINER])
  ok(await send(off, noKind), 'a monthly line next to a line with no kind')
  const neither = await off.draftQuote({}, [AUDIT, RETAINER])
  ok(await send(off, neither), 'no terms and no kind')
  for (const quote of [noTerms, noKind, neither]) {
    const row = await quoteRow(quote)
    assert.equal(row.status, 'Sent')
    assert.match(row.quote_number, /^PFX-/)
  }
  assert.deepEqual(await terms(noTerms), { start_date: null, term_months: null })
  assert.deepEqual(await terms(noKind), TERMS)
  const kinds = must(await admin.from('quote_lines').select('title,charge_kind').eq('quote_id', noKind).order('position'))
  assert.deepEqual(kinds.map((line) => [line.title, line.charge_kind]), [['Audit', null], ['Retainer', 'monthly']], 'the lines are as written')

  // And the other refusals are still the old ones.
  refused((await send(off, await off.draftQuote({}, []))).error, 'QUOTE_NEEDS_LINES')

  // Switching the same organisation on makes the same shape refuse: it is the switch that decides, not the quote.
  await off.setBilling(true)
  try {
    refused((await send(off, await off.draftQuote({}, [SETUP, RETAINER]))).error, 'QUOTE_BILLING_TERMS_REQUIRED')
  } finally {
    await off.setBilling(false)
  }
})

test('a revision copies the terms; a duplicate does not (it is a new draft that staff give terms of its own)', async () => {
  const quote = await fx.sentBillingQuote({ startDate: '2031-05-15', termMonths: 18 })
  const expected = { start_date: '2031-05-15', term_months: 18 }
  assert.deepEqual(await terms(quote), expected)

  const copy = must(await fx.sender.client.rpc('duplicate_quote', { p_id: quote })) as string
  assert.notEqual(copy, quote)
  assert.equal((await quoteRow(copy)).status, 'Draft')
  assert.deepEqual(await terms(copy), { start_date: null, term_months: null }, 'a duplicate has no start date and no term: the dates of an old quote must not carry over')
  const copied = must(await admin.from('quote_lines').select('title,charge_kind').eq('quote_id', copy).order('position')) as Array<{ title: string; charge_kind: string | null }>
  assert.deepEqual(copied, [{ title: 'Setup', charge_kind: 'once_off' }, { title: 'Retainer', charge_kind: 'monthly' }], 'but it has the lines of the quote, with their charge kinds')

  const revision = must(await fx.sender.client.rpc('revise_quote', { p_id: quote })) as string
  const revised = await quoteRow(revision)
  assert.equal(revised.status, 'Draft')
  assert.equal(revised.supersedes_quote_id, quote)
  assert.deepEqual(await terms(revision), expected, 'a revision has the same start date and term')
  assert.deepEqual(await terms(quote), expected, 'the original is unchanged')
  assert.deepEqual(await terms(copy), { start_date: null, term_months: null }, 'revising did not touch the duplicate')

  // The copies are ordinary drafts: the terms can be changed on them, and a revision goes out as it is.
  ok(await fx.sender.client.from('quotes').update({ start_date: '2031-06-01', term_months: 24 }).eq('id', copy), 'a duplicate can be given other terms')
  assert.deepEqual(await terms(copy), { start_date: '2031-06-01', term_months: 24 })
  ok(await send(fx, revision), 'the revision, with its copied terms, is sent')
  assert.equal((await quoteRow(quote)).status, 'Superseded')
  assert.deepEqual(await terms(revision), expected)

  // A quote with no terms copies none.
  const bare = await fx.sentBillingQuote({ startDate: null, termMonths: null, lines: [{ title: 'Audit', unitPrice: 500, chargeKind: 'once_off' }] })
  const bareCopy = must(await fx.sender.client.rpc('duplicate_quote', { p_id: bare })) as string
  assert.deepEqual(await terms(bareCopy), { start_date: null, term_months: null })
  const bareRevision = must(await fx.sender.client.rpc('revise_quote', { p_id: bare })) as string
  assert.deepEqual(await terms(bareRevision), { start_date: null, term_months: null })
})

test('the terms are editable on a draft and frozen after send for a member', async () => {
  const draft = await fx.draftQuote({}, [SETUP, RETAINER])
  const member = (change: Record<string, unknown>) => fx.sender.client.from('quotes').update(change).eq('id', draft)

  // On a draft a member sets, changes and clears them.
  ok(await member(TERMS), 'set')
  assert.deepEqual(await terms(draft), TERMS)
  ok(await member({ start_date: '2031-09-30', term_months: 120 }), 'changed to the far end of the range')
  assert.deepEqual(await terms(draft), { start_date: '2031-09-30', term_months: 120 })
  ok(await member({ start_date: null, term_months: null }), 'cleared')
  assert.deepEqual(await terms(draft), { start_date: null, term_months: null })

  // The table rules hold on a draft too: both or neither, and 1 to 120.
  refused((await member({ start_date: '2031-03-01' })).error, 'quotes_billing_terms_check')
  refused((await member({ term_months: 6 })).error, 'quotes_billing_terms_check')
  refused((await member({ start_date: '2031-03-01', term_months: 0 })).error, 'quotes_term_months_range')
  refused((await member({ start_date: '2031-03-01', term_months: 121 })).error, 'quotes_term_months_range')
  assert.equal(documentErrorMessage((await member({ start_date: '2031-03-01' })).error?.message), 'Enter both a start date and a term in months, or leave both blank.')
  assert.equal(documentErrorMessage((await member({ start_date: '2031-03-01', term_months: 121 })).error?.message), 'The term must be a whole number of months from 1 to 120.')
  assert.deepEqual(await terms(draft), { start_date: null, term_months: null }, 'the refused writes changed nothing')

  // After the send they are frozen for a member, the same value again is not a change.
  ok(await member(TERMS), 'set again')
  ok(await send(fx, draft), 'sent')
  for (const change of [{ start_date: '2031-04-01' }, { term_months: 7 }, { start_date: '2031-04-01', term_months: 7 }, { start_date: null, term_months: null }]) {
    refused((await member(change)).error, 'QUOTE_FROZEN')
  }
  assert.deepEqual(await terms(draft), TERMS, 'the refused writes changed nothing')
  ok(await member(TERMS), 'the same terms again')
  ok(await member({ notes: 'A note on a sent quote' }), 'a note')
})
