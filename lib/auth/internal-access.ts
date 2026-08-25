import type { Organization, OrganizationMembership } from '@/types/tenancy'

const INTERNAL_ORGANIZATION_SLUG = 'himark'
const INTERNAL_ADMIN_ROLES = new Set(['owner', 'admin'])

/**
 * Resolves internal access independently from the tenant selected in the
 * active-organization cookie. Internal administration belongs to HIMARK, so a
 * HIMARK administrator must not lose access simply because they last visited a
 * client tenant. Conversely, an ordinary HIMARK member must not gain access to
 * provisioning screens.
 */
export function resolveInternalAccess(input: {
  userId: string
  organizations: readonly Organization[]
  memberships: readonly OrganizationMembership[]
}) {
  const organization = input.organizations.find(
    (candidate) => candidate.slug.toLowerCase() === INTERNAL_ORGANIZATION_SLUG && candidate.status === 'active',
  )
  if (!organization) return null

  const membership = input.memberships.find(
    (candidate) => candidate.userId === input.userId
      && candidate.organizationId === organization.id
      && candidate.status === 'active'
      && INTERNAL_ADMIN_ROLES.has(candidate.roleId.toLowerCase()),
  )
  if (!membership) return null

  return { organization, membership, role: membership.roleId }
}

