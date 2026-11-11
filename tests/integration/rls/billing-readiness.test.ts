import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { activitiesOf, ok, refused, saToday, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin, cleanup, createFixtureUser, signedInClient } from './helpers.ts'
import { anonymous, must } from './portal-fixtures.ts'

// Accept to invoice, stage 4, task 3: the readiness rule and the start decision. billing_readiness is the one place that says whether
// the work may start (the start date has arrived and the first invoice is Paid); billing_set_readiness_override lets an owner or admin
// decide otherwise with a reason. Plans come from fx.approvedPlan (item 1 approved and issued); a payment is a real record_payment.

let fx: BillingOrg
let other: BillingOrg
let owner: { id: string; client: SupabaseClient }
let adminUser: { id: string; client: SupabaseClient }
let otherOwner: { client: SupabaseClient }
const extraUsers: string[] = []

before(async () => {
  fx = await setupBillingOrg('billing-ready-a')
  other = await setupBillingOrg('billing-ready-b')
  for (const [org, role, assign] of [
    [fx.orgId, 'owner', (value: typeof owner) => (owner = value)],
    [fx.orgId, 'admin', (value: typeof owner) => (adminUser = value)],
    [other.orgId, 'owner', (value: typeof owner) => (otherOwner = value)],
  ] as const) {
    const user = await createFixtureUser(org, role)
    extraUsers.push(user.id)
    assign({ id: user.id, client: await signedInClient(user.email, user.password) })
  }
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    try {
      await other?.teardown()
    } finally {
      await cleanup([], extraUsers)
    }
  }
})

type Row = Record<string, any>
const plusDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
const readiness = async (quote: string, client: SupabaseClient = fx.sender.client) => must(await client.rpc('billing_readiness', { p_quote_id: quote })) as Row
const setStart = async (quote: string, startDate: string | null) => {
  // Both or neither: the plan keeps its term when it has a start date.
  const change = startDate === null ? { start_date: null, term_months: null } : { start_date: startDate, term_months: 12 }
  ok(await admin.from('billing_plans').update(change).eq('quote_id', quote), 'set the start date')
}
const total = async (invoice: string) => Number((must(await admin.from('invoices').select('total_amount').eq('id', invoice).single()) as Row).total_amount)
const override = (client: SupabaseClient, quote: string, on: boolean, reason: string | null = 'Deposit agreed by phone') =>
  client.rpc('billing_set_readiness_override', { p_quote_id: quote, p_override: on, p_reason: reason })

test('no plan: no_plan; a plan whose start date is later: waiting_start whatever the invoice; no start date: not waiting for the date', async () => {
  const bare = await fx.sentBillingQuote({ startDate: null, termMonths: null, lines: [{ title: 'Setup', unitPrice: 5000, chargeKind: 'once_off' }] })
  const plain = await fx.sentBillingQuote({ startDate: null, termMonths: null, lines: [{ title: 'Setup', unitPrice: 5000, chargeKind: 'once_off' }] })
  for (const quote of [bare, plain]) assert.equal((await readiness(quote)).state, 'no_plan', 'a quote that was never accepted has no plan')

  const p = await fx.approvedPlan()
  await setStart(p.quoteId, plusDays(saToday(), 1))
  const waiting = await readiness(p.quoteId)
  assert.equal(waiting.state, 'waiting_start')
  assert.equal(waiting.start_date, plusDays(saToday(), 1))
  assert.equal(waiting.first_invoice.status, 'Issued')
  await fx.payInvoice(p.firstInvoiceId, await total(p.firstInvoiceId))
  assert.equal((await readiness(p.quoteId)).state, 'waiting_start', 'paid, but the date is later')

  await setStart(p.quoteId, saToday())
  assert.equal((await readiness(p.quoteId)).state, 'ready', 'the date is today and the first invoice is paid')
  await setStart(p.quoteId, null)
  assert.equal((await readiness(p.quoteId)).state, 'ready', 'no start date: that condition is met')
})

test('the first invoice: a Draft, Issued with a balance, partly paid and Cancelled are waiting_payment; fully paid is ready', async () => {
  // A Draft: accepted, not approved.
  const draftQuote = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(draftQuote)
  await setStart(draftQuote, saToday())
  const draft = await readiness(draftQuote)
  assert.equal(draft.state, 'waiting_payment')
  assert.equal(draft.first_invoice.status, 'Draft')

  const p = await fx.approvedPlan()
  await setStart(p.quoteId, saToday())
  const owed = await readiness(p.quoteId)
  assert.equal(owed.state, 'waiting_payment')
  assert.equal(owed.first_invoice.id, p.firstInvoiceId)
  assert.equal(owed.first_invoice.status, 'Issued')
  assert.equal(Number(owed.first_invoice.balance), await total(p.firstInvoiceId))
  assert.equal(owed.first_invoice.currency, 'ZAR')

  await fx.payInvoice(p.firstInvoiceId, 100)
  const part = await readiness(p.quoteId)
  assert.equal(part.state, 'waiting_payment', 'partly paid is not paid')
  assert.equal(part.first_invoice.status, 'Partially Paid')
  await fx.payInvoice(p.firstInvoiceId, (await total(p.firstInvoiceId)) - 100)
  assert.equal((await readiness(p.quoteId)).state, 'ready')

  const c = await fx.approvedPlan()
  await setStart(c.quoteId, saToday())
  assert.equal((await fx.sender.client.rpc('cancel_invoice', { p_invoice: c.firstInvoiceId })).error, null)
  const cancelled = await readiness(c.quoteId)
  assert.equal(cancelled.state, 'waiting_payment', 'a cancelled first invoice is not paid')
  assert.equal(cancelled.first_invoice.status, 'Cancelled')
})

