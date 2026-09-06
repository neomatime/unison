import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

export async function getProject(id: string) {
  // A malformed id is a miss, not a fault: Postgres rejects a non-uuid
  // literal (22P02) before RLS is consulted, which would otherwise surface
  // as a 500. The detail route already guards this itself; guarding here too
  // means the edit route — which had no guard — inherits it for free, same
  // as getFramework.
  if (!isUuid(id)) return null

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('projects')
    .select('*, frameworks(id, name), framework_phases(id, name), clients(id, name)')
    .eq('organization_id', organization.id)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export type ProjectRecord = NonNullable<Awaited<ReturnType<typeof getProject>>>
