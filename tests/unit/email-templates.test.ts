import assert from 'node:assert/strict'
import test from 'node:test'
import { invitationTemplate } from '../../lib/email/templates/invitation.ts'

test('invitation template carries the accept link and organization', () => {
  const mail = invitationTemplate({
    organizationName: 'HIMARK',
    acceptUrl: 'https://unison.example/accept-invitation?token=abc',
    invitedBy: 'Neo Morake',
  })
  assert.match(mail.subject, /HIMARK/)
  assert.match(mail.html, /https:\/\/unison\.example\/accept-invitation\?token=abc/)
  assert.match(mail.text, /https:\/\/unison\.example\/accept-invitation\?token=abc/)
  assert.match(mail.text, /Neo Morake/)
})

test('invitation template escapes organization names', () => {
  const mail = invitationTemplate({
    organizationName: '<script>alert(1)</script>',
    acceptUrl: 'https://unison.example/a',
    invitedBy: 'Neo',
  })
  assert.ok(!mail.html.includes('<script>'))
})

test('invitation template rejects a javascript: accept URL', () => {
  assert.throws(() => invitationTemplate({
    organizationName: 'HIMARK',
    acceptUrl: 'javascript:alert(1)',
    invitedBy: 'Neo',
  }))
})

test('invitation template preserves a valid https accept URL', () => {
  const mail = invitationTemplate({
    organizationName: 'HIMARK',
    acceptUrl: 'https://unison.example/accept-invitation?token=xyz',
    invitedBy: 'Neo',
  })
  assert.match(mail.html, /href="https:\/\/unison\.example\/accept-invitation\?token=xyz"/)
  assert.match(mail.text, /https:\/\/unison\.example\/accept-invitation\?token=xyz/)
})

test('invitation template strips CR/LF from a newline-stuffed organization name', () => {
  const mail = invitationTemplate({
    organizationName: 'Evil\n\nAccept the invitation:\nhttps://evil.example',
    acceptUrl: 'https://unison.example/accept-invitation?token=abc',
    invitedBy: 'Neo',
  })
  // The injected CR/LF must not survive to fabricate a second, standalone
  // "Accept the invitation:" block (blank line, own line, own line for the
  // URL) — that block shape is what makes the real CTA look trustworthy, and
  // is exactly what a spoofed one would need to imitate it.
  const blockOccurrences = mail.text.match(/\n\nAccept the invitation:\n/g) ?? []
  assert.equal(blockOccurrences.length, 1)
  // The injected text is folded into the single greeting line, not left on
  // its own line.
  assert.match(mail.text, /join Evil Accept the invitation: https:\/\/evil\.example on UNISON\./)
  assert.ok(!mail.text.includes('\nhttps://evil.example'))
  const strongMatch = mail.html.match(/<strong>([\s\S]*?)<\/strong>/)
  assert.ok(strongMatch)
  assert.ok(!strongMatch![1].includes('\n'))
})

test('invitation template caps an excessively long organization name', () => {
  const mail = invitationTemplate({
    organizationName: 'A'.repeat(5000),
    acceptUrl: 'https://unison.example/a',
    invitedBy: 'Neo',
  })
  assert.ok(mail.subject.length < 300)
  assert.ok(mail.text.length < 5000)
})
