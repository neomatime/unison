import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { accountEmailSchema, passwordResetSchema } from '../../features/auth-ui/schemas/account-access.ts'
import { MIN_PASSWORD_LENGTH } from '../../features/invitations/schemas/signup.ts'

const actions = readFileSync('features/auth-ui/actions/account-access.ts', 'utf8')
const screen = readFileSync('features/auth-ui/auth-screen.tsx', 'utf8')
const callback = readFileSync('app/auth/callback/route.ts', 'utf8')

test('account recovery accepts a valid email and rejects malformed input', () => {
  assert.equal(accountEmailSchema.safeParse('person@example.com').success, true)
  assert.equal(accountEmailSchema.safeParse('not-an-email').success, false)
})

test('a replacement password meets the shared floor and must be confirmed', () => {
  const password = 'a'.repeat(MIN_PASSWORD_LENGTH)

  assert.equal(passwordResetSchema.safeParse({ password, confirmPassword: password }).success, true)
  assert.equal(passwordResetSchema.safeParse({ password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1), confirmPassword: 'a'.repeat(MIN_PASSWORD_LENGTH - 1) }).success, false)
  assert.equal(passwordResetSchema.safeParse({ password, confirmPassword: `${password}!` }).success, false)
})

test('the account-access screens call Supabase instead of local completion state', () => {
  // A password is reset by an administrator (features/memberships/actions/send-reset-link.ts), never requested from this screen,
  // so the request action no longer calls resetPasswordForEmail; the reset page itself and email verification still do their work.
  assert.doesNotMatch(actions, /auth\.resetPasswordForEmail\(/)
  assert.match(actions, /auth\.updateUser\(\{ password:/)
  assert.match(actions, /auth\.resend\(\{\s*type: 'signup'/)
  assert.match(readFileSync('features/memberships/actions/send-reset-link.ts', 'utf8'), /callbackUrl\('\/reset-password', 'recovery'\)/)

  assert.match(screen, /action=\{isAccept \? acceptFormAction : accountAccessAction\}/)
  assert.match(screen, /name="confirmPassword"/)
  assert.match(screen, /AdminManagedNotice/)
})

test('account-access callbacks never pass through the Microsoft membership claim', () => {
  const recovery = callback.indexOf("flow === 'recovery'")
  const verification = callback.indexOf("flow === 'verification'")
  const directoryClaim = callback.indexOf("rpc('claim_directory_membership')")

  assert.ok(recovery >= 0 && verification >= 0)
  assert.ok(recovery < directoryClaim && verification < directoryClaim)
  assert.match(callback, /flow === 'recovery' && next === '\/reset-password'/)
  assert.match(callback, /flow === 'verification' && next === '\/sign-in\?verified=1'/)
})
