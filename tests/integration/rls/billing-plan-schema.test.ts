import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'
import { anonymous, must } from './portal-fixtures.ts'

// Accept to invoice, stage 1, task 1: the schema. Quote terms (start_date and term_months), the billing switch on the company
// settings, the two plan tables and the link from an invoice to a plan item. Nothing here has a function behind it yet, so the
// service role writes the plans, items and invoices and the signed-in roles are only asked what the privilege layer, the
// policies, the constraints and the triggers let them do. Every refusal is checked by SQLSTATE and by the name of the constraint
// (or the token), so a row cannot be refused for the wrong reason.
//
// The switch is left off in the main fixture on purpose: billing_plans_enabled defaults to false and one test shows it.

let fx: BillingOrg
let other: BillingOrg
let ownerClient: SupabaseClient
let adminClient: SupabaseClient
const extraOrgs: string[] = []
const extraUsers: string[] = []

before(async () => {
  fx = await setupBillingOrg('billing-schema-a', { billing: false })
  other = await setupBillingOrg('billing-schema-b')
  for (const [role, assign] of [['owner', (client: SupabaseClient) => (ownerClient = client)], ['admin', (client: SupabaseClient) => (adminClient = client)]] as const) {
    const user = await createFixtureUser(fx.orgId, role)
    extraUsers.push(user.id)
    assign(await signedInClient(user.email, user.password))
  }
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    try {
      await other?.teardown()
    } finally {
      // The owner and the admin are made here, so their logins are removed here (their memberships went with the organisation).
      await cleanup(extraOrgs, extraUsers)
    }
  }
})

/** A refusal by the named code, and by the named constraint or token, so a write cannot be refused for the wrong reason. */
const refused = (result: { error: { code?: string; message: string } | null }, code: string, message: RegExp, label: string) => {
  assert.equal(result.error?.code, code, `${label}: ${result.error?.message}`)
  assert.match(result.error?.message ?? '', message, label)
}
const ok = (result: { error: { message: string } | null }, label: string) => assert.equal(result.error, null, `${label}: ${result.error?.message}`)

const START = '2030-01-15'
const quoteTerms = async (id: string) => must(await admin.from('quotes').select('start_date,term_months').eq('id', id).single())
const settings = async (orgId = fx.orgId) =>
  must(await admin.from('organization_settings').select('billing_plans_enabled,billing_plans_enabled_at').eq('organization_id', orgId).single())
const ago = (value: string | null) => Math.abs(Date.now() - new Date(value as string).getTime())
const MINUTES = 60_000

const insertPlan = (quoteId: string, overrides: Record<string, unknown> = {}) =>
  admin.from('billing_plans').insert({ organization_id: fx.orgId, quote_id: quoteId, client_id: fx.clientId, start_date: START, term_months: 12, ...overrides }).select('id').single()
const insertItem = (planId: string, quoteId: string, monthNumber: number, kind: string, overrides: Record<string, unknown> = {}) =>
  admin.from('billing_plan_items').insert({ organization_id: fx.orgId, plan_id: planId, quote_id: quoteId, month_number: monthNumber, kind, bill_on: START, ...overrides }).select('id').single()
const insertInvoice = (organizationId: string, clientId: string, itemId: string | null) =>
  admin.from('invoices').insert({
    organization_id: organizationId, client_id: clientId, client_name: 'Portal Client', invoice_number: `RLS-I-${randomUUID().slice(0, 8)}`, status: 'Draft',
    billing_plan_item_id: itemId,
  }).select('id,billing_plan_item_id').single()

