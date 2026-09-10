import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'

export default async function Page({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params
  return <PhaseSixDetail kind="quote" id={quoteId} />
}
