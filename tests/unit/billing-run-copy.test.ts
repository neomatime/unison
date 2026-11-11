import assert from 'node:assert/strict'
import test from 'node:test'

import type { DocumentView } from '../../features/documents/document-view.ts'
import { monthlyInvoiceEmail } from '../../features/documents/billing-run-copy.ts'

// Accept to invoice, stage 2, task 5: the wording of the monthly invoice email. Client-facing, drafted for the owner's approval.

const view = (overrides: Partial<DocumentView> = {}): DocumentView =>
  ({
    kind: 'invoice',
    title: 'INVOICE',
    draft: false,
    number: 'HMK-I-2026-00007',
    currency: 'ZAR',
    totals: { subtotal: '1,500.00', vatLabel: 'VAT 15%', vat: '225.00', total: '1,725.00' },
    details: [{ label: 'Issue date', value: '3 December 2026' }, { label: 'Due date', value: '2 January 2027' }, { label: 'Currency', value: 'ZAR' }],
    from: { name: 'HIMARK (Pty) Ltd', lines: [], vatNumber: null },
    bank: [{ label: 'Bank', value: 'Fixture Bank' }, { label: 'Account name', value: 'HIMARK (Pty) Ltd' }, { label: 'Account number', value: '62000000001' }, { label: 'Branch code', value: '250655' }],
    ...overrides,
  }) as DocumentView

test('the subject names the invoice and the company', () => {
  const email = monthlyInvoiceEmail(view(), { monthNumber: 3, termMonths: 12, senderName: 'Olive Owner' })
  assert.equal(email.subject, 'Invoice HMK-I-2026-00007 from HIMARK (Pty) Ltd')
})

test('the text says which month of how many, the total, the due date, the bank details and the payment reference', () => {
  const { text } = monthlyInvoiceEmail(view(), { monthNumber: 3, termMonths: 12, senderName: 'Olive Owner' })
  assert.match(text, /month 3 of 12/i)
  assert.match(text, /ZAR 1,725\.00/)
  assert.match(text, /2 January 2027/)
  for (const detail of ['Fixture Bank', 'HIMARK (Pty) Ltd', '62000000001', '250655']) assert.ok(text.includes(detail), detail)
  assert.match(text, /Please use HMK-I-2026-00007 as your payment reference/)
  assert.match(text, /Olive Owner/)
  assert.match(text, /Kind regards/)
})

test('without a term the month line says only the month', () => {
  const { text } = monthlyInvoiceEmail(view(), { monthNumber: 2, termMonths: null, senderName: 'Olive Owner' })
  assert.match(text, /month 2/i)
  assert.doesNotMatch(text, /month 2 of \d/i)
})

test('without a due date the line is left out rather than printing a blank', () => {
  const { text } = monthlyInvoiceEmail(view({ details: [{ label: 'Issue date', value: '3 December 2026' }] }), { monthNumber: 2, termMonths: 12, senderName: 'Olive' })
  assert.doesNotMatch(text, /due on/i)
})

test('it never says paid, overdue or reminder', () => {
  const { text, html, subject } = monthlyInvoiceEmail(view(), { monthNumber: 3, termMonths: 12, senderName: 'Olive Owner' })
  for (const value of [text, html, subject]) assert.doesNotMatch(value, /\b(paid|overdue|reminder)\b/i)
})

test('the HTML escapes names with markup characters and carries the same facts', () => {
  const { html } = monthlyInvoiceEmail(view({ from: { name: 'A <b>&</b> Co', lines: [], vatNumber: null } }), { monthNumber: 3, termMonths: 12, senderName: 'Olive <Owner>' })
  assert.doesNotMatch(html, /<b>&<\/b>/)
  assert.match(html, /A &lt;b&gt;&amp;&lt;\/b&gt; Co/)
  assert.match(html, /Olive &lt;Owner&gt;/)
  assert.match(html, /HMK-I-2026-00007/)
  assert.match(html, /ZAR 1,725\.00/)
})

test('a view without a number is refused', () => {
  assert.throws(() => monthlyInvoiceEmail(view({ number: null }), { monthNumber: 3, termMonths: 12, senderName: 'Olive' }), /number/i)
})

test('when the sender is the company itself its name is not printed twice', () => {
  const { text } = monthlyInvoiceEmail(view(), { monthNumber: 3, termMonths: 12, senderName: 'HIMARK (Pty) Ltd' })
  assert.equal(text.split('HIMARK (Pty) Ltd').length - 1, 2, 'once in the bank details and once in the sign-off')
  assert.ok(text.endsWith('Kind regards,\nHIMARK (Pty) Ltd'), 'the sign-off is the company once')
})
