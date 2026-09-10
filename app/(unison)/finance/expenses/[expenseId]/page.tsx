import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'

export default async function Page({ params }: { params: Promise<{ expenseId: string }> }) {
  const { expenseId } = await params
  return <PhaseSixDetail kind="expense" id={expenseId} />
}
