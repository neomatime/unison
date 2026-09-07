'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { projectInputSchema } from '../schemas/project'

export async function updateProjectAction(id: string, _prev: { error?: string } | undefined, formData: FormData) {
  const parsed = projectInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.from('projects').update({
    name: parsed.data.name,
    framework_id: parsed.data.frameworkId,
    phase_id: parsed.data.phaseId,
    client_id: parsed.data.clientId,
    owner_id: parsed.data.ownerId,
    status: parsed.data.status,
    health: parsed.data.health,
    progress: parsed.data.progress,
    next_gate: parsed.data.nextGate,
    due_date: parsed.data.dueDate,
    notes: parsed.data.notes,
  }).eq('id', id).eq('organization_id', organization.id).select('id')

  // projects has four outgoing foreign keys that can raise 23503 on this same
  // update -- projects_client_fkey, projects_phase_fkey, projects_owner_fkey
  // and projects_framework_fkey -- plus two more firing from the referencing
  // side when some other row still points at this project's current
  // framework: delivery_items_project_framework_fkey (a delivery item exists
  // under it) and project_dependencies_prerequisite_framework_fkey (another
  // project's dependency names this one as its prerequisite in it). Only the
  // message names which one actually fired, so inspect it rather than
  // assuming framework_id is always the cause -- a stale client or a phase
  // from the wrong framework must not be blamed on delivery items or on a
  // dependency declared by a different project entirely.
  if (error?.code === '23503' && error.message.includes('delivery_items_project_framework_fkey')) {
    return { error: 'This project has delivery items recorded under its current framework, so the framework cannot be changed. Archive them first.' }
  }
  if (error?.code === '23503' && error.message.includes('project_dependencies_prerequisite_framework_fkey')) {
    return { error: 'Another project records this one as a prerequisite in its current framework, so the framework cannot be changed. Remove that dependency first.' }
  }
  if (error) return { error: 'The project could not be saved.' }
  // Without .select() an update matching no rows is indistinguishable from one
  // that saved: RLS and the organisation filter both express "not yours" as
  // zero rows, not as an error, so a wrong id reported success.
  if (!data?.length) return { error: 'That project no longer exists, or is not yours to edit.' }

  revalidatePath('/operations/projects')
  revalidatePath(`/operations/projects/${id}`)
  redirect(`/operations/projects/${id}`)
}
