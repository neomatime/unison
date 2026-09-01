import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSessionContext } from '../../lib/auth/session-context.ts'
import type { Organization, OrganizationMembership } from '../../types/tenancy.ts'

const himark: Organization = { id: 'org-1', name: 'HIMARK', slug: 'himark', status: 'active', createdAt: '', tier: 'core' }
const acme: Organization = { id: 'org-2', name: 'Acme', slug: 'acme', status: 'active', createdAt: '', tier: 'core' }
const suspendedOrg: Organization = { id: 'org-3', name: 'Suspended Co', slug: 'suspended-co', status: 'suspended', createdAt: '', tier: 'core' }
const membership: OrganizationMembership = {
  id: 'm-1', organizationId: 'org-1', userId: 'user-1', roleId: 'owner', status: 'active', createdAt: '',
}

test('uses the cookie organization when the user is a member', () => {
  const context = resolveSessionContext({
    userId: 'user-1', organizations: [himark, acme], memberships: [membership], cookieOrganizationId: 'org-1',
  })
  assert.equal(context.organization.slug, 'himark')
  assert.equal(context.role, 'owner')
})

test('falls back to the first active membership when the cookie names a foreign org', () => {
  const context = resolveSessionContext({
    userId: 'user-1', organizations: [himark, acme], memberships: [membership], cookieOrganizationId: 'org-2',
  })
  assert.equal(context.organization.id, 'org-1')
})

test('falls back when the cookie is absent', () => {
  const context = resolveSessionContext({
    userId: 'user-1', organizations: [himark], memberships: [membership], cookieOrganizationId: undefined,
  })
  assert.equal(context.organization.id, 'org-1')
})

test('throws when the user has no active membership', () => {
  assert.throws(() => resolveSessionContext({
    userId: 'user-1', organizations: [himark], memberships: [], cookieOrganizationId: undefined,
  }), /no active membership/i)
})

test('skips an active membership whose organization is suspended in favor of the next resolvable one', () => {
  const suspendedMembership: OrganizationMembership = {
    id: 'm-2', organizationId: 'org-3', userId: 'user-1', roleId: 'member', status: 'active', createdAt: '',
  }
  const context = resolveSessionContext({
    userId: 'user-1',
    organizations: [suspendedOrg, himark],
    memberships: [suspendedMembership, membership],
    cookieOrganizationId: undefined,
  })
  assert.equal(context.organization.id, 'org-1')
})

test('throws NoMembershipError, not TenantNotFoundError, when every active membership organization is non-active', () => {
  const suspendedMembership: OrganizationMembership = {
    id: 'm-2', organizationId: 'org-3', userId: 'user-1', roleId: 'member', status: 'active', createdAt: '',
  }
  assert.throws(() => resolveSessionContext({
    userId: 'user-1',
    organizations: [suspendedOrg],
    memberships: [suspendedMembership],
    cookieOrganizationId: undefined,
  }), /no active membership/i)
})
