import { PhaseFourDetail } from '@/features/operations/components/phase-four-detail'

export default async function Page({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  return <PhaseFourDetail kind="task" id={taskId} />
}
