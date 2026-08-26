import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function getProject(id: string) {
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
