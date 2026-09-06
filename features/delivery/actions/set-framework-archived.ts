'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Archive and unarchive in one action. Unarchive is not optional: the projects
 * slice shipped an archive with no in-UI undo, and that hazard is not repeated.
 */
export async function setFrameworkArchivedAction(_prev: { error?: string } | undefined, formData: FormData) {
  const id = formData.get('id')?.toString()
  const archived = formData.get('archived')?.toString() === 'true'
  if (!id) return { error: 'No framework was named.' }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('frameworks')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .select('id')

  if (error) return { error: `The framework could not be ${archived ? 'archived' : 'restored'}.` }
  if (!data?.length) return { error: 'That framework no longer exists, or is not yours to change.' }

  revalidatePath('/delivery/frameworks')
  revalidatePath(`/delivery/frameworks/${id}`)
  return {}
}
