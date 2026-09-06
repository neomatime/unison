'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Archive and restore in one action. A phase is never deleted:
 * projects_phase_fkey is ON DELETE SET NULL (phase_id), so a delete would
 * silently blank the current phase of every project sitting in it.
 */
export async function setPhaseArchivedAction(_prev: { error?: string } | undefined, formData: FormData) {
  const id = formData.get('id')?.toString()
  const frameworkId = formData.get('frameworkId')?.toString()
  const archived = formData.get('archived')?.toString() === 'true'
  if (!id || !frameworkId) return { error: 'No phase was named.' }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('framework_phases')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .select('id')

  if (error) return { error: `The phase could not be ${archived ? 'archived' : 'restored'}.` }
  if (!data?.length) return { error: 'That phase no longer exists, or is not yours to change.' }

  revalidatePath(`/delivery/frameworks/${frameworkId}`)
  return {}
}
