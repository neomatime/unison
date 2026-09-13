import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export type TraceabilityRow = {
  requirementId: string
  title: string
  deliveryItemIds: string[]
  evidenceIds: string[]
}

/**
 * Returns ids only, never names -- the panel resolves names from the
 * project's own delivery-item and evidence lists, which the page already
 * fetches for the Delivery and Governance tabs. Fetching them again here
 * would be a redundant round trip for data already in hand.
 */
export async function listTraceability(projectId: string): Promise<TraceabilityRow[]> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [
    { data: requirements, error: requirementsError },
    { data: deliveryLinks, error: deliveryLinksError },
    { data: evidenceLinks, error: evidenceLinksError },
  ] = await Promise.all([
    supabase.from('requirements')
      .select('id, title')
      .eq('organization_id', organization.id)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase.from('requirement_delivery_items')
      .select('requirement_id, delivery_item_id')
      .eq('organization_id', organization.id)
      .eq('project_id', projectId),
    supabase.from('requirement_evidence')
      .select('requirement_id, evidence_id')
      .eq('organization_id', organization.id)
      .eq('project_id', projectId),
  ])
  if (requirementsError) throw requirementsError
  if (deliveryLinksError) throw deliveryLinksError
  if (evidenceLinksError) throw evidenceLinksError

  return (requirements ?? []).map((requirement) => ({
    requirementId: requirement.id,
    title: requirement.title,
    deliveryItemIds: (deliveryLinks ?? [])
      .filter((link) => link.requirement_id === requirement.id)
      .map((link) => link.delivery_item_id),
    evidenceIds: (evidenceLinks ?? [])
      .filter((link) => link.requirement_id === requirement.id)
      .map((link) => link.evidence_id),
  }))
}
