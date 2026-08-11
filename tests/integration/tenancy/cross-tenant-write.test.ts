import assert from 'node:assert/strict'
import test from 'node:test'

import { TenantAccessDeniedError } from '../../../lib/tenancy/errors.ts'
import { requireMembership } from '../../../lib/tenancy/require-membership.ts'

test('a write guard rejects a user without tenant membership', () => {
  assert.throws(() => requireMembership([], 'user-1', 'himark'), TenantAccessDeniedError)
})
