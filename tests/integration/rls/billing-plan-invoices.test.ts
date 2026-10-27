import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  acceptQuote, activitiesOf, buildPlan, invoiceOf, itemsOf, linkedTo, makeDue, ok, planOf, refused, saToday, setupBillingOrg,
  type BillingLine, type BillingOrg, type BillingQuoteOptions,
} from './billing-fixtures.ts'
import { admin, cleanup, createFixtureUser, signedInClient } from './helpers.ts'
import { anonymous, must } from './portal-fixtures.ts'

// Accept to invoice, stage 1, task 2: building a plan and its invoices. The private functions (ensure_billing_plan and
// build_plan_item_invoice) are not reachable through the REST API, so plans are built the way staff can build them: an
// Accepted quote that carries terms, with the switch on, goes through create_invoice_from_quote. Plans, items and invoices are
// read back through the service role, and the service role moves bill_on into the past when a test needs a month that is due.
// (Plans built at acceptance, including for once-off-only quotes, are tested with the acceptance itself.)

let fx: BillingOrg
let other: BillingOrg
let loner: { id: string; email: string; password: string }
let lonerClient: SupabaseClient

before(async () => {
  fx = await setupBillingOrg('billing-invoices-a')
  other = await setupBillingOrg('billing-invoices-b')
  loner = await createFixtureUser(null)
  lonerClient = await signedInClient(loner.email, loner.password)
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    try {
      await other?.teardown()
    } finally {
      await cleanup([], loner ? [loner.id] : [])
    }
  }
})

