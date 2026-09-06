'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { projectInputSchema } from '../schemas/project'

export async function createProjectAction(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = projectInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.from('projects').insert({
    organization_id: organization.id,
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
  }).select('id').single()

  // Everything the database can still refuse here is a caller mistake, not a
  // server fault, so it reads as a refusal rather than a crash. What is left
  // after zod: the four composite foreign keys — a client, framework, phase,
  // or owner named from another organisation (projects_client_fkey,
  // projects_framework_fkey, the phase/framework pairing, and
  // projects_owner_fkey from migration 20260905180000). due_date is no longer
  // among them: optionalDate validates it before it reaches Postgres, so a bad
  // date is refused as a field error, never as this branch. The copy names
  // the four fields that can actually land here and nothing else.
  if (error) return { error: 'The project could not be created. Check the client, framework, phase and owner.' }

  revalidatePath('/operations/projects')
  redirect(`/operations/projects/${data.id}`)
}
