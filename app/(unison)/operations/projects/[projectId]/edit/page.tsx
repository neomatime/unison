import { notFound } from 'next/navigation'

import { ProjectForm } from '@/features/delivery/components/project-form'
import { getProject } from '@/features/delivery/queries/get-project'
import { updateProjectAction } from '@/features/delivery/actions/update-project'
import { listProjectFormOptions } from '@/features/delivery/queries/list-project-form-options'

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const [project, options] = await Promise.all([getProject(projectId), listProjectFormOptions()])
  if (!project) notFound()
  return <ProjectForm mode="edit" project={project} action={updateProjectAction.bind(null, projectId)} options={options} />
}
