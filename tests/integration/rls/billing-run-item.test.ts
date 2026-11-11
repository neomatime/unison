import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test, { after, before } from 'node:test'

import { activitiesOf, invoiceOf, linkedTo, ok, saToday, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin } from './helpers.ts'
import { anonymous, must } from './portal-fixtures.ts'

// Accept to invoice, stage 2, task 3: the database chooses and issues each due month. billing_due_items lists what the runner should
// work on (the service role only); billing_run_item takes the row lock, re-checks everything, and either issues the month, holds it
// for a person, answers that the hourly cap is reached, or skips it. Plans come from fx.approvedPlan (both switches on, item 1
// approved and emailed), and the service role moves what time would move: a month's date, the company's settings.

let fx: BillingOrg
let other: BillingOrg

before(async () => {
  fx = await setupBillingOrg('billing-run-a')
  other = await setupBillingOrg('billing-run-b')
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    await other?.teardown()
  }
})

type Plan = Awaited<ReturnType<BillingOrg['approvedPlan']>>
const CAP = 50
const run = async (item: string, cap = CAP) => must(await admin.rpc('billing_run_item', { p_item_id: item, p_email_cap: cap })) as { state: string; codes: string[]; invoice_id: string | null }
const dueFor = async (plan: Plan, limit = 200) => {
  const rows = must(await admin.rpc('billing_due_items', { p_limit: limit })) as Array<{ item_id: string; step: string }>
  const mine = new Set(plan.items.map((item) => item.id))
  return rows.filter((row) => mine.has(row.item_id))
}
const itemRow = async (id: string) => must(await admin.from('billing_plan_items').select('*').eq('id', id).single()) as Record<string, any>
const itemOf = (plan: Plan, month: number) => plan.items.find((item) => item.monthNumber === month)!.id
const titled = async (title: string, orgId = fx.orgId) =>
  must(await admin.from('notifications').select('user_id').eq('organization_id', orgId).eq('title', title)) as Array<{ user_id: string }>
const counter = async () =>
  (must(await admin.from('document_counters').select('last_number').eq('organization_id', fx.orgId).eq('kind', 'invoice')) as Array<{ last_number: number }>)
    .reduce((sum, row) => sum + row.last_number, 0)
const setPlan = async (plan: Plan, status: string) => ok(await admin.from('billing_plans').update({ status, status_reason: status === 'active' ? null : 'a test' }).eq('id', plan.planId), `plan ${status}`)
const settingsRow = async () => must(await admin.from('organization_settings').select('*').eq('organization_id', fx.orgId).single()) as Record<string, any>

const plusDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

test('billing_due_items lists a due month only when both switches are on, the plan is active, item 1 is approved and has an email record, and the date has come', async () => {
  const plan = await fx.approvedPlan()
  assert.deepEqual(await dueFor(plan), [], 'no month is due yet')

  await fx.dueMonth(plan.planId, 2)
  assert.deepEqual(await dueFor(plan), [{ item_id: itemOf(plan, 2), step: 'issue' }])

  await fx.setAutoSend(false)
  assert.deepEqual(await dueFor(plan), [], 'automatic sending off')
  await fx.setAutoSend(true)
  await fx.setBilling(false)
  assert.deepEqual(await dueFor(plan), [], 'billing plans off')
  await fx.setBilling(true)
  assert.equal((await dueFor(plan)).length, 1, 'both on again')
})

