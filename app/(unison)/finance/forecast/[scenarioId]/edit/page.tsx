import { notFound } from 'next/navigation'

import { PhaseSixForm } from '@/features/commercial-finance/components/phase-six-form'
import { getPhaseSixOptions, getPhaseSixRecord } from '@/features/commercial-finance/queries/phase-six'

export default async function Page({ params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = await params
  const [record, options] = await Promise.all([getPhaseSixRecord('forecast', scenarioId), getPhaseSixOptions()])
  if (!record) notFound()
  return <PhaseSixForm kind="forecast" record={record} options={options} />
}
