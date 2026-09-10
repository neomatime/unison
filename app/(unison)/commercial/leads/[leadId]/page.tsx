import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'

export default async function Page({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  return <PhaseSixDetail kind="lead" id={leadId} />
}
