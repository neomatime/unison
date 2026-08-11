import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSessionContext } from '../../lib/auth/session-context.ts'
import type { Organization, OrganizationMembership } from '../../types/tenancy.ts'

const himark: Organization = { id: 'org-1', name: 'HIMARK', slug: 'himark', status: 'active', createdAt: '' }
const acme: Organization = { id: 'org-2', name: 'Acme', slug: 'acme', status: 'active', createdAt: '' }
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
