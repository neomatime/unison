'use server'

import { revalidatePath } from 'next/cache'

import { getPlatformAutomationAccess } from '@/features/platform-automation/queries'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { testTeamsConnection, updateTeamsMeeting } from '@/lib/integrations/microsoft-teams'
import type { TeamsTestResult } from '@/lib/integrations/teams-meeting'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

export type RescheduleResult = { ok: true } | { ok: false; error: string }

/** Moves an event to a new start and end (the calendar's drag and drop). Only the two times change. */
export async function rescheduleEventAction(id: string, startAt: string, endAt: string): Promise<RescheduleResult> {
  const start = Date.parse(startAt)
  const end = Date.parse(endAt)
  if (!isUuid(id) || Number.isNaN(start) || Number.isNaN(end) || end < start) return { ok: false, error: 'That move is not valid.' }

  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const result = await db
    .from('calendar_events')
    .update({ start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString() })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .select('title,teams_event_id')
    .maybeSingle()
  if (result.error || !result.data) return { ok: false, error: 'The event could not be moved. Reload the calendar and try again.' }

  // Keep a Teams meeting's time in step. The event is already saved, so a failure here is logged, not shown.
  if (result.data.teams_event_id) {
    try {
      await updateTeamsMeeting(result.data.teams_event_id, { subject: result.data.title, startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() })
    } catch (error) {
      console.error('Teams meeting move failed', error)
    }
  }
  revalidatePath('/operations/calendar')
  return { ok: true }
}

/** Settings > Integrations > Microsoft Teams > Test connection. Owners and admins only; it reads the organiser's calendar and creates nothing. */
export async function testTeamsConnectionAction(): Promise<TeamsTestResult> {
  if (!(await getPlatformAutomationAccess()).canManage) return { ok: false, reason: 'other', message: 'Only an owner or an admin can test the connection.' }
  return testTeamsConnection()
}
