import 'server-only'

import { getTier, type UnisonTierId } from '@/config/unison-tiers'
import { roleHasPermission } from '@/config/roles'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import type { OrganizationProfileData } from '@/features/organizations/types'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { OrganizationStatus } from '@/types/tenancy'

/**
 * The authoritative organisation-profile projection for the active tenant.
 * Every table read is constrained to the active organisation; RLS applies the
 * same boundary again inside Postgres.
 */
export async function getOrganizationProfile(): Promise<OrganizationProfileData> {
  const { organization, role } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [organizationResult, projectsResult, clientsResult, members] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, slug, status, created_at, updated_at, email_domain, tier')
      .eq('id', organization.id)
      .maybeSingle(),
    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization.id)
      .eq('status', 'Active')
      .is('archived_at', null),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization.id)
      .eq('status', 'Active')
      .is('archived_at', null),
    listOrganizationMembers(),
  ])

  if (organizationResult.error) throw organizationResult.error
  if (!organizationResult.data) throw new Error('The active organisation could not be found.')
  if (projectsResult.error) throw projectsResult.error
  if (clientsResult.error) throw clientsResult.error

  const activeMembers = members.filter((member) => member.status === 'active')
  // Memberships do not designate a primary contact. An owner is useful
  // context, but the UI labels this precisely as "Workspace owner" rather
  // than making the stronger and unsupported primary-contact claim.
  const workspaceOwner = activeMembers.find((member) => member.roleId === 'owner') ?? null
  const tierId = organizationResult.data.tier as UnisonTierId
  const tier = getTier(tierId)

  return {
    id: organizationResult.data.id,
    name: organizationResult.data.name,
    slug: organizationResult.data.slug,
    status: organizationResult.data.status as OrganizationStatus,
    createdAt: organizationResult.data.created_at,
    updatedAt: organizationResult.data.updated_at,
    emailDomain: organizationResult.data.email_domain,
    tierId,
    tierLabel: tier.label,
    tierDescription: tier.description,
    workspaceOwner: workspaceOwner
      ? { displayName: workspaceOwner.displayName, email: workspaceOwner.email }
      : null,
    metrics: {
      users: activeMembers.length,
      projects: projectsResult.count ?? 0,
      clients: clientsResult.count ?? 0,
      vendors: null,
    },
    canEdit: roleHasPermission(role, 'organization.manage'),
  }
}
