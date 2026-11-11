import assert from 'node:assert/strict'
import test from 'node:test'

import { runBilling, type RunDeps } from '../../features/billing-runner/run.ts'

// Accept to invoice, stage 2, task 5: the orchestrator. The database makes every decision (which month, which checks, which state);
// this file only walks what it is told, in order. db.rpc is a script: each function name maps to a handler, and every call is kept.

type Call = { name: string; args: Record<string, any> }

const ITEM = '11111111-1111-4111-8111-111111111111'
const ITEM_2 = '22222222-2222-4222-8222-222222222222'
const INVOICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const READY = { state: 'ready', invoice_id: INVOICE, organization_id: 'org', to: 'client@example.test', reply_to: 'owner@example.test', sender_name: 'Olive', month_number: 2, term_months: 12 }

function harness(handlers: Record<string, (args: Record<string, any>, n: number) => any>, overrides: Partial<RunDeps> = {}) {
  const calls: Call[] = []
  const counts: Record<string, number> = {}
  const sent: any[] = []
  const notices: any[] = []
  const db = {
    rpc: async (name: string, args: Record<string, any> = {}) => {
      calls.push({ name, args })
      counts[name] = (counts[name] ?? 0) + 1
      const handler = handlers[name]
      if (!handler) return { data: null, error: null }
      const result = handler(args, counts[name])
      return result && typeof result === 'object' && 'error' in result && 'data' in result ? result : { data: result, error: null }
    },
  }
  const deps: RunDeps = {
    db,
    emailCap: 50,
    maxItems: 20,
    prepare: async ({ context }) => ({
      message: { to: context.to as string, replyTo: context.reply_to ?? undefined, subject: 'Invoice', text: 'text', html: '<p>html</p>' },
      attachment: { filename: 'invoice.pdf', bytes: new Uint8Array([1, 2, 3]) },
      sha256: 'a'.repeat(64),
    }),
    send: async (message) => {
      sent.push(message)
      return { delivered: true }
    },
    sendNotice: async (notice) => {
      notices.push(notice)
      return { delivered: true }
    },
    prepareReminder: async () => ({ error: 'PDF_FAILED' }),
    ...overrides,
  }
  return { deps, calls, sent, notices, names: () => calls.map((call) => call.name) }
}

test('a run issues, then sends, then records, in that order, for each due month', async () => {
  const h = harness({
    billing_due_items: () => [{ item_id: ITEM, step: 'issue' }],
    billing_run_item: () => ({ state: 'issued', codes: [], invoice_id: INVOICE }),
    billing_send_context: () => READY,
    billing_record_send: () => 'email-id',
  })
  const summary = await runBilling(h.deps)
  assert.deepEqual(h.names(), ['billing_due_items', 'billing_run_item', 'billing_send_context', 'billing_record_send', 'billing_pending_notice_emails', 'billing_reminder_candidates'])
  assert.deepEqual(h.calls[0].args, { p_limit: 20 })
  assert.deepEqual(h.calls[1].args, { p_item_id: ITEM, p_email_cap: 50 })
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].to, 'client@example.test')
  assert.equal(h.calls[3].args.p_item_id, ITEM)
  assert.equal(h.calls[3].args.p_sha256, 'a'.repeat(64))
  assert.equal(h.calls[3].args.p_bytes, 3)
  assert.equal(summary.issued, 1)
  assert.equal(summary.sent, 1)
})

test('a send step item is sent without being issued again', async () => {
  const h = harness({ billing_due_items: () => [{ item_id: ITEM, step: 'send' }], billing_send_context: () => READY, billing_record_send: () => 'email-id' })
  const summary = await runBilling(h.deps)
  assert.ok(!h.names().includes('billing_run_item'))
  assert.equal(summary.sent, 1)
  assert.equal(summary.issued, 0)
})

test('an item the database answers skipped or busy is left alone', async () => {
  const h = harness({
    billing_due_items: () => [{ item_id: ITEM, step: 'issue' }, { item_id: ITEM_2, step: 'send' }],
    billing_run_item: () => ({ state: 'skipped', codes: [], invoice_id: null }),
    billing_send_context: () => ({ state: 'busy' }),
  })
  const summary = await runBilling(h.deps)
  assert.equal(h.sent.length, 0)
  assert.ok(!h.names().includes('billing_record_send'))
  assert.equal(summary.skipped, 2)
})

