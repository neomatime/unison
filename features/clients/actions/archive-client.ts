'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function archiveClientAction(id: string) {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  // Archiving is the only removal path — there is no DELETE policy on
  // clients. This sets archived_at and flips status so the record drops
  // out of listClients' default (archived_at is null) view.
  const { error } = await supabase.from('clients').update({
    archived_at: new Date().toISOString(),
    status: 'Archived',
  }).eq('organization_id', organization.id).eq('id', id)

  if (error) throw error

  revalidatePath('/operations/clients')
  revalidatePath(`/operations/clients/${id}`)
  redirect('/operations/clients')
}
