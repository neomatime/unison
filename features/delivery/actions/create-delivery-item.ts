'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { deliveryItemInputSchema } from '../schemas/delivery-item'

export async function createDeliveryItemAction(projectId: string, _prev: { error?: string } | undefined, formData: FormData) {
  const parsed = deliveryItemInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  // framework_id is read from the project rather than accepted from the form:
  // delivery_items_project_framework_fkey would refuse a mismatch anyway, and a
  // value the caller cannot influence is one fewer thing to validate.
  const { data: project, error: projectError } = await supabase
    .from('projects').select('framework_id')
    .eq('id', projectId).eq('organization_id', organization.id).maybeSingle()
  if (projectError) return { error: 'The delivery item could not be created.' }
  if (!project) return { error: 'That project no longer exists, or is not yours.' }

  const { error } = await supabase.from('delivery_items').insert({
    organization_id: organization.id,
    project_id: projectId,
    framework_id: project.framework_id,
    level: parsed.data.level,
    parent_id: parsed.data.parentId,
    name: parsed.data.name,
    description: parsed.data.description,
    owner_id: parsed.data.ownerId,
    status: parsed.data.status,
    health: parsed.data.health,
    current_phase_id: parsed.data.currentPhaseId,
    start_date: parsed.data.startDate,
    target_date: parsed.data.targetDate,
  }).select('id').single()

  // What the database can still refuse after zod: an owner from another
  // organisation, a phase from another framework, or a parent that is not a
  // level-1 item of this project. The copy names those three and nothing else.
  if (error) return { error: 'The delivery item could not be created. Check the owner, phase and parent.' }

  revalidatePath(`/operations/projects/${projectId}`)
  return {}
}