test('quote terms are both or neither, the term is 1 to 120, and a start date alone is refused', async () => {
  const quote = await fx.draftQuote()
  const set = (change: Record<string, unknown>) => fx.sender.client.from('quotes').update(change).eq('id', quote)

  refused(await set({ start_date: START }), '23514', /quotes_billing_terms_check/, 'a start date alone')
  refused(await set({ term_months: 12 }), '23514', /quotes_billing_terms_check/, 'a term alone')
  assert.deepEqual(await quoteTerms(quote), { start_date: null, term_months: null }, 'the refused writes left nothing behind')

  ok(await set({ start_date: START, term_months: 12 }), 'both')
  assert.deepEqual(await quoteTerms(quote), { start_date: START, term_months: 12 })
  refused(await set({ term_months: null }), '23514', /quotes_billing_terms_check/, 'a start date left without its term')
  refused(await set({ start_date: null }), '23514', /quotes_billing_terms_check/, 'a term left without its start date')

  for (const months of [0, -1, 121, 1000]) {
    refused(await set({ term_months: months }), '23514', /quotes_term_months_range/, `a term of ${months} months`)
  }
  for (const months of [1, 120, 24]) {
    ok(await set({ term_months: months }), `a term of ${months} months`)
    assert.equal((await quoteTerms(quote)).term_months, months)
  }

  ok(await set({ start_date: null, term_months: null }), 'both cleared')
  assert.deepEqual(await quoteTerms(quote), { start_date: null, term_months: null })

  // The same rules hold on insert.
  const insert = (fields: Record<string, unknown>) =>
    fx.sender.client.from('quotes').insert({ organization_id: fx.orgId, client_id: fx.clientId, client_name: 'Portal Client', ...fields }).select('id').single()
  refused(await insert({ start_date: START }), '23514', /quotes_billing_terms_check/, 'an insert with a start date alone')
  refused(await insert({ term_months: 6 }), '23514', /quotes_billing_terms_check/, 'an insert with a term alone')
  refused(await insert({ start_date: START, term_months: 121 }), '23514', /quotes_term_months_range/, 'an insert with a term of 121')
  const inserted = await insert({ start_date: START, term_months: 6 })
  ok(inserted, 'an insert with both')
  assert.deepEqual(await quoteTerms(inserted.data!.id as string), { start_date: START, term_months: 6 })
})

test('a member sets the terms on a draft quote and cannot change them once it is sent; the service role can', async () => {
  const quote = await fx.draftQuote({ start_date: START, term_months: 6 })
  const member = (change: Record<string, unknown>) => fx.sender.client.from('quotes').update(change).eq('id', quote)

  ok(await member({ start_date: '2030-02-01', term_months: 9 }), 'the terms on a draft')
  assert.deepEqual(await quoteTerms(quote), { start_date: '2030-02-01', term_months: 9 })

  assert.equal((await fx.sender.client.rpc('send_quote', { p_id: quote })).error, null)
  assert.deepEqual(await quoteTerms(quote), { start_date: '2030-02-01', term_months: 9 }, 'sending keeps the terms')

  for (const change of [
    { start_date: '2030-03-01' },
    { term_months: 24 },
    { start_date: '2030-03-01', term_months: 24 },
    { start_date: null, term_months: null },
  ]) {
    refused(await member(change), '23514', /QUOTE_FROZEN/, `changing ${JSON.stringify(change)} on a sent quote`)
  }
  assert.deepEqual(await quoteTerms(quote), { start_date: '2030-02-01', term_months: 9 }, 'the refused writes changed nothing')

  // Writing the value a quote already has is not a change, and the freeze is only about what the list names.
  ok(await member({ start_date: '2030-02-01', term_months: 9 }), 'the same terms again')
  ok(await member({ notes: 'A note on a sent quote' }), 'a note')

  // A sent quote without terms cannot be given terms by a member either.
  const bare = await fx.sentBillingQuote({ startDate: null, termMonths: null })
  assert.deepEqual(await quoteTerms(bare), { start_date: null, term_months: null })
  refused(await fx.sender.client.from('quotes').update({ start_date: START, term_months: 12 }).eq('id', bare), '23514', /QUOTE_FROZEN/, 'terms added to a sent quote')

  // The service role is not a signed-in role: it can move the terms, and the table rules still apply to it.
  ok(await admin.from('quotes').update({ start_date: '2030-04-01', term_months: 18 }).eq('id', quote), 'the service role changes the terms')
  assert.deepEqual(await quoteTerms(quote), { start_date: '2030-04-01', term_months: 18 })
  refused(await admin.from('quotes').update({ term_months: 121 }).eq('id', quote), '23514', /quotes_term_months_range/, 'the service role past the range')
  ok(await admin.from('quotes').update({ start_date: null, term_months: null }).eq('id', quote), 'the service role clears the terms')
  assert.deepEqual(await quoteTerms(quote), { start_date: null, term_months: null })
})

