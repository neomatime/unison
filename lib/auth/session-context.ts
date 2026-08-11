import { requireMembership } from '../tenancy/require-membership.ts'
import { resolveOrganization } from '../tenancy/resolve-organization.ts'
import type { Organization, OrganizationMembership } from '@/types/tenancy'
import { NoMembershipError } from './errors.ts'

export const ACTIVE_ORG_COOKIE = 'unison_org'

export function resolveSessionContext(input: {
  userId: string
  organizations: readonly Organization[]
  memberships: readonly OrganizationMembership[]
  cookieOrganizationId: string | undefined
}) {
  const active = input.memberships.filter((m) => m.status === 'active')
  if (active.length === 0) throw new NoMembershipError()

  const candidate = input.cookieOrganizationId ?? active[0].organizationId

  // A cookie naming a foreign organization falls back — it never fails open.
  let organization: Organization
  let membership: OrganizationMembership
  try {
    organization = resolveOrganization(input.organizations, candidate)
    membership = requireMembership(active, input.userId, organization.id)
  } catch {
    organization = resolveOrganization(input.organizations, active[0].organizationId)
    membership = requireMembership(active, input.userId, organization.id)
  }

  return { organization, membership, role: membership.roleId }
}
