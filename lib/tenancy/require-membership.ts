import type { OrganizationId, OrganizationMembership, UserId } from '@/types/tenancy'
import { TenantAccessDeniedError } from './errors.ts'

export function requireMembership(
  memberships: readonly OrganizationMembership[],
  userId: UserId,
  organizationId: OrganizationId,
): OrganizationMembership {
  const membership = memberships.find(
    (candidate) =>
      candidate.userId === userId &&
      candidate.organizationId === organizationId &&
      candidate.status === 'active',
  )

  if (!membership) {
    throw new TenantAccessDeniedError()
  }

  return membership
}