test('billing_plans_enabled defaults to false, an owner or admin can switch it, a member cannot, and billing_plans_enabled_at is stamped on, cleared off and cannot be typed', async () => {
  const TYPED = '2020-01-01T00:00:00+00:00'
  assert.deepEqual(await settings(), { billing_plans_enabled: false, billing_plans_enabled_at: null }, 'off by default, with no time')

  // A member cannot see the row as writable: the update matches no row and nothing changes.
  const refusedWrite = await fx.sender.client.from('organization_settings').update({ billing_plans_enabled: true, billing_plans_enabled_at: TYPED })
    .eq('organization_id', fx.orgId).select('billing_plans_enabled')
  ok(refusedWrite, 'the member update is filtered, not an error')
  assert.deepEqual(refusedWrite.data, [], 'the member update matched no row')
  assert.deepEqual(await settings(), { billing_plans_enabled: false, billing_plans_enabled_at: null }, 'a member changed nothing')

  const write = (client: SupabaseClient, change: Record<string, unknown>) =>
    client.from('organization_settings').update(change).eq('organization_id', fx.orgId).select('billing_plans_enabled,billing_plans_enabled_at').single()

  // On: stamped with the time of the switch, even when a time is typed in the same write.
  const on = must(await write(ownerClient, { billing_plans_enabled: true, billing_plans_enabled_at: TYPED }))
  assert.equal(on.billing_plans_enabled, true)
  assert.ok(ago(on.billing_plans_enabled_at) < 10 * MINUTES, `stamped now, not typed: ${on.billing_plans_enabled_at}`)
  assert.deepEqual(await settings(), on, 'the stamp is stored')

  // Still on: the time stays, whether the row is saved for something else or a time is typed.
  const saved = must(await write(ownerClient, { tagline: 'Billing schema fixture' }))
  assert.deepEqual(saved, on, 'saving another field keeps the time')
  const typed = must(await write(adminClient, { billing_plans_enabled: true, billing_plans_enabled_at: TYPED }))
  assert.deepEqual(typed, on, 'a time typed while on is overwritten by the one kept')
  const typedAlone = must(await write(adminClient, { billing_plans_enabled_at: TYPED }))
  assert.deepEqual(typedAlone, on, 'a time typed on its own is overwritten too')

  // Off: the time goes, and a typed one goes with it.
  const off = must(await write(adminClient, { billing_plans_enabled: false, billing_plans_enabled_at: TYPED }))
  assert.deepEqual(off, { billing_plans_enabled: false, billing_plans_enabled_at: null })
  const offTyped = must(await write(adminClient, { billing_plans_enabled_at: TYPED }))
  assert.deepEqual(offTyped, { billing_plans_enabled: false, billing_plans_enabled_at: null }, 'a time typed while off is cleared')

  // On again: a fresh stamp, later than the first.
  const again = must(await write(adminClient, { billing_plans_enabled: true, billing_plans_enabled_at: TYPED }))
  assert.equal(again.billing_plans_enabled, true)
  assert.ok(new Date(again.billing_plans_enabled_at).getTime() > new Date(on.billing_plans_enabled_at).getTime(), 'a second switch on is stamped again')
  assert.ok(ago(again.billing_plans_enabled_at) < 10 * MINUTES)

  // Insert: on is stamped whatever is typed, off is null whatever is typed.
  const orgOn = await createFixtureOrg('billing-schema-settings-on')
  extraOrgs.push(orgOn)
  const orgOff = await createFixtureOrg('billing-schema-settings-off')
  extraOrgs.push(orgOff)
  ok(await admin.from('organization_settings').insert({ organization_id: orgOn, billing_plans_enabled: true, billing_plans_enabled_at: TYPED }), 'insert on')
  ok(await admin.from('organization_settings').insert({ organization_id: orgOff, billing_plans_enabled: false, billing_plans_enabled_at: TYPED }), 'insert off')
  const insertedOn = await settings(orgOn)
  assert.equal(insertedOn.billing_plans_enabled, true)
  assert.ok(ago(insertedOn.billing_plans_enabled_at) < 10 * MINUTES, 'inserted on is stamped now')
  assert.deepEqual(await settings(orgOff), { billing_plans_enabled: false, billing_plans_enabled_at: null }, 'inserted off has no time')
})

