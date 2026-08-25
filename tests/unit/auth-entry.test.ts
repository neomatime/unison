import assert from 'node:assert/strict'
import test from 'node:test'

import {
  authEntryPathFor,
  INTERNAL_SIGN_IN_PATH,
  isInternalPath,
  TENANT_SIGN_IN_PATH,
} from '../../lib/auth/auth-entry.ts'

test('internal destinations use the dedicated internal sign-in entry', () => {
  assert.equal(authEntryPathFor('/internal'), INTERNAL_SIGN_IN_PATH)
  assert.equal(authEntryPathFor('/internal/provisioning/new'), INTERNAL_SIGN_IN_PATH)
  assert.equal(authEntryPathFor('/internal/provisioning/new?step=modules'), INTERNAL_SIGN_IN_PATH)
})

test('tenant and lookalike destinations retain the tenant sign-in entry', () => {
  assert.equal(authEntryPathFor('/overview'), TENANT_SIGN_IN_PATH)
  assert.equal(authEntryPathFor('/internality'), TENANT_SIGN_IN_PATH)
  assert.equal(authEntryPathFor('/internal-tools/overview'), TENANT_SIGN_IN_PATH)
  assert.equal(isInternalPath('/internality'), false)
})

