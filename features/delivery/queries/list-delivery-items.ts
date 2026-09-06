import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { assembleDeliveryItemTree } from '../delivery-item-tree'
import type { DeliveryItem, DeliveryItemNode, DeliveryItemRow } from '../delivery-item-tree'

export type { DeliveryItem, DeliveryItemNode }

/**
 * The project's delivery items as a two-level tree.
 *
 * Two levels is a schema guarantee (delivery_items_parent_fkey), so this
 * assembles one pass of parents and one of children rather than recursing.
 *
 * Fetches archived rows too -- archived items are shown, muted, with a
 * working Restore, not hidden. See assembleDeliveryItemTree for how the flat
 * row set (including archived rows at both levels) becomes the tree.
 */
export async function listDeliveryItems(projectId: string): Promise<DeliveryItemNode[]> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [rows, members] = await Promise.all([
    supabase.from('delivery_items')
      .select('id, level, parent_id, name, description, owner_id, status, health, start_date, target_date, archived_at, current_phase_id, framework_phases(name, archived_at)')
      .eq('project_id', projectId)
      .eq('organization_id', organization.id)
      .order('level')
      .order('name'),
    listOrganizationMembers(),
  ])
  if (rows.error) throw rows.error

  const names = new Map(members.map((member) => [member.userId, member.displayName]))
  const map = (row: (typeof rows.data)[number]): DeliveryItemRow => ({
    id: row.id,
    // Trusted cast: delivery_items_level_check constrains level to (1, 2).
    level: row.level as 1 | 2,
    parentId: row.parent_id,
    name: row.name,
    description: row.description,
    // 'Former member' covers an owner whose membership row was deleted outright
    // rather than marked removed -- the same fallback list-projects.ts uses.
    ownerName: row.owner_id ? names.get(row.owner_id) ?? 'Former member' : 'Unassigned',
    status: row.status,
    health: row.health,
    phaseName: row.framework_phases?.name ?? null,
    phaseArchived: Boolean(row.framework_phases?.archived_at),
    startDate: row.start_date,
    targetDate: row.target_date,
    archivedAt: row.archived_at,
  })

  return assembleDeliveryItemTree((rows.data ?? []).map(map))
}