test('billing_due_items lists nothing for a paused or ended plan, a cancelled item, a CATCH_UP item, an unapproved first invoice, or a first invoice approved but not emailed', async () => {
  const plan = await fx.approvedPlan()
  await fx.dueMonth(plan.planId, 2)
  const second = itemOf(plan, 2)

  await setPlan(plan, 'paused')
  assert.deepEqual(await dueFor(plan), [], 'paused')
  await setPlan(plan, 'ended')
  assert.deepEqual(await dueFor(plan), [], 'ended')
  await setPlan(plan, 'active')

  ok(await admin.from('billing_plan_items').update({ status: 'cancelled', cancelled_reason: 'a test' }).eq('id', second), 'cancel')
  assert.deepEqual(await dueFor(plan), [], 'cancelled item')
  ok(await admin.from('billing_plan_items').update({ status: 'open', cancelled_reason: null }).eq('id', second), 'reopen')

  ok(await admin.from('billing_plan_items').update({ attention_code: 'CATCH_UP' }).eq('id', second), 'hold')
  assert.deepEqual(await dueFor(plan), [], 'a CATCH_UP item waits for a person')
  ok(await admin.from('billing_plan_items').update({ attention_code: null }).eq('id', second), 'release')
  assert.equal((await dueFor(plan)).length, 1)

  const emails = must(await admin.from('document_emails').select('id').eq('invoice_id', plan.firstInvoiceId))
  ok(await admin.from('document_emails').delete().eq('invoice_id', plan.firstInvoiceId), 'forget the first email')
  assert.deepEqual(await dueFor(plan), [], 'item 1 approved but not emailed holds every later month')
  assert.equal(emails.length, 1)

  // An accepted plan whose first invoice nobody has approved.
  const unapproved = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(unapproved)
  const items = must(await admin.from('billing_plan_items').select('id,plan_id,month_number').eq('quote_id', unapproved).order('month_number')) as Array<Record<string, any>>
  await fx.dueMonth(items[0].plan_id, 2)
  const asPlan = { items: items.map((item) => ({ id: item.id, monthNumber: item.month_number })) } as Plan
  assert.deepEqual(await dueFor(asPlan), [], 'the first invoice is not approved')
})

test('billing_due_items respects its limit and refuses one out of range', async () => {
  const plan = await fx.approvedPlan()
  await fx.dueMonth(plan.planId, 2)
  await fx.dueMonth(plan.planId, 3)
  assert.equal((await dueFor(plan, 200)).length, 2)
  const first = must(await admin.rpc('billing_due_items', { p_limit: 1 })) as unknown[]
  assert.equal(first.length, 1, 'one row at most')
  for (const limit of [0, -1, 201, null]) {
    const refusedLimit = await admin.rpc('billing_due_items', { p_limit: limit })
    assert.equal(refusedLimit.error?.code, '22023', `a limit of ${limit}`)
  }
})

test('billing_run_item issues the month: numbered, dated the South African day, due the company payment days, the monthly lines only, linked and recorded', async () => {
  const plan = await fx.approvedPlan()
  await fx.dueMonth(plan.planId, 2)
  const before = await counter()
  const answer = await run(itemOf(plan, 2))
  assert.equal(answer.state, 'issued')
  assert.ok(answer.invoice_id)

  const invoice = await invoiceOf(answer.invoice_id!)
  assert.equal(invoice.status, 'Issued')
  assert.match(invoice.invoice_number, /\S/)
  assert.equal(invoice.issue_date, saToday())
  const settings = await settingsRow()
  assert.equal(invoice.due_date, plusDays(saToday(), settings.default_payment_days))
  assert.equal(invoice.billing_plan_item_id, itemOf(plan, 2))
  assert.equal(await counter(), before + 1, 'exactly one number was consumed')

  const lines = must(await admin.from('invoice_lines').select('title').eq('invoice_id', invoice.id)) as Array<{ title: string }>
  assert.deepEqual(lines.map((line) => line.title), ['Retainer'], 'the monthly lines only')

  const item = await itemRow(itemOf(plan, 2))
  assert.ok(item.system_issued_at, 'the system issued it')
  assert.equal(item.attention_code, null)
  const entries = await activitiesOf(plan.quoteId, 'billing.invoice_auto_issued')
  assert.equal(entries.length, 1)
  assert.match(entries[0].subject, new RegExp(`Invoice ${invoice.invoice_number} issued automatically for month 2`))
  assert.equal((await titled('Month 2 for Portal Client was issued at a different VAT rate')).length, 0, 'the same VAT rate tells nobody')
})

test('run twice, and run twice at once, it issues one invoice and the second answer is skipped', async () => {
  const plan = await fx.approvedPlan()
  await fx.dueMonth(plan.planId, 2)
  assert.equal((await run(itemOf(plan, 2))).state, 'issued')
  assert.equal((await run(itemOf(plan, 2))).state, 'skipped')
  assert.equal((await linkedTo(itemOf(plan, 2))).length, 1)

  await fx.dueMonth(plan.planId, 3)
  const answers = await Promise.all([run(itemOf(plan, 3)), run(itemOf(plan, 3))])
  assert.deepEqual(answers.map((answer) => answer.state).sort(), ['issued', 'skipped'])
  assert.equal((await linkedTo(itemOf(plan, 3))).length, 1)
})

