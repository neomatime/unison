import assert from 'node:assert/strict'
import test from 'node:test'

import { TenantAccessDeniedError } from '../../../lib/tenancy/errors.ts'
import { requireMembership } from '../../../lib/tenancy/require-membership.ts'
import type { OrganizationMembership } from '../../../types/tenancy'

test('a removed membership cannot establish tenant context', () => {
  const memberships: OrganizationMembership[] = [
    {
      id: 'membership-1',
      organizationId: 'himark',
      userId: 'user-1',
      roleId: 'member',
      status: 'removed',
      createdAt: '2026-08-10T00:00:00.000Z',
    },
  ]

  assert.throws(() => requireMembership(memberships, 'user-1', 'himark'), TenantAccessDeniedError)
})
