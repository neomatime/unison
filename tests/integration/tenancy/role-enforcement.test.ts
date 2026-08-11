import assert from 'node:assert/strict'
import test from 'node:test'

import type { PermissionId } from '../../../config/permissions.ts'
import { roles, type RoleDefinition } from '../../../config/roles.ts'

function hasPermission(
  role: RoleDefinition | undefined,
  permission: PermissionId,
) {
  return role?.permissions.includes(permission) ?? false
}

test('only the owner role can manage organization settings', () => {
  const owner = roles.find((role) => role.id === 'owner')
  const admin = roles.find((role) => role.id === 'admin')

  assert.equal(hasPermission(owner, 'organization.manage'), true)
  assert.equal(hasPermission(admin, 'organization.manage'), false)
})
