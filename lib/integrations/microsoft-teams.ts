import 'server-only'
import { getGraphAccessToken } from '@/lib/email/graph'
import { buildTeamsEventBody, classifyGraphFailure, TEAMS_TEST_MESSAGES, type GraphFailure, type TeamsTestResult, buildTeamsEventUpdate, readTeamsMeeting, teamsConnectionStatus, type TeamsMeeting, type TeamsMeetingInput, type TeamsStatus } from './teams-meeting'

// Creates Teams meetings as events in one organiser mailbox, using the app registration that already sends UNISON's
// mail (client-credentials grant, no sign-in involved). Needs the Calendars.ReadWrite application permission with admin
// consent, limited to the organiser's mailbox by an Exchange application access policy. docs/calendar/teams-setup.md has
// the steps and the other options that were weighed.
//
// Everything is read lazily, at the moment a meeting is asked for. A missing setting never breaks the calendar: the form
// shows "Teams not connected" and an event is saved without a meeting.

export class TeamsNotConnectedError extends Error {
  constructor() {
    super('Microsoft Teams is not connected for this workspace.')
    this.name = 'TeamsNotConnectedError'
  }
}

/** A Graph call that was refused. The message keeps Graph's own detail for the server log; `reason` is what the form acts on. */
export class TeamsGraphError extends Error {
  reason: GraphFailure

  constructor(message: string, reason: GraphFailure) {
    super(message)
    this.name = 'TeamsGraphError'
    this.reason = reason
  }
}

export function getTeamsStatus(): TeamsStatus {
  return teamsConnectionStatus(process.env)
}

function organizer(): string {
  const status = getTeamsStatus()
  if (!status.connected) throw new TeamsNotConnectedError()
  return encodeURIComponent(String(process.env.TEAMS_ORGANIZER_UPN).trim())
}

async function graph(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { authorization: `Bearer ${await getGraphAccessToken()}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new TeamsGraphError(`Microsoft Graph ${method} ${path.split('/').slice(-1)[0]} failed (${response.status}): ${detail.slice(0, 400)}`, classifyGraphFailure(response.status, detail))
  }
  return response.status === 204 ? null : response.json()
}

/** Creates the event and its Teams meeting. Throws TeamsNotConnectedError when Teams is not configured. */
export async function createTeamsMeeting(input: TeamsMeetingInput): Promise<TeamsMeeting> {
  const user = organizer()
  return readTeamsMeeting(await graph('POST', `/users/${user}/events`, buildTeamsEventBody(input)))
}

/** Keeps the Teams event's title and time in step with an edited event. */
export async function updateTeamsMeeting(eventId: string, input: Pick<TeamsMeetingInput, 'subject' | 'startIso' | 'endIso' | 'bodyHtml' | 'attendees'>): Promise<void> {
  const user = organizer()
  await graph('PATCH', `/users/${user}/events/${encodeURIComponent(eventId)}`, buildTeamsEventUpdate(input))
}

/** Removes a Teams event, used to clean up when the calendar event could not be saved after the meeting was created. */
export async function deleteTeamsMeeting(eventId: string): Promise<void> {
  const user = organizer()
  await graph('DELETE', `/users/${user}/events/${encodeURIComponent(eventId)}`)
}

/** The organiser mailbox, for display. An address, never a secret. */
export function getTeamsOrganizer(): string | null {
  return String(process.env.TEAMS_ORGANIZER_UPN ?? '').trim() || null
}

/** Asks Microsoft for a token and then for the organiser mailbox's calendar. A read only: no meeting or event is created. */
export async function testTeamsConnection(): Promise<TeamsTestResult> {
  const fail = (reason: keyof typeof TEAMS_TEST_MESSAGES): TeamsTestResult => ({ ok: false, reason, message: TEAMS_TEST_MESSAGES[reason] })
  if (!getTeamsStatus().connected) return fail('not-configured')
  try {
    await getGraphAccessToken()
  } catch (error) {
    console.error('Teams connection test: token request failed', error instanceof Error ? error.message : error)
    return fail('token')
  }
  try {
    await graph('GET', `/users/${organizer()}/calendar?$select=id,name`)
    return { ok: true, message: `Connected. UNISON can reach the calendar of ${getTeamsOrganizer()}.` }
  } catch (error) {
    console.error('Teams connection test failed', error)
    return fail(error instanceof TeamsGraphError ? error.reason : 'other')
  }
}
