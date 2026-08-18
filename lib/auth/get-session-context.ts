import 'server-only'
import { cookies } from 'next/headers'
import { resolveSessionContext, ACTIVE_ORG_COOKIE } from './session-context'
import type { Organization, OrganizationMembership } from '@/types/tenancy'
import { createServerSupabase } from '@/lib/supabase/server'
import { NotAuthenticatedError } from './errors'

export async function getSessionContext() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new NotAuthenticatedError()

  const { data: rows, error } = await supabase
    .from('memberships')
    .select('id, organization_id, user_id, role_id, status, created_at, organizations(id, name, slug, status, created_at)')
    .eq('user_id', user.id)
    .eq('status', 'active')
  if (error) throw error

  const memberships: OrganizationMembership[] = (rows ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    roleId: row.role_id,
    status: row.status as OrganizationMembership['status'],
    createdAt: row.created_at,
  }))
  const organizations: Organization[] = (rows ?? []).map((row) => ({
    id: row.organizations.id,
    name: row.organizations.name,
    slug: row.organizations.slug,
    status: row.organizations.status as Organization['status'],
    createdAt: row.organizations.created_at,
  }))

  const cookieStore = await cookies()
  const context = resolveSessionContext({
    userId: user.id,
    organizations,
    memberships,
    cookieOrganizationId: cookieStore.get(ACTIVE_ORG_COOKIE)?.value,
  })

  return { user, organizations, ...context }
}
