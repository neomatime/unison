import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'

export default async function Page({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  return <PhaseSixDetail kind="invoice" id={invoiceId} />
}
