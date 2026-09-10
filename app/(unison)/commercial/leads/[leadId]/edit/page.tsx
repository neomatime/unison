import { notFound } from 'next/navigation'

import { PhaseSixForm } from '@/features/commercial-finance/components/phase-six-form'
import { getPhaseSixOptions, getPhaseSixRecord } from '@/features/commercial-finance/queries/phase-six'

export default async function Page({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  const [record, options] = await Promise.all([getPhaseSixRecord('lead', leadId), getPhaseSixOptions()])
  if (!record) notFound()
  return <PhaseSixForm kind="lead" record={record} options={options} />
}
