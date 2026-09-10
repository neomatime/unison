import { notFound } from 'next/navigation'

import { PhaseSixForm } from '@/features/commercial-finance/components/phase-six-form'
import { getPhaseSixOptions, getPhaseSixRecord } from '@/features/commercial-finance/queries/phase-six'

export default async function Page({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  const [record, options] = await Promise.all([getPhaseSixRecord('invoice', invoiceId), getPhaseSixOptions()])
  if (!record) notFound()
  return <PhaseSixForm kind="invoice" record={record} options={options} />
}
