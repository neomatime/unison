import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMimeMessage, encodeHeaderValue, extractAddress, sanitizeHeaderValue } from '../../lib/email/mime.ts'

const base = {
  from: 'HIMARK <info@himark.co.za>',
  to: 'invitee@example.com',
  subject: 'You have been invited to Meridian on UNISON',
  text: 'Plain text body',
  html: '<p>HTML body</p>',
  boundary: 'FIXED-BOUNDARY',
}

function decodePart(message: string, contentType: string): string {
  const section = message.split('--FIXED-BOUNDARY').find((part) => part.includes(contentType))
  assert.ok(section, `no part with ${contentType}`)
  const body = section!.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/--\r\n?$/, '').trim()
  return Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')
}

test('carries both alternatives, with html last so clients prefer it', () => {
  const message = buildMimeMessage(base)
  assert.match(message, /Content-Type: multipart\/alternative; boundary="FIXED-BOUNDARY"/)
  assert.ok(message.indexOf('text/plain') < message.indexOf('text/html'))
  assert.equal(decodePart(message, 'text/plain'), 'Plain text body')
  assert.equal(decodePart(message, 'text/html'), '<p>HTML body</p>')
})

test('uses CRLF line endings throughout', () => {
  const message = buildMimeMessage(base)
  const bareNewlines = message.split('\n').filter((line, index, all) => index < all.length - 1 && !line.endsWith('\r'))
  assert.deepEqual(bareNewlines, [], 'every line must end with CRLF')
})

test('closes the multipart with a terminating boundary', () => {
  assert.match(buildMimeMessage(base), /--FIXED-BOUNDARY--\r\n$/)
})

test('a CRLF in a header value cannot inject another header', () => {
  const message = buildMimeMessage({
    ...base,
    subject: 'Invitation\r\nBcc: attacker@evil.example',
  })
  assert.ok(!/^Bcc:/m.test(message), 'Bcc was injected as a real header')
  assert.match(message, /Subject: Invitation Bcc: attacker@evil\.example/)
})

test('a CRLF in the recipient cannot inject another header', () => {
  const message = buildMimeMessage({ ...base, to: 'a@b.com\r\nBcc: attacker@evil.example' })
  assert.ok(!/^Bcc:/m.test(message))
})

test('sanitizeHeaderValue collapses CR and LF', () => {
  assert.equal(sanitizeHeaderValue('one\r\ntwo\nthree'), 'one two three')
})

test('encodeHeaderValue leaves ASCII alone', () => {
  assert.equal(encodeHeaderValue('Plain ASCII subject'), 'Plain ASCII subject')
})

test('encodeHeaderValue RFC 2047 encodes non-ASCII', () => {
  const encoded = encodeHeaderValue('Ubuntu Löwe 株式会社')
  assert.match(encoded, /^=\?UTF-8\?B\?.+\?=$/)
  const decoded = Buffer.from(encoded.replace(/^=\?UTF-8\?B\?/, '').replace(/\?=$/, ''), 'base64').toString('utf8')
  assert.equal(decoded, 'Ubuntu Löwe 株式会社')
})

test('non-ASCII bodies survive the base64 round trip', () => {
  const message = buildMimeMessage({ ...base, text: 'Löwe 株式会社 — dash', html: '<p>Löwe 株式会社</p>' })
  assert.equal(decodePart(message, 'text/plain'), 'Löwe 株式会社 — dash')
  assert.equal(decodePart(message, 'text/html'), '<p>Löwe 株式会社</p>')
})

test('base64 lines stay within the 76-character limit', () => {
  const message = buildMimeMessage({ ...base, text: 'x'.repeat(5000) })
  const tooLong = message.split('\r\n').filter((line) => line.length > 76)
  assert.deepEqual(tooLong, [])
})

test('extractAddress pulls the address out of a display-name form', () => {
  assert.equal(extractAddress('HIMARK <info@himark.co.za>'), 'info@himark.co.za')
  assert.equal(extractAddress('info@himark.co.za'), 'info@himark.co.za')
})
