import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { ok, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin } from './helpers.ts'
import { anonymous, must } from './portal-fixtures.ts'

// Accept to invoice, stage 2, task 6: billing notices by email. private.billing_notify writes the in-app notice exactly as before
// and, only when the organisation has automatic sending on, one outbox row per recipient (billing_notice_emails). The runner sends
// the outbox: billing_pending_notice_emails lists what is waiting (with each recipient's login address) and billing_mark_notice_email
// records the result. Pause notices stay in the app only.

let fx: BillingOrg
let other: BillingOrg

before(async () => {
  fx = await setupBillingOrg('billing-notice-a', { billing: true })
  other = await setupBillingOrg('billing-notice-b')
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    await other?.teardown()
  }
})

const READY = 'Portal Client accepted: first invoice ready to approve'
const outbox = async (subject?: string) => {
  const query = admin.from('billing_notice_emails').select('*').eq('organization_id', fx.orgId).order('created_at')
  return must(subject ? await query.eq('subject', subject) : await query) as Array<Record<string, any>>
}
const notices = async (title: string) => must(await admin.from('notifications').select('user_id').eq('organization_id', fx.orgId).eq('title', title)) as Array<{ user_id: string }>

test('with automatic sending off a first-invoice-ready notice is in the app only, as before', async () => {
  await fx.setAutoSend(false)
  const quote = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(quote)
  assert.ok((await notices(READY)).length >= 1, 'the in-app notice is written')
  assert.equal((await outbox()).length, 0, 'nothing waits in the outbox')
})

test('with it on, each recipient also gets one outbox row with the same title and body', async () => {
  await fx.setAutoSend(true)
  const before = (await notices(READY)).length
  const beforeMail = (await outbox(READY)).length
  const quote = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(quote)
  const told = (await notices(READY)).length - before
  const rows = (await outbox(READY)).slice(beforeMail)
  assert.ok(told >= 1)
  assert.equal(rows.length, told, 'one outbox row per in-app notice')
  assert.equal(new Set(rows.map((row) => row.user_id)).size, rows.length, 'one per person')
  for (const row of rows) {
    assert.match(row.body, /Check the draft invoice for quotation/)
    assert.equal(row.quote_id, quote)
    assert.equal(row.sent_at, null)
    assert.equal(row.attempts, 0)
  }
})

test('a held month and an unapproved first invoice also enqueue emails; a pause does not', async () => {
  const plan = await fx.approvedPlan()
  await fx.dueMonth(plan.planId, 2)
  const item = plan.items.find((entry) => entry.monthNumber === 2)!.id

  ok(await admin.from('clients').update({ address_line1: '' }).eq('id', fx.clientId), 'break the address')
  const held = 'Month 2 for Portal Client needs your attention'
  const before = (await outbox(held)).length
  try {
    const answer = must(await admin.rpc('billing_run_item', { p_item_id: item, p_email_cap: 50 })) as Record<string, any>
    assert.equal(answer.state, 'held')
  } finally {
    ok(await admin.from('clients').update({ address_line1: '2 Client Road' }).eq('id', fx.clientId), 'fix the address')
  }
  assert.ok((await outbox(held)).length > before, 'a held month is emailed')

  // The nightly reminder about an unapproved first invoice.
  const lonely = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(lonely)
  const first = must(await admin.from('billing_plan_items').select('id').eq('quote_id', lonely).eq('month_number', 1).single())
  const old = new Date(Date.now() - 3 * 86_400_000).toISOString()
  ok(await admin.from('billing_plan_items').update({ created_at: old }).eq('id', first.id), 'age the item')
  const reminder = 'First invoice for Portal Client is waiting for approval'
  const beforeReminder = (await outbox(reminder)).length
  const night = must(await admin.rpc('billing_nightly')) as Record<string, any>
  assert.ok(night.reminded >= 1)
  assert.ok((await outbox(reminder)).length > beforeReminder, 'the reminder is emailed')

  // A pause stays in the app.
  const paused = 'Billing plan paused for Portal Client'
  const beforePause = (await outbox(paused)).length
  await fx.setStatus(plan.quoteId, 'Sent')
  assert.ok((await notices(paused)).length >= 1, 'the pause is in the app')
  assert.equal((await outbox(paused)).length, beforePause, 'and not by email')
})

test('billing_pending_notice_emails lists unsent rows oldest first with the login address, billing_mark_notice_email records the result', async () => {
  const rows = await outbox()
  assert.ok(rows.length >= 2)
  const pending = must(await admin.rpc('billing_pending_notice_emails', { p_limit: 200 })) as Array<Record<string, any>>
  const mine = pending.filter((row) => rows.some((own) => own.id === row.id))
  assert.equal(mine.length, rows.length)
  assert.deepEqual(mine.map((row) => row.id), rows.map((row) => row.id), 'oldest first')
  const logins = new Set([fx.sender.email, fx.owner.email].map((email) => email.toLowerCase()))
  for (const row of mine) {
    assert.ok(logins.has(String(row.to_address).toLowerCase()), `an address from the team logins: ${row.to_address}`)
    assert.ok(row.subject && row.body)
    assert.equal(typeof row.quote_id === 'string' || row.quote_id === null, true)
  }

  const [first, second] = mine
  assert.equal((await admin.rpc('billing_mark_notice_email', { p_id: first.id, p_sent: true })).error, null)
  assert.equal((await admin.rpc('billing_mark_notice_email', { p_id: second.id, p_sent: false })).error, null)
  const afterFirst = must(await admin.from('billing_notice_emails').select('sent_at,attempts').eq('id', first.id).single())
  assert.ok(afterFirst.sent_at)
  const afterSecond = must(await admin.from('billing_notice_emails').select('sent_at,attempts').eq('id', second.id).single())
  assert.equal(afterSecond.sent_at, null)
  assert.equal(afterSecond.attempts, 1)

  const again = (must(await admin.rpc('billing_pending_notice_emails', { p_limit: 200 })) as Array<Record<string, any>>).map((row) => row.id)
  assert.ok(!again.includes(first.id), 'a sent row is not listed again')
  assert.ok(again.includes(second.id), 'a failed attempt is listed again')

  ok(await admin.from('billing_notice_emails').update({ attempts: 5 }).eq('id', second.id), 'five attempts')
  const final = (must(await admin.rpc('billing_pending_notice_emails', { p_limit: 200 })) as Array<Record<string, any>>).map((row) => row.id)
  assert.ok(!final.includes(second.id), 'a row with five attempts is left')

  assert.equal((await admin.rpc('billing_pending_notice_emails', { p_limit: 0 })).error?.code, '22023')
  assert.equal((await admin.rpc('billing_pending_notice_emails', { p_limit: 201 })).error?.code, '22023')
})

test('members and anon cannot call either function', async () => {
  for (const [who, client] of [['a member', fx.sender.client], ['another organisation', other.sender.client], ['anon', anonymous]] as const) {
    assert.match((await client.rpc('billing_pending_notice_emails', { p_limit: 5 })).error?.message ?? '', /permission denied for function billing_pending_notice_emails/, who)
    assert.match((await client.rpc('billing_mark_notice_email', { p_id: '00000000-0000-4000-8000-0000000000aa', p_sent: true })).error?.message ?? '', /permission denied for function billing_mark_notice_email/, who)
  }
})
