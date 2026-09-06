import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'

export type DeliveryItem = {
  id: string
  level: 1 | 2
  name: string
  description: string | null
  /** Resolved name, or 'Unassigned' / 'Former member'. Never a raw uuid. */
  ownerName: string
  status: string
  health: string
  phaseName: string | null
  /** Drives the "Archived in framework" qualifier. The component does no lookup. */
  phaseArchived: boolean
  startDate: string | null
  targetDate: string | null
  archivedAt: string | null
}

export type DeliveryItemNode = DeliveryItem & { children: DeliveryItem[] }

/**
 * The project's delivery items as a two-level tree.
 *
 * Two levels is a schema guarantee (delivery_items_parent_fkey), so this
 * assembles one pass of parents and one of children rather than recursing.
 */
export async function listDeliveryItems(projectId: string): Promise<DeliveryItemNode[]> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [rows, members] = await Promise.all([
    supabase.from('delivery_items')
      .select('id, level, parent_id, name, description, owner_id, status, health, start_date, target_date, archived_at, current_phase_id, framework_phases(name, archived_at)')
      .eq('project_id', projectId)
      .eq('organization_id', organization.id)
      .is('archived_at', null)
      .order('level')
      .order('name'),
    listOrganizationMembers(),
  ])
  if (rows.error) throw rows.error

  const names = new Map(members.map((member) => [member.userId, member.displayName]))
  const map = (row: (typeof rows.data)[number]): DeliveryItem => ({
    id: row.id,
    level: row.level as 1 | 2,
    name: row.name,
    description: row.description,
    // 'Former member' covers an owner whose membership row was deleted outright
    // rather than marked removed -- the same fallback list-projects.ts uses.
    ownerName: row.owner_id ? names.get(row.owner_id) ?? 'Former member' : 'Unassigned',
    status: row.status,
    health: row.health,
    phaseName: row.framework_phases?.name ?? null,
    phaseArchived: row.framework_phases?.archived_at !== null && row.framework_phases?.archived_at !== undefined,
    startDate: row.start_date,
    targetDate: row.target_date,
    archivedAt: row.archived_at,
  })

  const all = rows.data ?? []
  return all.filter((row) => row.level === 1).map((parent) => ({
    ...map(parent),
    children: all.filter((row) => row.parent_id === parent.id).map(map),
  }))
}