test("members read their own organisation's plans and items and no other organisation's; no member and no anon can insert, update or delete either", async () => {
  const quoteA = await fx.sentBillingQuote()
  const quoteB = await other.sentBillingQuote()
  const planA = must(await insertPlan(quoteA)).id as string
  const itemA1 = must(await insertItem(planA, quoteA, 1, 'first')).id as string
  const itemA2 = must(await insertItem(planA, quoteA, 2, 'monthly', { bill_on: '2030-02-15' })).id as string
  const planB = must(await admin.from('billing_plans').insert({ organization_id: other.orgId, quote_id: quoteB, client_id: other.clientId, start_date: START, term_months: 12 }).select('id').single()).id as string
  const itemB1 = must(await admin.from('billing_plan_items').insert({ organization_id: other.orgId, plan_id: planB, quote_id: quoteB, month_number: 1, kind: 'first', bill_on: START }).select('id').single()).id as string

  const ids = async (client: SupabaseClient, table: 'billing_plans' | 'billing_plan_items') => {
    const rows = must(await client.from(table).select('id')) as Array<{ id: string }>
    return rows.map((row) => row.id).sort()
  }
  for (const client of [fx.sender.client, fx.owner.client, ownerClient, adminClient]) {
    assert.deepEqual(await ids(client, 'billing_plans'), [planA], 'a member of A reads A\'s plan only')
    assert.deepEqual(await ids(client, 'billing_plan_items'), [itemA1, itemA2].sort(), 'a member of A reads A\'s items only')
  }
  assert.deepEqual(await ids(other.sender.client, 'billing_plans'), [planB], 'a member of B reads B\'s plan only')
  assert.deepEqual(await ids(other.sender.client, 'billing_plan_items'), [itemB1], 'a member of B reads B\'s item only')
  assert.deepEqual(must(await fx.sender.client.from('billing_plans').select('id').eq('id', planB)), [], 'B\'s plan by its id is invisible to A')
  assert.deepEqual(must(await fx.sender.client.from('billing_plan_items').select('id').eq('id', itemB1)), [], 'B\'s item by its id is invisible to A')

  // Nobody signed in writes: there is no write grant, so the refusal is the table privilege, not a row filter.
  const denied = (table: string) => new RegExp(`permission denied for table ${table}\\b`)
  const clients: Array<[string, SupabaseClient]> = [
    ['a member', fx.sender.client], ['the quote owner', fx.owner.client], ['an owner', ownerClient], ['an admin', adminClient], ['anon', anonymous],
  ]
  for (const [who, client] of clients) {
    refused(await client.from('billing_plans').insert({ organization_id: fx.orgId, quote_id: quoteA }), '42501', denied('billing_plans'), `${who} inserts a plan`)
    refused(await client.from('billing_plans').update({ status: 'ended' }).eq('id', planA), '42501', denied('billing_plans'), `${who} updates a plan`)
    refused(await client.from('billing_plans').delete().eq('id', planA), '42501', denied('billing_plans'), `${who} deletes a plan`)
    refused(await client.from('billing_plan_items').insert({ organization_id: fx.orgId, plan_id: planA, quote_id: quoteA, month_number: 3, kind: 'monthly', bill_on: START }), '42501', denied('billing_plan_items'), `${who} inserts an item`)
    refused(await client.from('billing_plan_items').update({ status: 'cancelled' }).eq('id', itemA1), '42501', denied('billing_plan_items'), `${who} updates an item`)
    refused(await client.from('billing_plan_items').delete().eq('id', itemA1), '42501', denied('billing_plan_items'), `${who} deletes an item`)
  }
  // anon cannot read either.
  refused(await anonymous.from('billing_plans').select('id').limit(1), '42501', denied('billing_plans'), 'anon reads plans')
  refused(await anonymous.from('billing_plan_items').select('id').limit(1), '42501', denied('billing_plan_items'), 'anon reads items')

  const plan = must(await admin.from('billing_plans').select('status').eq('id', planA).single())
  assert.equal(plan.status, 'active', 'the plan is as it was')
  const items = must(await admin.from('billing_plan_items').select('id,status').eq('plan_id', planA).order('month_number'))
  assert.deepEqual(items, [{ id: itemA1, status: 'open' }, { id: itemA2, status: 'open' }], 'the items are as they were')
})

