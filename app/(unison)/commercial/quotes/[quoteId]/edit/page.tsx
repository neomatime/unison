import { notFound } from 'next/navigation'

import { PhaseSixForm } from '@/features/commercial-finance/components/phase-six-form'
import { getPhaseSixOptions, getPhaseSixRecord } from '@/features/commercial-finance/queries/phase-six'

export default async function Page({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params
  const [record, options] = await Promise.all([getPhaseSixRecord('quote', quoteId), getPhaseSixOptions()])
  if (!record) notFound()
  return <PhaseSixForm kind="quote" record={record} options={options} />
}