test('a failing check keeps a Draft, consumes no number, holds the month, tells the owner once, and the next run recovers when the data is fixed', async () => {
  const plan = await fx.approvedPlan()
  await fx.dueMonth(plan.planId, 2)
  const item = itemOf(plan, 2)
  ok(await admin.from('clients').update({ address_line1: '' }).eq('id', fx.clientId), 'break the address')
  const before = await counter()
  const title = 'Month 2 for Portal Client needs your attention'
  const told = (await titled(title)).length

  try {
    const held = await run(item)
    assert.equal(held.state, 'held')
    assert.ok(held.codes.includes('CLIENT_ADDRESS_MISSING'), `codes: ${held.codes}`)
    const drafts = await linkedTo(item)
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].status, 'Draft')
    assert.equal(await counter(), before, 'no number was consumed')
    const row = await itemRow(item)
    assert.equal(row.attention_code, 'CHECKS_FAILED')
    assert.match(row.attention_detail, /CLIENT_ADDRESS_MISSING/)
    const afterFirst = (await titled(title)).length
    assert.ok(afterFirst > told, 'someone was told')
    assert.equal(new Set((await titled(title)).map((entry) => entry.user_id)).size, afterFirst, 'each person was told once')

    assert.equal((await run(item)).state, 'held', 'still failing')
    assert.equal((await titled(title)).length, afterFirst, 'the same failure tells nobody twice')
    assert.equal((await activitiesOf(plan.quoteId, 'billing.item_held')).length, 1, 'one timeline entry for one failure')
  } finally {
    ok(await admin.from('clients').update({ address_line1: '2 Client Road' }).eq('id', fx.clientId), 'fix the address')
  }

  const fixed = await run(item)
  assert.equal(fixed.state, 'issued')
  assert.equal(await counter(), before + 1)
  const row = await itemRow(item)
  assert.equal(row.attention_code, null)
  assert.equal(row.attention_detail, null)
  assert.equal((await linkedTo(item)).length, 1, 'the same invoice, not a second')
})

test('two months due at once are both held as drafts, one notice for the plan, and one issued by hand leaves the other held', async () => {
  const plan = await fx.approvedPlan()
  await fx.dueMonth(plan.planId, 2)
  await fx.dueMonth(plan.planId, 3)
  const title = 'Portal Client: more than one month is due'
  const told = (await titled(title)).length

  const answers = [await run(itemOf(plan, 3)), await run(itemOf(plan, 2))]
  assert.deepEqual(answers.map((answer) => answer.state), ['held', 'held'])
  assert.deepEqual(answers[0].codes, ['CATCH_UP'])
  for (const month of [2, 3]) {
    const row = await itemRow(itemOf(plan, month))
    assert.equal(row.attention_code, 'CATCH_UP')
    const drafts = await linkedTo(itemOf(plan, month))
    assert.equal(drafts.length, 1)
    assert.equal(drafts[0].status, 'Draft')
  }
  const notices = (await titled(title)).length - told
  assert.ok(notices >= 1, 'the plan told someone')
  assert.equal(new Set((await titled(title)).map((entry) => entry.user_id)).size, (await titled(title)).length, 'one notice per person, not per month')

  const second = (await linkedTo(itemOf(plan, 2)))[0]
  ok(await fx.sender.client.rpc('issue_invoice', { p_id: second.id }), 'the owner issues month 2 by hand')
  assert.deepEqual(await dueFor(plan), [], 'a held month stays held')
  assert.equal((await run(itemOf(plan, 3))).state, 'skipped')
  assert.equal((await linkedTo(itemOf(plan, 3)))[0].status, 'Draft')
})

test('the hourly cap answers capped and writes nothing', async () => {
  const plan = await fx.approvedPlan()
  await fx.dueMonth(plan.planId, 2)
  const sent = must(await admin.from('document_emails').select('id').eq('organization_id', fx.orgId).gte('sent_at', new Date(Date.now() - 3_600_000).toISOString())).length
  assert.ok(sent >= 1)
  const answer = await run(itemOf(plan, 2), sent)
  assert.equal(answer.state, 'capped')
  assert.equal((await linkedTo(itemOf(plan, 2))).length, 0, 'no draft was made')
  assert.equal((await run(itemOf(plan, 2), sent + 1000)).state, 'issued', 'with room, it goes')
})