test('one plan per quote; (quote, month number) is unique; item 1 must be first and the rest monthly', async () => {
  const quote = await fx.sentBillingQuote()
  const planId = must(await insertPlan(quote)).id as string

  // One plan per quote.
  refused(await insertPlan(quote), '23505', /billing_plans_quote_id_key/, 'a second plan for the quote')
  assert.equal(must(await admin.from('billing_plans').select('id').eq('quote_id', quote)).length, 1)

  // The plan's own rules: a status from the list, terms both or neither and within range, a quote and client of the same organisation.
  const spare = await fx.sentBillingQuote()
  refused(await insertPlan(spare, { status: 'cancelled' }), '23514', /billing_plans_status_check/, 'a plan status outside the list')
  refused(await insertPlan(spare, { start_date: null }), '23514', /billing_plans_terms_check/, 'a plan term without a start date')
  refused(await insertPlan(spare, { term_months: null }), '23514', /billing_plans_terms_check/, 'a plan start date without a term')
  refused(await insertPlan(spare, { term_months: 121 }), '23514', /billing_plans_term_months_range/, 'a plan term past 120')
  refused(await insertPlan(spare, { organization_id: other.orgId }), '23503', /billing_plans_(quote|client)_id_organization_id_fkey/, 'a plan filed under another organisation')
  refused(await insertPlan(spare, { client_id: other.clientId }), '23503', /billing_plans_client_id_organization_id_fkey/, 'a plan for another organisation\'s client')
  const onceOff = await insertPlan(spare, { start_date: null, term_months: null })
  ok(onceOff, 'a plan with no terms (a once-off quote)')
  for (const status of ['paused', 'ended', 'active']) {
    ok(await admin.from('billing_plans').update({ status, status_reason: `set to ${status}` }).eq('id', onceOff.data!.id), `plan status ${status}`)
  }
  refused(await admin.from('billing_plans').update({ status: 'cancelled' }).eq('id', onceOff.data!.id), '23514', /billing_plans_status_check/, 'a plan moved outside the list')

  // Items: month 1 is first; every later month is monthly; (quote, month number) is unique.
  const first = await insertItem(planId, quote, 1, 'first')
  ok(first, 'item 1 as first')
  assert.deepEqual(
    must(await admin.from('billing_plan_items').select('status,cancelled_reason,approved_at,approved_by,approval_reminded_at').eq('id', first.data!.id).single()),
    { status: 'open', cancelled_reason: null, approved_at: null, approved_by: null, approval_reminded_at: null },
    'an item starts open and unapproved',
  )
  refused(await insertItem(planId, quote, 1, 'first'), '23505', /billing_plan_items_quote_id_month_number_key/, 'month 1 twice')
  refused(await insertItem(planId, quote, 1, 'monthly'), '23514', /billing_plan_items_first_is_month_one/, 'month 1 as monthly')
  refused(await insertItem(planId, quote, 2, 'first'), '23514', /billing_plan_items_first_is_month_one/, 'month 2 as first')
  ok(await insertItem(planId, quote, 2, 'monthly', { bill_on: '2030-02-15' }), 'month 2 as monthly')
  refused(await insertItem(planId, quote, 2, 'monthly'), '23505', /billing_plan_items_quote_id_month_number_key/, 'month 2 twice')
  refused(await insertItem(planId, quote, 0, 'monthly'), '23514', /billing_plan_items_month_number_check/, 'month 0')
  refused(await insertItem(planId, quote, -3, 'monthly'), '23514', /billing_plan_items_month_number_check/, 'a negative month')
  refused(await insertItem(planId, quote, 5, 'weekly'), '23514', /billing_plan_items_kind_check/, 'a kind outside the list')
  refused(await insertItem(planId, quote, 5, 'monthly', { status: 'done' }), '23514', /billing_plan_items_status_check/, 'an item status outside the list')
  refused(await insertItem(planId, quote, 5, 'monthly', { bill_on: null }), '23502', /bill_on/, 'an item with no bill date')
  ok(await insertItem(planId, quote, 5, 'monthly', { status: 'cancelled', cancelled_reason: 'The client changed the term' }), 'a cancelled item')

  // An item belongs to its own organisation's plan and quote.
  refused(await insertItem(planId, quote, 6, 'monthly', { organization_id: other.orgId }), '23503', /billing_plan_items_plan_id_organization_id_fkey|billing_plan_items_quote_id_organization_id_fkey/, 'an item under another organisation')
  const foreignQuote = await other.sentBillingQuote()
  refused(await insertItem(planId, foreignQuote, 6, 'monthly'), '23503', /billing_plan_items_quote_id_organization_id_fkey/, 'an item for another organisation\'s quote')

  // Deleting the quote takes its plan and items with it.
  assert.equal(must(await admin.from('billing_plan_items').select('id').eq('quote_id', quote)).length, 3)
  ok(await admin.from('quotes').delete().eq('id', quote), 'the quote is deleted')
  assert.equal(must(await admin.from('billing_plans').select('id').eq('id', planId)).length, 0, 'the plan went with the quote')
  assert.equal(must(await admin.from('billing_plan_items').select('id').eq('plan_id', planId)).length, 0, 'the items went with the plan')
})

