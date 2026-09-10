import { PhaseFourDetail } from '@/features/operations/components/phase-four-detail'

export default async function Page({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params
  return <PhaseFourDetail kind="team-member" id={employeeId} />
}
