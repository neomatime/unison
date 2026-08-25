import { ProjectDetailScreen } from '@/features/delivery/components/project-detail-screen'

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  return <ProjectDetailScreen projectId={projectId} />
}
