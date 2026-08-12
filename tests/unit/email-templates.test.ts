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
