import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDocumentView } from '../../features/documents/document-view.ts'
import {
  BODY_MAX, HOURLY_EMAIL_CAP, MAX_EMAIL_PDF_BYTES, SUBJECT_MAX,
  defaultEmailMessage, defaultEmailSubject, emailHtml, isValidEmailAddress, readEmailFields,
} from '../../features/documents/email.ts'

const form = (values: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
const sentQuote = (issuer: Record<string, unknown> | null = { legal_name: 'Test Co (Pty) Ltd', quote_closing_text: 'Thanks for considering us.\nReply to accept.' }) =>
  buildDocumentView({
    kind: 'quote',
    record: { quote_number: 'TST-Q-2026-00001', status: 'Sent', currency: 'ZAR', total_amount: 1234.5, subtotal: 1073.48, tax_amount: 161.02, client_name: 'Test Client', bill_to: { name: 'Test Client' }, issuer },
    lines: [], client: null, settings: null,
  })

test('the limits are the ones the spec names', () => {
  assert.equal(HOURLY_EMAIL_CAP, 50)
  assert.equal(SUBJECT_MAX, 300)
  assert.equal(BODY_MAX, 10000)
  assert.equal(MAX_EMAIL_PDF_BYTES, 2_000_000)
})

test('one plain ASCII address is valid and nothing else is', () => {
  for (const good of ['a@example.com', 'first.last+tag@sub.example.co.za', "o'neil@example.com", 'A_B-c@Example.COM', '  padded@example.com  ']) assert.equal(isValidEmailAddress(good), true, good)
  for (const bad of [
    '', '   ', 'not-an-address', 'a@b', 'a@b.c', '@example.com', 'a@.example.com', 'a@example..com', 'a..b@example.com', '.a@example.com', 'a.@example.com',
    'a@b.com, c@d.com', 'a@b.com;c@d.com', 'Name <a@b.com>', '"Name" a@b.com', 'a b@example.com', 'a@b.com\r\nBcc: x@y.com', 'a@b.com\nBcc: x@y.com',
    'ä@example.com', 'a@exämple.com', `${'a'.repeat(250)}@example.com`,
  ]) assert.equal(isValidEmailAddress(bad), false, JSON.stringify(bad))
  assert.equal(isValidEmailAddress(undefined), false)
  assert.equal(isValidEmailAddress(42), false)
})

test('readEmailFields reads, trims and flattens the subject to one line', () => {
  assert.deepEqual(readEmailFields(form({ to: ' a@example.com ', subject: ' Quote\r\nBcc: x@y.com ', body: 'Hi\r\nthere ' })), { to: 'a@example.com', subject: 'Quote Bcc: x@y.com', body: 'Hi\nthere' })
})

test('readEmailFields refuses a bad address, an empty or long subject and a long message with a plain message', () => {
  assert.deepEqual(readEmailFields(form({ to: 'a@b.com, c@d.com', subject: 's', body: '' })), { error: 'Enter one valid email address.' })
  assert.deepEqual(readEmailFields(form({ to: 'Name <a@b.com>', subject: 's', body: '' })), { error: 'Enter one valid email address.' })
  assert.deepEqual(readEmailFields(form({ to: 'a@example.com', subject: '  ', body: '' })), { error: 'Enter a subject.' })
  assert.match((readEmailFields(form({ to: 'a@example.com', subject: 'x'.repeat(301), body: '' })) as { error: string }).error, /too long/)
  assert.match((readEmailFields(form({ to: 'a@example.com', subject: 's', body: 'x'.repeat(10001) })) as { error: string }).error, /too long/)
  assert.ok(!('error' in readEmailFields(form({ to: 'a@example.com', subject: 'x'.repeat(300), body: 'x'.repeat(10000) }))))
  assert.deepEqual(readEmailFields(new FormData()), { error: 'Enter one valid email address.' })
})

test('readEmailFields drops control characters other than newline and tab, and repairs lone surrogates', () => {
  const fields = readEmailFields(form({ to: 'a@example.com', subject: 'Quote\u0000 12\u0007\u001b3\ttab', body: 'Hi\u0000 there\u0008\tindented\nsecond\u000b line\r\nthird\rfourth' })) as { subject: string; body: string }
  assert.equal(fields.subject, 'Quote 123\ttab')
  assert.equal(fields.body, 'Hi there\tindented\nsecond line\nthirdfourth')
  assert.ok(!/[\u0000-\u0008\u000b-\u001f]/.test(fields.subject + fields.body.replace(/\n/g, '')))

  const broken = readEmailFields(form({ to: 'a@example.com', subject: 'Lone \ud800 surrogate', body: 'Also \udc00 here' })) as { subject: string; body: string }
  assert.equal(broken.subject, 'Lone � surrogate')
  assert.equal(broken.body, 'Also � here')
  assert.equal(broken.subject.isWellFormed(), true)
  assert.equal(broken.body.isWellFormed(), true)
  const valid = readEmailFields(form({ to: 'a@example.com', subject: 'Fine é 😀', body: '' })) as { subject: string }
  assert.equal(valid.subject, 'Fine é 😀', 'valid characters and pairs are untouched')
})

test('a subject that is only control characters counts as empty', () => {
  assert.deepEqual(readEmailFields(form({ to: 'a@example.com', subject: '\u0000\u0001 ', body: '' })), { error: 'Enter a subject.' })
})

test('the default subject names the document and the company', () => {
  assert.equal(defaultEmailSubject(sentQuote()), 'Quote TST-Q-2026-00001 from Test Co (Pty) Ltd')
  assert.equal(defaultEmailSubject(sentQuote(null)), 'Quote TST-Q-2026-00001')
})

test('the default message has the total, the closing text and the sender', () => {
  const message = defaultEmailMessage(sentQuote(), 'Sam Sender')
  assert.match(message, /^Hello,\n\nPlease find attached quote TST-Q-2026-00001 for ZAR 1,234\.50\./)
  assert.match(message, /Thanks for considering us\.\nReply to accept\./)
  assert.match(message, /Kind regards,\nSam Sender\nTest Co \(Pty\) Ltd$/)
  assert.doesNotMatch(defaultEmailMessage(sentQuote(null), 'Sam Sender'), /undefined|null/)
})

test('the html body is the same text, escaped, in paragraphs', () => {
  const html = emailHtml('Hello <b>there</b> & "friends"\nsecond line\n\nNew paragraph <script>alert(1)</script>')
  assert.ok(!html.includes('<script>') && !html.includes('<b>'))
  assert.match(html, /Hello &lt;b&gt;there&lt;\/b&gt; &amp; &quot;friends&quot;<br>second line/)
  assert.equal(html.match(/<p /g)!.length, 2)
  assert.doesNotThrow(() => emailHtml(''))
})
