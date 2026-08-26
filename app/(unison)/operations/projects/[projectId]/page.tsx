import { notFound } from 'next/navigation'

import { ProjectDetailScreen } from '@/features/delivery/components/project-detail-screen'
import { getProject } from '@/features/delivery/queries/get-project'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }

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

  return <ProjectDetailScreen project={{
    id: project.id,
    name: project.name,
    framework: project.frameworks?.name ?? '—',
    phase: project.framework_phases?.name ?? '—',
    client: project.clients?.name ?? '—',
    status: project.status,
    health: project.health,
    progress: project.progress,
    nextGate: project.next_gate ?? '—',
    dueDate: project.due_date ? new Date(project.due_date).toLocaleDateString('en-ZA', dateFormat) : '—',
    notes: project.notes ?? '—',
    updated: new Date(project.updated_at).toLocaleDateString('en-ZA', dateFormat),
    archived: project.archived_at !== null,
  }} />
}