/** `start` plus `k` calendar months, the day clamped to the length of that month: worked out here, independently of the database. */
const monthsFrom = (start: string, k: number) => {
  const [year, month, day] = start.split('-').map(Number)
  const index = month - 1 + k
  const y = year + Math.floor(index / 12)
  const m = (index % 12) + 1
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`
}
const cents = (value: number) => Math.round(value * 100) / 100

/** An Accepted quote: written and sent by a member (the real send_quote), then set to Accepted by staff, as the quote page allows. */
const accepted = (options: BillingQuoteOptions = {}, org: BillingOrg = fx) => acceptQuote(org, options)
/** The same, sent while the switch is off. For quotes the send rules of a later task refuse with the switch on (monthly lines
 *  without terms, lines without a charge kind): the plan is built, and everything after, with the switch back on. */
const acceptedLoosely = async (options: BillingQuoteOptions = {}, org: BillingOrg = fx) => {
  await org.setBilling(false)
  try {
    return await accepted(options, org)
  } finally {
    await org.setBilling(true)
  }
}

const press = (quote: string, client: SupabaseClient = fx.sender.client) => client.rpc('create_invoice_from_quote', { p_quote_id: quote })
const create = (item: string, client: SupabaseClient = fx.sender.client) => client.rpc('create_plan_item_invoice', { p_item_id: item })
/** The plan, its items and the first invoice, built the way the quote page builds them. */
const planned = (options: BillingQuoteOptions = {}, org: BillingOrg = fx) => buildPlan(org, options)

const invoicesOf = async (quote: string) => must(await admin.from('invoices').select('*').eq('quote_id', quote).order('created_at')) as Array<Record<string, any>>
const quoteRow = async (id: string) => must(await admin.from('quotes').select('*').eq('id', id).single()) as Record<string, any>
const quoteLines = async (quote: string) => must(await admin.from('quote_lines').select('*').eq('quote_id', quote).order('position')) as Array<Record<string, any>>
const invoiceLines = async (invoice: string) => must(await admin.from('invoice_lines').select('*').eq('invoice_id', invoice).order('position')) as Array<Record<string, any>>
const shape = (rows: Array<Record<string, any>>) =>
  rows.map((row) => ({ position: row.position, title: row.title, description: row.description, quantity: Number(row.quantity), unit_price: Number(row.unit_price), vat_code: row.vat_code }))

test('a quote with a 12-month term gets item 1 as first and items 2 to 12 as monthly, dated on the start day of each month', async () => {
  const START = '2031-03-15'
  const quote = await accepted({ startDate: START, termMonths: 12 })
  assert.equal(await planOf(quote), null, 'no plan before the button')

  const days = [saToday()]
  const invoiceId = must(await press(quote)) as string
  days.push(saToday())

  const plan = (await planOf(quote))!
  assert.ok(plan, 'the plan is built')
  assert.equal(plan.organization_id, fx.orgId)
  assert.equal(plan.client_id, fx.clientId, 'the client is copied onto the plan')
  assert.equal(plan.start_date, START, 'the start date is copied onto the plan')
  assert.equal(plan.term_months, 12, 'the term is copied onto the plan')
  assert.equal(plan.status, 'active')
  assert.equal(plan.status_reason, null)

  const items = await itemsOf(quote)
  assert.deepEqual(items.map((item) => item.month_number), Array.from({ length: 12 }, (_, index) => index + 1), 'one item per month, 1 to 12')
  assert.deepEqual(items.map((item) => item.kind), ['first', ...Array(11).fill('monthly')], 'item 1 is first and the rest are monthly')
  assert.ok(days.includes(items[0].bill_on), `item 1 is billed on the South African day of the build (${items[0].bill_on} not in ${days})`)
  assert.deepEqual(items.slice(1).map((item) => item.bill_on), Array.from({ length: 11 }, (_, index) => monthsFrom(START, index + 1)), 'the monthly items fall on the start day of each month')
  assert.equal(items[1].bill_on, '2031-04-15')
  assert.equal(items[11].bill_on, '2032-02-15')
  for (const item of items) {
    assert.equal(item.plan_id, plan.id)
    assert.equal(item.quote_id, quote)
    assert.equal(item.organization_id, fx.orgId)
    assert.equal(item.status, 'open')
    assert.equal(item.cancelled_reason, null)
    assert.equal(item.approved_at, null)
    assert.equal(item.approved_by, null)
  }

  // The invoice the button returned is item 1's, and no other month has one.
  const invoices = await invoicesOf(quote)
  assert.deepEqual(invoices.map((invoice) => [invoice.id, invoice.billing_plan_item_id]), [[invoiceId, items[0].id]])

  const entries = await activitiesOf(quote, 'billing.plan_created')
  assert.equal(entries.length, 1, 'one timeline entry for the plan')
  assert.equal(entries[0].organization_id, fx.orgId)
  assert.equal(entries[0].created_by, fx.sender.userId)
  assert.equal(entries[0].details.plan_id, plan.id)
  assert.match(entries[0].subject, new RegExp((await quoteRow(quote)).quote_number))
})

test('a start on 31 January gives 28 February (29 in a leap year), 31 March and 30 April, counted from the start date', async () => {
  const cases: Array<[start: string, term: number, expected: string[]]> = [
    ['2031-01-31', 5, ['2031-02-28', '2031-03-31', '2031-04-30', '2031-05-31']],
    ['2032-01-31', 4, ['2032-02-29', '2032-03-31', '2032-04-30']],
    ['2031-01-30', 4, ['2031-02-28', '2031-03-30', '2031-04-30']],
    ['2031-10-31', 6, ['2031-11-30', '2031-12-31', '2032-01-31', '2032-02-29', '2032-03-31']],
    ['2031-05-29', 3, ['2031-06-29', '2031-07-29']],
  ]
  for (const [start, term, expected] of cases) {
    const { items, plan } = await planned({ startDate: start, termMonths: term })
    assert.equal(plan?.start_date, start)
    assert.equal(items.length, term, `a term of ${term} gives ${term} items`)
    assert.deepEqual(items.slice(1).map((item) => item.bill_on), expected, `a start on ${start}`)
  }
})

test('a term of 24 months gives 24 items', async () => {
  const START = '2031-02-01'
  const { items, plan } = await planned({ startDate: START, termMonths: 24 })
  assert.equal(plan?.term_months, 24)
  assert.deepEqual(items.map((item) => item.month_number), Array.from({ length: 24 }, (_, index) => index + 1))
  assert.equal(items.filter((item) => item.kind === 'first').length, 1)
  assert.equal(items.filter((item) => item.kind === 'monthly').length, 23)
  assert.equal(items[1].bill_on, '2031-03-01')
  assert.equal(items[23].bill_on, '2033-01-01', 'month 24 is 23 months after the start')

  // A term of one month is the first item alone.
  const single = await planned({ startDate: START, termMonths: 1 })
  assert.deepEqual(single.items.map((item) => [item.month_number, item.kind]), [[1, 'first']])
})

test('a quote with monthly lines but no terms gets no plan from the button', async () => {
  const quote = await acceptedLoosely({ startDate: null, termMonths: null })
  assert.equal((await quoteLines(quote)).filter((line) => line.charge_kind === 'monthly').length, 1, 'the quote has a monthly line')
  const invoice = must(await press(quote)) as string

  assert.equal(await planOf(quote), null, 'no plan')
  assert.deepEqual(await itemsOf(quote), [], 'no items')
  const row = await invoiceOf(invoice)
  assert.equal(row.billing_plan_item_id, null, 'the invoice is a plain one')
  assert.deepEqual(shape(await invoiceLines(invoice)), shape(await quoteLines(quote)), 'with every line of the quote')
  assert.deepEqual(await activitiesOf(quote, 'billing.plan_created'), [], 'nothing on the timeline about a plan')
})

test('lines with no charge kind count as once-off', async () => {
  const lines: BillingLine[] = [
    { title: 'Audit', unitPrice: 400, chargeKind: null },
    { title: 'Hosting', unitPrice: 250, chargeKind: 'monthly' },
  ]
  // Sent with the switch off: a later send rule refuses a line with no kind while the switch is on.
  const quote = await acceptedLoosely({ startDate: '2031-06-01', termMonths: 3, lines })
  const invoice = must(await press(quote)) as string
  const items = await itemsOf(quote)
  assert.equal(items.length, 3)
  assert.deepEqual((await invoiceLines(invoice)).map((line) => line.title), ['Audit', 'Hosting'], 'the first invoice carries both')
  await makeDue(items[1].id)
  const monthly = must(await create(items[1].id)) as string
  assert.deepEqual((await invoiceLines(monthly)).map((line) => line.title), ['Hosting'], 'the monthly invoice carries only the monthly line; the line with no kind is once-off')

  // Lines that are all once-off or have no kind, with terms: nothing is monthly, so the plan is the first item alone.
  const once = await acceptedLoosely({ startDate: '2031-06-01', termMonths: 6, lines: [{ title: 'Audit', unitPrice: 400, chargeKind: null }, { title: 'Review', unitPrice: 100, chargeKind: 'once_off' }] })
  must(await press(once))
  assert.equal((await planOf(once))?.term_months, 6, "the plan keeps the quote's terms")
  assert.deepEqual((await itemsOf(once)).map((item) => [item.month_number, item.kind]), [[1, 'first']], 'no monthly line, so no monthly items')
})

test("the first invoice carries every quote line and a monthly item only the monthly lines, each linked to its item, owned by the quote's owner, totals equal to the lines", async () => {
  const opportunity = must(await admin.from('sales_opportunities').insert({
    organization_id: fx.orgId, name: 'Billing renewal', client_id: fx.clientId, client_name: 'Portal Client', stage: 'Proposal',
    owner_id: fx.owner.teamMemberId, expected_value: 1000, probability_percent: 60,
  }).select('id').single()).id as string
  const lines: BillingLine[] = [
    { title: 'Setup', unitPrice: 10000, chargeKind: 'once_off' },
    { title: 'Retainer', unitPrice: 1500, chargeKind: 'monthly' },
    { title: 'Hosting', unitPrice: 250, chargeKind: 'monthly' },
    { title: 'Audit', unitPrice: 400, chargeKind: 'once_off' },
  ]
  const quote = await accepted({ startDate: '2031-04-01', termMonths: 3, lines, opportunityId: opportunity })
  // What a member cannot set on a sent quote and the header copies: the owner, the project fields and the client's reference.
  ok(await admin.from('quotes').update({
    owner_id: fx.owner.teamMemberId, project_name: 'Brand refresh', project_description: 'Twelve weeks of work', project_ref: 'PRJ-9', client_ref: 'PO-4411',
  }).eq('id', quote), 'the quote header')
  ok(await admin.from('quote_offerings').insert([
    { organization_id: fx.orgId, quote_id: quote, position: 1, offering_kind: 'retainer', offering_key: 'growth' },
    { organization_id: fx.orgId, quote_id: quote, position: 2, offering_kind: 'support', offering_key: 'website_care' },
  ]), 'the offerings')

  const first = must(await press(quote)) as string
  const items = await itemsOf(quote)
  await makeDue(items[1].id)
  const second = must(await create(items[1].id)) as string
  const source = await quoteRow(quote)
  const sourceLines = await quoteLines(quote)
  const vatRate = Number(source.vat_rate)

  for (const [invoiceId, item, expected] of [
    [first, items[0], sourceLines],
    [second, items[1], sourceLines.filter((line) => line.charge_kind === 'monthly')],
  ] as const) {
    const invoice = await invoiceOf(invoiceId)
    assert.equal(invoice.billing_plan_item_id, item.id, `month ${item.month_number}: linked to its item`)
    assert.equal(invoice.organization_id, fx.orgId)
    assert.equal(invoice.quote_id, quote)
    assert.equal(invoice.status, 'Draft')
    assert.match(invoice.invoice_number, /^DRAFT-[0-9a-f]{8}$/)
    assert.equal(invoice.client_id, source.client_id)
    assert.equal(invoice.client_name, source.client_name)
    assert.equal(invoice.owner_id, fx.owner.teamMemberId, "the quote's owner owns the invoice")
    assert.equal(invoice.opportunity_id, opportunity)
    assert.equal(invoice.currency, source.currency)
    assert.equal(invoice.project_name, 'Brand refresh')
    assert.equal(invoice.project_description, 'Twelve weeks of work')
    assert.equal(invoice.project_ref, 'PRJ-9')
    assert.equal(invoice.client_ref, 'PO-4411')
    assert.equal(invoice.due_date, null, 'the due date is left for the person who sends it')
    assert.equal(invoice.issue_date, null)
    assert.equal(invoice.notes, null, 'internal notes are not copied')

    assert.deepEqual(shape(await invoiceLines(invoiceId)), shape(expected), `month ${item.month_number}: the lines are the quote's lines`)
    const subtotal = cents(expected.reduce((sum, line) => sum + Number(line.line_amount), 0))
    const standard = expected.filter((line) => line.vat_code === 'standard').reduce((sum, line) => sum + Number(line.line_amount), 0)
    const tax = cents((standard * vatRate) / 100)
    assert.equal(Number(invoice.subtotal), subtotal, `month ${item.month_number}: the subtotal is the lines'`)
    assert.equal(Number(invoice.tax_amount), tax, `month ${item.month_number}: the VAT is worked out from the lines`)
    assert.equal(Number(invoice.total_amount), cents(subtotal + tax))
    assert.equal(Number(invoice.balance_amount), cents(subtotal + tax))

    const offerings = must(await admin.from('invoice_offerings').select('position,offering_kind,offering_key').eq('invoice_id', invoiceId).order('position'))
    assert.deepEqual(offerings, [{ position: 1, offering_kind: 'retainer', offering_key: 'growth' }, { position: 2, offering_kind: 'support', offering_key: 'website_care' }], `month ${item.month_number}: the offerings come too`)
  }
  assert.deepEqual((await invoiceLines(first)).map((line) => line.title), ['Setup', 'Retainer', 'Hosting', 'Audit'])
  assert.deepEqual((await invoiceLines(second)).map((line) => line.title), ['Retainer', 'Hosting'])
  assert.equal(Number((await invoiceOf(first)).total_amount), Number(source.total_amount), 'the first invoice adds up to the quote')
  assert.equal(Number((await invoiceOf(second)).subtotal), 1750)

  // The quote is as it was, and each build is on its timeline.
  const now = await quoteRow(quote)
  for (const column of ['status', 'quote_number', 'subtotal', 'tax_amount', 'total_amount', 'start_date', 'term_months']) assert.deepEqual(now[column], source[column], `${column} on the quote is unchanged`)
  assert.equal((await quoteLines(quote)).length, 4)
  const entries = await activitiesOf(quote, 'quote.invoiced')
  assert.equal(entries.length, 2)
  assert.deepEqual(entries.map((entry) => entry.details.invoice_id).sort(), [first, second].sort())
  for (const entry of entries) {
    assert.equal(entry.subject, `Draft invoice created from quote ${source.quote_number}`)
    assert.equal(entry.details.quote_id, quote)
    assert.equal(entry.details.quote_number, source.quote_number)
    assert.equal(entry.created_by, fx.sender.userId)
  }
})

