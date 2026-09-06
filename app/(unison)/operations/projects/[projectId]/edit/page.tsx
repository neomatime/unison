import { notFound } from 'next/navigation'

import { ProjectForm } from '@/features/delivery/components/project-form'
import { getProject } from '@/features/delivery/queries/get-project'
import { updateProjectAction } from '@/features/delivery/actions/update-project'
import { listProjectFormOptions } from '@/features/delivery/queries/list-project-form-options'

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  // Sequential rather than Promise.all: the options depend on the project. The
  // owner and client pickers must retain this project's current selections even
  // when that member has been removed or that client archived, or the select
  // falls back to its empty option and saving writes null over them.
  const project = await getProject(projectId)
  if (!project) notFound()
  const options = await listProjectFormOptions({ ownerId: project.owner_id, clientId: project.client_id })
  return <ProjectForm mode="edit" project={project} action={updateProjectAction.bind(null, projectId)} options={options} />
}