test('a held month and a capped month are counted and not sent', async () => {
  const h = harness({
    billing_due_items: () => [{ item_id: ITEM, step: 'issue' }, { item_id: ITEM_2, step: 'issue' }],
    billing_run_item: (args) => (args.p_item_id === ITEM ? { state: 'held', codes: ['COMPANY_VAT_NUMBER_MISSING'], invoice_id: null } : { state: 'capped', codes: [], invoice_id: null }),
  })
  const summary = await runBilling(h.deps)
  assert.equal(h.sent.length, 0)
  assert.equal(summary.held, 1)
  assert.equal(summary.capped, 1)
})

test('a send that throws records MAIL_REJECTED, a missing-env error records NOT_CONFIGURED, and the run continues with the next item', async () => {
  class MissingEnvError extends Error {
    constructor() {
      super('Environment variable GRAPH_TENANT_ID is not set.')
      this.name = 'MissingEnvError'
    }
  }
  let n = 0
  const h = harness(
    {
      billing_due_items: () => [{ item_id: ITEM, step: 'send' }, { item_id: ITEM_2, step: 'send' }],
      billing_send_context: () => READY,
      billing_record_send_failure: () => ({ attempts: 1, gave_up: false }),
    },
    { send: async () => { n += 1; throw n === 1 ? new Error('graph said no') : new MissingEnvError() } },
  )
  const summary = await runBilling(h.deps)
  const failures = h.calls.filter((call) => call.name === 'billing_record_send_failure')
  assert.deepEqual(failures.map((call) => call.args), [{ p_item_id: ITEM, p_code: 'MAIL_REJECTED' }, { p_item_id: ITEM_2, p_code: 'NOT_CONFIGURED' }])
  assert.ok(!h.names().includes('billing_record_send'))
  assert.equal(summary.failed, 2)
})

test('a prepare error records its code and sends nothing', async () => {
  const h = harness(
    { billing_due_items: () => [{ item_id: ITEM, step: 'send' }], billing_send_context: () => READY, billing_record_send_failure: () => ({ attempts: 1, gave_up: false }) },
    { prepare: async () => ({ error: 'PDF_FAILED' }) },
  )
  const summary = await runBilling(h.deps)
  assert.deepEqual(h.calls.find((call) => call.name === 'billing_record_send_failure')?.args, { p_item_id: ITEM, p_code: 'PDF_FAILED' })
  assert.equal(h.sent.length, 0)
  assert.equal(summary.failed, 1)
})

test('a context without an address is recorded as NO_ADDRESS without preparing anything', async () => {
  let prepared = 0
  const h = harness(
    { billing_due_items: () => [{ item_id: ITEM, step: 'send' }], billing_send_context: () => ({ ...READY, to: null }), billing_record_send_failure: () => ({ attempts: 1, gave_up: false }) },
    { prepare: async () => { prepared += 1; return { error: 'PDF_FAILED' } } },
  )
  await runBilling(h.deps)
  assert.equal(prepared, 0)
  assert.deepEqual(h.calls.find((call) => call.name === 'billing_record_send_failure')?.args, { p_item_id: ITEM, p_code: 'NO_ADDRESS' })
})

test('log mode records nothing and counts logged', async () => {
  const h = harness(
    { billing_due_items: () => [{ item_id: ITEM, step: 'send' }], billing_send_context: () => READY },
    { send: async () => ({ delivered: false }) },
  )
  const summary = await runBilling(h.deps)
  assert.ok(!h.names().includes('billing_record_send'))
  assert.ok(!h.names().includes('billing_record_send_failure'))
  assert.equal(summary.logged, 1)
  assert.equal(summary.sent, 0)
})

test('a record failure is counted failed, the message is not sent again, and the run goes on', async () => {
  const h = harness({
    billing_due_items: () => [{ item_id: ITEM, step: 'send' }, { item_id: ITEM_2, step: 'send' }],
    billing_send_context: () => READY,
    billing_record_send: (args) => (args.p_item_id === ITEM ? { data: null, error: { code: 'XX000', message: 'boom with client@example.test' } } : 'email-id'),
  })
  const summary = await runBilling(h.deps)
  assert.equal(h.sent.length, 2, 'one message per item, never a second for the first')
  assert.equal(summary.failed, 1)
  assert.equal(summary.sent, 1)
})

test('one item failing in the database does not stop the others', async () => {
  const h = harness({
    billing_due_items: () => [{ item_id: ITEM, step: 'issue' }, { item_id: ITEM_2, step: 'issue' }],
    billing_run_item: (args) => (args.p_item_id === ITEM ? { data: null, error: { code: '40001', message: 'serialization' } } : { state: 'held', codes: ['NO_LINES'], invoice_id: null }),
  })
  const summary = await runBilling(h.deps)
  assert.equal(summary.failed, 1)
  assert.equal(summary.held, 1)
})

