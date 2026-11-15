import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { CalendarWorkspace } from '@/features/calendar/components/calendar-workspace'
import { parseCalendarParams, rowToCalendarEvent, todayKey, type CalendarEvent } from '@/features/calendar/model'
import { PhaseFourRegister } from '@/features/operations/components/phase-four-register'
import { listCalendarEvents } from '@/features/operations/queries/phase-four'
import { getTeamsStatus } from '@/lib/integrations/microsoft-teams'

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; owner?: string; client?: string }> }) {
  const rows = await listCalendarEvents()
  const now = Date.now()
  const params = await searchParams
  const { view, date } = parseCalendarParams(params, now)
  const events: CalendarEvent[] = rows.filter((row) => !row.archivedAt).map(rowToCalendarEvent)
  return (
    <>
      <WorkspaceHeader category="Operations" title="Calendar" description="Coordinate persistent delivery, client and governance events." action="New Event" actionHref="/operations/calendar/new" />
      <CalendarWorkspace
        events={events}
        initialView={view}
        initialDate={date}
        today={todayKey(now)}
        initialOwner={typeof params.owner === 'string' ? params.owner.slice(0, 120) : ''}
        initialClient={typeof params.client === 'string' ? params.client.slice(0, 120) : ''}
        teamsConnected={getTeamsStatus().connected}
        listPanel={<PhaseFourRegister kind="calendar-event" slim hideHeader rows={rows} />}
      />
    </>
  )
}
