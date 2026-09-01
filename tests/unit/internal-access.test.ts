import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveInternalAccess } from '../../lib/auth/internal-access.ts'
import type { Organization, OrganizationMembership } from '../../types/tenancy.ts'

const himark: Organization = { id: 'org-himark', name: 'HIMARK', slug: 'himark', status: 'active', createdAt: '2026-01-01', tier: 'core' }
const client: Organization = { id: 'org-client', name: 'Client', slug: 'client', status: 'active', createdAt: '2026-01-02', tier: 'core' }

function membership(organizationId: string, roleId: string, status: OrganizationMembership['status'] = 'active'): OrganizationMembership {
  return { id: `${organizationId}-${roleId}`, organizationId, userId: 'user-1', roleId, status, createdAt: '2026-01-03' }
}

test('HIMARK owners and admins can resolve internal administration access', () => {
  for (const role of ['owner', 'admin']) {
    const access = resolveInternalAccess({ userId: 'user-1', organizations: [himark], memberships: [membership(himark.id, role)] })
    assert.equal(access?.organization.id, himark.id)
    assert.equal(access?.role, role)
  }
})

test('ordinary, inactive, and non-HIMARK memberships cannot access internal administration', () => {
  assert.equal(resolveInternalAccess({ userId: 'user-1', organizations: [himark], memberships: [membership(himark.id, 'member')] }), null)
  assert.equal(resolveInternalAccess({ userId: 'user-1', organizations: [himark], memberships: [membership(himark.id, 'admin', 'suspended')] }), null)
  assert.equal(resolveInternalAccess({ userId: 'user-1', organizations: [client], memberships: [membership(client.id, 'owner')] }), null)
})

test('HIMARK admin access does not depend on the currently selected client tenant', () => {
  const access = resolveInternalAccess({
    userId: 'user-1',
    organizations: [client, himark],
    memberships: [membership(client.id, 'owner'), membership(himark.id, 'admin')],
  })
  assert.equal(access?.organization.id, himark.id)
  assert.equal(access?.role, 'admin')
})

