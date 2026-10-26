import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { activitiesOf, invoiceOf, itemsOf, ok, planOf, saToday, setupBillingOrg, type BillingOrg, type BillingQuoteOptions } from './billing-fixtures.ts'
import { admin, cleanup, createFixtureUser, signedInClient } from './helpers.ts'
import { anonymous, must, quoteRow } from './portal-fixtures.ts'

// Accept to invoice, stage 1, task 5: what happens when a client accepts a quote on the portal, and the nightly sweep.
// portal_decide calls private.decision_follow_ups, which now calls private.billing_on_acceptance (in a block of its own whose
// failure only warns) for an acceptance. With the organisation's switch on it moves the Sales record to Won, builds the plan,
// makes the draft first invoice and tells the owner and the sender; with the switch off it does nothing. public.billing_nightly
// (service role only) picks up acceptances whose billing step failed, and reminds the people about first invoices nobody has
// approved. Every acceptance goes through the real portal functions (billing-fixtures.acceptedOnPortal); the service role only
// moves what staff or time would: a quote's owner and client, an item's age, the switch.
//
// Two organisations: `fx` has the switch on from the start; `sw` starts with it off and the sweep tests move it. billing_nightly
// sweeps every organisation that has the switch on, so each test leaves nothing for the next one to sweep.

type Row = Record<string, any>
type Person = { id: string; client: SupabaseClient }

let fx: BillingOrg
let sw: BillingOrg
let fxOwner: Person
const extraUsers: string[] = []

before(async () => {
  fx = await setupBillingOrg('billing-accept-on')
  sw = await setupBillingOrg('billing-accept-sw', { billing: false })
  const user = await createFixtureUser(fx.orgId, 'owner')
  extraUsers.push(user.id)
  fxOwner = { id: user.id, client: await signedInClient(user.email, user.password) }
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    try {
      await sw?.teardown()
    } finally {
      await cleanup([], extraUsers)
    }
  }
})

const DAY = 86_400_000
const CONSENT_ACCEPT = 'I confirm that I am authorised to act on behalf of the organisation and have reviewed and accept this quotation and its accompanying terms and conditions.'
const CONSENT_DECLINE = 'I confirm that I am authorised to decline this quotation on behalf of the organisation.'
const SUCCESS_KEYS = [
  'ok', 'replay', 'decision', 'decided_at', 'quote_id', 'quote_number', 'client_name', 'recipient_email', 'signatory_name', 'signatory_position',
  'decline_reason', 'decline_comments', 'owner_name', 'notify_email',
].sort()
const READY_TITLE = 'Portal Client accepted: first invoice ready to approve'
const REMINDER_TITLE = 'First invoice for Portal Client is waiting for approval'
const approvalBody = (quoteNumber: string) =>
  `Check the draft invoice for quotation ${quoteNumber}, then press Approve and send. Only an owner or admin can approve it.`
const BY_HAND = ' Its monthly invoices have to be created by hand.'
const TERMLESS = { startDate: null, termMonths: null } as const

const time = (value: string) => new Date(value).getTime()
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const sorted = (...ids: string[]) => [...ids].sort()
const users = (rows: Row[]) => rows.map((row) => row.user_id as string).sort()
const without = (row: Row, keys: string[]) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)))

/** A sent quote owned by the given team profile (Olive, who has a login, unless said otherwise); the owner is set before the client opens the page. */
const sentQuote = async (org: BillingOrg, { owner = org.owner.teamMemberId, ...options }: BillingQuoteOptions & { owner?: string | null } = {}) => {
  const quote = await org.sentBillingQuote(options)
  ok(await admin.from('quotes').update({ owner_id: owner }).eq('id', quote), 'the quote has its owner')
  return quote
}
/** A quote the client accepted on the portal (the real portal functions). */
const acceptedQuote = async (org: BillingOrg, options: BillingQuoteOptions & { owner?: string | null } = {}) => {
  const quote = await sentQuote(org, options)
  await org.acceptedOnPortal(quote)
  return quote
}
/** An acceptance whose billing step fails because the quote has no client at that moment: accepted, no plan. The client is not put back. */
const strandedQuote = async (org: BillingOrg, options: BillingQuoteOptions & { owner?: string | null } = {}) => {
  const quote = await sentQuote(org, options)
  ok(await admin.from('quotes').update({ client_id: null }).eq('id', quote), 'the quote has no client')
  await org.acceptedOnPortal(quote)
  assert.equal((await quoteRow(quote)).status, 'Accepted', 'the acceptance holds')
  assert.equal(await planOf(quote), null, 'no plan')
  return quote
}
const restoreClient = async (org: BillingOrg, quote: string) => ok(await admin.from('quotes').update({ client_id: org.clientId }).eq('id', quote), 'the client is put back')

const opportunity = async (org: BillingOrg, fields: Row = {}) =>
  must(await admin.from('sales_opportunities').insert({
    organization_id: org.orgId, name: 'Portal renewal', client_id: org.clientId, client_name: 'Portal Client', owner_id: org.owner.teamMemberId,
    stage: 'Proposal', expected_value: 0, probability_percent: 60, expected_close: '2031-06-30', next_step: 'Send the contract', notes: 'Typed by staff', ...fields,
  }).select('*').single()) as Row
const opportunityRow = async (id: string) => must(await admin.from('sales_opportunities').select('*').eq('id', id).single()) as Row
const opportunityCount = async (org: BillingOrg) => must(await admin.from('sales_opportunities').select('id').eq('organization_id', org.orgId)).length
const noticesOf = async (org: BillingOrg, quote: string, category: string) =>
  must(await admin.from('notifications').select('*').eq('organization_id', org.orgId).eq('href', `/commercial/quotes/${quote}`).eq('category', category).order('created_at')) as Row[]
