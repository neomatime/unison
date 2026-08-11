import type {
  ActiveTenantContext,
  Organization,
  OrganizationMembership,
  UserId,
} from '@/types/tenancy'
import { requireMembership } from './require-membership.ts'
import { resolveOrganization } from './resolve-organization.ts'

export function getActiveOrganization(input: {
  organizations: readonly Organization[]
  memberships: readonly OrganizationMembership[]
  organizationIdentifier: string
  userId: UserId
}): ActiveTenantContext {
  const organization = resolveOrganization(input.organizations, input.organizationIdentifier)
  const membership = requireMembership(input.memberships, input.userId, organization.id)

  return { organization, membership }
}