test('a paused plan, an ended plan, a cancelled item, a switched-off organisation and an unapproved first invoice answer skipped and create nothing', async () => {
  const plan = await fx.approvedPlan()
  await fx.dueMonth(plan.planId, 2)
  const item = itemOf(plan, 2)
  const created = async () => (await linkedTo(item)).length

  await setPlan(plan, 'paused')
  assert.equal((await run(item)).state, 'skipped')
  await setPlan(plan, 'ended')
  assert.equal((await run(item)).state, 'skipped')
  await setPlan(plan, 'active')

  ok(await admin.from('billing_plan_items').update({ status: 'cancelled', cancelled_reason: 'a test' }).eq('id', item), 'cancel')
  assert.equal((await run(item)).state, 'skipped')
  ok(await admin.from('billing_plan_items').update({ status: 'open', cancelled_reason: null }).eq('id', item), 'reopen')

  await fx.setAutoSend(false)
  assert.equal((await run(item)).state, 'skipped')
  await fx.setAutoSend(true)

  ok(await admin.from('billing_plan_items').update({ approved_at: null }).eq('id', itemOf(plan, 1)), 'unapprove')
  assert.equal((await run(item)).state, 'skipped')
  ok(await admin.from('billing_plan_items').update({ approved_at: new Date().toISOString() }).eq('id', itemOf(plan, 1)), 'approve again')

  assert.equal(await created(), 0, 'none of that created an invoice')
  assert.equal((await run(item)).state, 'issued', 'and with everything right it goes')

  const early = await fx.approvedPlan()
  assert.equal((await run(itemOf(early, 2))).state, 'skipped', 'a month whose date has not come')
  assert.equal((await run(itemOf(early, 1))).state, 'skipped', 'item 1 is never the runner\'s')
})

test('the date is South African: today is due, tomorrow is not, and the function never reads the server date', async () => {
  const plan = await fx.approvedPlan()
  const item = itemOf(plan, 2)
  ok(await admin.from('billing_plan_items').update({ bill_on: plusDays(saToday(), 1) }).eq('id', item), 'tomorrow')
  assert.deepEqual(await dueFor(plan), [])
  assert.equal((await run(item)).state, 'skipped')
  ok(await admin.from('billing_plan_items').update({ bill_on: saToday() }).eq('id', item), 'today')
  assert.equal((await dueFor(plan)).length, 1)

  const source = readFileSync(join(process.cwd(), 'supabase/migrations/20261111102000_billing_run_item.sql'), 'utf8')
  assert.doesNotMatch(source, /current_date|localtimestamp|\bnow\(\)::date/i, 'no server-date reads')
  assert.match(source, /Africa\/Johannesburg/)
})

test('a different VAT rate at issue notifies, the same rate notifies nobody', async () => {
  const plan = await fx.approvedPlan()
  await fx.dueMonth(plan.planId, 2)
  const title = 'Month 2 for Portal Client was issued at a different VAT rate'
  const before = (await titled(title)).length
  const original = (await settingsRow()).vat_rate
  ok(await admin.from('organization_settings').update({ vat_rate: 14 }).eq('organization_id', fx.orgId), 'change the rate')
  try {
    assert.equal((await run(itemOf(plan, 2))).state, 'issued')
  } finally {
    ok(await admin.from('organization_settings').update({ vat_rate: original }).eq('organization_id', fx.orgId), 'restore the rate')
  }
  assert.ok((await titled(title)).length > before, 'the people were told')
})

test('no member, no anon and no other organisation can call billing_due_items or billing_run_item', async () => {
  const plan = await fx.approvedPlan()
  for (const [who, client] of [['a member', fx.sender.client], ['another organisation', other.sender.client], ['anon', anonymous]] as const) {
    const due = await client.rpc('billing_due_items', { p_limit: 10 })
    assert.match(due.error?.message ?? '', /permission denied for function billing_due_items/, who)
    const ran = await client.rpc('billing_run_item', { p_item_id: itemOf(plan, 2), p_email_cap: CAP })
    assert.match(ran.error?.message ?? '', /permission denied for function billing_run_item/, who)
  }
})