const invoicesOf = async (quote: string) => must(await admin.from('invoices').select('*').eq('quote_id', quote).order('created_at')) as Row[]
const planCount = async (quote: string) => must(await admin.from('billing_plans').select('id').eq('quote_id', quote)).length
const stageChanges = async (opportunityId: string) =>
  must(await admin.from('activities').select('*').eq('opportunity_id', opportunityId).eq('kind', 'opportunity.stage_changed')) as Row[]
const ageItem = async (item: string, change: Row) => ok(await admin.from('billing_plan_items').update(change).eq('id', item), 'the item is aged')
const itemRow = async (item: string) => must(await admin.from('billing_plan_items').select('*').eq('id', item).single()) as Row

const nightly = async () => {
  const { data, error } = await admin.rpc('billing_nightly')
  assert.equal(error, null, error?.message)
  assert.deepEqual(Object.keys(data).sort(), ['reminded', 'swept'])
  return data as { swept: number; reminded: number }
}

/** What billing does for a quote that was accepted: the plan, the items, the draft and the notice, read back whole. */
const billed = async (org: BillingOrg, quote: string) => ({
  plan: await planOf(quote),
  items: await itemsOf(quote),
  invoices: await invoicesOf(quote),
  notices: await noticesOf(org, quote, 'Finance'),
  created: await activitiesOf(quote, 'billing.plan_created'),
})
/** Nothing of billing exists for the quote. */
const assertNoBilling = async (org: BillingOrg, quote: string, label: string) => {
  const state = await billed(org, quote)
  assert.equal(state.plan, null, `${label}: no plan`)
  assert.deepEqual(state.items, [], `${label}: no items`)
  assert.deepEqual(state.invoices, [], `${label}: no invoice`)
  assert.deepEqual(state.notices, [], `${label}: no billing notice`)
  assert.deepEqual(state.created, [], `${label}: no plan on the timeline`)
}
/** Exactly one plan, one first invoice (a Draft) and one notice for each of Olive and Sam, whatever raced to make them. */
const assertBilledOnce = async (org: BillingOrg, quote: string, label: string) => {
  const state = await billed(org, quote)
  assert.ok(state.plan, `${label}: a plan`)
  assert.equal(await planCount(quote), 1, `${label}: one plan`)
  assert.equal(state.created.length, 1, `${label}: one plan on the timeline`)
  assert.equal(state.invoices.length, 1, `${label}: one invoice`)
  assert.equal(state.invoices[0].status, 'Draft', `${label}: a draft`)
  assert.equal(state.invoices[0].billing_plan_item_id, state.items[0].id, `${label}: the first item's invoice`)
  assert.deepEqual(users(state.notices), sorted(org.owner.userId, org.sender.userId), `${label}: the owner and the sender are told once each`)
}

// ---------------------------------------------------------------------------------------------------------------------------

test('switch off: accepting changes the status and the existing follow-ups only - no plan, no invoice, no opportunity change', async () => {
  const opp = await opportunity(sw, { stage: 'Proposal', expected_value: 0, probability_percent: 60 })
  const linked = await sentQuote(sw, { opportunityId: opp.id })
  const unlinked = await sentQuote(sw)
  const opportunitiesBefore = await opportunityCount(sw)

  for (const quote of [linked, unlinked]) await sw.acceptedOnPortal(quote)

  for (const quote of [linked, unlinked]) {
    const row = await quoteRow(quote)
    assert.equal(row.status, 'Accepted')
    assert.ok(row.accepted_at, 'accepted_at is set')
    await assertNoBilling(sw, quote, 'switch off')
    // The existing follow-ups: the owner and the sender are told in the Commercial category.
    const told = await noticesOf(sw, quote, 'Commercial')
    assert.deepEqual(users(told), sorted(sw.owner.userId, sw.sender.userId))
    assert.deepEqual([...new Set(told.map((row) => row.title))], [`Portal Client accepted quotation ${row.quote_number}`])
    assert.deepEqual([...new Set(told.map((row) => row.body))], ['Signed by Pat Client, Managing Director.'])
    assert.equal((await activitiesOf(quote, 'quote.invoiced')).length, 0, 'no invoice on the timeline')
  }
  assert.equal((await quoteRow(linked)).opportunity_id, opp.id, 'the link is as it was')
  assert.deepEqual(await opportunityRow(opp.id), opp, 'the opportunity is exactly as it was')
  assert.deepEqual(await stageChanges(opp.id), [], 'no stage change')
  assert.equal((await quoteRow(unlinked)).opportunity_id, null, 'no opportunity is linked')
  assert.equal(await opportunityCount(sw), opportunitiesBefore, 'no opportunity was made')
})

