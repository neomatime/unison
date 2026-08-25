import { ProjectForm } from '@/features/delivery/components/project-form'

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return <ProjectForm mode="edit" projectId={projectId} />
}
