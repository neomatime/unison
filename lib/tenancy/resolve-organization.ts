import type { Organization } from '@/types/tenancy'
import { TenantNotFoundError } from './errors.ts'

export function resolveOrganization(
  organizations: readonly Organization[],
  identifier: string,
): Organization {
  const organization = organizations.find(
    (candidate) => candidate.id === identifier || candidate.slug === identifier,
  )

  if (!organization || organization.status !== 'active') {
    throw new TenantNotFoundError(identifier)
  }

  return organization
}
