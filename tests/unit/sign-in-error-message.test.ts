import assert from 'node:assert/strict'
import test from 'node:test'
import { signInErrorMessage } from '../../lib/auth/sign-in-error-message.ts'

test('returns undefined when there is no error', () => {
  assert.equal(signInErrorMessage(undefined), undefined)
})

test('returns undefined for an unrecognised error code', () => {
  assert.equal(signInErrorMessage('something-else'), undefined)
})

test('no-access explains the account is not linked to an organization', () => {
  assert.match(signInErrorMessage('no-access')!, /isn.t linked to a UNISON organization/)
})

test('microsoft explains sign-in did not complete', () => {
  assert.match(signInErrorMessage('microsoft')!, /didn.t complete/)
})

test('no-access and microsoft render different copy', () => {
  // The callback route collapses two distinct server-side outcomes (no
  // organization for the domain, and a revoked membership) into the single
  // `no-access` code before it ever reaches this function — there is
  // deliberately only one message keyed to that one code. This test just
  // confirms `no-access` and `microsoft` remain distinguishable from each
  // other, not from anything more specific.
  assert.notEqual(signInErrorMessage('no-access'), signInErrorMessage('microsoft'))
})
