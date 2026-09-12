import 'server-only'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export type RequirementRow = {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  /** Resolved name, or 'Unassigned' / 'Former member'. Never a raw uuid. */
  owner: string
  ownerId: string | null
  targetDate: string | null
  targetDateLabel: string
}

export async function listRequirements(projectId: string): Promise<RequirementRow[]> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [{ data, error }, members] = await Promise.all([
    supabase.from('requirements')
      .select('id, title, description, priority, status, owner_id, target_date')
      .eq('organization_id', organization.id)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    listOrganizationMembers(),
  ])
  if (error) throw error

  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]))

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    // A removed member keeps their name here rather than becoming a blank:
    // nulling ownership when someone leaves erases who was accountable.
    owner: row.owner_id ? (memberNames.get(row.owner_id) ?? 'Former member') : 'Unassigned',
    ownerId: row.owner_id,
    targetDate: row.target_date,
    targetDateLabel: row.target_date ? formatDate(row.target_date) : 'No target date',
  }))
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}
