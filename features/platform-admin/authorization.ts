import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { resolveInternalAccess } from '@/lib/auth/internal-access'

export async function requireInternalAdministrator() {
  const context = await getSessionContext()
  const access = resolveInternalAccess({
    userId: context.user.id,
    organizations: context.organizations,
    memberships: context.memberships,
  })
  if (!access) throw new Error('You do not have permission to administer the platform.')
  return { ...context, internalOrganization: access.organization, internalRole: access.role }
}

export async function requireTenantKnowledgeAdministrator() {
  const context = await getSessionContext()
  if (!['owner', 'admin'].includes(context.membership.roleId.toLowerCase())) {
    throw new Error('Only organization owners and administrators can manage knowledge articles.')
  }
  return context
}
