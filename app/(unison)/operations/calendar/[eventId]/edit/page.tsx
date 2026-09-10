import { notFound } from 'next/navigation'

import { PhaseFourForm } from '@/features/operations/components/phase-four-form'
import { getPhaseFourOptions, getPhaseFourRecord } from '@/features/operations/queries/phase-four'

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const [record, options] = await Promise.all([getPhaseFourRecord('calendar-event', eventId), getPhaseFourOptions()])
  if (!record) notFound()
  return <PhaseFourForm kind="calendar-event" record={record} options={options} />
}
