import { notFound } from 'next/navigation'

import { PhaseFourForm } from '@/features/operations/components/phase-four-form'
import { getPhaseFourOptions, getPhaseFourRecord } from '@/features/operations/queries/phase-four'

export default async function Page({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  const [record, options] = await Promise.all([getPhaseFourRecord('task', taskId), getPhaseFourOptions()])
  if (!record) notFound()
  return <PhaseFourForm kind="task" record={record} options={options} />
}
