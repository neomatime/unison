import assert from 'node:assert/strict'
import test from 'node:test'

import { isRunnerAuthorised } from '../../lib/billing/runner-auth.ts'
import { MissingEnvError, readCronSecret } from '../../lib/env.ts'

// Accept to invoice, stage 2, task 5: the runner's one credential. The host's cron sends CRON_SECRET as a bearer token.

const SECRET = 'cron-secret-value-0123456789'

test('the right bearer secret is authorised', () => {
  assert.equal(isRunnerAuthorised(`Bearer ${SECRET}`, SECRET), true)
})

test('a missing header, another scheme, or a bare Bearer is not authorised', () => {
  for (const header of [null, undefined, '', 'Basic ' + SECRET, 'bearer ' + SECRET, `Bearer`, `Bearer `, SECRET, `Bearer  ${SECRET}`]) {
    assert.equal(isRunnerAuthorised(header, SECRET), false, String(header))
  }
})

test('a wrong secret, a longer one and a shorter one are not authorised', () => {
  for (const attempt of ['wrong', SECRET + 'x', SECRET.slice(0, -1), SECRET.toUpperCase()]) {
    assert.equal(isRunnerAuthorised(`Bearer ${attempt}`, SECRET), false, attempt)
  }
})

test('an empty or missing configured secret never authorises anything', () => {
  for (const secret of ['', null, undefined]) {
    assert.equal(isRunnerAuthorised('Bearer ', secret), false)
    assert.equal(isRunnerAuthorised('Bearer anything', secret), false)
    assert.equal(isRunnerAuthorised(null, secret), false)
  }
})

test('readCronSecret reads CRON_SECRET and throws MissingEnvError, naming it, when it is blank or absent', () => {
  assert.equal(readCronSecret({ CRON_SECRET: SECRET }), SECRET)
  for (const source of [{}, { CRON_SECRET: '' }]) {
    assert.throws(() => readCronSecret(source), (error: unknown) => {
      assert.ok(error instanceof MissingEnvError)
      assert.match((error as Error).message, /CRON_SECRET/)
      return true
    })
  }
})
