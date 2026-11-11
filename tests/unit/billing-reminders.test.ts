import assert from 'node:assert/strict'
import test from 'node:test'

import { runReminders, type ReminderDeps } from '../../features/billing-runner/reminders.ts'

// Accept to invoice, stage 3, task 4: the reminders step of the runner. The database decides which reminder is due, claims it, and
// records it (billing_reminder_candidates, _claim, _record, _release); this file walks what it is told. db.rpc is a script.

type Call = { name: string; args: Record<string, any> }
const INVOICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const INVOICE_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const READY = { state: 'ready', invoice_id: INVOICE, sequence: 1, to: 'client@example.test', reply_to: 'owner@example.test', sender_name: 'Olive', number: 'HMK-I-1', balance: '1,725.00', currency: 'ZAR', due_date: '2027-01-02', month_number: 2 }
const fresh = () => ({ reminders: 0, failed: 0, skipped: 0, logged: 0 })

function harness(handlers: Record<string, (args: Record<string, any>) => any>, overrides: Partial<ReminderDeps> = {}) {
  const calls: Call[] = []
  const sent: any[] = []
  const db = {
    rpc: async (name: string, args: Record<string, any> = {}) => {
      calls.push({ name, args })
      const handler = handlers[name]
      if (!handler) return { data: null, error: null }
      const result = handler(args)
      return result && typeof result === 'object' && 'error' in result && 'data' in result ? result : { data: result, error: null }
    },
  }
  const deps: ReminderDeps = {
    db,
    maxItems: 20,
    prepareReminder: async ({ context }) => ({
      message: { to: context.to as string, replyTo: context.reply_to ?? undefined, subject: 'Reminder', text: 'text', html: '<p>h</p>' },
      attachment: { filename: 'invoice.pdf', bytes: new Uint8Array([1, 2, 3]) },
      sha256: 'c'.repeat(64),
    }),
    send: async (message) => {
      sent.push(message)
      return { delivered: true }
    },
    ...overrides,
  }
  return { deps, calls, sent, names: () => calls.map((call) => call.name) }
}

test('candidates, then claim, then record, in that order, for each reminder', async () => {
  const h = harness({
    billing_reminder_candidates: () => [{ invoice_id: INVOICE, sequence: 1 }],
    billing_reminder_claim: () => READY,
    billing_reminder_record: () => 'row-id',
  })
  const summary = fresh()
  await runReminders(h.deps, summary)
  assert.deepEqual(h.names(), ['billing_reminder_candidates', 'billing_reminder_claim', 'billing_reminder_record'])
  assert.deepEqual(h.calls[0].args, { p_limit: 20 })
  assert.deepEqual(h.calls[1].args, { p_invoice_id: INVOICE })
  assert.deepEqual(h.calls[2].args, { p_invoice_id: INVOICE, p_sequence: 1, p_to: 'client@example.test', p_subject: 'Reminder', p_sha256: 'c'.repeat(64), p_bytes: 3 })
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].replyTo, 'owner@example.test')
  assert.equal(summary.reminders, 1)
})

test('busy and skipped claims are left alone and counted skipped', async () => {
  const h = harness({
    billing_reminder_candidates: () => [{ invoice_id: INVOICE, sequence: 1 }, { invoice_id: INVOICE_2, sequence: 2 }],
    billing_reminder_claim: (args) => (args.p_invoice_id === INVOICE ? { state: 'busy' } : { state: 'skipped' }),
  })
  const summary = fresh()
  await runReminders(h.deps, summary)
  assert.equal(h.sent.length, 0)
  assert.ok(!h.names().includes('billing_reminder_record'))
  assert.ok(!h.names().includes('billing_reminder_release'))
  assert.equal(summary.skipped, 2)
})

test('no address releases the claim and counts a failure without preparing anything', async () => {
  let prepared = 0
  const h = harness(
    { billing_reminder_candidates: () => [{ invoice_id: INVOICE, sequence: 1 }], billing_reminder_claim: () => ({ ...READY, to: null }) },
    { prepareReminder: async () => { prepared += 1; return { error: 'PDF_FAILED' } } },
  )
  const summary = fresh()
  await runReminders(h.deps, summary)
  assert.equal(prepared, 0)
  assert.deepEqual(h.calls.find((call) => call.name === 'billing_reminder_release')?.args, { p_invoice_id: INVOICE, p_sequence: 1, p_count_attempt: true })
  assert.equal(summary.failed, 1)
})

