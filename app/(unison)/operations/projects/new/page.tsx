import { ProjectForm } from '@/features/delivery/components/project-form'
import { createProjectAction } from '@/features/delivery/actions/create-project'
import { listProjectFormOptions } from '@/features/delivery/queries/list-project-form-options'

export default async function Page() {
  const options = await listProjectFormOptions()
  return <ProjectForm mode="create" action={createProjectAction} options={options} />
}
