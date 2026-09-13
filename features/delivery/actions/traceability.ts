'use server'

import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

export type TraceabilityActionState = { error?: string; success?: string } | undefined

async function context() {
  const { organization } = await getSessionContext()
  return { organization, supabase: (await createServerSupabase()) as any }
}

/**
 * Reads the requirement's own project_id from the database rather than
 * trusting the form for it -- the same reasoning create-project-dependency.ts
 * uses for the prerequisite's framework_id: a value the caller cannot
 * influence is one fewer to validate, and the composite foreign keys would
 * refuse a mismatch anyway.
 */
async function requirementProject(supabase: any, organizationId: string, requirementId: string) {
  const { data, error } = await supabase.from('requirements')
    .select('project_id').eq('id', requirementId).eq('organization_id', organizationId).maybeSingle()
  if (error || !data) return null
  return data.project_id as string
}

export async function linkDeliveryItemAction(
  requirementId: string,
  _previous: TraceabilityActionState,
  form: FormData,
): Promise<TraceabilityActionState> {
  const deliveryItemId = String(form.get('deliveryItemId') ?? '').trim()
  if (!isUuid(requirementId) || !isUuid(deliveryItemId)) return { error: 'Choose a valid delivery item.' }

  const { organization, supabase } = await context()
  const projectId = await requirementProject(supabase, organization.id, requirementId)
  if (!projectId) return { error: 'That requirement no longer exists, or is not yours.' }

  const { error } = await supabase.from('requirement_delivery_items').insert({
    organization_id: organization.id,
    project_id: projectId,
    requirement_id: requirementId,
    delivery_item_id: deliveryItemId,
  })
  if (error?.code === '23505') return { error: 'That delivery item is already linked.' }
  if (error) return { error: 'That delivery item could not be linked.' }

  revalidatePath(`/operations/projects/${projectId}`)
  return { success: 'Delivery item linked.' }
}

export async function unlinkDeliveryItemAction(
  requirementId: string,
  _previous: TraceabilityActionState,
  form: FormData,
): Promise<TraceabilityActionState> {
  const deliveryItemId = String(form.get('deliveryItemId') ?? '').trim()
  if (!isUuid(requirementId) || !isUuid(deliveryItemId)) return { error: 'That link could not be removed.' }

  const { organization, supabase } = await context()
  const { data, error } = await supabase.from('requirement_delivery_items')
    .delete()
    .eq('requirement_id', requirementId).eq('delivery_item_id', deliveryItemId).eq('organization_id', organization.id)
    .select('project_id')
  if (error) return { error: 'That link could not be removed.' }
  if (!data || data.length === 0) return { error: 'That link no longer exists, or is not yours.' }

  revalidatePath(`/operations/projects/${data[0].project_id}`)
  return { success: 'Delivery item unlinked.' }
}

export async function linkEvidenceAction(
  requirementId: string,
  _previous: TraceabilityActionState,
  form: FormData,
): Promise<TraceabilityActionState> {
  const evidenceId = String(form.get('evidenceId') ?? '').trim()
  if (!isUuid(requirementId) || !isUuid(evidenceId)) return { error: 'Choose a valid evidence record.' }

  const { organization, supabase } = await context()
  const projectId = await requirementProject(supabase, organization.id, requirementId)
  if (!projectId) return { error: 'That requirement no longer exists, or is not yours.' }

  const { error } = await supabase.from('requirement_evidence').insert({
    organization_id: organization.id,
    project_id: projectId,
    requirement_id: requirementId,
    evidence_id: evidenceId,
  })
  if (error?.code === '23505') return { error: 'That evidence is already linked.' }
  if (error) return { error: 'That evidence could not be linked.' }

  revalidatePath(`/operations/projects/${projectId}`)
  return { success: 'Evidence linked.' }
}

export async function unlinkEvidenceAction(
  requirementId: string,
  _previous: TraceabilityActionState,
  form: FormData,
): Promise<TraceabilityActionState> {
  const evidenceId = String(form.get('evidenceId') ?? '').trim()
  if (!isUuid(requirementId) || !isUuid(evidenceId)) return { error: 'That link could not be removed.' }

  const { organization, supabase } = await context()
  const { data, error } = await supabase.from('requirement_evidence')
    .delete()
    .eq('requirement_id', requirementId).eq('evidence_id', evidenceId).eq('organization_id', organization.id)
    .select('project_id')
  if (error) return { error: 'That link could not be removed.' }
  if (!data || data.length === 0) return { error: 'That link no longer exists, or is not yours.' }

  revalidatePath(`/operations/projects/${data[0].project_id}`)
  return { success: 'Evidence unlinked.' }
}