test('a prepare error releases the claim and sends nothing', async () => {
  const h = harness(
    { billing_reminder_candidates: () => [{ invoice_id: INVOICE, sequence: 1 }], billing_reminder_claim: () => READY },
    { prepareReminder: async () => ({ error: 'PDF_FAILED' }) },
  )
  const summary = fresh()
  await runReminders(h.deps, summary)
  assert.equal(h.sent.length, 0)
  assert.ok(h.names().includes('billing_reminder_release'))
  assert.equal(summary.failed, 1)
})

test('a send that throws releases the claim and the run goes on with the next invoice', async () => {
  let n = 0
  const h = harness(
    {
      billing_reminder_candidates: () => [{ invoice_id: INVOICE, sequence: 1 }, { invoice_id: INVOICE_2, sequence: 2 }],
      billing_reminder_claim: (args) => ({ ...READY, invoice_id: args.p_invoice_id }),
      billing_reminder_record: () => 'row-id',
    },
    { send: async () => { n += 1; if (n === 1) throw new Error('graph said no'); return { delivered: true } } },
  )
  const summary = fresh()
  await runReminders(h.deps, summary)
  const releases = h.calls.filter((call) => call.name === 'billing_reminder_release').map((call) => call.args)
  assert.deepEqual(releases, [{ p_invoice_id: INVOICE, p_sequence: 1, p_count_attempt: true }])
  assert.equal(summary.failed, 1)
  assert.equal(summary.reminders, 1)
})

test('log mode releases without counting an attempt, records nothing, and counts logged', async () => {
  const h = harness(
    { billing_reminder_candidates: () => [{ invoice_id: INVOICE, sequence: 1 }], billing_reminder_claim: () => READY },
    { send: async () => ({ delivered: false }) },
  )
  const summary = fresh()
  await runReminders(h.deps, summary)
  assert.ok(!h.names().includes('billing_reminder_record'))
  assert.deepEqual(h.calls.find((call) => call.name === 'billing_reminder_release')?.args, { p_invoice_id: INVOICE, p_sequence: 1, p_count_attempt: false })
  assert.equal(summary.logged, 1)
  assert.equal(summary.reminders, 0)
})

test('a record failure is counted, not released, and the message is not sent again', async () => {
  const h = harness({
    billing_reminder_candidates: () => [{ invoice_id: INVOICE, sequence: 1 }, { invoice_id: INVOICE_2, sequence: 1 }],
    billing_reminder_claim: (args) => ({ ...READY, invoice_id: args.p_invoice_id }),
    billing_reminder_record: (args) => (args.p_invoice_id === INVOICE ? { data: null, error: { code: 'XX000', message: 'boom with client@example.test' } } : 'row-id'),
  })
  const summary = fresh()
  await runReminders(h.deps, summary)
  assert.equal(h.sent.length, 2, 'one message each')
  assert.ok(!h.names().includes('billing_reminder_release'), 'the message went out, so the claim is not given back')
  assert.equal(summary.failed, 1)
  assert.equal(summary.reminders, 1)
})

test('a candidate list that cannot be read stops the step with an error naming no data', async () => {
  const h = harness({ billing_reminder_candidates: () => ({ data: null, error: { code: '42501', message: 'permission denied for client@example.test' } }) })
  await assert.rejects(() => runReminders(h.deps, fresh()), (error: unknown) => {
    assert.doesNotMatch(String((error as Error).message), /client@example\.test/)
    assert.match(String((error as Error).message), /42501/)
    return true
  })
})

test('one claim failing in the database does not stop the others', async () => {
  const h = harness({
    billing_reminder_candidates: () => [{ invoice_id: INVOICE, sequence: 1 }, { invoice_id: INVOICE_2, sequence: 1 }],
    billing_reminder_claim: (args) => (args.p_invoice_id === INVOICE ? { data: null, error: { code: '40001', message: 'serialization' } } : { ...READY, invoice_id: INVOICE_2 }),
    billing_reminder_record: () => 'row-id',
  })
  const summary = fresh()
  await runReminders(h.deps, summary)
  assert.equal(summary.failed, 1)
  assert.equal(summary.reminders, 1)
})

test('a second pass over the same state sends nothing new', async () => {
  let recorded = false
  const h = harness({
    billing_reminder_candidates: () => (recorded ? [] : [{ invoice_id: INVOICE, sequence: 1 }]),
    billing_reminder_claim: () => READY,
    billing_reminder_record: () => { recorded = true; return 'row-id' },
  })
  await runReminders(h.deps, fresh())
  await runReminders(h.deps, fresh())
  assert.equal(h.sent.length, 1)
})