test('switch on: a quote linked to an opportunity moves it to Won with won_at, the value is once-off plus monthly times term excluding VAT when it had none, a value staff typed is kept, a Lost opportunity becomes Won with lost_reason cleared, probability untouched', async () => {
  const started = Date.now() - 60_000
  const careful = (row: Row, keys = ['stage', 'expected_value', 'won_at', 'lost_reason', 'updated_at']) => without(row, keys)

  // 10 000 once-off + 1 500 monthly x 12 = 28 000, excluding VAT (the lines carry standard VAT; with it the figure would be 32 200).
  const proposal = await opportunity(fx, { stage: 'Proposal', expected_value: 0, probability_percent: 60 })
  const quote = await acceptedQuote(fx, { opportunityId: proposal.id })
  const won = await opportunityRow(proposal.id)
  assert.equal(won.stage, 'Won')
  assert.ok(won.won_at && time(won.won_at) > started, 'won_at is set')
  assert.equal(Number(won.expected_value), 28000)
  assert.equal(won.probability_percent, 60, 'the probability is untouched')
  assert.deepEqual(careful(won), careful(proposal), 'every other field is untouched')
  assert.equal((await quoteRow(quote)).opportunity_id, proposal.id, 'the quote still belongs to it')
  const changes = await stageChanges(proposal.id)
  assert.equal(changes.length, 1, 'the stage change is on the timeline')
  assert.deepEqual(changes[0].details, { from: 'Proposal', to: 'Won' })

  // A value staff typed is kept.
  const typed = await opportunity(fx, { stage: 'Negotiation', expected_value: 5000, probability_percent: 80 })
  await acceptedQuote(fx, { opportunityId: typed.id })
  const keptValue = await opportunityRow(typed.id)
  assert.equal(keptValue.stage, 'Won')
  assert.equal(Number(keptValue.expected_value), 5000, 'the typed value is kept')
  assert.equal(keptValue.probability_percent, 80)
  assert.ok(keptValue.won_at)

  // A Lost opportunity becomes Won, its reason cleared. No terms: the monthly line counts once, 10 000 + 1 500 = 11 500.
  const lost = await opportunity(fx, { stage: 'Lost', lost_reason: 'Chose another provider', probability_percent: 10 })
  await acceptedQuote(fx, { opportunityId: lost.id, ...TERMLESS })
  const revived = await opportunityRow(lost.id)
  assert.equal(revived.stage, 'Won')
  assert.equal(revived.lost_reason, null, 'the lost reason is cleared')
  assert.equal(Number(revived.expected_value), 11500, 'a quote without terms counts its monthly lines once')
  assert.equal(revived.probability_percent, 10)
  assert.ok(revived.won_at)
  assert.deepEqual(careful(revived), careful(lost))

  // A line with no kind is once-off: 750 + 200 x 6 = 1 950.
  const mixed = await opportunity(fx, { stage: 'Qualified', probability_percent: 30 })
  await acceptedQuote(fx, {
    opportunityId: mixed.id, startDate: '2031-05-01', termMonths: 6,
    lines: [{ title: 'Audit', unitPrice: 750, chargeKind: null }, { title: 'Hosting', unitPrice: 200, chargeKind: 'monthly' }],
  })
  assert.equal(Number((await opportunityRow(mixed.id)).expected_value), 1950)

  // Already Won: the day it was won stays, no stage change is written, and a value of 0 still gets the agreement's value.
  const wonLongAgo = await opportunity(fx, { stage: 'Won', won_at: '2025-03-01T08:00:00+00:00', expected_value: 0, probability_percent: 100 })
  await acceptedQuote(fx, { opportunityId: wonLongAgo.id })
  const stillWon = await opportunityRow(wonLongAgo.id)
  assert.equal(stillWon.stage, 'Won')
  assert.equal(time(stillWon.won_at), time(wonLongAgo.won_at), 'won_at is the day it was won')
  assert.equal(Number(stillWon.expected_value), 28000)
  assert.deepEqual(await stageChanges(wonLongAgo.id), [], 'no stage change when it was already Won')
})

test('a quote with no opportunity gets one, linked to the quote; a second acceptance of a revision never creates a second', async () => {
  const opportunitiesBefore = await opportunityCount(fx)

  // Named after the project when there is one.
  const named = await sentQuote(fx)
  ok(await admin.from('quotes').update({ project_name: 'Annual advisory retainer' }).eq('id', named), 'the quote has a project name')
  await fx.acceptedOnPortal(named)
  const namedQuote = await quoteRow(named)
  assert.ok(namedQuote.opportunity_id, 'the quote is linked to an opportunity')
  const made = await opportunityRow(namedQuote.opportunity_id)
  assert.deepEqual(without(made, ['id', 'created_at', 'updated_at', 'won_at']), {
    organization_id: fx.orgId, name: 'Annual advisory retainer', client_id: fx.clientId, client_name: 'Portal Client', lead_id: null,
    owner_id: fx.owner.teamMemberId, stage: 'Won', expected_value: 28000, currency: 'ZAR', probability_percent: 0, expected_close: null,
    next_step: null, lost_reason: null, notes: null, archived_at: null,
  })
  assert.ok(made.won_at, 'won_at is set')
  assert.equal((await invoicesOf(named))[0].opportunity_id, made.id, 'the draft invoice follows the opportunity')
  assert.equal(await opportunityCount(fx), opportunitiesBefore + 1)

  // Otherwise "Quotation <number>", with the quote's owner (none here) and a quote without terms.
  const plain = await sentQuote(fx, { owner: null, ...TERMLESS })
  await fx.acceptedOnPortal(plain)
  const plainQuote = await quoteRow(plain)
  const plainOpportunity = await opportunityRow(plainQuote.opportunity_id)
  assert.equal(plainOpportunity.name, `Quotation ${plainQuote.quote_number}`)
  assert.equal(plainOpportunity.owner_id, null)
  assert.equal(plainOpportunity.stage, 'Won')
  assert.equal(Number(plainOpportunity.expected_value), 11500)
  assert.equal(await opportunityCount(fx), opportunitiesBefore + 2)

  // The client's acceptance is taken back by staff and a revision goes out and is accepted: it carries the same opportunity,
  // which is already Won with a value, so nothing is made and nothing changes.
  ok(await fx.sender.client.from('quotes').update({ status: 'Declined' }).eq('id', named), 'staff moved the quote to Declined')
  const revision = await fx.revise(named)
  assert.equal((await quoteRow(revision)).opportunity_id, made.id, 'the revision carries the opportunity')
  ok(await fx.sender.client.rpc('send_quote', { p_id: revision }), 'the revision is sent')
  await fx.acceptedOnPortal(revision)
  assert.equal((await quoteRow(revision)).status, 'Accepted')
  assert.equal((await quoteRow(revision)).opportunity_id, made.id)
  assert.equal(await opportunityCount(fx), opportunitiesBefore + 2, 'no second opportunity')
  assert.deepEqual(await opportunityRow(made.id), made, 'the opportunity is exactly as it was')
  assert.equal(await planCount(revision), 1, 'the revision has its own plan')
})

