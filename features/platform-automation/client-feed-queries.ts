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

export type ClientFeedGateStatus = {
  enabled: boolean
  hasLiveKey: boolean
  lastReadAt: string | null
  totalClients: number
  withAcceptedQuote: number
}

/**
 * Where the HIVE feed gate stands, for the switch on Settings > Integrations: whether it is on, whether a live feed key
 * exists, when HIVE last read the feed, and how many clients the organisation has and how many of them have an accepted
 * quote. Owners and admins only (null for anyone else, as the key list is empty for them). It goes through the signed-in
 * member's client and the status function, which checks membership and gives the counts to owners and admins alone; no
 * key, key hash or key name comes back from it.
 *
 * A failure of the read must not take the Integrations page down with it (that page is where an administrator revokes a
 * compromised feed key), so it gives null, which leaves the gate section out and nothing else. One line is logged, with the
 * error code alone: never the message, an address or any data.
 */
export async function getClientFeedGate(): Promise<ClientFeedGateStatus | null> {
  const { organization, role } = await getSessionContext()
  if (!['owner', 'admin'].includes(role.toLowerCase())) return null
  try {
    const db = (await createServerSupabase()) as any
    const { data, error } = await db.rpc('get_hive_feed_status', { p_organization_id: organization.id })
    if (error) throw error
    if (!data?.summary) return null
    return {
      enabled: Boolean(data.gate_enabled),
      hasLiveKey: Boolean(data.has_live_key),
      lastReadAt: data.last_read_at ?? null,
      totalClients: Number(data.summary.total_clients),
      withAcceptedQuote: Number(data.summary.with_accepted_quote),
    }
  } catch (error) {
    console.error('[client-feed:gate-status]', errorCode(error))
    return null
  }
}

/** The error's code when it is a short plain string (42501, PGRST202, ECONNRESET), otherwise 'unknown'. */
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(code) ? code : 'unknown'
}
