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

  if (error) {
    // Consistent with create/update: don't let the raw Postgres error
    // reach the route error boundary. This action isn't driven by
    // useActionState (it's a plain progressively-enhanced <form>, so it
    // works without JS — see client-detail.tsx), so there's no state
    // object to return an { error } into. Redirecting back to the record
    // with a query flag is the server-rendered equivalent: the detail
    // page reads it and shows a friendly message instead.
    revalidatePath(`/operations/clients/${id}`)
    redirect(`/operations/clients/${id}?archiveError=1`)
  }

  revalidatePath('/operations/clients')
  revalidatePath(`/operations/clients/${id}`)
  redirect('/operations/clients')
}
