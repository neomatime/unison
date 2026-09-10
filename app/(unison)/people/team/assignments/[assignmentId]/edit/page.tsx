import { notFound } from 'next/navigation'

import { PhaseFourForm } from '@/features/operations/components/phase-four-form'
import { getPhaseFourOptions, getPhaseFourRecord } from '@/features/operations/queries/phase-four'

export default async function Page({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  const [record, options] = await Promise.all([getPhaseFourRecord('assignment', assignmentId), getPhaseFourOptions()])
  if (!record) notFound()
  return <PhaseFourForm kind="assignment" record={record} options={options} />
}
