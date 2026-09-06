'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

// There is no delete policy on projects, by design. Archiving sets
// archived_at, which every list query already filters on.
export async function archiveProjectAction(formData: FormData) {
  const id = formData.get('id')?.toString()
  if (!id) return

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('projects')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .select('id')
  if (error) throw error
  // Zero rows means the id was wrong, already archived, or another tenant's.
  // Redirecting to the register as though it worked would be a fabricated
  // success — the defect class ui-completeness.test.ts exists to prevent.
  if (!data?.length) return

  revalidatePath('/operations/projects')
  redirect('/operations/projects')
}
