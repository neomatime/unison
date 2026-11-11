import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test, { after, before } from 'node:test'

import { activitiesOf, ok, saToday, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin } from './helpers.ts'
import { must } from './portal-fixtures.ts'

// Accept to invoice, stage 4, task 2: an onboarding record and a task when a quote is accepted on the portal. private.billing_on_acceptance
// calls private.billing_make_onboarding inside a block of its own; the nightly sweep reaches it too and must never make a second.
// Every acceptance goes through the real portal functions (billing-fixtures.acceptedOnPortal).

let fx: BillingOrg

before(async () => {
  fx = await setupBillingOrg('billing-onb-accept')
})

after(async () => {
  await fx?.teardown()
})

type Row = Record<string, any>
const onboardings = async (quote: string) => must(await admin.from('client_onboardings').select('*').eq('quote_id', quote)) as Row[]
const tasksOf = async (onboarding: string) => must(await admin.from('tasks').select('*').eq('onboarding_id', onboarding)) as Row[]
const quoteRow = async (id: string) => must(await admin.from('quotes').select('*').eq('id', id).single()) as Row

/** The next business day after the South African today (Monday to Friday), as YYYY-MM-DD. The same rule as private.add_business_days. */
const nextBusinessDay = () => {
  const date = new Date(`${saToday()}T00:00:00Z`)
  do date.setUTCDate(date.getUTCDate() + 1)
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
  return date.toISOString().slice(0, 10)
}

test('switch off: acceptance makes no onboarding and no task', async () => {
  await fx.setBilling(false)
  const before = must(await admin.from('client_onboardings').select('id').eq('organization_id', fx.orgId)).length
  const tasksBefore = must(await admin.from('tasks').select('id').eq('organization_id', fx.orgId)).length
  const quote = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(quote)
  assert.deepEqual(await onboardings(quote), [])
  assert.equal(must(await admin.from('client_onboardings').select('id').eq('organization_id', fx.orgId)).length, before)
  assert.equal(must(await admin.from('tasks').select('id').eq('organization_id', fx.orgId)).length, tasksBefore)
  await fx.setBilling(true)
})

test('switch on: one onboarding for the quote with the client, the owner, the start date, Welcome and Active; one task for the owner due the next business day at 17:00 South African time', async () => {
  const quote = await fx.sentBillingQuote({ startDate: '2031-03-01', termMonths: 12 })
  await fx.acceptedOnPortal(quote)
  const row = await quoteRow(quote)

  const made = await onboardings(quote)
  assert.equal(made.length, 1)
  const onboarding = made[0]
  assert.equal(onboarding.client_id, fx.clientId)
  assert.equal(onboarding.client_name, 'Portal Client')
  assert.equal(onboarding.owner_id, row.owner_id)
  assert.equal(onboarding.start_date, '2031-03-01')
  assert.equal(onboarding.stage, 'Welcome')
  assert.equal(onboarding.status, 'Active')
  assert.equal(onboarding.onboarding_type, 'Standard Client')
  assert.match(onboarding.notes, new RegExp(`accepted quotation ${row.quote_number}`))

  const tasks = await tasksOf(onboarding.id)
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].title, 'Contact Portal Client within one business day')
  assert.equal(tasks[0].assignee_id, row.owner_id)
  assert.equal(tasks[0].client_id, fx.clientId)
  assert.equal(tasks[0].priority, 'High')
  assert.equal(tasks[0].status, 'Planned')
  assert.equal(new Date(tasks[0].due_at).getTime(), Date.parse(`${nextBusinessDay()}T15:00:00Z`), '17:00 in South Africa is 15:00 UTC, on the next business day')

  const entries = await activitiesOf(quote, 'billing.onboarding_created')
  assert.equal(entries.length, 1)
  assert.equal(entries[0].subject, 'Onboarding started for Portal Client')
})

