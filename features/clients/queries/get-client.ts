import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function getClient(id: string) {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('clients').select('*')
    .eq('organization_id', organization.id).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export type ClientRecord = NonNullable<Awaited<ReturnType<typeof getClient>>>
