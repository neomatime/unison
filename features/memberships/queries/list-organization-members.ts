import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { resolveDisplayName } from '@/lib/auth/display-name'

export type OrganizationMember = {
  userId: string
  displayName: string
  email: string | null
  roleId: string
  status: string
}

/**
 * Members of the caller's active organisation, names included.
 *
 * Goes through the `list_organization_members` RPC rather than a table select
 * because names live in `auth.users`, which PostgREST does not expose. Returns
 * every member with their status rather than only active ones: the owner picker
 * filters to active, and the register needs the name of an owner whose
 * membership has since been removed.
 *
 * Display names are resolved with the same helper the shell uses, so a person
 * is named identically wherever they appear.
 */
export async function listOrganizationMembers(): Promise<OrganizationMember[]> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.rpc('list_organization_members', {
    p_organization_id: organization.id,
  })
  if (error) throw error

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    displayName: resolveDisplayName({
      email: row.email,
      user_metadata: row.full_name ? { full_name: row.full_name } : {},
    }),
    email: row.email,
    roleId: row.role_id,
    status: row.status,
  }))
}
