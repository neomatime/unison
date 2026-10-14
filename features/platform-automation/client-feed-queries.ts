import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export type ClientFeedKey = {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export async function listClientFeedKeys(): Promise<ClientFeedKey[]> {
  const { organization, role } = await getSessionContext()
  if (!['owner', 'admin'].includes(role.toLowerCase())) return []
  const db = (await createServerSupabase()) as any
  const { data, error } = await db.rpc('list_client_feed_keys', { p_organization_id: organization.id })
  if (error) throw error
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }))
}
