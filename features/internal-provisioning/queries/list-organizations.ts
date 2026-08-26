import 'server-only'
import { createServerSupabase } from '@/lib/supabase/server'

export type OrganisationRow = {
  id: string
  name: string
  tier: string
  status: string
  modules: string
  admin: string
  owner: string
  created: string
  activity: string
}

/**
 * Shaped to what OrganisationsScreen already renders. Tier, modules,
 * implementation owner and last activity have no backing column, so they render
 * '—' rather than a fabricated value — the same rule the delivery queries follow.
 */
export async function listOrganizations(): Promise<OrganisationRow[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('list_provisioned_organizations')
  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    tier: '—',
    status: row.status,
    modules: '—',
    admin: row.admin_email ?? '—',
    owner: '—',
    created: new Date(row.created_at).toLocaleDateString('en-ZA', {
      day: '2-digit', month: 'short', year: 'numeric',
    }),
    activity: '—',
  }))
}
