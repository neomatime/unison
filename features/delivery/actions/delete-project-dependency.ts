'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

const schema = z.object({ id: z.string().uuid(), projectId: z.string().uuid() })

/**
 * A hard delete, unlike archive-project.ts. A dependency is an edge: it has no
 * children to orphan, and an archived edge answers no question a deleted one
 * does not. See the migration's comment on the delete policy.
 */
export async function deleteProjectDependencyAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'That dependency could not be removed.' }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  // organization_id is redundant with RLS and stated anyway: a delete whose
  // filter is wrong deletes nothing rather than something else.
  const { data, error } = await supabase.from('project_dependencies')
    .delete().eq('id', parsed.data.id).eq('organization_id', organization.id)
    .select('id')

  if (error) return { error: 'That dependency could not be removed.' }
  if (!data || data.length === 0) return { error: 'That dependency no longer exists, or is not yours.' }

  revalidatePath(`/operations/projects/${parsed.data.projectId}`)
  return {}
}
