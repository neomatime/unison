'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { deliveryItemInputSchema } from '../schemas/delivery-item'

export async function updateDeliveryItemAction(
  id: string,
  projectId: string,
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const parsed = deliveryItemInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  // level and parent_id are deliberately absent from this update. Changing an
  // item's level, or reparenting it, is not in this slice — and omitting the
  // columns is what makes that true rather than merely intended. The form
  // still submits them, because the schema's level/parent refinement needs
  // both to validate; the action ignores them.
  const { data, error } = await supabase.from('delivery_items').update({
    name: parsed.data.name,
    description: parsed.data.description,
    owner_id: parsed.data.ownerId,
    status: parsed.data.status,
    health: parsed.data.health,
    current_phase_id: parsed.data.currentPhaseId,
    start_date: parsed.data.startDate,
    target_date: parsed.data.targetDate,
  }).eq('id', id).eq('organization_id', organization.id).select('id')

  // What the database can still refuse after zod: an owner from another
  // organisation, or a phase from another framework.
  if (error) return { error: 'The delivery item could not be saved. Check the owner and phase.' }
  // Without .select() an update matching no rows is indistinguishable from one
  // that saved: RLS and the organisation filter both express "not yours" as
  // zero rows, not as an error.
  if (!data?.length) return { error: 'That delivery item no longer exists, or is not yours to edit.' }

  revalidatePath(`/operations/projects/${projectId}`)
  return {}
}
