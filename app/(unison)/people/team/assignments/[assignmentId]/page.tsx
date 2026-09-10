import { PhaseFourDetail } from '@/features/operations/components/phase-four-detail'

export default async function Page({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  return <PhaseFourDetail kind="assignment" id={assignmentId} />
}
