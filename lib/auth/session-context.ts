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

  // A cookie naming a resolvable organization the user is an active member of wins.
  // It never fails open: an unresolvable or foreign org falls through to the loop below.
  if (input.cookieOrganizationId !== undefined) {
    const fromCookie = tryResolve(input.organizations, active, input.userId, input.cookieOrganizationId)
    if (fromCookie) return { ...fromCookie, role: fromCookie.membership.roleId }
  }

  // Walk active memberships in order and take the first whose organization actually
  // resolves (exists and is active). An org can be suspended/archived without its
  // membership rows being touched, so resolution — not just membership status — must gate this.
  for (const candidate of active) {
    const resolved = tryResolve(input.organizations, active, input.userId, candidate.organizationId)
    if (resolved) return { ...resolved, role: resolved.membership.roleId }
  }

  // No active membership has a usable organization. This is the caller's cue to
  // redirect somewhere like /join-organization, not an unhandled error.
  throw new NoMembershipError()
}

function tryResolve(
  organizations: readonly Organization[],
  active: readonly OrganizationMembership[],
  userId: string,
  organizationIdentifier: string,
): { organization: Organization; membership: OrganizationMembership } | undefined {
  try {
    const organization = resolveOrganization(organizations, organizationIdentifier)
    const membership = requireMembership(active, userId, organization.id)
    return { organization, membership }
  } catch {
    return undefined
  }
}
