import assert from 'node:assert/strict'
import test from 'node:test'

import { describeReadiness, type ReadinessFacts } from '../../features/documents/billing-readiness-view.ts'

// Accept to invoice, stage 4, task 4: what the quote page says about whether the work may start (spec section 8). Pure. The rule itself
// lives in one database function (billing_readiness); this only words its answer.

const facts = (overrides: Partial<ReadinessFacts> = {}): ReadinessFacts => ({
  state: 'ready',
  startDate: '2027-01-15',
  firstInvoice: { number: 'HMK-I-2026-00007', status: 'Paid', balance: 0, currency: 'ZAR' },
  override: null,
  ...overrides,
})

test('ready: the start date has arrived and the first invoice is paid', () => {
  assert.deepEqual(describeReadiness(facts()), { line: 'The work may start: the start date has arrived and the first invoice is paid.', tone: 'done' })
})

test('waiting for the start date names the date', () => {
  assert.deepEqual(describeReadiness(facts({ state: 'waiting_start' })), { line: 'Waiting for the start date, 15 January 2027.', tone: 'waiting' })
})

test('waiting for payment names the invoice and what is owing', () => {
  const owing = { number: 'HMK-I-2026-00007', status: 'Issued', balance: 11500, currency: 'ZAR' }
  assert.deepEqual(describeReadiness(facts({ state: 'waiting_payment', firstInvoice: owing })), {
    line: 'Waiting for the first invoice to be paid: HMK-I-2026-00007, ZAR 11,500.00 owing.',
    tone: 'attention',
  })
  assert.match(describeReadiness(facts({ state: 'waiting_payment', firstInvoice: { ...owing, status: 'Partially Paid', balance: 250.5 } }))!.line, /ZAR 250\.50 owing/)
})

test('waiting for payment with no invoice, a draft or a cancelled one says the invoice is not out yet, never "owing"', () => {
  const line = 'Waiting for the first invoice to be approved and paid.'
  assert.deepEqual(describeReadiness(facts({ state: 'waiting_payment', firstInvoice: null })), { line, tone: 'attention' })
  assert.deepEqual(describeReadiness(facts({ state: 'waiting_payment', firstInvoice: { number: 'DRAFT-1', status: 'Draft', balance: 0, currency: 'ZAR' } })), { line, tone: 'attention' })
  assert.deepEqual(describeReadiness(facts({ state: 'waiting_payment', firstInvoice: { number: 'HMK-I-1', status: 'Cancelled', balance: 0, currency: 'ZAR' } })), { line, tone: 'attention' })
})

test('overridden names who decided and why, or "somebody" when there is no name', () => {
  assert.deepEqual(describeReadiness(facts({ state: 'overridden', override: { byName: 'Olive Owner', reason: 'Deposit agreed by phone' } })), {
    line: 'Started by decision of Olive Owner: Deposit agreed by phone',
    tone: 'done',
  })
  assert.equal(describeReadiness(facts({ state: 'overridden', override: { byName: null, reason: 'Agreed' } }))!.line, 'Started by decision of somebody: Agreed')
})

test('an ended plan says nothing will start from it, quietly', () => {
  assert.deepEqual(describeReadiness(facts({ state: 'ended' })), { line: 'The billing plan has ended, so nothing will start from it.', tone: 'muted' })
})

test('no plan renders nothing', () => {
  assert.equal(describeReadiness(facts({ state: 'no_plan' })), null)
})

test('a date that cannot be read is shown as it is rather than hidden', () => {
  assert.match(describeReadiness(facts({ state: 'waiting_start', startDate: 'soon' }))!.line, /soon/)
  assert.equal(describeReadiness(facts({ state: 'waiting_start', startDate: null }))!.line, 'Waiting for the start date.')
})

test('no line says completed, synced or handed off, and paid appears only for a paid first invoice', () => {
  for (const state of ['waiting_start', 'waiting_payment', 'overridden', 'ready', 'ended'] as const) {
    const line = describeReadiness(facts({ state, override: { byName: 'A', reason: 'R' } }))!.line
    assert.doesNotMatch(line, /completed|synced|handed off/i)
  }
  assert.doesNotMatch(describeReadiness(facts({ state: 'waiting_start' }))!.line, /paid/i)
})