test('a quote with no terms and a once-off-only quote get an onboarding too, with no start date', async () => {
  // A quote with a monthly line cannot be sent without terms while the switch is on, so this one goes out with it off (as a quote sent before
  // the switch was turned on would) and is accepted with it on.
  await fx.setBilling(false)
  const termless = await fx.sentBillingQuote({ startDate: null, termMonths: null })
  await fx.setBilling(true)
  await fx.acceptedOnPortal(termless)
  const onceOff = await fx.sentBillingQuote({ startDate: null, termMonths: null, lines: [{ title: 'Setup', unitPrice: 5000, chargeKind: 'once_off' }] })
  await fx.acceptedOnPortal(onceOff)
  for (const quote of [termless, onceOff]) {
    const made = await onboardings(quote)
    assert.equal(made.length, 1)
    assert.equal(made[0].start_date, null)
    assert.equal((await tasksOf(made[0].id)).length, 1)
  }
})

test('the sweep and two sweeps at once leave one onboarding and one task, and the plan comes back', async () => {
  const quote = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(quote)
  const [onboarding] = await onboardings(quote)
  assert.ok(onboarding)

  // Take the plan and the draft away, as a failed billing step would have left them, so the nightly sweep has something to recover.
  ok(await admin.from('invoices').delete().eq('quote_id', quote), 'remove the draft invoice')
  ok(await admin.from('billing_plans').delete().eq('quote_id', quote), 'remove the plan')
  const sweeps = await Promise.all([admin.rpc('billing_nightly'), admin.rpc('billing_nightly')])
  for (const sweep of sweeps) assert.equal(sweep.error, null, sweep.error?.message)

  assert.equal(must(await admin.from('billing_plans').select('id').eq('quote_id', quote)).length, 1, 'the sweep recovered the plan once')
  const after = await onboardings(quote)
  assert.equal(after.length, 1, 'still one onboarding')
  assert.equal(after[0].id, onboarding.id, 'the same record')
  assert.equal((await tasksOf(onboarding.id)).length, 1, 'still one task')
  assert.equal((await activitiesOf(quote, 'billing.onboarding_created')).length, 1, 'one timeline entry')
})

test('the onboarding step is a guarded block of its own, after the plan and before the notice, whose handler only warns', () => {
  const source = readFileSync(join(process.cwd(), 'supabase/migrations/20261113101000_billing_onboarding_on_acceptance.sql'), 'utf8').replace(/\r\n/g, '\n')
  const plan = source.indexOf('perform private.build_plan_item_invoice(v_item);')
  const block = source.indexOf('perform private.billing_make_onboarding(v_quote.id);')
  const notice = source.indexOf('-- Notice.')
  assert.ok(plan > -1 && block > plan && notice > block, 'plan, then onboarding, then notice')
  const around = source.slice(block - 20, block + 250)
  assert.match(around, /begin\s+perform private\.billing_make_onboarding\(v_quote\.id\);\s+exception when others then\s+raise warning 'billing_on_acceptance: the onboarding for quote % failed \(SQLSTATE %\)', v_quote\.id, sqlstate;\s+end;/)
  assert.doesNotMatch(source, /current_date|localtimestamp|\bnow\(\)::date/i, 'the South African day only')
})

test('the acceptance, the plan, the draft invoice and the notice are as before', async () => {
  const quote = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(quote)
  assert.equal(must(await admin.from('billing_plans').select('id').eq('quote_id', quote)).length, 1)
  const items = must(await admin.from('billing_plan_items').select('id,kind').eq('quote_id', quote)) as Row[]
  assert.equal(items.filter((item) => item.kind === 'first').length, 1)
  const drafts = must(await admin.from('invoices').select('id,status').eq('quote_id', quote)) as Row[]
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].status, 'Draft')
  const titles = must(await admin.from('notifications').select('title').eq('organization_id', fx.orgId).eq('title', 'Portal Client accepted: first invoice ready to approve')) as Row[]
  assert.ok(titles.length >= 1)
  assert.equal((await quoteRow(quote)).status, 'Accepted')
})
