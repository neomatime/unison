import assert from 'node:assert/strict'
import test from 'node:test'

import { AUTH_UNAVAILABLE_ERROR, isAuthServiceUnavailable } from '../../lib/auth/auth-unavailable.ts'
import { signInErrorMessage } from '../../lib/auth/sign-in-error-message.ts'

test('a failure to reach the auth service is recognised', () => {
  assert.equal(isAuthServiceUnavailable({ name: 'AuthRetryableFetchError' }), true)
})

test('a refusal by the auth service is not a failure to reach it', () => {
  // The distinction this module exists for: an answer that rejects the caller
  // must keep sending them to sign in, only an absent answer changes the copy.
  assert.equal(isAuthServiceUnavailable({ name: 'AuthApiError' }), false)
  assert.equal(isAuthServiceUnavailable({ name: 'AuthPKCECodeVerifierMissingError' }), false)
})

test('an absent error is not an outage', () => {
  assert.equal(isAuthServiceUnavailable(null), false)
  assert.equal(isAuthServiceUnavailable(undefined), false)
})

test('the unavailable code renders its own message', () => {
  const message = signInErrorMessage(AUTH_UNAVAILABLE_ERROR)
  assert.ok(message, 'expected a message for the unavailable code')
  assert.match(message, /can.t reach the sign-in service/i)
})

test('unavailable does not tell the user to retry Microsoft', () => {
  // Microsoft succeeded in this case, so repeating that step cannot help.
  assert.notEqual(signInErrorMessage(AUTH_UNAVAILABLE_ERROR), signInErrorMessage('microsoft'))
  assert.doesNotMatch(signInErrorMessage(AUTH_UNAVAILABLE_ERROR)!, /microsoft/i)
})