test('a list that cannot be read stops the run with an error that names no data', async () => {
  const h = harness({ billing_due_items: () => ({ data: null, error: { code: '42501', message: 'permission denied for client@example.test' } }) })
  await assert.rejects(() => runBilling(h.deps), (error: unknown) => {
    assert.doesNotMatch(String((error as Error).message), /client@example\.test/)
    assert.match(String((error as Error).message), /42501/)
    return true
  })
})

test('the summary holds counts only, no address and no invoice number', async () => {
  const h = harness({
    billing_due_items: () => [{ item_id: ITEM, step: 'send' }],
    billing_send_context: () => READY,
    billing_record_send: () => 'email-id',
  })
  const summary = await runBilling(h.deps)
  assert.deepEqual(Object.keys(summary).sort(), ['capped', 'failed', 'held', 'issued', 'logged', 'notices', 'reminders', 'sent', 'skipped'])
  for (const value of Object.values(summary)) assert.equal(typeof value, 'number')
})

test('pending notice emails are sent and marked; one that fails is counted as an attempt', async () => {
  let n = 0
  const seen: any[] = []
  const h = harness(
    {
      billing_due_items: () => [],
      billing_pending_notice_emails: () => [
        { id: 'n1', to_address: 'a@example.test', subject: 'S1', body: 'B1', quote_id: 'q1' },
        { id: 'n2', to_address: 'b@example.test', subject: 'S2', body: 'B2' },
      ],
      billing_mark_notice_email: () => null,
    },
    { sendNotice: async (notice) => { n += 1; seen.push(notice); if (n === 2) throw new Error('nope'); return { delivered: true } } },
  )
  const summary = await runBilling(h.deps)
  const marks = h.calls.filter((call) => call.name === 'billing_mark_notice_email').map((call) => call.args)
  assert.deepEqual(marks, [{ p_id: 'n1', p_sent: true }, { p_id: 'n2', p_sent: false }])
  assert.equal(summary.notices, 1)
  assert.deepEqual(seen[0], { id: 'n1', to: 'a@example.test', subject: 'S1', body: 'B1', quoteId: 'q1' })
  assert.equal(seen[1].quoteId, null, 'a notice with no quote has none')
})

test('a second run over the same state sends nothing new', async () => {
  let issued = false
  let recorded = false
  const h = harness({
    billing_due_items: () => (recorded ? [] : issued ? [{ item_id: ITEM, step: 'send' }] : [{ item_id: ITEM, step: 'issue' }]),
    billing_run_item: () => { issued = true; return { state: 'issued', codes: [], invoice_id: INVOICE } },
    billing_send_context: () => READY,
    billing_record_send: () => { recorded = true; return 'email-id' },
  })
  await runBilling(h.deps)
  await runBilling(h.deps)
  assert.equal(h.sent.length, 1)
})

test('payment reminders run after the notices, with the same database and mail server', async () => {
  const h = harness(
    {
      billing_due_items: () => [],
      billing_reminder_candidates: () => [{ invoice_id: INVOICE, sequence: 1 }],
      billing_reminder_claim: () => ({ state: 'ready', invoice_id: INVOICE, sequence: 1, to: 'client@example.test', reply_to: 'owner@example.test', sender_name: 'Olive', number: 'HMK-I-1', balance: 1725, currency: 'ZAR', due_date: '2027-01-02', month_number: 2 }),
      billing_reminder_record: () => 'row-id',
    },
    {
      prepareReminder: async ({ context }) => ({
        message: { to: context.to as string, replyTo: context.reply_to ?? undefined, subject: 'Reminder', text: 'text', html: '<p>h</p>' },
        attachment: { filename: 'invoice.pdf', bytes: new Uint8Array([1, 2, 3]) },
        sha256: 'd'.repeat(64),
      }),
    },
  )
  const summary = await runBilling(h.deps)
  assert.deepEqual(h.names(), ['billing_due_items', 'billing_pending_notice_emails', 'billing_reminder_candidates', 'billing_reminder_claim', 'billing_reminder_record'])
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].subject, 'Reminder')
  assert.equal(summary.reminders, 1)
})

test('a reminders step that cannot read its list stops the run after the months and notices were done', async () => {
  const h = harness({
    billing_due_items: () => [{ item_id: ITEM, step: 'send' }],
    billing_send_context: () => READY,
    billing_record_send: () => 'email-id',
    billing_reminder_candidates: () => ({ data: null, error: { code: '42883', message: 'function does not exist' } }),
  })
  await assert.rejects(() => runBilling(h.deps), /billing_reminder_candidates failed \(42883\)/)
  assert.equal(h.sent.length, 1, 'the month was still sent before the reminders step failed')
})
