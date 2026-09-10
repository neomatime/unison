import { notFound } from 'next/navigation'

import { PhaseFourForm } from '@/features/operations/components/phase-four-form'
import { getPhaseFourOptions, getPhaseFourRecord } from '@/features/operations/queries/phase-four'

export default async function Page({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params
  const [record, options] = await Promise.all([getPhaseFourRecord('team-member', employeeId), getPhaseFourOptions()])
  if (!record) notFound()
  return <PhaseFourForm kind="team-member" record={record} options={options} />
}
