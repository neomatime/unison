import 'server-only'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { deriveDependencyStatus, type DependencyStatus } from '../dependency-status.ts'

export type DependencyRow = {
  id: string
  /** The project at the OTHER end of the edge, whichever direction this row came from. */
  projectId: string
  projectName: string
  requiredState: string
  status: DependencyStatus
  reason: string
  /** Resolved name, or 'Unassigned' / 'Former member'. Never a raw uuid. */
  owner: string
  requiredByDate: string | null
  criticality: string
  notes: string | null
}

/**
 * Both directions of a project's dependency edges, in one query.
 *
 * `dependsOn` is the rows where this project is the dependent -- the risk it
 * carries. `dependedOnBy` is the rows where it is the prerequisite -- the risk
 * it creates for other projects. Requirement §4 requires both: a PM must see
 * the downstream risk this project creates, not only the risk it carries.
 *
 * The status of every row is derived from the PREREQUISITE, whichever side of
 * the edge the current project sits on -- that is what makes "projects that
 * depend on this" meaningful rather than reporting this project's own state
 * back at itself.
 */
export async function listProjectDependencies(projectId: string): Promise<{
  dependsOn: DependencyRow[]
  dependedOnBy: DependencyRow[]
}> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  // Both projects on the edge are embedded, so one query serves both
  // directions. project_dependencies has two foreign keys to projects, so
  // each embed needs an explicit constraint-name hint -- PostgREST cannot
  // disambiguate `dependent` vs `prerequisite` on its own.
  const [{ data, error }, members] = await Promise.all([
    supabase.from('project_dependencies')
      .select(`id, dependent_project_id, prerequisite_project_id, required_status, required_by_date,
               criticality, notes, dependency_owner_id,
               dependent:projects!project_dependencies_dependent_fkey (id, name),
               prerequisite:projects!project_dependencies_prerequisite_fkey (id, name, status, health, archived_at, phase_id),
               required_phase:framework_phases!project_dependencies_phase_fkey (id, name, position)`)
      .eq('organization_id', organization.id)
      .or(`dependent_project_id.eq.${projectId},prerequisite_project_id.eq.${projectId}`),
    listOrganizationMembers(),
  ])
  if (error) throw error

  const rows = data ?? []
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]))
  const today = new Date().toISOString().slice(0, 10)

  // The prerequisite's CURRENT phase position, which the embed above cannot
  // reach: phase_id points at framework_phases, and PostgREST will not follow
  // a second hop from an embedded row. One extra query, not one per row.
  const phasePositions = await currentPhasePositions(supabase, organization.id, rows)

  const dependsOn: DependencyRow[] = []
  const dependedOnBy: DependencyRow[] = []

  for (const row of rows) {
    const requiredState = row.required_phase?.name ?? row.required_status ?? '—'
    const { status, reason } = deriveDependencyStatus(
      {
        requiredStatus: row.required_status,
        requiredPhaseName: row.required_phase?.name ?? null,
        requiredPhasePosition: row.required_phase?.position ?? null,
        requiredByDate: row.required_by_date,
      },
      {
        name: row.prerequisite.name,
        status: row.prerequisite.status,
        health: row.prerequisite.health,
        archived: row.prerequisite.archived_at !== null,
        currentPhasePosition: row.prerequisite.phase_id
          ? phasePositions.get(row.prerequisite.phase_id) ?? null
          : null,
      },
      today,
    )

    // The far end of the edge, from this project's point of view.
    const isDependent = row.dependent_project_id === projectId
    const other = isDependent ? row.prerequisite : row.dependent

    const built: DependencyRow = {
      id: row.id,
      projectId: other.id,
      projectName: other.name,
      requiredState,
      status,
      reason,
      // A removed member keeps their name here rather than becoming a blank.
      // Nulling ownership when someone leaves erases who was responsible.
      owner: row.dependency_owner_id
        ? memberNames.get(row.dependency_owner_id) ?? 'Former member'
        : 'Unassigned',
      requiredByDate: row.required_by_date,
      criticality: row.criticality,
      notes: row.notes,
    }

    if (isDependent) dependsOn.push(built)
    else dependedOnBy.push(built)
  }

  // Worst first, then soonest, then name -- so the row a PM must act on is at
  // the top rather than wherever the database happened to return it.
  const severity: Record<DependencyStatus, number> = { Blocked: 0, 'At Risk': 1, Pending: 2, Satisfied: 3 }
  const order = (a: DependencyRow, b: DependencyRow) =>
    severity[a.status] - severity[b.status]
    || (a.requiredByDate ?? '9999-12-31').localeCompare(b.requiredByDate ?? '9999-12-31')
    || a.projectName.localeCompare(b.projectName)
    || a.id.localeCompare(b.id)

  return { dependsOn: dependsOn.sort(order), dependedOnBy: dependedOnBy.sort(order) }
}

/**
 * Positions of the prerequisites' current phases.
 *
 * A second query rather than a second embed hop: `phase_id` on the embedded
 * prerequisite points at framework_phases, and PostgREST will not follow a
 * further relationship from an already-embedded row. One query for all rows,
 * never one per row.
 */
async function currentPhasePositions(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  organizationId: string,
  rows: ReadonlyArray<{ prerequisite: { phase_id: string | null } }>,
): Promise<Map<string, number>> {
  const ids = [...new Set(rows.map((row) => row.prerequisite.phase_id).filter((id): id is string => id !== null))]
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase.from('framework_phases')
    .select('id, position').eq('organization_id', organizationId).in('id', ids)
  if (error) throw error

  return new Map((data ?? []).map((phase) => [phase.id, phase.position]))
}
