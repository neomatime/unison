import assert from 'node:assert/strict'
import test from 'node:test'

import { outstandingOnPlan, owingLabel, type PlanItemInvoice } from '../../features/documents/billing-plan-view.ts'

// Accept to invoice, stage 3, task 5: the amount outstanding on a plan, shown per month and as a total on the quote's plan panel
// (spec section 7). It comes from the invoices' balances, which come from recorded payments: nothing here marks anything paid.

const invoice = (status: string, balance: number, currency = 'ZAR'): PlanItemInvoice => ({ id: '00000000-0000-4000-8000-000000000001', number: 'HMK-I-1', status, balance, currency })

test('an invoice that is still owed gets its balance after its label', () => {
  for (const status of ['Issued', 'Partially Paid', 'Overdue']) {
    assert.equal(owingLabel('Invoiced: HMK-I-1, Issued', invoice(status, 1725)), 'Invoiced: HMK-I-1, Issued, ZAR 1,725.00 owing', status)
  }
  assert.equal(owingLabel('Invoiced: HMK-I-1, Partially Paid', invoice('Partially Paid', 500.5)), 'Invoiced: HMK-I-1, Partially Paid, ZAR 500.50 owing')
})

test('a label is left alone when nothing is owing or the month has no invoice', () => {
  assert.equal(owingLabel('Paid', invoice('Paid', 0)), 'Paid')
  assert.equal(owingLabel('Draft invoice', invoice('Draft', 1725)), 'Draft invoice')
  assert.equal(owingLabel('Invoice HMK-I-1 cancelled', invoice('Cancelled', 0)), 'Invoice HMK-I-1 cancelled')
  assert.equal(owingLabel('Invoiced: HMK-I-1, Issued', invoice('Issued', 0)), 'Invoiced: HMK-I-1, Issued', 'a zero balance owes nothing')
  assert.equal(owingLabel('Scheduled', null), 'Scheduled')
  assert.equal(owingLabel('Invoiced: x', { id: 'a', number: 'x', status: 'Issued' }), 'Invoiced: x', 'an invoice whose balance was not read says nothing')
})

test('the outstanding total adds the balances of the invoices still owed, in the plan currency', () => {
  const items = [
    { invoice: invoice('Paid', 0) },
    { invoice: invoice('Overdue', 1725) },
    { invoice: invoice('Issued', 1725) },
    { invoice: invoice('Partially Paid', 100.25) },
    { invoice: invoice('Draft', 1725) },
    { invoice: invoice('Cancelled', 0) },
    { invoice: null },
  ]
  assert.deepEqual(outstandingOnPlan(items), { currency: 'ZAR', amount: 3550.25, label: 'ZAR 3,550.25' })
})

test('nothing outstanding gives null, so the panel shows no line', () => {
  assert.equal(outstandingOnPlan([{ invoice: invoice('Paid', 0) }, { invoice: null }]), null)
  assert.equal(outstandingOnPlan([]), null)
})

test('pennies add up exactly', () => {
  const items = [0.1, 0.2, 0.7].map((balance) => ({ invoice: invoice('Issued', balance) }))
  assert.equal(outstandingOnPlan(items)?.amount, 1)
})

test('invoices in different currencies are not added together', () => {
  assert.equal(outstandingOnPlan([{ invoice: invoice('Issued', 10, 'ZAR') }, { invoice: invoice('Issued', 10, 'USD') }]), null)
})

test('no wording says an invoice is paid', () => {
  const text = owingLabel('Invoiced: x', invoice('Overdue', 10)) + (outstandingOnPlan([{ invoice: invoice('Overdue', 10) }])?.label ?? '')
  assert.doesNotMatch(text, /\bpaid\b/i)
})
