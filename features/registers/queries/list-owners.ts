import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/** The organisation's active team members, for the owner filter. */
export async function listOwners(): Promise<Array<{ id: string; label: string }>> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const result = await db.from('team_members').select('id,full_name').eq('organization_id', organization.id).eq('status', 'Active').is('archived_at', null).order('full_name')
  if (result.error) throw result.error
  return ((result.data ?? []) as Array<{ id: string; full_name: string }>).map((row) => ({ id: row.id, label: row.full_name }))
}
