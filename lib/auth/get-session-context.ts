import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { resolveSessionContext, ACTIVE_ORG_COOKIE } from './session-context'
import type { Organization, OrganizationMembership } from '@/types/tenancy'
import { createServerSupabase } from '@/lib/supabase/server'
import { NotAuthenticatedError } from './errors'

/**
 * Resolves who is signed in and which organization they are acting within.
 *
 * Wrapped in React's `cache()`, which deduplicates per request: the layout and
 * every query on a page each call this, and without it each one pays a full
 * `auth.getUser()` round trip to Supabase plus a memberships query. That cost
 * multiplies with every module connected, so the page that loads a workspace,
 * its record count and its rows would pay it three times over.
 *
 * Per-request, not global — the cache is scoped to a single render pass, so a
 * membership revoked between requests takes effect immediately. That matters:
 * this project deliberately resolves tenancy live rather than from JWT claims
 * precisely so revocation is not deferred.
 */
export const getSessionContext = cache(async function getSessionContext() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new NotAuthenticatedError()

  const { data: rows, error } = await supabase
    .from('memberships')
    .select('id, organization_id, user_id, role_id, status, created_at, organizations(id, name, slug, status, created_at, tier)')
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
    tier: row.organizations.tier as Organization['tier'],
  }))

  const cookieStore = await cookies()
  const context = resolveSessionContext({
    userId: user.id,
    organizations,
    memberships,
    cookieOrganizationId: cookieStore.get(ACTIVE_ORG_COOKIE)?.value,
  })

  return { user, organizations, memberships, ...context }
})
