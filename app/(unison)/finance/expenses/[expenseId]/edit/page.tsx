import { notFound } from 'next/navigation'

import { PhaseSixForm } from '@/features/commercial-finance/components/phase-six-form'
import { getPhaseSixOptions, getPhaseSixRecord } from '@/features/commercial-finance/queries/phase-six'

export default async function Page({ params }: { params: Promise<{ expenseId: string }> }) {
  const { expenseId } = await params
  const [record, options] = await Promise.all([getPhaseSixRecord('expense', expenseId), getPhaseSixOptions()])
  if (!record) notFound()
  return <PhaseSixForm kind="expense" record={record} options={options} />
}
