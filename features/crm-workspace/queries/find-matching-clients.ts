import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { normalizeCompanyName } from '../fields'

/**
 * Non-archived clients whose name is the same company as `companyName`, ignoring
 * capitals and extra spaces. Compared in code, on the organisation's client names,
 * because a database comparison would have to reproduce the same normalisation.
 */
export async function findMatchingClients(companyName: string): Promise<Array<{ id: string; name: string }>> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const wanted = normalizeCompanyName(companyName)
  if (!wanted) return []
  const { data, error } = await db
    .from('clients')
    .select('id, name')
    .eq('organization_id', organization.id)
    .is('archived_at', null)
    .ilike('name', `%${companyName.trim().split(/\s+/)[0].replace(/[\\%_*]/g, (m) => `\\${m}`)}%`)
    .limit(1000)
  if (error) throw error
  return (data ?? []).filter((row: { id: string; name: string }) => normalizeCompanyName(row.name) === wanted)
}
