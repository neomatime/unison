import assert from 'node:assert/strict'
import test from 'node:test'
import { MIN_PASSWORD_LENGTH, invitationSignUpSchema } from '../../features/invitations/schemas/signup.ts'

const valid = {
  token: 'a-token',
  password: 'a'.repeat(MIN_PASSWORD_LENGTH),
  confirmPassword: 'a'.repeat(MIN_PASSWORD_LENGTH),
}

test('accepts a password at the minimum length', () => {
  assert.equal(invitationSignUpSchema.safeParse(valid).success, true)
})

test('rejects a password one character short', () => {
  const result = invitationSignUpSchema.safeParse({
    ...valid,
    password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1),
    confirmPassword: 'a'.repeat(MIN_PASSWORD_LENGTH - 1),
  })
  assert.equal(result.success, false)
  assert.match(result.error!.issues[0].message, new RegExp(String(MIN_PASSWORD_LENGTH)))
})

test('rejects mismatched confirmation', () => {
  const result = invitationSignUpSchema.safeParse({ ...valid, confirmPassword: 'b'.repeat(MIN_PASSWORD_LENGTH) })
  assert.equal(result.success, false)
  assert.match(result.error!.issues[0].message, /do not match/i)
})

test('rejects a missing token', () => {
  const result = invitationSignUpSchema.safeParse({ ...valid, token: '' })
  assert.equal(result.success, false)
  assert.match(result.error!.issues[0].message, /incomplete/i)
})

test('the minimum is long enough to be worth having', () => {
  // Guards the constant itself: a future edit dropping it to Supabase's own
  // floor of 6 would silently weaken every invited account.
  assert.ok(MIN_PASSWORD_LENGTH >= 12, 'password minimum should be at least 12 characters')
})
