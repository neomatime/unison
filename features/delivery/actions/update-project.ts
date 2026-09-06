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

  // delivery_items_project_framework_fkey: changing framework_id while
  // delivery items exist under the current framework raises a foreign-key
  // violation, because those items' phases belong to the old framework and
  // would be meaningless under the new one. Named here so it reads as a
  // deliberate refusal rather than the generic save-failed message below.
  if (error?.code === '23503') {
    return { error: 'This project has delivery items recorded under its current framework, so the framework cannot be changed. Archive them first.' }
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
