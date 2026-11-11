import assert from 'node:assert/strict'
import test from 'node:test'

import { noticeEmail } from '../../features/billing-runner/notices.ts'

// Accept to invoice, stage 2, task 6: the wording of a billing notice email. Staff-facing, plain text first.

const input = { subject: 'Month 2 for Portal Client needs your attention', body: 'Month 2 of the billing plan for quotation HMK-Q-2026-00001 is waiting.', appUrl: 'https://unison.example.test', quotePath: '/commercial/quotes/abc' }

test('the subject and body are kept and a link to the quote is added', () => {
  const email = noticeEmail(input)
  assert.equal(email.subject, input.subject)
  assert.ok(email.text.startsWith(input.body))
  assert.match(email.text, /Open it in UNISON: https:\/\/unison\.example\.test\/commercial\/quotes\/abc$/)
  assert.match(email.html, /https:\/\/unison\.example\.test\/commercial\/quotes\/abc/)
})

test('a trailing slash on the app address does not double up', () => {
  assert.match(noticeEmail({ ...input, appUrl: 'https://unison.example.test/' }).text, /test\/commercial\/quotes\/abc$/)
  assert.doesNotMatch(noticeEmail({ ...input, appUrl: 'https://unison.example.test/' }).text, /\.test\/\//)
})

test('without a quote there is no link line', () => {
  const email = noticeEmail({ ...input, quotePath: null })
  assert.doesNotMatch(email.text, /Open it in UNISON/)
  assert.equal(email.text, input.body)
})

test('the HTML escapes markup in the body', () => {
  const email = noticeEmail({ ...input, body: 'A <script>alert(1)</script> & B' })
  assert.doesNotMatch(email.html, /<script>/)
  assert.match(email.html, /&lt;script&gt;/)
  assert.match(email.html, /&amp; B/)
})

test('it never says paid', () => {
  const email = noticeEmail(input)
  assert.doesNotMatch(email.text + email.html + email.subject, /\bpaid\b/i)
})
