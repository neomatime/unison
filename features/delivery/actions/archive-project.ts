'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

// There is no delete policy on projects, by design. Archiving sets
// archived_at, which every list query already filters on.
export async function archiveProjectAction(_prev: { error?: string } | undefined, formData: FormData) {
  const id = formData.get('id')?.toString()
  if (!id) return { error: 'No project was named for archiving.' }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('projects')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organization.id)
    // Without this an already-archived project matched, had its archived_at
    // re-stamped to now, and reported success — so the zero-row branch below
    // could not actually mean "already archived", which its comment claimed.
    .is('archived_at', null)
    .select('id')
  if (error) return { error: 'The project could not be archived.' }
  // Zero rows means the id was wrong, the project is already archived, or it
  // belongs to another tenant — RLS and the organisation filter both express
  // "not yours" as zero rows rather than as an error. Redirecting as though it
  // worked would be a fabricated success, the defect class
  // ui-completeness.test.ts exists to prevent. Refusing silently was only
  // marginally better: the user confirmed a dialog that told them the action
  // was irreversible and then saw nothing happen at all. Now it says so.
  if (!data?.length) return { error: 'That project no longer exists, is already archived, or is not yours to archive.' }

  revalidatePath('/operations/projects')
  redirect('/operations/projects')
}
