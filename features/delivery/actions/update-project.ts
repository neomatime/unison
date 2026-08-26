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

  const { error } = await supabase.from('projects').update({
    name: parsed.data.name,
    framework_id: parsed.data.frameworkId,
    phase_id: parsed.data.phaseId,
    client_id: parsed.data.clientId,
    status: parsed.data.status,
    health: parsed.data.health,
    progress: parsed.data.progress,
    next_gate: parsed.data.nextGate,
    due_date: parsed.data.dueDate,
    notes: parsed.data.notes,
  }).eq('id', id).eq('organization_id', organization.id)

  if (error) return { error: 'The project could not be saved.' }

  revalidatePath('/operations/projects')
  revalidatePath(`/operations/projects/${id}`)
  redirect(`/operations/projects/${id}`)
}
