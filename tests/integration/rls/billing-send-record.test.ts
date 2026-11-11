import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test, { after, before } from 'node:test'

import { activitiesOf, ok, refused, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin } from './helpers.ts'
import { anonymous, must } from './portal-fixtures.ts'

// Accept to invoice, stage 2, task 4: sending a system-issued month. billing_send_context leases the item and says who to write to;
// billing_record_send records the email the runner sent; billing_record_send_failure counts a failed attempt. Service role only.
// A month is issued with the real billing_run_item, so these tests start where the runner's issue step ends.

let fx: BillingOrg
let other: BillingOrg

before(async () => {
  fx = await setupBillingOrg('billing-send-a')
  other = await setupBillingOrg('billing-send-b')
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    await other?.teardown()
  }
})

type Plan = Awaited<ReturnType<BillingOrg['approvedPlan']>>
const UNKNOWN = '00000000-0000-4000-8000-0000000000aa'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const row = async (id: string) => must(await admin.from('billing_plan_items').select('*').eq('id', id).single()) as Record<string, any>
const context = async (item: string) => must(await admin.rpc('billing_send_context', { p_item_id: item })) as Record<string, any>
const recordSend = (item: string, overrides: Record<string, unknown> = {}) =>
  admin.rpc('billing_record_send', { p_item_id: item, p_to: 'accounts@portal-client.test', p_subject: 'Invoice X from HIMARK', p_body: 'Please find attached', p_sha256: hash(item), p_bytes: 2048, ...overrides })
const failure = (item: string, code: string) => admin.rpc('billing_record_send_failure', { p_item_id: item, p_code: code })
const titled = async (title: string) => must(await admin.from('notifications').select('user_id').eq('organization_id', fx.orgId).eq('title', title)) as Array<{ user_id: string }>

/** A plan whose month 2 the runner has issued, and the ids of month 2 and its invoice. */
async function issuedMonth(): Promise<{ plan: Plan; item: string; invoice: string }> {
  const plan = await fx.approvedPlan()
  await fx.dueMonth(plan.planId, 2)
  const item = plan.items.find((entry) => entry.monthNumber === 2)!.id
  const ran = must(await admin.rpc('billing_run_item', { p_item_id: item, p_email_cap: 50 })) as Record<string, any>
  assert.equal(ran.state, 'issued')
  return { plan, item, invoice: ran.invoice_id as string }
}

test('billing_send_context says who to write to, leases the item, and skips what is not a system-issued, unemailed month', async () => {
  const { plan, item, invoice } = await issuedMonth()
  const quote = must(await admin.from('quotes').select('owner_id').eq('id', plan.quoteId).single())
  const owner = quote.owner_id ? (await admin.from('team_members').select('email,full_name').eq('id', quote.owner_id).maybeSingle()).data : null
  const company = must(await admin.from('organization_settings').select('legal_name').eq('organization_id', fx.orgId).single())

  const ready = await context(item)
  assert.equal(ready.state, 'ready')
  assert.equal(ready.invoice_id, invoice)
  assert.equal(ready.organization_id, fx.orgId)
  assert.equal(ready.to, 'accounts@portal-client.test')
  assert.equal(ready.reply_to, owner?.email ?? null)
  assert.equal(ready.sender_name, owner?.full_name?.trim() ? owner.full_name : company.legal_name)
  assert.equal(ready.month_number, 2)
  assert.equal(ready.term_months, 12)
  assert.ok(new Date((await row(item)).send_lease_until).getTime() > Date.now() + 5 * 60_000, 'a lease of about ten minutes')

  assert.equal((await context(item)).state, 'busy', 'while leased')
  ok(await admin.from('billing_plan_items').update({ send_lease_until: new Date(Date.now() - 1000).toISOString() }).eq('id', item), 'let the lease run out')
  assert.equal((await context(item)).state, 'ready', 'a lease in the past gives ready again')

  // A billing email that is not an address falls back to the primary contact's, else nobody.
  ok(await admin.from('billing_plan_items').update({ send_lease_until: null }).eq('id', item), 'clear lease')
  ok(await admin.from('clients').update({ billing_email: 'not an address' }).eq('id', fx.clientId), 'break the billing email')
  const contact = (await admin.from('contacts').select('email').eq('client_id', fx.clientId).eq('is_primary', true).is('archived_at', null).maybeSingle()).data
  assert.equal((await context(item)).to, contact?.email ?? null)
  ok(await admin.from('clients').update({ billing_email: 'accounts@portal-client.test' }).eq('id', fx.clientId), 'restore')
  ok(await admin.from('billing_plan_items').update({ send_lease_until: null }).eq('id', item), 'clear lease')

  // What is skipped.
  assert.equal((await context(plan.items.find((entry) => entry.monthNumber === 3)!.id)).state, 'skipped', 'a month the system has not issued')
  assert.equal((await context(plan.items[0].id)).state, 'skipped', 'the first invoice is never the runner\'s')
  await fx.setAutoSend(false)
  assert.equal((await context(item)).state, 'skipped', 'automatic sending off')
  await fx.setAutoSend(true)
  ok(await admin.from('billing_plan_items').update({ send_attempts: 5 }).eq('id', item), 'five attempts')
  assert.equal((await context(item)).state, 'skipped', 'five failed attempts')
  ok(await admin.from('billing_plan_items').update({ send_attempts: 0 }).eq('id', item), 'reset')
  assert.equal((await recordSend(item)).error, null)
  assert.equal((await context(item)).state, 'skipped', 'already emailed')
  assert.equal((await context(UNKNOWN)).state, 'skipped', 'an unknown item')
})

