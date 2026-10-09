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

export async function listClientOwners() {
  const { organization } = await getSessionContext()
  const supabase = (await createServerSupabase()) as any
  const { data, error } = await supabase.from('team_members').select('user_id,full_name').eq('organization_id', organization.id).eq('status', 'Active').is('archived_at', null).not('user_id', 'is', null).order('full_name')
  if (error) throw error
  return (data ?? []).map((row: { user_id: string; full_name: string }) => ({ id: row.user_id, name: row.full_name }))
}