test("an invoice links to at most one item and an item to at most one invoice; a link to another organisation's item is refused", async () => {
  const quote = await fx.sentBillingQuote()
  const planId = must(await insertPlan(quote)).id as string
  const item1 = must(await insertItem(planId, quote, 1, 'first')).id as string
  const item2 = must(await insertItem(planId, quote, 2, 'monthly', { bill_on: '2030-02-15' })).id as string

  const invoice1 = must(await insertInvoice(fx.orgId, fx.clientId, item1))
  assert.equal(invoice1.billing_plan_item_id, item1, 'an invoice carries its item')
  refused(await insertInvoice(fx.orgId, fx.clientId, item1), '23505', /invoices_billing_plan_item_id_key/, 'a second invoice for the same item')

  // Plain invoices are unaffected: any number of them have no item.
  ok(await insertInvoice(fx.orgId, fx.clientId, null), 'an invoice with no item')
  ok(await insertInvoice(fx.orgId, fx.clientId, null), 'another invoice with no item')

  // One invoice holds one item: moving its link frees the item it had.
  const invoice2 = must(await insertInvoice(fx.orgId, fx.clientId, item2))
  refused(await admin.from('invoices').update({ billing_plan_item_id: item1 }).eq('id', invoice2.id), '23505', /invoices_billing_plan_item_id_key/, 'moving a link onto an item that has an invoice')
  ok(await admin.from('invoices').update({ billing_plan_item_id: null }).eq('id', invoice2.id), 'an invoice lets its item go')
  ok(await admin.from('invoices').update({ billing_plan_item_id: item2 }).eq('id', invoice1.id), 'a second invoice takes the freed item')
  assert.equal(must(await admin.from('invoices').select('billing_plan_item_id').eq('id', invoice1.id).single()).billing_plan_item_id, item2)
  ok(await insertInvoice(fx.orgId, fx.clientId, item1), 'the item invoice 1 let go can be invoiced')

  // The link stays inside the organisation.
  const quoteB = await other.sentBillingQuote()
  const planB = must(await admin.from('billing_plans').insert({ organization_id: other.orgId, quote_id: quoteB, client_id: other.clientId, start_date: START, term_months: 12 }).select('id').single()).id as string
  const itemB = must(await admin.from('billing_plan_items').insert({ organization_id: other.orgId, plan_id: planB, quote_id: quoteB, month_number: 1, kind: 'first', bill_on: START }).select('id').single()).id as string
  refused(await insertInvoice(fx.orgId, fx.clientId, itemB), '23503', /invoices_billing_plan_item_id_organization_id_fkey/, 'an invoice linked to another organisation\'s item')
  refused(await admin.from('invoices').update({ billing_plan_item_id: itemB }).eq('id', invoice2.id), '23503', /invoices_billing_plan_item_id_organization_id_fkey/, 'an invoice moved onto another organisation\'s item')
  ok(await insertInvoice(other.orgId, other.clientId, itemB), 'its own organisation\'s invoice can link it')

  // Removing the plan removes its items and lets the invoices go; the invoices stay.
  ok(await admin.from('billing_plans').delete().eq('id', planId), 'the plan is deleted')
  assert.equal(must(await admin.from('billing_plan_items').select('id').eq('plan_id', planId)).length, 0)
  const left = must(await admin.from('invoices').select('id,billing_plan_item_id').eq('organization_id', fx.orgId).not('billing_plan_item_id', 'is', null))
  assert.deepEqual(left, [], 'no invoice still points at a removed item')
  assert.equal(must(await admin.from('invoices').select('id').eq('id', invoice1.id)).length, 1, 'the invoice itself stays')
})

