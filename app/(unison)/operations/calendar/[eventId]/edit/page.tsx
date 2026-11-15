import { getTeamsStatus } from '@/lib/integrations/microsoft-teams'
import { notFound } from 'next/navigation'

import { PhaseFourForm } from '@/features/operations/components/phase-four-form'
import { rowToCalendarEvent } from '@/features/calendar/model'
import { getInvitablePeople, getPhaseFourOptions, getPhaseFourRecord, listCalendarEvents } from '@/features/operations/queries/phase-four'

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const [record, options, rows, people] = await Promise.all([getPhaseFourRecord('calendar-event', eventId), getPhaseFourOptions(), listCalendarEvents(), getInvitablePeople()])
  if (!record) notFound()
  return <PhaseFourForm kind="calendar-event" record={record} options={options} teamsConnected={getTeamsStatus().connected} scheduleEvents={rows.filter((row) => !row.archivedAt).map(rowToCalendarEvent)} people={people} />
}
