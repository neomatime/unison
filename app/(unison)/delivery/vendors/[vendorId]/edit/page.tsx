import { notFound } from 'next/navigation'

import { PhaseFourForm } from '@/features/operations/components/phase-four-form'
import { getPhaseFourOptions, getPhaseFourRecord } from '@/features/operations/queries/phase-four'

export default async function Page({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params
  const [record, options] = await Promise.all([getPhaseFourRecord('vendor', vendorId), getPhaseFourOptions()])
  if (!record) notFound()
  return <PhaseFourForm kind="vendor" record={record} options={options} />
}
