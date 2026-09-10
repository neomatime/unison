import { notFound } from 'next/navigation'

import { PhaseSixForm } from '@/features/commercial-finance/components/phase-six-form'
import { getPhaseSixOptions, getPhaseSixRecord } from '@/features/commercial-finance/queries/phase-six'

export default async function Page({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params
  const [record, options] = await Promise.all([getPhaseSixRecord('opportunity', opportunityId), getPhaseSixOptions()])
  if (!record) notFound()
  return <PhaseSixForm kind="opportunity" record={record} options={options} />
}
