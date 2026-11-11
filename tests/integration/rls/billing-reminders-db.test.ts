import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { runBilling, type RunDeps } from '../../../features/billing-runner/run.ts'
import { setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin } from './helpers.ts'
import { must } from './portal-fixtures.ts'

// Accept to invoice, stage 3, task 4: the real orchestrator (features/billing-runner/run.ts, with reminders.ts) against the real database
// functions for payment reminders. Only the two things that cannot run in a test are faked: the PDF and the mail server. Nothing is sent.
//
// THE GUARDS THAT KEEP THIS TEST AWAY FROM REAL DATA. runBilling works on whatever the database lists, in every organisation that has the
// switches on, and records what it "sent". With a fake mail server, a run over a real organisation would mark its real reminders as sent
// when nothing was sent. So the database the runner sees is this one: months to issue and notices are none, reminder candidates are cut
// down to this fixture's own invoices, and every reminder question is asked about a day (p_on) that makes the fixture's reminder due,
// which is how the test sees day 3 without waiting for it.

let fx: BillingOrg
const mine = new Set<string>()
let asOf: string | null = null
const sent: Array<{ to: string; subject: string }> = []
let failNext = false

before(async () => {
  fx = await setupBillingOrg('billing-rem-db')
})

after(async () => {
  await fx?.teardown()
})

const plusDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const scopedDb = {
  rpc: async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'billing_due_items' || name === 'billing_pending_notice_emails') return { data: [], error: null }
    if (name === 'billing_reminder_candidates') {
      const listed = await admin.rpc(name, { ...args, p_on: asOf } as never)
      return { ...listed, data: ((listed.data ?? []) as Array<{ invoice_id: string }>).filter((row) => mine.has(row.invoice_id)) }
    }
    if (name === 'billing_reminder_claim') {
      if (!mine.has(String(args.p_invoice_id))) return { data: { state: 'skipped' }, error: null }
      return admin.rpc(name, { ...args, p_on: asOf } as never)
    }
    return admin.rpc(name, args as never)
  },
}

const deps = (): RunDeps => ({
  db: scopedDb,
  emailCap: 50,
  maxItems: 20,
  prepare: async () => ({ error: 'PDF_FAILED' }),
  prepareReminder: async ({ context }) => ({
    message: { to: context.to as string, replyTo: context.reply_to ?? undefined, subject: `Reminder ${context.sequence}`, text: 'text', html: '<p>html</p>' },
    attachment: { filename: 'invoice.pdf', bytes: new Uint8Array([1, 2, 3, 4, 5]) },
    sha256: 'e'.repeat(64),
  }),
  send: async (message) => {
    if (failNext) {
      failNext = false
      throw new Error('the mail server said no')
    }
    sent.push({ to: message.to, subject: message.subject })
    return { delivered: true }
  },
  sendNotice: async () => ({ delivered: true }),
})

async function plan() {
  const made = await fx.issuedPlanInvoice()
  await fx.setReminders(true)
  // Only the newest invoice is in scope: earlier tests' invoices fall due on the same day and would be reminded too.
  mine.clear()
  mine.add(made.invoiceId)
  const due = (must(await admin.from('invoices').select('due_date').eq('id', made.invoiceId).single()) as Record<string, any>).due_date as string
  return { ...made, due }
}
const rows = async (invoice: string) => must(await admin.from('billing_reminders').select('*').eq('invoice_id', invoice).order('sequence')) as Array<Record<string, any>>

test('a run sends reminder 1 for an invoice 3 days past due and records it once; a second run sends nothing; the next goes only when its day comes', async () => {
  const p = await plan()
  sent.length = 0

  asOf = plusDays(p.due, 2)
  assert.equal((await runBilling(deps())).reminders, 0, 'not before day 3')

  asOf = plusDays(p.due, 3)
  const first = await runBilling(deps())
  assert.equal(first.reminders, 1)
  assert.equal(first.failed, 0)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'accounts@portal-client.test')
  assert.equal(sent[0].subject, 'Reminder 1')
  const recorded = await rows(p.invoiceId)
  assert.equal(recorded.length, 1)
  assert.ok(recorded[0].sent_at)
  assert.equal(recorded[0].pdf_sha256, 'e'.repeat(64))

  assert.equal((await runBilling(deps())).reminders, 0, 'a second run the same day')
  assert.equal(sent.length, 1)

  asOf = plusDays(p.due, 10)
  assert.equal((await runBilling(deps())).reminders, 1, 'reminder 2 on day 10')
  assert.equal(sent[1].subject, 'Reminder 2')
  assert.equal((await rows(p.invoiceId)).filter((row) => row.sent_at).length, 2)
})

test('a failed send is released and retried by the next run, and recorded once', async () => {
  const p = await plan()
  sent.length = 0
  asOf = plusDays(p.due, 3)
  failNext = true

  const first = await runBilling(deps())
  assert.equal(first.reminders, 0)
  assert.equal(first.failed, 1)
  let state = await rows(p.invoiceId)
  assert.equal(state.length, 1)
  assert.equal(state[0].sent_at, null)
  assert.equal(state[0].attempts, 1)
  assert.equal(state[0].claimed_until, null, 'the claim was given back')

  const second = await runBilling(deps())
  assert.equal(second.reminders, 1)
  state = await rows(p.invoiceId)
  assert.equal(state.length, 1, 'one row for the sequence')
  assert.ok(state[0].sent_at)
  assert.equal(sent.length, 1)
})

test('two runs at once send one reminder', async () => {
  const p = await plan()
  sent.length = 0
  asOf = plusDays(p.due, 3)
  await Promise.all([runBilling(deps()), runBilling(deps())])
  assert.equal((await rows(p.invoiceId)).filter((row) => row.sent_at).length, 1)
  assert.equal(sent.length, 1, 'one message')
})

test('a payment in full stops the next reminder at once, and a paused invoice gets none', async () => {
  const p = await plan()
  sent.length = 0
  asOf = plusDays(p.due, 3)
  assert.equal((await runBilling(deps())).reminders, 1)

  const total = Number((must(await admin.from('invoices').select('total_amount').eq('id', p.invoiceId).single()) as Record<string, any>).total_amount)
  await fx.payInvoice(p.invoiceId, total)
  asOf = plusDays(p.due, 10)
  assert.equal((await runBilling(deps())).reminders, 0, 'paid in full')

  const q = await plan()
  asOf = plusDays(q.due, 3)
  assert.equal(
    (await admin.from('billing_plan_items').update({ reminders_paused_at: new Date().toISOString(), reminders_pause_reason: 'Client promised payment' }).eq('id', q.itemId)).error,
    null,
  )
  assert.equal((await runBilling(deps())).reminders, 0, 'paused')
  assert.equal((await rows(q.invoiceId)).length, 0)
})

test('the guard holds: a run never touches an invoice that is not from this fixture', async () => {
  asOf = plusDays('2099-01-01', 0)
  const listed = await scopedDb.rpc('billing_reminder_candidates', { p_limit: 200 })
  for (const row of (listed.data ?? []) as Array<{ invoice_id: string }>) assert.ok(mine.has(row.invoice_id), 'only this fixture invoices are listed')
  assert.deepEqual((await scopedDb.rpc('billing_pending_notice_emails', { p_limit: 20 })).data, [])
  assert.deepEqual((await scopedDb.rpc('billing_due_items', { p_limit: 20 })).data, [])
})