test('two simultaneous contexts give one ready and one busy', async () => {
  const { item } = await issuedMonth()
  const answers = await Promise.all([context(item), context(item)])
  assert.deepEqual(answers.map((answer) => answer.state).sort(), ['busy', 'ready'])
})

test('billing_record_send writes one email record with no sender and the timeline entry, clears the lease and the failure state, and cannot be repeated', async () => {
  const { item, invoice } = await issuedMonth()
  assert.equal((await context(item)).state, 'ready')
  ok(await admin.from('billing_plan_items').update({ attention_code: 'EMAIL_FAILED', attention_detail: 'MAIL_REJECTED', attention_notified_at: new Date().toISOString(), send_attempts: 2 }).eq('id', item), 'a failed attempt')

  const recorded = await recordSend(item)
  assert.equal(recorded.error, null, recorded.error?.message)
  const email = must(await admin.from('document_emails').select('*').eq('id', recorded.data).single()) as Record<string, any>
  assert.equal(email.invoice_id, invoice)
  assert.equal(email.sent_by, null)
  assert.equal(email.to_address, 'accounts@portal-client.test')
  assert.equal(email.pdf_bytes, 2048)
  const timeline = must(await admin.from('activities').select('subject').eq('client_id', fx.clientId).eq('kind', 'invoice.emailed')) as Array<{ subject: string }>
  assert.ok(timeline.some((entry) => entry.subject.includes('emailed to accounts@portal-client.test')), 'the timeline says so')

  const state = await row(item)
  assert.equal(state.send_lease_until, null)
  assert.equal(state.attention_code, null)
  assert.equal(state.attention_detail, null)
  assert.equal(state.attention_notified_at, null)
  assert.equal(state.send_attempts, 0)

  refused((await recordSend(item)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  assert.equal(must(await admin.from('document_emails').select('id').eq('invoice_id', invoice)).length, 1, 'one record')
})

test('billing_record_send validates like record_document_email', async () => {
  const { item } = await issuedMonth()
  refused((await recordSend(item, { p_to: 'not an address' })).error, 'EMAIL_ADDRESS_INVALID')
  refused((await recordSend(item, { p_subject: 'two\nlines' })).error, 'EMAIL_SUBJECT_INVALID')
  refused((await recordSend(item, { p_sha256: 'short' })).error, 'EMAIL_RECORD_INVALID')
  refused((await recordSend(UNKNOWN)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  assert.equal((await recordSend(item)).error, null, 'nothing was recorded by the refused calls, so a valid one still works')
})

test('billing_record_send_failure counts attempts, tells the people on the first failure and on giving up only, and stops the send step after five', async () => {
  const { plan, item } = await issuedMonth()
  const couldNot = 'Month 2 for Portal Client could not be emailed'
  const giveUp = 'Month 2 for Portal Client will not be retried'
  const toldFirst = (await titled(couldNot)).length
  const toldLast = (await titled(giveUp)).length

  assert.equal((await context(item)).state, 'ready')
  assert.deepEqual(must(await failure(item, 'MAIL_REJECTED')), { attempts: 1, gave_up: false })
  const state = await row(item)
  assert.equal(state.attention_code, 'EMAIL_FAILED')
  assert.equal(state.attention_detail, 'MAIL_REJECTED')
  assert.equal(state.send_lease_until, null)
  assert.equal(state.send_attempts, 1)
  const afterFirst = (await titled(couldNot)).length
  assert.ok(afterFirst > toldFirst, 'the first failure tells someone')

  assert.deepEqual(must(await failure(item, 'PDF_FAILED')), { attempts: 2, gave_up: false })
  assert.equal((await titled(couldNot)).length, afterFirst, 'the second failure tells nobody')
  assert.equal((await row(item)).attention_detail, 'PDF_FAILED')

  ok(await admin.from('billing_plan_items').update({ send_attempts: 4 }).eq('id', item), 'four attempts')
  assert.deepEqual(must(await failure(item, 'NO_ADDRESS')), { attempts: 5, gave_up: true })
  assert.ok((await titled(giveUp)).length > toldLast, 'giving up tells someone')
  assert.equal((await activitiesOf(plan.quoteId, 'billing.item_held')).length, 2, 'one timeline entry for the first failure and one for giving up')

  const due = must(await admin.rpc('billing_due_items', { p_limit: 200 })) as Array<{ item_id: string; step: string }>
  assert.ok(!due.some((entry) => entry.item_id === item), 'the send step no longer lists it')

  assert.equal((await failure(item, 'SOMETHING_ELSE')).error?.code, '22023')
  refused((await failure(UNKNOWN, 'MAIL_REJECTED')).error, 'BILLING_ITEM_NOT_FOUND', '42501')
})

test('none of the three send functions is callable by a member, another organisation or anon', async () => {
  const { item } = await issuedMonth()
  const calls: Array<[string, Record<string, unknown>]> = [
    ['billing_send_context', { p_item_id: item }],
    ['billing_record_send', { p_item_id: item, p_to: 'a@b.test', p_subject: 'S', p_body: '', p_sha256: hash(item), p_bytes: 1 }],
    ['billing_record_send_failure', { p_item_id: item, p_code: 'MAIL_REJECTED' }],
  ]
  for (const [who, client] of [['a member', fx.sender.client], ['another organisation', other.sender.client], ['anon', anonymous]] as const) {
    for (const [name, args] of calls) {
      assert.match((await client.rpc(name, args)).error?.message ?? '', new RegExp(`permission denied for function ${name}`), `${who} calling ${name}`)
    }
  }
  assert.equal((await row(item)).send_attempts, 0, 'nothing changed')
})