test('an ended plan is never ready, even paid; the onboarding is linked when there is one', async () => {
  const p = await fx.approvedPlan()
  await setStart(p.quoteId, saToday())
  await fx.payInvoice(p.firstInvoiceId, await total(p.firstInvoiceId))
  const before = await readiness(p.quoteId)
  assert.equal(before.state, 'ready')
  const onboarding = must(await admin.from('client_onboardings').select('id').eq('quote_id', p.quoteId).maybeSingle())
  assert.equal(before.onboarding_id, onboarding?.id ?? null)

  const plan = must(await admin.from('billing_plans').select('id').eq('quote_id', p.quoteId).single())
  assert.equal((await owner.client.rpc('billing_plan_set_state', { p_plan_id: plan.id, p_action: 'end', p_reason: 'The client left' })).error, null)
  assert.equal((await readiness(p.quoteId)).state, 'ended')
})

test('an override makes the state overridden whatever else is true; it needs an owner or admin and a reason, can be updated and removed, and removing returns to the rule', async () => {
  const p = await fx.approvedPlan()
  await setStart(p.quoteId, plusDays(saToday(), 10))
  assert.equal((await readiness(p.quoteId)).state, 'waiting_start')

  refused((await override(fx.sender.client, p.quoteId, true)).error, 'BILLING_PLAN_ADMIN_ONLY')
  for (const reason of [null, '', '   ', 'x'.repeat(501)]) refused((await override(owner.client, p.quoteId, true, reason)).error, 'BILLING_REASON_REQUIRED')
  assert.equal((await readiness(p.quoteId)).state, 'waiting_start', 'the refused calls changed nothing')

  assert.equal((await override(owner.client, p.quoteId, true, 'Deposit agreed by phone')).error, null)
  const set = await readiness(p.quoteId)
  assert.equal(set.state, 'overridden')
  assert.equal(set.override.reason, 'Deposit agreed by phone')
  const ownerName = (await admin.from('team_members').select('full_name').eq('user_id', owner.id).eq('organization_id', fx.orgId).maybeSingle()).data?.full_name ?? null
  assert.equal(set.override.by_name, ownerName && String(ownerName).trim() ? ownerName : null)
  assert.ok(set.override.at)

  assert.equal((await override(adminUser.client, p.quoteId, true, 'Updated reason')).error, null, 'an admin can update it')
  assert.equal((await readiness(p.quoteId)).override.reason, 'Updated reason')
  assert.equal((await override(owner.client, p.quoteId, false, null)).error, null)
  assert.equal((await readiness(p.quoteId)).state, 'waiting_start', 'removed: back to the rule')
  assert.equal((await override(owner.client, p.quoteId, false, null)).error, null, 'removing what is not there changes nothing')

  const entries = await activitiesOf(p.quoteId, 'billing.readiness_overridden')
  assert.equal(entries.length, 3, 'set, updated and removed')
  assert.equal(entries[0].subject, 'Start decided despite waiting: Deposit agreed by phone')
  assert.equal(entries[0].created_by, owner.id)
  assert.equal(entries[1].created_by, adminUser.id)
  assert.equal(entries[2].subject, 'Start decision removed')
})

test('another organisation, a quote with no plan, anon and a missing quote are refused', async () => {
  const p = await fx.approvedPlan()
  refused((await otherOwner.client.rpc('billing_readiness', { p_quote_id: p.quoteId })).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await override(otherOwner.client, p.quoteId, true)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  assert.match((await anonymous.rpc('billing_readiness', { p_quote_id: p.quoteId })).error?.message ?? '', /permission denied for function billing_readiness/)
  assert.match((await override(anonymous, p.quoteId, true)).error?.message ?? '', /permission denied for function billing_set_readiness_override/)
  refused((await fx.sender.client.rpc('billing_readiness', { p_quote_id: '00000000-0000-4000-8000-0000000000aa' })).error, 'BILLING_ITEM_NOT_FOUND', '42501')

  const noPlan = await fx.sentBillingQuote({ startDate: null, termMonths: null, lines: [{ title: 'Setup', unitPrice: 5000, chargeKind: 'once_off' }] })
  refused((await override(owner.client, noPlan, true)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  assert.equal(must(await admin.from('billing_plans').select('readiness_override_at').eq('quote_id', p.quoteId).single()).readiness_override_at, null, 'nothing was set')
})

test('every member of the organisation can read the readiness; the South African date is used and the server date is never read', async () => {
  const p = await fx.approvedPlan()
  for (const client of [fx.sender.client, fx.owner.client, owner.client, adminUser.client]) {
    assert.equal((await readiness(p.quoteId, client)).state, 'waiting_start', 'the default start date is in the future')
  }
  const source = readFileSync(join(process.cwd(), 'supabase/migrations/20261113102000_billing_readiness.sql'), 'utf8')
  assert.doesNotMatch(source, /current_date|localtimestamp|\bnow\(\)::date/i)
  assert.match(source, /Africa\/Johannesburg/)
})
