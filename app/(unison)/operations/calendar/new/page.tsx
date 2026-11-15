import { parseNewEventTimes, rowToCalendarEvent } from '@/features/calendar/model'
import { PhaseFourForm } from '@/features/operations/components/phase-four-form'
import { getInvitablePeople, getPhaseFourOptions, listCalendarEvents } from '@/features/operations/queries/phase-four'
import { getTeamsStatus } from '@/lib/integrations/microsoft-teams'
import { isUuid } from '@/lib/utils'

const clip = (value: string | undefined, length: number) => (value ? value.slice(0, length) : undefined)

// A new event can be started with a title, client, description and type, as Schedule Engagement on the Overview map does,
// and with a start and end (YYYY-MM-DDTHH:mm on the Johannesburg clock), as a click on an empty slot in the calendar does.
export default async function Page({ searchParams }: { searchParams: Promise<{ title?: string; clientId?: string; description?: string; eventType?: string; start?: string; end?: string }> }) {
  const params = await searchParams
  const defaults = {
    title: clip(params.title, 200),
    clientId: params.clientId && isUuid(params.clientId) ? params.clientId : undefined,
    description: clip(params.description, 2000),
    eventType: params.eventType === 'Client Meeting' ? 'Client Meeting' : undefined,
    ...parseNewEventTimes({ start: clip(params.start, 16), end: clip(params.end, 16) }),
  }
  const [options, rows, people] = await Promise.all([getPhaseFourOptions(), listCalendarEvents(), getInvitablePeople()])
  const scheduleEvents = rows.filter((row) => !row.archivedAt).map(rowToCalendarEvent)
  return <PhaseFourForm kind="calendar-event" options={options} defaults={defaults} teamsConnected={getTeamsStatus().connected} scheduleEvents={scheduleEvents} people={people} />
}
