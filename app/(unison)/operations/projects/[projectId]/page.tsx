import { notFound } from 'next/navigation'

import { ProjectDetailScreen } from '@/features/delivery/components/project-detail-screen'
import { getProject } from '@/features/delivery/queries/get-project'
import { listDeliveryItems } from '@/features/delivery/queries/list-delivery-items'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }
// due_date is a `date` column, so `new Date('2026-09-30')` is UTC midnight and
// any runtime west of UTC renders it as 29 Sep. Pinning the zone preserves the
// stored calendar date, which is what overview-bands.ts already documents and
// delivery-overview.ts's formatDate already does. updated_at deliberately keeps
// the local zone above: it is a timestamptz, a real instant, and "when was this
// last changed" is a question about the reader's clock, not the database's.
const dateOnlyFormat: Intl.DateTimeFormatOptions = { ...dateFormat, timeZone: 'UTC' }

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params

  // Postgres rejects a non-uuid before RLS is consulted, which would surface as
  // a 500 rather than a miss. A malformed id is a miss.
  if (!UUID.test(projectId)) notFound()

  // getProject is org-scoped, so "not in this organisation" and "does not
  // exist" both arrive here as null and both mean 404. What must never happen
  // is falling back to some other project's data.
  const project = await getProject(projectId)
  if (!project) notFound()

  // Ownership is what this slice exists to add, and the one screen dedicated to
  // a single project showed it nowhere: owner_id was fetched by getProject and
  // dropped by this mapper. Resolved the same way list-projects.ts does, with
  // the same 'Former member' fallback for an owner whose membership row was
  // deleted outright rather than marked removed.
  const members = project.owner_id ? await listOrganizationMembers() : []
  const ownerName = project.owner_id
    ? members.find((member) => member.userId === project.owner_id)?.displayName ?? 'Former member'
    : 'Unassigned'

  // The Delivery tab's own hierarchy, plus the framework's two level labels so
  // the tab can head level-1 and level-2 rows with the framework's own words
  // rather than an invented default.
  const items = await listDeliveryItems(projectId)
  const labels = {
    level1Label: project.frameworks?.level_1_label ?? null,
    level2Label: project.frameworks?.level_2_label ?? null,
  }

  return <ProjectDetailScreen items={items} labels={labels} project={{
    id: project.id,
    owner: ownerName,
    name: project.name,
    framework: project.frameworks?.name ?? '—',
    phase: project.framework_phases?.name ?? '—',
    client: project.clients?.name ?? '—',
    status: project.status,
    health: project.health,
    progress: project.progress,
    nextGate: project.next_gate ?? '—',
    dueDate: project.due_date ? new Date(project.due_date).toLocaleDateString('en-ZA', dateOnlyFormat) : '—',
    notes: project.notes ?? '—',
    updated: new Date(project.updated_at).toLocaleDateString('en-ZA', dateFormat),
    archived: project.archived_at !== null,
  }} />
}
