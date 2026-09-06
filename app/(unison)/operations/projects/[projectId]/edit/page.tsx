import { notFound } from 'next/navigation'

import { ProjectForm } from '@/features/delivery/components/project-form'
import { getProject } from '@/features/delivery/queries/get-project'
import { updateProjectAction } from '@/features/delivery/actions/update-project'
import { listProjectFormOptions } from '@/features/delivery/queries/list-project-form-options'

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  // Sequential rather than Promise.all: the options depend on the project. All
  // four pickers — owner, client, phase and framework — must retain this
  // project's current selection even when that member has been removed, that
  // client or framework archived, or that phase archived, or the select falls
  // back to its empty option and saving writes null over them. For the
  // framework picker specifically, ProjectForm's <select> is controlled and
  // required, so a missing option does not merely fall back — it leaves
  // nothing selected and the browser refuses to submit the form at all.
  const project = await getProject(projectId)
  if (!project) notFound()
  const options = await listProjectFormOptions({
    ownerId: project.owner_id,
    clientId: project.client_id,
    phaseId: project.phase_id,
    frameworkId: project.framework_id,
  })
  return <ProjectForm mode="edit" project={project} action={updateProjectAction.bind(null, projectId)} options={options} />
}