test('the billing fixtures: the switch is on by default, a quote is sent with its terms and lines, and a portal acceptance is recorded', async () => {
  // `other` was set up with the default: the switch on, with its time.
  const on = await settings(other.orgId)
  assert.equal(on.billing_plans_enabled, true, 'setupBillingOrg switches billing on by default')
  assert.ok(ago(on.billing_plans_enabled_at) < 10 * MINUTES)
  await other.setBilling(false)
  assert.deepEqual(await settings(other.orgId), { billing_plans_enabled: false, billing_plans_enabled_at: null })
  await other.setBilling(true)
  assert.equal((await settings(other.orgId)).billing_plans_enabled, true)

  // The company and the client are complete.
  const company = must(await admin.from('organization_settings').select('vat_number,bank_name,bank_account_name,bank_account_number,bank_branch_code,address_line1,city,postal_code').eq('organization_id', other.orgId).single())
  for (const [column, value] of Object.entries(company)) assert.ok(value, `the company has ${column}`)
  const client = must(await admin.from('clients').select('billing_email,address_line1,city,postal_code').eq('id', other.clientId).single())
  for (const [column, value] of Object.entries(client)) assert.ok(value, `the client has ${column}`)

  // A sent quote: the default lines (10 000 once-off and 1 500 monthly) and the default terms (12 months from the first of a month).
  const quote = await other.sentBillingQuote()
  const sent = must(await admin.from('quotes').select('status,start_date,term_months,subtotal').eq('id', quote).single())
  assert.equal(sent.status, 'Sent')
  assert.equal(sent.term_months, 12)
  assert.match(sent.start_date, /^\d{4}-\d{2}-01$/)
  assert.ok(sent.start_date > new Date().toISOString().slice(0, 10), 'the default start is in the future')
  assert.equal(Number(sent.subtotal), 11500)
  const lines = must(await admin.from('quote_lines').select('title,unit_price,charge_kind').eq('quote_id', quote).order('position'))
  assert.deepEqual(lines.map((line) => [line.title, Number(line.unit_price), line.charge_kind]), [['Setup', 10000, 'once_off'], ['Retainer', 1500, 'monthly']])

  // Terms and lines as asked, including none.
  const custom = await other.sentBillingQuote({ startDate: '2031-02-28', termMonths: 24, lines: [{ title: 'Audit', unitPrice: 750, chargeKind: null }] })
  assert.deepEqual(await quoteTerms(custom), { start_date: '2031-02-28', term_months: 24 })
  assert.deepEqual(await quoteTerms(await other.sentBillingQuote({ startDate: null, termMonths: null })), { start_date: null, term_months: null })

  // An acceptance through the real portal functions.
  const { responseId, linkId } = await other.acceptedOnPortal(quote)
  const response = must(await admin.from('quote_responses').select('id,quote_id,link_id,decision').eq('id', responseId).single())
  assert.deepEqual(response, { id: responseId, quote_id: quote, link_id: linkId, decision: 'accepted' })
  const accepted = must(await admin.from('quotes').select('status,accepted_at').eq('id', quote).single())
  assert.equal(accepted.status, 'Accepted')
  assert.ok(accepted.accepted_at)
})