test('an item is invoiced once: a second call raises BILLING_ITEM_ALREADY_INVOICED, two simultaneous calls make one invoice, an archived draft frees the item and a Cancelled invoice does not', async () => {
  const { quote, invoice: first, items } = await planned({ startDate: '2031-05-01', termMonths: 4 })

  // Item 1 already has its draft: asking again is refused and changes nothing.
  refused((await create(items[0].id)).error, 'BILLING_ITEM_ALREADY_INVOICED')
  assert.deepEqual((await linkedTo(items[0].id)).map((row) => row.id), [first])

  // Two members at once: one invoice, one refusal.
  await makeDue(items[1].id)
  const race = await Promise.all([create(items[1].id, fx.sender.client), create(items[1].id, fx.owner.client)])
  assert.equal(race.filter((result) => !result.error).length, 1, 'exactly one call made the invoice')
  const lost = race.filter((result) => result.error)
  assert.equal(lost.length, 1)
  refused(lost[0].error, 'BILLING_ITEM_ALREADY_INVOICED')
  const [only] = await linkedTo(items[1].id)
  assert.equal((await linkedTo(items[1].id)).length, 1, 'one invoice for the month')
  assert.equal(race.find((result) => !result.error)?.data, only.id)

  // An archived draft frees the month: it is deleted (it was never numbered, so no number is lost, and a restored copy could have been
  // issued with no approval), and the month can be invoiced again. (Archived by the service role here; the member's own discard and
  // restore are tested in billing-approval.)
  ok(await admin.from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', only.id), 'the draft is archived')
  const again = must(await create(items[1].id)) as string
  assert.notEqual(again, only.id)
  assert.deepEqual(must(await admin.from('invoices').select('id').eq('id', only.id)), [], 'the archived draft was deleted when the month was built again')
  assert.deepEqual(must(await admin.from('invoice_lines').select('id').eq('invoice_id', only.id)), [], 'with its lines')
  assert.deepEqual((await linkedTo(items[1].id)).map((row) => row.id), [again], 'the month points at the new draft')

  // A Cancelled invoice keeps the month: issued, then cancelled, it is still the invoice of that month.
  const issued = await fx.sender.client.rpc('issue_invoice', { p_id: again })
  ok(issued, 'the monthly invoice is issued')
  ok(await fx.sender.client.rpc('cancel_invoice', { p_invoice: again }), 'and cancelled')
  refused((await create(items[1].id)).error, 'BILLING_ITEM_ALREADY_INVOICED')
  const [kept] = await linkedTo(items[1].id)
  assert.equal(kept.id, again)
  assert.equal(kept.status, 'Cancelled', 'the cancelled invoice still holds the month')
  assert.equal((await invoicesOf(quote)).length, 2, 'the item-1 draft and the cancelled invoice: nothing else was made, and the discarded draft is gone')

  // A monthly invoice that is only a draft and not archived keeps the month too.
  await makeDue(items[2].id)
  const third = must(await create(items[2].id)) as string
  refused((await create(items[2].id)).error, 'BILLING_ITEM_ALREADY_INVOICED')
  assert.deepEqual((await linkedTo(items[2].id)).map((row) => row.id), [third])
})

test("a monthly item is refused before its date; paused and ended plans, cancelled items, non-members, other organisations' items and a switched-off organisation are refused", async () => {
  const { quote, items } = await planned({ startDate: '2031-07-01', termMonths: 4 })

  // Not due: a monthly item is refused until its day, and the day itself is allowed.
  refused((await create(items[1].id)).error, 'BILLING_ITEM_NOT_DUE')
  assert.deepEqual(await linkedTo(items[1].id), [], 'nothing was made')
  ok(await admin.from('billing_plan_items').update({ bill_on: saToday() }).eq('id', items[2].id), 'item 3 is due today')
  const today = must(await create(items[2].id)) as string
  assert.equal((await linkedTo(items[2].id))[0].id, today, 'a month due today can be invoiced')

  // Paused and ended plans.
  await makeDue(items[1].id)
  for (const status of ['paused', 'ended']) {
    ok(await admin.from('billing_plans').update({ status, status_reason: `Set to ${status}` }).eq('quote_id', quote), `the plan is ${status}`)
    refused((await create(items[1].id)).error, 'BILLING_PLAN_NOT_ACTIVE')
    assert.deepEqual(await linkedTo(items[1].id), [], `nothing was made for a ${status} plan`)
  }
  ok(await admin.from('billing_plans').update({ status: 'active', status_reason: null }).eq('quote_id', quote), 'the plan is active again')

  // A cancelled item, whether or not its day has come.
  ok(await admin.from('billing_plan_items').update({ status: 'cancelled', cancelled_reason: 'The client changed the term' }).in('id', [items[1].id, items[3].id]), 'items cancelled')
  refused((await create(items[1].id)).error, 'BILLING_ITEM_CANCELLED')
  refused((await create(items[3].id)).error, 'BILLING_ITEM_CANCELLED')
  assert.deepEqual(await linkedTo(items[3].id), [])
  ok(await admin.from('billing_plan_items').update({ status: 'open', cancelled_reason: null }).eq('id', items[1].id), 'item 2 is open again')

  // Not a member, another organisation's member, an item that does not exist: never revealed.
  refused((await create(items[1].id, lonerClient)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await create(items[1].id, other.sender.client)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await create('00000000-0000-0000-0000-000000000000')).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  const foreign = await planned({ startDate: '2031-07-01', termMonths: 3 }, other)
  await makeDue(foreign.items[1].id)
  refused((await create(foreign.items[1].id)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  assert.deepEqual(await linkedTo(foreign.items[1].id), [], "A could not invoice B's month")
  const signedOut = await anonymous.rpc('create_plan_item_invoice', { p_item_id: items[1].id })
  assert.match(signedOut.error?.message ?? '', /permission denied for function create_plan_item_invoice/)
  assert.deepEqual(await linkedTo(items[1].id), [])

  // A switched-off organisation: its own members are refused, plan or not.
  await other.setBilling(false)
  try {
    refused((await create(foreign.items[1].id, other.sender.client)).error, 'BILLING_NOT_ENABLED')
    assert.deepEqual(await linkedTo(foreign.items[1].id), [])
  } finally {
    await other.setBilling(true)
  }
  const made = must(await create(foreign.items[1].id, other.sender.client)) as string
  assert.equal((await linkedTo(foreign.items[1].id))[0].id, made, 'with the switch back on it works')

  // The same member can now invoice the open, due month of the active plan.
  const reopened = must(await create(items[1].id)) as string
  assert.equal((await linkedTo(items[1].id))[0].id, reopened)

  // The quote must still be Accepted and unarchived (a separate plan, so nothing after depends on its state).
  for (const [label, change, token] of [
    ['declined', { status: 'Declined' }, 'QUOTE_NOT_ACCEPTED'],
    ['archived', { archived_at: new Date().toISOString() }, 'QUOTE_ARCHIVED'],
  ] as const) {
    const gone = await planned({ startDate: '2031-07-01', termMonths: 3 })
    await makeDue(gone.items[1].id)
    ok(await admin.from('quotes').update(change).eq('id', gone.quote), `the quote is ${label}`)
    refused((await create(gone.items[1].id)).error, token)
    assert.deepEqual(await linkedTo(gone.items[1].id), [], `no invoice for a ${label} quote`)
  }
})

test("create_invoice_from_quote: without a plan it makes one draft with the quote's lines; pressed twice, or at once, the second raises QUOTE_ALREADY_INVOICED; after the draft is archived or the invoice cancelled it works again; with a plan it raises QUOTE_HAS_BILLING_PLAN; with the switch off it is exactly as before", async () => {
  // Without a plan: one draft, the quote's lines, no link, no plan.
  const quote = await accepted({ startDate: null, termMonths: null, lines: [{ title: 'Setup', unitPrice: 10000, chargeKind: 'once_off' }, { title: 'Review', unitPrice: 500, chargeKind: 'once_off' }] })
  const draft = must(await press(quote)) as string
  const row = await invoiceOf(draft)
  assert.equal(row.status, 'Draft')
  assert.equal(row.quote_id, quote)
  assert.equal(row.billing_plan_item_id, null)
  assert.deepEqual(shape(await invoiceLines(draft)), shape(await quoteLines(quote)))
  assert.equal(Number(row.total_amount), Number((await quoteRow(quote)).total_amount))
  assert.equal(await planOf(quote), null, 'no terms, no plan')

  // Pressed twice: the second is refused and nothing is added.
  refused((await press(quote)).error, 'QUOTE_ALREADY_INVOICED')
  assert.equal((await invoicesOf(quote)).length, 1)
  assert.equal((await activitiesOf(quote, 'quote.invoiced')).length, 1, 'only the invoice that was made is on the timeline')

  // Pressed at once: one invoice, one refusal. (The default lines include a monthly one, which a later send rule refuses without
  // terms while the switch is on: sent with the switch off.)
  const racing = await acceptedLoosely({ startDate: null, termMonths: null })
  const race = await Promise.all([press(racing, fx.sender.client), press(racing, fx.owner.client)])
  assert.equal(race.filter((result) => !result.error).length, 1, 'exactly one call made the invoice')
  const lost = race.filter((result) => result.error)
  assert.equal(lost.length, 1)
  refused(lost[0].error, 'QUOTE_ALREADY_INVOICED')
  assert.equal((await invoicesOf(racing)).length, 1)

  // The same with terms and the switch on: one plan, its items once, one invoice, one refusal.
  const racingPlan = await accepted({ startDate: '2031-11-01', termMonths: 4 })
  const planRace = await Promise.all([press(racingPlan, fx.sender.client), press(racingPlan, fx.owner.client)])
  assert.equal(planRace.filter((result) => !result.error).length, 1, 'exactly one call built the plan')
  const planLost = planRace.filter((result) => result.error)
  assert.equal(planLost.length, 1)
  refused(planLost[0].error, 'QUOTE_HAS_BILLING_PLAN')
  assert.equal(must(await admin.from('billing_plans').select('id').eq('quote_id', racingPlan)).length, 1, 'one plan')
  assert.equal((await itemsOf(racingPlan)).length, 4, 'its items, once')
  assert.equal((await invoicesOf(racingPlan)).length, 1, 'one invoice')
  assert.equal((await activitiesOf(racingPlan, 'billing.plan_created')).length, 1, 'one timeline entry')

  // An archived Draft no longer counts (an archived invoice that was issued does: see the test that follows): the button works
  // again, and the archived draft stays as it was.
  ok(await fx.sender.client.from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', draft), 'the draft is archived')
  const second = must(await press(quote)) as string
  assert.notEqual(second, draft)
  assert.ok((await invoiceOf(draft)).archived_at, 'the archived draft is still archived')
  refused((await press(quote)).error, 'QUOTE_ALREADY_INVOICED')

  // A Cancelled invoice no longer counts either.
  ok(await fx.sender.client.rpc('issue_invoice', { p_id: second }), 'the second invoice is issued')
  refused((await press(quote)).error, 'QUOTE_ALREADY_INVOICED')
  ok(await fx.sender.client.rpc('cancel_invoice', { p_invoice: second }), 'and cancelled')
  const third = must(await press(quote)) as string
  assert.equal((await invoiceOf(third)).status, 'Draft')
  assert.equal((await invoicesOf(quote)).length, 3, 'an archived draft, a cancelled invoice and the live draft')
  assert.deepEqual(shape(await invoiceLines(third)), shape(await quoteLines(quote)))

  // With a plan: the button is closed, whatever the invoices are.
  const { quote: planQuote, invoice: planDraft, items } = await planned({ startDate: '2031-08-01', termMonths: 3 })
  refused((await press(planQuote)).error, 'QUOTE_HAS_BILLING_PLAN')
  ok(await admin.from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', planDraft), 'the plan draft is archived')
  refused((await press(planQuote)).error, 'QUOTE_HAS_BILLING_PLAN')
  await fx.setBilling(false)
  try {
    refused((await press(planQuote)).error, 'QUOTE_HAS_BILLING_PLAN')
  } finally {
    await fx.setBilling(true)
  }
  assert.equal((await invoicesOf(planQuote)).length, 1, 'no invoice outside the plan')
  assert.equal((await planOf(planQuote))?.status, 'active')
  assert.equal((await itemsOf(planQuote)).length, items.length, 'the plan is as it was')
  assert.equal((await activitiesOf(planQuote, 'billing.plan_created')).length, 1)

  // With the switch off it is exactly as before: one plain draft with every line, even for a quote that carries terms.
  await other.setBilling(false)
  try {
    const legacy = await accepted({ startDate: '2031-08-01', termMonths: 6 }, other)
    const invoice = must(await press(legacy, other.sender.client)) as string
    const made = await invoiceOf(invoice)
    const source = await quoteRow(legacy)
    assert.equal(made.status, 'Draft')
    assert.equal(made.billing_plan_item_id, null)
    assert.equal(made.client_id, source.client_id)
    assert.equal(made.client_name, source.client_name)
    assert.equal(made.owner_id, source.owner_id)
    assert.equal(made.currency, source.currency)
    assert.equal(made.due_date, null)
    assert.deepEqual(shape(await invoiceLines(invoice)), shape(await quoteLines(legacy)), 'every line, once-off and monthly')
    assert.equal(Number(made.total_amount), Number(source.total_amount))
    assert.equal(await planOf(legacy), null, 'no plan')
    assert.deepEqual(await itemsOf(legacy), [])
    assert.deepEqual(await activitiesOf(legacy, 'billing.plan_created'), [])
    const entries = await activitiesOf(legacy, 'quote.invoiced')
    assert.equal(entries.length, 1)
    assert.equal(entries[0].subject, `Draft invoice created from quote ${source.quote_number}`)
    assert.deepEqual(Object.keys(entries[0].details).sort(), ['invoice_id', 'quote_id', 'quote_number'], 'the timeline entry is the one it always was')
    refused((await press(legacy, other.sender.client)).error, 'QUOTE_ALREADY_INVOICED')
  } finally {
    await other.setBilling(true)
  }

  // The rest of the checks are as they were.
  refused((await press(await fx.sentBillingQuote())).error, 'QUOTE_NOT_ACCEPTED')
  refused((await press(quote, other.sender.client)).error, 'QUOTE_NOT_FOUND', '42501')
})

test("an archived invoice that was issued is still the quote's invoice: only an archived Draft or a Cancelled invoice frees the button", async () => {
  const quote = await accepted({ startDate: null, termMonths: null, lines: [{ title: 'Setup', unitPrice: 4000, chargeKind: 'once_off' }, { title: 'Review', unitPrice: 600, chargeKind: 'once_off' }] })
  const issued = must(await press(quote)) as string
  ok(await fx.sender.client.rpc('issue_invoice', { p_id: issued }), 'the invoice is issued')

  // Nothing in the schema stops a member archiving an issued invoice, so the guard cannot read "archived" as "discarded".
  ok(await fx.sender.client.from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', issued), 'a member archives the issued invoice')
  const archived = await invoiceOf(issued)
  assert.equal(archived.status, 'Issued')
  assert.ok(archived.archived_at, 'it is archived')
  refused((await press(quote)).error, 'QUOTE_ALREADY_INVOICED')
  assert.equal((await invoicesOf(quote)).length, 1, 'no second invoice for the quote')
  assert.equal((await activitiesOf(quote, 'quote.invoiced')).length, 1, 'and nothing more on the timeline')

  // Cancelling it frees the button, archived or not.
  ok(await fx.sender.client.rpc('cancel_invoice', { p_invoice: issued }), 'the issued invoice is cancelled')
  assert.equal((await invoiceOf(issued)).status, 'Cancelled')
  const draft = must(await press(quote)) as string
  assert.equal((await invoiceOf(draft)).status, 'Draft')
  refused((await press(quote)).error, 'QUOTE_ALREADY_INVOICED')

  // An archived Draft frees it too.
  ok(await fx.sender.client.from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', draft), 'the draft is archived')
  const again = must(await press(quote)) as string
  assert.notEqual(again, draft)
  assert.equal((await invoiceOf(again)).status, 'Draft')
  assert.equal((await invoicesOf(quote)).length, 3, 'a cancelled invoice, an archived draft and the live draft')
  refused((await press(quote)).error, 'QUOTE_ALREADY_INVOICED')
})

test('a plan cannot be built for an accepted quote whose client has since been removed', async () => {
  const client = must(await admin.from('clients').insert({
    organization_id: fx.orgId, name: 'Gone Client', status: 'Active', billing_email: 'gone@portal-client.test', address_line1: '3 Test Lane', city: 'Cape Town', postal_code: '8001',
  }).select('id').single()).id as string
  const quote = must(await fx.sender.client.from('quotes').insert({
    organization_id: fx.orgId, client_id: client, client_name: 'Gone Client', start_date: '2031-09-01', term_months: 3,
  }).select('id').single()).id as string
  ok(await fx.sender.client.from('quote_lines').insert({ organization_id: fx.orgId, quote_id: quote, position: 1, title: 'Retainer', quantity: 1, unit_price: 900, charge_kind: 'monthly' }), 'the line')
  ok(await fx.sender.client.rpc('send_quote', { p_id: quote }), 'the quote is sent')
  await fx.setStatus(quote, 'Accepted')
  ok(await admin.from('clients').delete().eq('id', client), 'the client is removed')
  assert.equal((await quoteRow(quote)).client_id, null)

  refused((await press(quote)).error, 'BILLING_QUOTE_NOT_ELIGIBLE')
  assert.equal(await planOf(quote), null, 'no plan')
  assert.deepEqual(await itemsOf(quote), [])
  assert.deepEqual(await invoicesOf(quote), [], 'and no invoice: the whole call was undone')
  assert.deepEqual(await activitiesOf(quote, 'billing.plan_created'), [])
})

test('the Create invoice button makes a plain draft and no plan for a quote whose client is archived; the same quote of a client that is not archived gets its plan', async () => {
  const newClient = async (name: string) =>
    must(await admin.from('clients').insert({
      organization_id: fx.orgId, name, status: 'Active', billing_email: 'archived@portal-client.test', address_line1: '4 Test Lane', city: 'Cape Town', postal_code: '8001',
    }).select('id').single()).id as string
  const quoteFor = async (client: string, name: string) => {
    const quote = must(await fx.sender.client.from('quotes').insert({
      organization_id: fx.orgId, client_id: client, client_name: name, start_date: '2031-09-01', term_months: 3,
    }).select('id').single()).id as string
    ok(await fx.sender.client.from('quote_lines').insert({ organization_id: fx.orgId, quote_id: quote, position: 1, title: 'Setup', quantity: 1, unit_price: 700, charge_kind: 'once_off' }), 'the once-off line')
    ok(await fx.sender.client.from('quote_lines').insert({ organization_id: fx.orgId, quote_id: quote, position: 2, title: 'Retainer', quantity: 1, unit_price: 900, charge_kind: 'monthly' }), 'the monthly line')
    ok(await fx.sender.client.rpc('send_quote', { p_id: quote }), 'the quote is sent')
    await fx.setStatus(quote, 'Accepted')
    return quote
  }
  const client = await newClient('Archived Client')
  const quote = await quoteFor(client, 'Archived Client')

  // The client is archived after the quote was accepted (by the service role: the pause trigger fires on the act and finds no plan).
  ok(await admin.from('clients').update({ archived_at: new Date().toISOString() }).eq('id', client), 'the client is archived')
  const draft = must(await press(quote)) as string
  const row = await invoiceOf(draft)
  assert.equal(row.status, 'Draft')
  assert.equal(row.quote_id, quote)
  assert.equal(row.billing_plan_item_id, null, 'a plain draft, linked to no month')
  assert.deepEqual(shape(await invoiceLines(draft)), shape(await quoteLines(quote)), 'every quote line, once-off and monthly, as the legacy copy makes it')
  assert.equal(await planOf(quote), null, 'no plan')
  assert.deepEqual(await itemsOf(quote), [], 'no items')
  assert.deepEqual(await activitiesOf(quote, 'billing.plan_created'), [], 'and no plan on the timeline')
  assert.equal((await activitiesOf(quote, 'quote.invoiced')).length, 1)
  refused((await press(quote)).error, 'QUOTE_ALREADY_INVOICED')
  assert.equal(await planOf(quote), null, 'pressed again: still no plan')

  // The same terms and lines for a client that is not archived: the plan is built. (So it was the archived client that made the difference.)
  ok(await admin.from('clients').update({ archived_at: null }).eq('id', client), 'the client is back')
  const second = await quoteFor(client, 'Archived Client')
  const first = must(await press(second)) as string
  assert.ok((await invoiceOf(first)).billing_plan_item_id, 'linked to item 1')
  assert.equal((await planOf(second))?.status, 'active')
  assert.equal((await itemsOf(second)).length, 3, 'a plan with its three months')
})

test("a plan item cannot name a quote other than its plan's", async () => {
  const [one, two] = [await accepted(), await accepted()]
  const plan = must(await admin.from('billing_plans').insert({ organization_id: fx.orgId, quote_id: one, client_id: fx.clientId, start_date: '2031-10-01', term_months: 3 }).select('id').single()).id as string
  const insertItem = (quote: string, month: number) =>
    admin.from('billing_plan_items').insert({ organization_id: fx.orgId, plan_id: plan, quote_id: quote, month_number: month, kind: month === 1 ? 'first' : 'monthly', bill_on: '2031-10-01' }).select('id').single()

  const crossed = await insertItem(two, 1)
  refused(crossed.error, 'billing_plan_items_plan_id_quote_id_fkey', '23503')
  assert.deepEqual(await itemsOf(two), [], 'nothing was written')
  ok(await insertItem(one, 1), "an item for its plan's own quote")
  refused((await insertItem(two, 2)).error, 'billing_plan_items_plan_id_quote_id_fkey', '23503')
  assert.equal((await itemsOf(one)).length, 1)
})
