import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { runBilling, type RunDeps } from '../../../features/billing-runner/run.ts'
import { setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin } from './helpers.ts'
import { must } from './portal-fixtures.ts'

// Accept to invoice, stage 2, task 5: the real orchestrator (features/billing-runner/run.ts) against the real database functions.
// Only the two things that cannot run in a test are faked: the PDF and the mail server. Nothing is sent anywhere.

let fx: BillingOrg

before(async () => {
  fx = await setupBillingOrg('billing-runner-db')
})

after(async () => {
  await fx?.teardown()
})

const sent: Array<{ to: string; replyTo?: string; subject: string }> = []
let failNext = false

// THE GUARD THAT KEEPS THIS TEST AWAY FROM REAL DATA. runBilling works on whatever billing_due_items lists, in every organisation that
// has both switches on, and records what it "sent". With the fake mail server above, a run over a real organisation would mark its
// real invoices as emailed when nothing was sent. So the database the runner sees is this one: the list of due items is cut down to
// this fixture's own plan items, and the notice outbox is empty. Nothing else about the database is changed.
const mine = new Set<string>()
const scopedDb = {
  rpc: async (name: string, args?: Record<string, unknown>) => {
    if (name === 'billing_due_items') {
      const listed = await admin.rpc(name, args as never)
      return { ...listed, data: ((listed.data ?? []) as Array<{ item_id: string }>).filter((row) => mine.has(row.item_id)) }
    }
    if (name === 'billing_pending_notice_emails') return { data: [], error: null }
    return admin.rpc(name, args as never)
  },
}
const track = (plan: { items: Array<{ id: string }> }) => plan.items.forEach((item) => mine.add(item.id))

const deps = (): RunDeps => ({
  db: scopedDb,
  emailCap: 50,
  maxItems: 20,
  prepare: async ({ context }) => ({
    message: { to: context.to as string, replyTo: context.reply_to ?? undefined, subject: `Invoice for month ${context.month_number}`, text: 'text', html: '<p>html</p>' },
    attachment: { filename: 'invoice.pdf', bytes: new Uint8Array([1, 2, 3, 4]) },
    sha256: 'b'.repeat(64),
  }),
  send: async (message) => {
    if (failNext) {
      failNext = false
      throw new Error('the mail server said no')
    }
    sent.push({ to: message.to, replyTo: message.replyTo, subject: message.subject })
    return { delivered: true }
  },
  sendNotice: async () => ({ delivered: true }),
})

test('a run issues a due month, sends and records it once, and a second run does nothing', async () => {
  const plan = await fx.approvedPlan()
  track(plan)
  await fx.dueMonth(plan.planId, 2)
  const item = plan.items.find((entry) => entry.monthNumber === 2)!.id
  sent.length = 0

  const first = await runBilling(deps())
  assert.equal(first.issued, 1)
  assert.equal(first.sent, 1)
  assert.equal(first.failed, 0)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'accounts@portal-client.test')

  const invoice = must(await admin.from('invoices').select('id,status').eq('billing_plan_item_id', item).single())
  assert.equal(invoice.status, 'Issued')
  const emails = must(await admin.from('document_emails').select('sent_by,pdf_bytes').eq('invoice_id', invoice.id))
  assert.equal(emails.length, 1)
  assert.equal(emails[0].sent_by, null)
  assert.equal(emails[0].pdf_bytes, 4)

  const second = await runBilling(deps())
  assert.deepEqual({ issued: second.issued, sent: second.sent }, { issued: 0, sent: 0 })
  assert.equal(sent.length, 1, 'nothing more was sent')
  assert.equal(must(await admin.from('document_emails').select('id').eq('invoice_id', invoice.id)).length, 1)
})

test('a send that fails is recorded, the month is issued once, and the next run sends it', async () => {
  const plan = await fx.approvedPlan()
  track(plan)
  await fx.dueMonth(plan.planId, 2)
  const item = plan.items.find((entry) => entry.monthNumber === 2)!.id
  sent.length = 0
  failNext = true

  const first = await runBilling(deps())
  assert.equal(first.issued, 1)
  assert.equal(first.sent, 0)
  assert.equal(first.failed, 1)
  let row = must(await admin.from('billing_plan_items').select('attention_code,attention_detail,send_attempts').eq('id', item).single())
  assert.deepEqual(row, { attention_code: 'EMAIL_FAILED', attention_detail: 'MAIL_REJECTED', send_attempts: 1 })

  const second = await runBilling(deps())
  assert.equal(second.issued, 0, 'it is not issued again')
  assert.equal(second.sent, 1)
  row = must(await admin.from('billing_plan_items').select('attention_code,attention_detail,send_attempts').eq('id', item).single())
  assert.deepEqual(row, { attention_code: null, attention_detail: null, send_attempts: 0 })
  assert.equal(must(await admin.from('invoices').select('id').eq('billing_plan_item_id', item)).length, 1, 'one invoice for the month')
  assert.equal(sent.length, 1)
})

test('two runs at once issue and send each month once', async () => {
  const plan = await fx.approvedPlan()
  track(plan)
  await fx.dueMonth(plan.planId, 2)
  const item = plan.items.find((entry) => entry.monthNumber === 2)!.id
  sent.length = 0

  await Promise.all([runBilling(deps()), runBilling(deps())])
  assert.equal(must(await admin.from('invoices').select('id').eq('billing_plan_item_id', item)).length, 1)
  const invoice = must(await admin.from('invoices').select('id').eq('billing_plan_item_id', item).single())
  assert.equal(must(await admin.from('document_emails').select('id').eq('invoice_id', invoice.id)).length, 1)
  assert.equal(sent.length, 1, 'one message')
})

test('the guard holds: a run never touches an item that is not from this fixture', async () => {
  const stranger = await admin.rpc('billing_due_items', { p_limit: 200 })
  assert.equal(stranger.error, null)
  const listed = await scopedDb.rpc('billing_due_items', { p_limit: 200 })
  for (const row of (listed.data ?? []) as Array<{ item_id: string }>) assert.ok(mine.has(row.item_id), 'only this fixture items are listed')
  assert.deepEqual((await scopedDb.rpc('billing_pending_notice_emails', { p_limit: 20 })).data, [], 'no real notice is ever handed to the fake mail server')
})
