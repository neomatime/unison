import assert from 'node:assert/strict'
import test from 'node:test'

import { roleHasPermission } from '../../config/roles.ts'

test('owners and admins can manage the company details, members cannot', () => {
  assert.equal(roleHasPermission('owner', 'company.manage'), true)
  assert.equal(roleHasPermission('admin', 'company.manage'), true)
  assert.equal(roleHasPermission('member', 'company.manage'), false)
  assert.equal(roleHasPermission('stranger', 'company.manage'), false)
})
