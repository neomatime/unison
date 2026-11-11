import assert from 'node:assert/strict'
import test from 'node:test'

import { reminderEmail } from '../../features/documents/billing-reminder-copy.ts'
import type { DocumentView } from '../../features/documents/document-view.ts'

// Accept to invoice, stage 3, task 4: the wording of the payment reminder email. Client-facing, drafted for the owner's approval.
// One wording for all five: friendly and short. Escalation is the owner's, by the follow-up task after the fifth.

const view = (overrides: Partial<DocumentView> = {}): DocumentView =>
  ({
    kind: 'invoice',
    number: 'HMK-I-2026-00007',
    currency: 'ZAR',
    from: { name: 'HIMARK (Pty) Ltd', lines: [], vatNumber: null },
    bank: [{ label: 'Bank', value: 'Fixture Bank' }, { label: 'Account Number', value: '62000000001' }, { label: 'Branch Code', value: '250655' }],
    ...overrides,
  }) as DocumentView

const input = { sequence: 1, total: 5, balance: '1,725.00', currency: 'ZAR', dueDateLabel: '2 January 2027', senderName: 'Olive Owner' }

test('the subject names the invoice and the company', () => {
  assert.equal(reminderEmail(view(), input).subject, 'Reminder: invoice HMK-I-2026-00007 from HIMARK (Pty) Ltd')
})

test('the text has the invoice number, the balance owing, the due date, the bank details and the payment reference', () => {
  const { text } = reminderEmail(view(), input)
  assert.match(text, /invoice HMK-I-2026-00007/)
  assert.match(text, /ZAR 1,725\.00 is still owing/)
  assert.match(text, /due on 2 January 2027/)
  for (const detail of ['Fixture Bank', '62000000001', '250655']) assert.ok(text.includes(detail), detail)
  assert.match(text, /Please use HMK-I-2026-00007 as your payment reference/)
  assert.match(text, /If you have already paid, please let us know and ignore this message/)
  assert.match(text, /Kind regards,\nOlive Owner\nHIMARK \(Pty\) Ltd$/)
})

test('the due date is left out rather than printed blank', () => {
  assert.doesNotMatch(reminderEmail(view(), { ...input, dueDateLabel: null }).text, /due on/)
})

test('all five reminders say the same thing: no sequence, no escalation', () => {
  const first = reminderEmail(view(), { ...input, sequence: 1 })
  for (const sequence of [2, 3, 4, 5]) {
    const later = reminderEmail(view(), { ...input, sequence })
    assert.equal(later.text, first.text)
    assert.equal(later.subject, first.subject)
  }
  const { text, html, subject } = first
  for (const value of [text, html, subject]) assert.doesNotMatch(value, /\b(final|last|urgent|overdue|legal|demand|action)\b|\d of \d|reminder \d/i)
})

test('it never says paid except in the already-paid sentence', () => {
  const { text } = reminderEmail(view(), input)
  const rest = text.replace('If you have already paid, please let us know and ignore this message.', '')
  assert.doesNotMatch(rest, /\bpaid\b/i)
})

test('the company name is printed once in the sign-off when the company is the sender', () => {
  const { text } = reminderEmail(view(), { ...input, senderName: 'HIMARK (Pty) Ltd' })
  assert.ok(text.endsWith('Kind regards,\nHIMARK (Pty) Ltd'))
})

test('the HTML escapes markup in names', () => {
  const { html } = reminderEmail(view({ from: { name: 'A <b>&</b> Co', lines: [], vatNumber: null } }), { ...input, senderName: 'Olive <Owner>' })
  assert.doesNotMatch(html, /<b>&<\/b>/)
  assert.match(html, /A &lt;b&gt;&amp;&lt;\/b&gt; Co/)
  assert.match(html, /Olive &lt;Owner&gt;/)
})

test('a view without a number is refused', () => {
  assert.throws(() => reminderEmail(view({ number: null }), input), /number/i)
})
