import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { MockRecord } from '@/features/product-ui/types'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { escapeLikePattern, sortColumn } from './list-projects-helpers'

const PAGE_SIZE = 25

export async function listProjects(params: { q?: string; status?: string; sort?: string; page?: number }) {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()
  const page = Math.max(1, params.page ?? 1)

  let query = supabase
    .from('projects')
    .select(
      'id, name, status, health, progress, next_gate, due_date, updated_at, owner_id, frameworks(name), framework_phases(name), clients(name)',
      { count: 'exact' },
    )
    .eq('organization_id', organization.id)
    .is('archived_at', null)

  if (params.q) query = query.ilike('name', `%${escapeLikePattern(params.q)}%`)
  if (params.status) query = query.eq('status', params.status)

  const column = sortColumn(params.sort)
  query = query.order(column, { ascending: column === 'name' })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const { data, error, count } = await query
  if (error) throw error

  // Owner is a user id and auth.users is not reachable through PostgREST, so
  // names come from the list_organization_members RPC. One call for the page,
  // not one per row.
  const members = await listOrganizationMembers()
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]))

  const records: MockRecord[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    // The register's badge column is the one whose id is 'status', and the
    // projects config labels it "Health" -- RecordCollectionWorkspace renders
    // exactly that cell through HealthBadge. So the health value has to travel
    // in `status`, as the mock mapper this query replaced also did. Sending
    // row.status here would put 'Active'/'On Hold' under a Health heading, and
    // healthStyles has no entry for either, so every badge would render grey.
    status: row.health,
    health: row.health,
    // MockRecord requires this; the existing screen used the framework
    // name as the row's supporting line, so it keeps doing so.
    context: row.frameworks?.name ?? '—',
    framework: row.frameworks?.name ?? '—',
    phase: row.framework_phases?.name ?? '—',
    client: row.clients?.name ?? '—',
    // 'Former member' covers an owner whose membership row was deleted outright
    // -- offboarding sets `status` instead, so this is the rare case, not the
    // normal one.
    owner: row.owner_id ? memberNames.get(row.owner_id) ?? 'Former member' : 'Unassigned',
    nextGate: row.next_gate ?? '—',
    due: row.due_date
      // timeZone pinned because due_date is a `date` column: new Date('2026-09-30')
      // is UTC midnight, and any runtime west of UTC would render it as 29 Sep.
      // `updated` below is a timestamptz and correctly keeps the local zone.
      ? new Date(row.due_date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
      : '—',
    progress: `${row.progress}%`,
    updated: new Date(row.updated_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }),
  }))

  return { records, total: count ?? 0, page, pageSize: PAGE_SIZE }
}