test("a plan, item 1 and a draft first invoice with the quote's lines are made; the owner and the sender each get one notification that names who can approve; the notice adds the hand-made-monthly sentence only for a monthly quote without terms (which gets item 1 only); a quote with terms gets all its items; a once-off-only quote gets item 1 only and no hand-made sentence", async () => {
  // Monthly lines and terms: the plan has every month, the first invoice every line.
  const quote = await acceptedQuote(fx, { startDate: '2031-05-31', termMonths: 12 })
  const row = await quoteRow(quote)
  const state = await billed(fx, quote)
  assert.ok(state.plan)
  assert.deepEqual(without(state.plan, ['id', 'created_at', 'updated_at']), {
    organization_id: fx.orgId, quote_id: quote, client_id: fx.clientId, start_date: '2031-05-31', term_months: 12, status: 'active', status_reason: null,
  })
  assert.equal(state.items.length, 12, 'every month of the term')
  assert.deepEqual(state.items.map((item) => item.month_number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  assert.deepEqual(state.items.map((item) => item.kind), ['first', ...Array(11).fill('monthly')])
  assert.equal(state.items[0].bill_on, saToday(), 'the first invoice is billed today')
  assert.equal(state.items[1].bill_on, '2031-06-30', 'month 2 is the start date plus one month')
  assert.equal(state.items[2].bill_on, '2031-07-31', 'months are counted from the start date, never chained')
  assert.ok(state.items.every((item) => item.status === 'open' && item.approved_at === null && item.approval_reminded_at === null))
  assert.equal(state.created.length, 1)

  assert.equal(state.invoices.length, 1, 'one invoice: item 1')
  const invoice = await invoiceOf(state.invoices[0].id)
  assert.equal(invoice.status, 'Draft')
  assert.equal(invoice.billing_plan_item_id, state.items[0].id)
  assert.equal(invoice.client_id, fx.clientId)
  assert.equal(invoice.client_name, 'Portal Client')
  assert.equal(invoice.owner_id, fx.owner.teamMemberId)
  assert.equal(invoice.currency, 'ZAR')
  assert.equal(Number(invoice.subtotal), 11500)
  const quoteLines = must(await admin.from('quote_lines').select('position,title,quantity,unit_price,vat_code').eq('quote_id', quote).order('position'))
  const invoiceLines = must(await admin.from('invoice_lines').select('position,title,quantity,unit_price,vat_code').eq('invoice_id', invoice.id).order('position'))
  assert.deepEqual(invoiceLines, quoteLines, "the invoice carries the quote's lines")
  assert.equal((await activitiesOf(quote, 'quote.invoiced')).length, 1)

  // The owner (Olive) and the sender (Sam) each get one notice that says who can approve it, and not the hand-made sentence.
  assert.deepEqual(users(state.notices), sorted(fx.owner.userId, fx.sender.userId))
  for (const notice of state.notices) {
    assert.equal(notice.title, READY_TITLE)
    assert.equal(notice.body, approvalBody(row.quote_number))
    assert.equal(notice.category, 'Finance')
    assert.equal(notice.href, `/commercial/quotes/${quote}`)
    assert.equal(notice.read_at, null)
  }

  // A monthly quote with no terms: item 1 only, and the notice says the monthly invoices are made by hand.
  const handMade = await acceptedQuote(fx, TERMLESS)
  const handState = await billed(fx, handMade)
  assert.ok(handState.plan)
  assert.equal(handState.plan.start_date, null)
  assert.equal(handState.plan.term_months, null)
  assert.deepEqual(handState.items.map((item) => item.kind), ['first'])
  assert.equal(handState.invoices.length, 1)
  assert.equal(Number((await invoiceOf(handState.invoices[0].id)).subtotal), 11500, 'item 1 carries every line')
  assert.deepEqual(users(handState.notices), sorted(fx.owner.userId, fx.sender.userId))
  for (const notice of handState.notices) assert.equal(notice.body, approvalBody((await quoteRow(handMade)).quote_number) + BY_HAND)

  // A once-off quote: item 1 only, with or without terms, and no hand-made sentence.
  for (const options of [{}, TERMLESS]) {
    const onceOff = await acceptedQuote(fx, { ...options, lines: [{ title: 'Audit', unitPrice: 750, chargeKind: 'once_off' }, { title: 'Report', unitPrice: 250, chargeKind: null }] })
    const onceState = await billed(fx, onceOff)
    assert.deepEqual(onceState.items.map((item) => item.kind), ['first'], `once-off only (${JSON.stringify(options)})`)
    assert.equal(onceState.invoices.length, 1)
    assert.equal(Number((await invoiceOf(onceState.invoices[0].id)).subtotal), 1000)
    for (const notice of onceState.notices) assert.equal(notice.body, approvalBody((await quoteRow(onceOff)).quote_number), 'no hand-made sentence')
    assert.equal(onceState.notices.length, 2)
  }

  // One notice when the owner and the sender are the same login; only the sender's when the owner has no login.
  const same = await acceptedQuote(fx, { owner: fx.sender.teamMemberId })
  assert.deepEqual(users(await noticesOf(fx, same, 'Finance')), [fx.sender.userId])
  const noLogin = await acceptedQuote(fx, { owner: fx.ownerWithoutLogin.teamMemberId })
  assert.deepEqual(users(await noticesOf(fx, noLogin, 'Finance')), [fx.sender.userId])
  const noOwner = await acceptedQuote(fx, { owner: null })
  assert.deepEqual(users(await noticesOf(fx, noOwner, 'Finance')), [fx.sender.userId])
  for (const quote of [same, noLogin, noOwner]) assert.equal((await billed(fx, quote)).invoices.length, 1)
})

test("a failing billing step still records the acceptance and its other follow-ups and writes only a warning: with the quote's client_id nulled by the service role, the acceptance holds, no plan exists, and after the client is restored billing_nightly creates the plan and the draft once", async () => {
  const opportunitiesBefore = await opportunityCount(fx)
  const quote = await strandedQuote(fx)

  // The acceptance and the follow-ups that already existed are there; nothing of billing is, the Sales step included.
  const row = await quoteRow(quote)
  assert.equal(row.status, 'Accepted')
  assert.equal(row.client_id, null)
  assert.equal(must(await admin.from('quote_responses').select('id,decision').eq('quote_id', quote)).length, 1, 'the acceptance is recorded')
  assert.deepEqual(users(await noticesOf(fx, quote, 'Commercial')), sorted(fx.owner.userId, fx.sender.userId), 'the existing notices are written')
  await assertNoBilling(fx, quote, 'failed step')
  assert.equal(row.opportunity_id, null, 'the Sales step was rolled back with the rest')
  assert.equal(await opportunityCount(fx), opportunitiesBefore, 'no opportunity was made')

  // The sweep cannot bill a quote without a client either; it warns and goes on.
  await nightly()
  await assertNoBilling(fx, quote, 'still no client')

  await restoreClient(fx, quote)
  const swept = await nightly()
  assert.ok(swept.swept >= 1)
  await assertBilledOnce(fx, quote, 'swept')
  assert.equal(await opportunityCount(fx), opportunitiesBefore + 1, 'the sweep made the opportunity')
  assert.equal((await opportunityRow((await quoteRow(quote)).opportunity_id)).stage, 'Won')

  // Once: a second sweep changes nothing.
  assert.equal((await nightly()).swept, 0)
  await assertBilledOnce(fx, quote, 'swept twice')
  assert.equal(await opportunityCount(fx), opportunitiesBefore + 1)
})

test('a client that is archived at the time: the acceptance holds and bills nothing, with no warning to act on; the sweep bills it once the client is back', async () => {
  const second = must(await admin.from('clients').insert({
    organization_id: fx.orgId, name: 'Archived Client', status: 'Active', billing_email: 'accounts@archived-client.test', address_line1: '4 Quiet Road', city: 'Durban', postal_code: '4001',
  }).select('id').single()).id as string
  const quote = await sentQuote(fx)
  ok(await admin.from('quotes').update({ client_id: second, client_name: 'Archived Client' }).eq('id', quote), 'the quote belongs to the second client')
  ok(await admin.from('clients').update({ archived_at: new Date().toISOString() }).eq('id', second), 'the client is archived')
  await fx.acceptedOnPortal(quote)
  assert.equal((await quoteRow(quote)).status, 'Accepted')
  await assertNoBilling(fx, quote, 'archived client')
  assert.equal((await quoteRow(quote)).opportunity_id, null, 'no opportunity either')
  assert.equal((await nightly()).swept, 0, 'the sweep leaves it while the client is archived')
  await assertNoBilling(fx, quote, 'archived client, swept')

  ok(await admin.from('clients').update({ archived_at: null }).eq('id', second), 'the client is un-archived')
  assert.equal((await nightly()).swept, 1)
  const state = await billed(fx, quote)
  assert.equal(state.plan?.client_id, second)
  assert.equal(state.invoices.length, 1)
  assert.equal(state.invoices[0].client_id, second)
  assert.equal(state.notices.length, 2)
})

test('a quote staff have already invoiced by hand is not billed again by the sweep; a discarded draft is not an invoice', async () => {
  // No terms, so the Create invoice button makes a plain invoice with no plan (the way it always did).
  const quote = await strandedQuote(fx, TERMLESS)
  await restoreClient(fx, quote)
  const invoice = must(await fx.sender.client.rpc('create_invoice_from_quote', { p_quote_id: quote })) as string
  assert.equal(await planCount(quote), 0, 'a plain invoice has no plan')
  assert.equal((await nightly()).swept, 0)
  assert.equal(await planCount(quote), 0, 'the sweep does not bill a quote that has an invoice')
  assert.deepEqual((await invoicesOf(quote)).map((row) => row.id), [invoice], 'still the one invoice')
  assert.deepEqual(await noticesOf(fx, quote, 'Finance'), [], 'nobody is told to approve anything')
  assert.equal((await quoteRow(quote)).opportunity_id, null, 'nor is the Sales record touched')

  // Staff discarded that draft (archived it): the quote has no live invoice, so it is a candidate like any other.
  ok(await fx.sender.client.from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', invoice), 'the draft is archived')
  assert.equal((await nightly()).swept, 1)
  const state = await billed(fx, quote)
  assert.equal(await planCount(quote), 1)
  assert.equal(state.invoices.length, 2, 'the archived draft and the plan draft')
  const planned = state.invoices.filter((row) => row.billing_plan_item_id !== null)
  assert.equal(planned.length, 1)
  assert.equal(planned[0].status, 'Draft')
  assert.equal(planned[0].archived_at, null)
  assert.equal(planned[0].billing_plan_item_id, state.items[0].id)
  assert.deepEqual(users(state.notices), sorted(fx.owner.userId, fx.sender.userId))
})

test('billing_nightly ignores acceptances from before billing_plans_enabled_at, hand-accepted quotes, quotes no longer Accepted and switched-off organisations, is idempotent, and two sweeps at once leave one plan and one draft', async () => {
  // Accepted while the switch is off: not swept while it is off, and not once it is on (the acceptance is older than the switch).
  const early = await acceptedQuote(sw)
  await assertNoBilling(sw, early, 'accepted with the switch off')
  await nightly()
  await assertNoBilling(sw, early, 'switch off, swept')
  await sw.setBilling(true)
  const enabled = must(await admin.from('organization_settings').select('billing_plans_enabled_at').eq('organization_id', sw.orgId).single())
  assert.ok(enabled.billing_plans_enabled_at, 'the switch has a time')
  const earlyResponse = must(await admin.from('quote_responses').select('decided_at').eq('quote_id', early).single())
  assert.ok(time(earlyResponse.decided_at) < time(enabled.billing_plans_enabled_at), 'the acceptance is older than the switch')
  await nightly()
  await assertNoBilling(sw, early, 'accepted before the switch was turned on')
  assert.equal((await quoteRow(early)).opportunity_id, null, 'no opportunity for it either')

  // Accepted by hand (no client's acceptance on record).
  const byHand = await sentQuote(sw)
  await sw.setStatus(byHand, 'Accepted')
  await nightly()
  await assertNoBilling(sw, byHand, 'accepted by hand')

  // Accepted on the portal, billing failed, then staff moved the quote on or archived it, and the client came back.
  const moved = await strandedQuote(sw)
  ok(await sw.sender.client.from('quotes').update({ status: 'Declined' }).eq('id', moved), 'staff moved the quote to Declined')
  await restoreClient(sw, moved)
  const archived = await strandedQuote(sw)
  ok(await admin.from('quotes').update({ archived_at: new Date().toISOString() }).eq('id', archived), 'the quote is archived')
  await restoreClient(sw, archived)
  await nightly()
  await assertNoBilling(sw, moved, 'no longer Accepted')
  await assertNoBilling(sw, archived, 'archived')
  assert.equal((await quoteRow(moved)).status, 'Declined')

  // A quote of an organisation with the switch off is never swept, whatever its acceptance.
  const off = await strandedQuote(fx)
  await restoreClient(fx, off)
  await fx.setBilling(false)
  await nightly()
  await assertNoBilling(fx, off, 'switch off in its organisation')
  await fx.setBilling(true)
  // (Turning it back on dates the switch from now: the acceptance above is older, so it is not picked up either.)
  await nightly()
  await assertNoBilling(fx, off, 'switch turned back on')

  // The one that is swept: accepted on the portal after the switch, billing failed, client back.
  const stranded = await strandedQuote(sw)
  await restoreClient(sw, stranded)
  const first = await nightly()
  assert.ok(first.swept >= 1)
  await assertBilledOnce(sw, stranded, 'swept')
  for (const [quote, label] of [[early, 'early'], [byHand, 'by hand'], [moved, 'moved'], [archived, 'archived']] as const) await assertNoBilling(sw, quote, `${label}, after the real sweep`)
  const before = await billed(sw, stranded)

  // Idempotent.
  assert.equal((await nightly()).swept, 0)
  const after = await billed(sw, stranded)
  assert.deepEqual(after, before, 'a second sweep changes nothing')

  // Two sweeps at once: one plan, one draft, one notice each.
  const both = await strandedQuote(sw)
  await restoreClient(sw, both)
  const [a, b] = await Promise.all([nightly(), nightly()])
  assert.equal(a.swept + b.swept, 1, 'one of them did it')
  await assertBilledOnce(sw, both, 'two sweeps at once')
  assert.equal(must(await admin.from('sales_opportunities').select('id').eq('organization_id', sw.orgId).eq('name', `Quotation ${(await quoteRow(both)).quote_number}`)).length, 1, 'one opportunity')
})

test('billing_nightly is for the service role only', async () => {
  for (const [who, client] of [['a signed-in member', fx.sender.client], ['an owner', fxOwner.client], ['the public', anonymous]] as const) {
    const { error } = await client.rpc('billing_nightly')
    assert.ok(error, `${who} is refused`)
    assert.equal(error.code, '42501', `${who}: ${error.message}`)
  }
})

test('an acceptance racing the sweep leaves one plan and one draft invoice', async () => {
  // Two sweepers run flat out while the client's acceptance goes through the real portal calls, so the sweeps land at every
  // point of it. A stranded acceptance waits for them to pick it up. Any error from a sweep (a deadlock, say) fails the test.
  for (const round of [1, 2, 3]) {
    const stranded = await strandedQuote(fx)
    await restoreClient(fx, stranded)
    const fresh = await sentQuote(fx)
    let running = true
    const failures: unknown[] = []
    const sweeper = async () => {
      let runs = 0
      while (running && failures.length === 0) {
        try {
          await nightly()
          runs += 1
        } catch (error) {
          failures.push(error)
        }
      }
      return runs
    }
    const sweepers = [sweeper(), sweeper()]
    try {
      await fx.acceptedOnPortal(fresh)
    } finally {
      running = false
    }
    const runs = (await Promise.all(sweepers)).reduce((sum, count) => sum + count, 0)
    assert.deepEqual(failures, [], `round ${round}: no sweep failed`)
    assert.ok(runs >= 2, `round ${round}: the sweeps ran during the acceptance`)
    await assertBilledOnce(fx, fresh, `round ${round}: the new acceptance`)
    await assertBilledOnce(fx, stranded, `round ${round}: the stranded acceptance`)
    assert.equal((await nightly()).swept, 0, `round ${round}: nothing is left to sweep`)
  }

  // Three sweeps started together over one stranded acceptance.
  const replayed = await strandedQuote(fx)
  await restoreClient(fx, replayed)
  const together = await Promise.all([nightly(), nightly(), nightly()])
  assert.equal(together.reduce((sum, result) => sum + result.swept, 0), 1, 'one of the three did it')
  await assertBilledOnce(fx, replayed, 'three sweeps at once')
})

test('unapproved drafts are reminded after two days and then every two days, not before, not once approved, not when paused, not when the switch is off, and to the same people', async () => {
  await sw.setBilling(true)
  const remindersOf = async (org: BillingOrg, quote: string) => (await noticesOf(org, quote, 'Finance')).filter((notice) => notice.title === REMINDER_TITLE)
  const told = sorted(fx.owner.userId, fx.sender.userId)

  const quote = await acceptedQuote(fx)
  const [item] = await itemsOf(quote)
  assert.equal(item.kind, 'first')
  assert.equal(item.approval_reminded_at, null)

  // A draft made now is not reminded; nor one made yesterday.
  assert.equal((await nightly()).reminded, 0, 'nothing is old enough')
  assert.equal((await remindersOf(fx, quote)).length, 0)
  await ageItem(item.id, { created_at: ago(1 * DAY) })
  await nightly()
  assert.equal((await remindersOf(fx, quote)).length, 0, 'one day is too soon')
  assert.equal((await itemRow(item.id)).approval_reminded_at, null)

  // Three days: reminded once, to the owner and the sender (the people the acceptance told), and the item is stamped.
  await ageItem(item.id, { created_at: ago(3 * DAY) })
  const first = await nightly()
  assert.equal(first.reminded, 1)
  const reminders = await remindersOf(fx, quote)
  assert.deepEqual(users(reminders), told, 'the same people as the acceptance')
  for (const reminder of reminders) {
    assert.equal(reminder.category, 'Finance')
    assert.equal(reminder.href, `/commercial/quotes/${quote}`)
    assert.equal(reminder.read_at, null)
    assert.ok(reminder.body.includes(`quotation ${(await quoteRow(quote)).quote_number}`), 'the body names the quotation')
  }
  const stamped = (await itemRow(item.id)).approval_reminded_at
  assert.ok(stamped && Math.abs(Date.now() - time(stamped)) < 10 * 60_000, 'the item is stamped with now')

  // Not again the same night; not a day later; again two days later, and again.
  assert.equal((await nightly()).reminded, 0)
  assert.equal((await remindersOf(fx, quote)).length, 2)
  assert.equal((await itemRow(item.id)).approval_reminded_at, stamped, 'the stamp is not moved by a run that reminds nobody')
  await ageItem(item.id, { approval_reminded_at: ago(1 * DAY) })
  await nightly()
  assert.equal((await remindersOf(fx, quote)).length, 2, 'one day after a reminder is too soon')
  await ageItem(item.id, { approval_reminded_at: ago(3 * DAY) })
  assert.equal((await nightly()).reminded, 1)
  assert.equal((await remindersOf(fx, quote)).length, 4, 'two days after a reminder, the people are reminded again')
  assert.deepEqual(users(await remindersOf(fx, quote)), sorted(...told, ...told))

  // The owner approves it: no more reminders.
  ok(await fxOwner.client.rpc('approve_first_invoice', { p_item_id: item.id }), 'the owner approves the first invoice')
  assert.equal((await invoiceOf((await invoicesOf(quote))[0].id)).status, 'Issued')
  await ageItem(item.id, { approval_reminded_at: ago(5 * DAY) })
  assert.equal((await nightly()).reminded, 0)
  assert.equal((await remindersOf(fx, quote)).length, 4, 'an approved invoice is not reminded')

  // A paused plan is not reminded; resumed, it is.
  const paused = await acceptedQuote(fx)
  const pausedPlan = (await planOf(paused))!
  const [pausedItem] = await itemsOf(paused)
  await ageItem(pausedItem.id, { created_at: ago(3 * DAY) })
  ok(await fxOwner.client.rpc('billing_plan_set_state', { p_plan_id: pausedPlan.id, p_action: 'pause', p_reason: 'Client asked us to wait' }), 'the plan is paused')
  assert.equal((await nightly()).reminded, 0)
  assert.equal((await remindersOf(fx, paused)).length, 0, 'a paused plan is not reminded')
  ok(await fxOwner.client.rpc('billing_plan_set_state', { p_plan_id: pausedPlan.id, p_action: 'resume', p_reason: null }), 'the plan is resumed')
  assert.equal((await nightly()).reminded, 1)
  assert.deepEqual(users(await remindersOf(fx, paused)), told)

  // An ended plan, and a draft that was archived, are not reminded.
  const ended = await acceptedQuote(fx)
  const [endedItem] = await itemsOf(ended)
  await ageItem(endedItem.id, { created_at: ago(3 * DAY) })
  ok(await fxOwner.client.rpc('billing_plan_set_state', { p_plan_id: (await planOf(ended))!.id, p_action: 'end', p_reason: 'Client withdrew' }), 'the plan is ended')
  const discarded = await acceptedQuote(fx)
  const [discardedItem] = await itemsOf(discarded)
  await ageItem(discardedItem.id, { created_at: ago(3 * DAY) })
  ok(await fx.sender.client.from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', (await invoicesOf(discarded))[0].id), 'the draft is archived')
  assert.equal((await nightly()).reminded, 0)
  assert.equal((await remindersOf(fx, ended)).length, 0, 'an ended plan is not reminded')
  assert.equal((await remindersOf(fx, discarded)).length, 0, 'an archived draft is not reminded')

  // An organisation with the switch off is not reminded; with it on again, it is.
  const waiting = await acceptedQuote(sw)
  const [waitingItem] = await itemsOf(waiting)
  await ageItem(waitingItem.id, { created_at: ago(3 * DAY) })
  await sw.setBilling(false)
  await nightly()
  assert.equal((await remindersOf(sw, waiting)).length, 0, 'switch off')
  await sw.setBilling(true)
  assert.equal((await nightly()).reminded, 1)
  assert.deepEqual(users(await remindersOf(sw, waiting)), sorted(sw.owner.userId, sw.sender.userId))
})

test("portal_decide's answer and the decision record are unchanged", async () => {
  const decideOnPortal = async (org: BillingOrg, quote: string, decision: 'accepted' | 'declined') => {
    const link = await org.newLink(quote, { email: 'billing.client@example.test', name: 'Pat Client' })
    const page = must(await admin.rpc('portal_get_quote', { p_token: link.token })) as Row
    const issued = must(await admin.rpc('portal_issue_code', { p_token: link.token })) as Row
    const args = {
      p_token: link.token, p_code: issued.code, p_decision: decision, p_signatory_name: 'Pat Client', p_signatory_position: 'Managing Director',
      p_signatory_organisation: 'Portal Client (Pty) Ltd', p_consent_text: decision === 'accepted' ? CONSENT_ACCEPT : CONSENT_DECLINE, p_consent: true,
      p_snapshot_hash: page.snapshot_hash, p_decline_reason: decision === 'declined' ? 'Budget considerations' : null, p_decline_comments: null,
      p_ip: '203.0.113.7', p_user_agent: 'Mozilla/5.0 (billing acceptance test)',
    }
    const result = must(await admin.rpc('portal_decide', args)) as Row
    return { args, result, link }
  }
  const responsesOf = async (quote: string) => must(await admin.from('quote_responses').select('*').eq('quote_id', quote)) as Row[]
  const shape = (result: Row) => without(result, ['decided_at', 'quote_id', 'quote_number'])

  // The same decision with the switch off and with it on: the same answer, the same record.
  const offQuote = await sentQuote(sw)
  await sw.setBilling(false)
  const offDecision = await decideOnPortal(sw, offQuote, 'accepted')
  await sw.setBilling(true)
  const onQuote = await sentQuote(fx)
  const onDecision = await decideOnPortal(fx, onQuote, 'accepted')
  for (const decision of [offDecision, onDecision]) assert.deepEqual(Object.keys(decision.result).sort(), SUCCESS_KEYS)
  assert.equal(onDecision.result.ok, true)
  assert.equal(onDecision.result.replay, false)
  assert.equal(onDecision.result.decision, 'accepted')
  assert.equal(onDecision.result.quote_id, onQuote)
  assert.equal(onDecision.result.client_name, 'Portal Client')
  assert.equal(onDecision.result.recipient_email, 'billing.client@example.test')
  assert.equal(onDecision.result.signatory_name, 'Pat Client')
  assert.equal(onDecision.result.signatory_position, 'Managing Director')
  assert.equal(onDecision.result.decline_reason, null)
  assert.equal(onDecision.result.decline_comments, null)
  assert.equal(onDecision.result.owner_name, 'Olive Owner')
  assert.equal(onDecision.result.notify_email, fx.owner.email)
  assert.deepEqual(shape(onDecision.result), shape({ ...offDecision.result, owner_name: onDecision.result.owner_name, notify_email: onDecision.result.notify_email }))

  const [response] = await responsesOf(onQuote)
  assert.equal((await responsesOf(onQuote)).length, 1, 'one decision record')
  assert.equal(response.decision, 'accepted')
  assert.equal(time(response.decided_at), time(onDecision.result.decided_at))
  assert.equal(response.quote_number, onDecision.result.quote_number)
  const [offResponse] = await responsesOf(offQuote)
  assert.deepEqual(Object.keys(response).sort(), Object.keys(offResponse).sort(), 'the record has the same columns')
  for (const column of ['decision', 'signatory_name', 'signatory_position', 'signatory_organisation', 'verified_email', 'consent_text', 'consent_given', 'ip_address', 'user_agent', 'decline_reason', 'decline_comments']) {
    assert.equal(response[column], offResponse[column], column)
  }
  await assertBilledOnce(fx, onQuote, 'switch on')
  await assertNoBilling(sw, offQuote, 'switch off')

  // Replaying the decision: the same answer with replay true, and nothing more is made.
  const before = await billed(fx, onQuote)
  const opportunitiesBefore = await opportunityCount(fx)
  const replay = must(await admin.rpc('portal_decide', onDecision.args)) as Row
  assert.equal(replay.ok, true)
  assert.equal(replay.replay, true)
  assert.deepEqual(without(replay, ['replay']), without(onDecision.result, ['replay']))
  assert.equal((await responsesOf(onQuote)).length, 1)
  assert.deepEqual(await billed(fx, onQuote), before, 'a replay makes nothing')
  assert.equal(await opportunityCount(fx), opportunitiesBefore)

  // A decline with the switch on bills nothing and makes no opportunity.
  const declinedQuote = await sentQuote(fx)
  const declined = await decideOnPortal(fx, declinedQuote, 'declined')
  assert.equal(declined.result.ok, true)
  assert.equal(declined.result.decision, 'declined')
  assert.equal((await quoteRow(declinedQuote)).status, 'Declined')
  assert.equal((await quoteRow(declinedQuote)).opportunity_id, null)
  await assertNoBilling(fx, declinedQuote, 'declined')
  assert.equal(await opportunityCount(fx), opportunitiesBefore, 'a decline makes no opportunity')
  assert.deepEqual(users(await noticesOf(fx, declinedQuote, 'Commercial')), sorted(fx.owner.userId, fx.sender.userId), 'the existing notices are still written')
})
