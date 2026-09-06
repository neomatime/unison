import 'server-only'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  bandFor,
  HEALTH_BANDS,
  isDateOverdue,
  isDateWithinDays,
  type AttentionRow,
  type DeliveryOverview,
  type UpcomingProjectDate,
} from '../overview-bands'
import { summariseDeliveryItems } from '../item-briefing.ts'

export type { AttentionRow, DeliveryOverview, UpcomingProjectDate }

const PROJECT_DATE_WINDOW_DAYS = 30
const NEXT_SEVEN_DAYS = 7

export async function getDeliveryOverview(): Promise<DeliveryOverview> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [projectResult, members, itemResult] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, status, health, due_date, next_gate, notes, owner_id, framework_id, phase_id, clients(name), frameworks(id, name), framework_phases(id, name, position)')
      .eq('organization_id', organization.id)
      .is('archived_at', null),
    listOrganizationMembers(),
    supabase
      .from('delivery_items')
      .select('project_id, current_phase_id, health, status')
      .eq('organization_id', organization.id)
      .is('archived_at', null),
  ])
  const { data, error } = projectResult
  if (error) throw error
  if (itemResult.error) throw itemResult.error

  const rows = data ?? []
  const active = rows.filter((row) => row.status === 'Active')
  const today = new Date().toISOString().slice(0, 10)
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]))

  const healthCounts = Object.fromEntries(HEALTH_BANDS.map((band) => [band, 0])) as DeliveryOverview['healthCounts']
  for (const row of active) healthCounts[bandFor(row.health)] += 1

  const projectDatesNext7 = active.filter((row) => isDateWithinDays(row.due_date, today, NEXT_SEVEN_DAYS)).length
  const projectDatesNext30 = active.filter((row) => isDateWithinDays(row.due_date, today, PROJECT_DATE_WINDOW_DAYS)).length
  const overdueProjectDates = active.filter((row) => isDateOverdue(row.due_date, today)).length
  const missingNextGateCount = active.filter((row) => !row.next_gate?.trim()).length
  const unassignedOwnerCount = active.filter((row) => !row.owner_id).length

  const upcomingProjectDates: UpcomingProjectDate[] = active
    .filter((row) => isDateWithinDays(row.due_date, today, PROJECT_DATE_WINDOW_DAYS))
    .sort((a, b) => {
      const dateDifference = (a.due_date ?? '').localeCompare(b.due_date ?? '')
      if (dateDifference) return dateDifference
      const nameDifference = a.name.localeCompare(b.name)
      return nameDifference || a.id.localeCompare(b.id)
    })
    .map((row) => {
      // The date-window filter above rejects null dates. Keep the guard here so
      // the serialized type remains honest if that helper ever changes.
      if (!row.due_date) throw new Error(`Upcoming project ${row.id} has no due date`)
      return {
        id: row.id,
        name: row.name,
        health: row.health,
        dueDate: row.due_date,
        dueDateLabel: formatDate(row.due_date),
        nextGate: row.next_gate?.trim() || null,
      }
    })

  // The lifecycle axis belongs to one framework: phases are defined per framework,
  // so "Initiate…Measure" and "Welcome…Go Live" are different vocabularies that
  // cannot share an axis. Chart whichever framework carries the most active work.
  const byFramework = new Map<string, { name: string; count: number }>()
  for (const row of active) {
    if (!row.frameworks) continue
    const entry = byFramework.get(row.frameworks.id) ?? { name: row.frameworks.name, count: 0 }
    entry.count += 1
    byFramework.set(row.frameworks.id, entry)
  }
  const leading = [...byFramework.entries()].sort((a, b) => {
    const countDifference = b[1].count - a[1].count
    const nameDifference = a[1].name.localeCompare(b[1].name)
    return countDifference || nameDifference || a[0].localeCompare(b[0])
  })[0]

  let framework: DeliveryOverview['framework'] = null
  let leadingPhases: { id: string; name: string; position: number }[] = []
  let leadingProjectIds = new Set<string>()

  if (leading) {
    const [frameworkId, { name }] = leading
    framework = { id: frameworkId, name }

    // Every phase of the framework appears, including those holding nothing — an
    // empty column is the useful part of a distribution, not a gap to omit.
    const { data: phases, error: phaseError } = await supabase
      .from('framework_phases')
      .select('id, name, position')
      .eq('framework_id', frameworkId)
      .eq('organization_id', organization.id)
      .order('position', { ascending: true })
    if (phaseError) throw phaseError

    leadingProjectIds = new Set(active.filter((row) => row.framework_id === frameworkId).map((row) => row.id))
    leadingPhases = (phases ?? []).map((phase) => ({ id: phase.id, name: phase.name, position: phase.position }))
  }

  const itemBriefing = summariseDeliveryItems({
    rows: (itemResult.data ?? []).map((row) => ({
      projectId: row.project_id,
      phaseId: row.current_phase_id,
      health: row.health,
      status: row.status,
    })),
    leadingFrameworkPhases: leadingPhases,
    leadingFrameworkProjectIds: leadingProjectIds,
    activeProjectIds: new Set(active.map((row) => row.id)),
  })

  const attention: AttentionRow[] = active
    .filter((row) => row.health === 'At Risk' || row.health === 'Critical')
    // Critical before At Risk, then soonest project due date. Name and id make
    // equal-health/equal-date rows stable regardless of database return order.
    .sort((a, b) => {
      if (a.health !== b.health) return a.health === 'Critical' ? -1 : 1
      const dateDifference = (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31')
      if (dateDifference) return dateDifference
      const nameDifference = a.name.localeCompare(b.name)
      return nameDifference || a.id.localeCompare(b.id)
    })
    .map((row) => ({
      id: row.id,
      name: row.name,
      health: row.health,
      phase: row.framework_phases?.name ?? '—',
      framework: row.frameworks?.name ?? '—',
      client: row.clients?.name ?? 'Internal delivery',
      owner: row.owner_id ? memberNames.get(row.owner_id) ?? 'Former member' : 'Unassigned',
      nextGate: row.next_gate?.trim() || null,
      targetDate: row.due_date,
      targetDateLabel: row.due_date ? formatDate(row.due_date) : 'Not recorded',
      note: row.notes?.trim() || null,
    }))

  return {
    activeProjects: active.length,
    healthCounts,
    projectDatesNext7,
    projectDatesNext30,
    overdueProjectDates,
    missingNextGateCount,
    unassignedOwnerCount,
    portfolioHealth: active.length === 0 ? null : Math.round((healthCounts['On Track / Healthy'] / active.length) * 100),
    framework,
    ...itemBriefing,
    attention,
    upcomingProjectDates,
  }
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