test('an organisation with a plan item linked to an invoice is deleted completely, audit rows included', async () => {
  const orgId = await createFixtureOrg('billing-schema-cleanup')
  try {
    const clientId = must(await admin.from('clients').insert({ organization_id: orgId, name: 'Cleanup Client', status: 'Active' }).select('id').single()).id as string
    const quote = must(await admin.from('quotes').insert({ organization_id: orgId, client_id: clientId, client_name: 'Cleanup Client', quote_number: `RLS-Q-${randomUUID().slice(0, 8)}`, status: 'Accepted' }).select('id').single()).id as string
    const planId = must(await admin.from('billing_plans').insert({ organization_id: orgId, quote_id: quote, client_id: clientId, start_date: START, term_months: 3 }).select('id').single()).id as string
    const itemId = must(await admin.from('billing_plan_items').insert({ organization_id: orgId, plan_id: planId, quote_id: quote, month_number: 1, kind: 'first', bill_on: START }).select('id').single()).id as string
    must(await insertInvoice(orgId, clientId, itemId))
    // Touch the invoice and the client so the audit trail has rows for the sweep to find.
    ok(await admin.from('invoices').update({ notes: 'Cleanup fixture' }).eq('billing_plan_item_id', itemId), 'an invoice update')
  } catch (error) {
    await cleanup([orgId], [])
    throw error
  }

  await cleanup([orgId], [])

  assert.equal(must(await admin.from('organizations').select('id').eq('id', orgId)).length, 0, 'the organisation is gone')
  for (const table of ['billing_plans', 'billing_plan_items', 'invoices', 'quotes', 'clients']) {
    assert.equal(must(await admin.from(table).select('id').eq('organization_id', orgId)).length, 0, `${table} rows are gone`)
  }
  const leftovers = must(await admin.from('audit_events').select('id,resource').is('organization_id', null)
    .or(`resource_id.eq.${orgId},old_value->>organization_id.eq.${orgId},new_value->>organization_id.eq.${orgId}`))
  assert.deepEqual(leftovers, [], 'no audit row of the fixture is left behind')
})
