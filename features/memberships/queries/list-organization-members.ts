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
 * Display names are resolved with the same helper the shell uses
 * (`resolveDisplayName`), which checks `full_name` first and `name` second.
 * `list_organization_members` (migration 20260905200000) now selects
 * `coalesce(full_name, name)` from `raw_user_meta_data` for the same reason,
 * so a member is named identically here and in the shell regardless of which
 * of those two keys their provider populated.
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
