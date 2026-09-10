import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'

export default async function Page({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params
  return <PhaseSixDetail kind="opportunity" id={opportunityId} />
}
