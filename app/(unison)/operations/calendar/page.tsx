import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { CalendarWorkspace } from '@/features/calendar/components/calendar-workspace'
import { parseCalendarParams, todayKey, type CalendarEvent } from '@/features/calendar/model'
import { PhaseFourRegister } from '@/features/operations/components/phase-four-register'
import { listCalendarEvents } from '@/features/operations/queries/phase-four'
import { getTeamsStatus } from '@/lib/integrations/microsoft-teams'

const text = (value: unknown) => (value === null || value === undefined || value === '' ? null : String(value))

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const rows = await listCalendarEvents()
  const now = Date.now()
  const { view, date } = parseCalendarParams(await searchParams, now)
  const events: CalendarEvent[] = rows
    .filter((row) => !row.archivedAt)
    .map((row) => ({
      id: row.id,
      title: String(row.title ?? row.name),
      eventType: String(row.eventType ?? 'Internal'),
      startAt: String(row.startAt),
      endAt: String(row.endAt),
      allDay: Boolean(row.allDay),
      status: String(row.status),
      location: text(row.location),
      owner: text(row.owner),
      client: text(row.client) === '—' ? null : text(row.client),
      project: text(row.project) === '—' ? null : text(row.project),
      teamsJoinUrl: text(row.teamsJoinUrl),
    }))
  return (
    <>
      <WorkspaceHeader category="Operations" title="Calendar" description="Coordinate persistent delivery, client and governance events." action="New Event" actionHref="/operations/calendar/new" />
      <CalendarWorkspace
        events={events}
        initialView={view}
        initialDate={date}
        today={todayKey(now)}
        teamsConnected={getTeamsStatus().connected}
        listPanel={<PhaseFourRegister kind="calendar-event" slim hideHeader rows={rows} />}
      />
    </>
  )
}
