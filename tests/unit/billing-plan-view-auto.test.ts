import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BILLING_PLAN_COPY,
  billingPlanDescription,
  describePlanItem,
  type PlanItemFacts,
  type PlanItemInvoice,
} from '../../features/documents/billing-plan-view.ts'

// Accept to invoice, stage 2, task 7: what the plan panel says about a month once automatic sending is on, and what a month the
// runner is holding says. With automatic sending off every Stage 1 label is unchanged (billing-plan-view.test.ts pins those).

const TODAY = '2026-12-03'
const monthly = (overrides: Partial<PlanItemFacts> = {}): PlanItemFacts => ({ kind: 'monthly', monthNumber: 2, billOn: '2027-01-15', status: 'open', approvedAt: null, ...overrides })
const invoice = (status: string, number = 'HMK-I-2026-00007'): PlanItemInvoice => ({ id: '00000000-0000-4000-8000-000000000001', number, status })
const on = (extra: { attention?: { code: 'CHECKS_FAILED' | 'CATCH_UP' | 'EMAIL_FAILED'; detail: string | null } | null; systemIssued?: boolean } = {}) =>
  ({ enabled: true, attention: null, systemIssued: false, ...extra })
const off = { enabled: false, attention: null, systemIssued: false }

test('with automatic sending on, a month that is not due yet says when it will be issued and emailed', () => {
  assert.deepEqual(describePlanItem(monthly(), null, TODAY, 'active', true, on()), { label: 'Will be issued and emailed on 15 January 2027', tone: 'muted' })
})

test('with it on, a due month with no invoice is being issued automatically, unless the first invoice is not approved', () => {
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-12-03' }), null, TODAY, 'active', true, on()), { label: 'Due: being issued automatically', tone: 'waiting' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-12-02' }), null, TODAY, 'active', true, on()), { label: 'Due: being issued automatically', tone: 'waiting' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-12-03' }), null, TODAY, 'active', false, on()), { label: 'Waiting for the first invoice to be approved', tone: 'waiting' })
})

test('an invoice the system issued says so', () => {
  assert.deepEqual(describePlanItem(monthly(), invoice('Issued'), TODAY, 'active', true, on({ systemIssued: true })), { label: 'Issued automatically: HMK-I-2026-00007', tone: 'done' })
  assert.deepEqual(describePlanItem(monthly(), invoice('Issued'), TODAY, 'active', true, on({ systemIssued: false })), { label: 'Invoiced: HMK-I-2026-00007, Issued', tone: 'done' }, 'one a person issued is not called automatic')
  assert.deepEqual(describePlanItem(monthly(), invoice('Overdue'), TODAY, 'active', true, on({ systemIssued: true })), { label: 'Invoiced: HMK-I-2026-00007, Overdue', tone: 'done' })
})

test('a month held for a check says why, and a failed email says the invoice is issued but not sent', () => {
  assert.deepEqual(
    describePlanItem(monthly({ billOn: '2026-12-01' }), invoice('Draft'), TODAY, 'active', true, on({ attention: { code: 'CATCH_UP', detail: null } })),
    { label: 'Held for your check: more than one month is due. Issue and email it yourself.', tone: 'attention' },
  )
  assert.deepEqual(
    describePlanItem(monthly({ billOn: '2026-12-01' }), invoice('Draft'), TODAY, 'active', true, on({ attention: { code: 'CHECKS_FAILED', detail: 'CLIENT_ADDRESS_MISSING,NO_LINES' } })),
    { label: 'Held: The client has no address. Add the first address line to the client.', tone: 'attention' },
  )
  assert.deepEqual(
    describePlanItem(monthly({ billOn: '2026-12-01' }), invoice('Draft'), TODAY, 'active', true, on({ attention: { code: 'CHECKS_FAILED', detail: 'INVOICE_DUE_BEFORE_ISSUE' } })),
    { label: 'Held: Something on this invoice needs attention.', tone: 'attention' },
    'a code the panel has no sentence for falls back to the general one',
  )
  assert.deepEqual(
    describePlanItem(monthly(), invoice('Issued'), TODAY, 'active', true, on({ systemIssued: true, attention: { code: 'EMAIL_FAILED', detail: 'MAIL_REJECTED' } })),
    { label: 'Issued, email not sent. Send it from the invoice.', tone: 'attention' },
  )
})

test('a cancelled month is still just Cancelled, whatever the runner thinks', () => {
  assert.deepEqual(describePlanItem(monthly({ status: 'cancelled' }), null, TODAY, 'active', true, on({ attention: { code: 'CATCH_UP', detail: null } })), { label: 'Cancelled', tone: 'muted' })
})

test('with automatic sending off every label is as it was, attention or not', () => {
  assert.deepEqual(describePlanItem(monthly(), null, TODAY, 'active', true, off), { label: 'Scheduled for 15 January 2027', tone: 'muted' })
  assert.deepEqual(describePlanItem(monthly({ billOn: '2026-12-01' }), null, TODAY, 'active', true, off), { label: "Due: create this month's invoice", tone: 'attention' })
  assert.deepEqual(describePlanItem(monthly(), invoice('Issued'), TODAY, 'active', true, { ...off, systemIssued: true }), { label: 'Invoiced: HMK-I-2026-00007, Issued', tone: 'done' })
  assert.deepEqual(describePlanItem(monthly(), invoice('Draft'), TODAY, 'active', true, { ...off, attention: { code: 'CATCH_UP', detail: null } }), { label: 'Draft invoice', tone: 'waiting' })
  assert.deepEqual(describePlanItem(monthly(), null, TODAY), { label: 'Scheduled for 15 January 2027', tone: 'muted' }, 'the argument is optional')
})

test('the description says later months are automatic only when automatic sending is on', () => {
  const items = [{ kind: 'first' as const }, { kind: 'monthly' as const }]
  assert.match(billingPlanDescription(items), /none is sent automatically yet/)
  assert.equal(billingPlanDescription(items, true), `${BILLING_PLAN_COPY.descriptionFirstInvoice} Later months are issued and emailed automatically.`)
  assert.equal(billingPlanDescription([{ kind: 'first' }], true), BILLING_PLAN_COPY.descriptionFirstInvoice, 'a once-off plan has no later months')
})

test('no label says paid, overdue or reminder for a system-issued month that is not', () => {
  for (const status of ['Issued']) {
    const { label } = describePlanItem(monthly(), invoice(status), TODAY, 'active', true, on({ systemIssued: true }))
    assert.doesNotMatch(label, /\b(paid|reminder)\b/i)
  }
})
