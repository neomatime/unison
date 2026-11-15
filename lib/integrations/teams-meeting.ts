// Microsoft Teams meetings through Microsoft Graph: what is needed to be connected, the request Graph is sent and the
// answer it gives back. Pure: no directive, no imports, so the tests load it directly. The network calls live in
// microsoft-teams.ts.

/** The environment variables a Teams connection needs. The first three are the Entra app registration the mail sender
 *  already uses (lib/env.ts readGraphEnv); the fourth is the mailbox the meetings are created in. */
export const TEAMS_ENV_NAMES = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'TEAMS_ORGANIZER_UPN'] as const

export type TeamsStatus = { connected: boolean; missing: string[] }

/** Whether Teams is configured, and which settings are missing. Names only, never values. */
export function teamsConnectionStatus(source: Record<string, string | undefined>): TeamsStatus {
  const missing = TEAMS_ENV_NAMES.filter((name) => !String(source[name] ?? '').trim())
  return { connected: missing.length === 0, missing }
}

/** bodyHtml is the invitation text, already written as escaped HTML (features/calendar/description.ts). */
export type TeamsAttendee = { name: string; email: string; optional?: boolean }
export type TeamsMeetingInput = { subject: string; startIso: string; endIso: string; bodyHtml?: string | null; /** Who Microsoft invites. Omitted on an update means the list is left as it is. */ attendees?: TeamsAttendee[] }

const graphAttendees = (list: TeamsAttendee[]) => list.map((person) => ({ emailAddress: { address: person.email, name: person.name }, type: person.optional ? 'optional' : 'required' }))

/** The Graph "create event" body that makes an event with a Teams meeting attached. Times go as UTC, which Graph reads
 *  without a timezone lookup. No attendees: the join link is shared by the person who creates the event. */
export function buildTeamsEventBody(input: TeamsMeetingInput) {
  const graphTime = (iso: string) => ({ dateTime: new Date(iso).toISOString().replace('Z', ''), timeZone: 'UTC' })
  return {
    subject: input.subject.slice(0, 255),
    body: { contentType: 'html', content: (input.bodyHtml ?? '').slice(0, 20000) },
    start: graphTime(input.startIso),
    end: graphTime(input.endIso),
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    allowNewTimeProposals: false,
    ...(input.attendees?.length ? { attendees: graphAttendees(input.attendees) } : {}),
  }
}

/** The part of the body that changes when an event is edited later: title, time and, when given, the invitation text. */
export function buildTeamsEventUpdate(input: Pick<TeamsMeetingInput, 'subject' | 'startIso' | 'endIso' | 'bodyHtml' | 'attendees'>) {
  const { subject, start, end, body } = buildTeamsEventBody(input)
  return {
    subject,
    start,
    end,
    ...(input.bodyHtml == null ? {} : { body }),
    // An empty list is sent too: it removes everyone who was invited before.
    ...(input.attendees ? { attendees: graphAttendees(input.attendees) } : {}),
  }
}

export type TeamsMeeting = { eventId: string; joinUrl: string }

/** Reads Graph's answer. Throws when there is no join link, so an event is never saved claiming a meeting it lacks. */
export function readTeamsMeeting(payload: unknown): TeamsMeeting {
  const record = (payload && typeof payload === 'object' ? payload : {}) as { id?: unknown; onlineMeeting?: { joinUrl?: unknown } | null }
  const joinUrl = record.onlineMeeting?.joinUrl
  if (typeof record.id !== 'string' || typeof joinUrl !== 'string' || !/^https:\/\//i.test(joinUrl)) {
    throw new Error('Microsoft Graph did not return a Teams join link for the event.')
  }
  return { eventId: record.id, joinUrl }
}

/** Adds the join line to a description once. */
export function withJoinLink(description: string | null | undefined, joinUrl: string): string {
  const text = String(description ?? '').trim()
  if (text.includes(joinUrl)) return text
  const line = `Join Microsoft Teams meeting: ${joinUrl}`
  return text ? `${text}\n\n${line}` : line
}

export type GraphFailure = 'access-policy' | 'permission' | 'mailbox' | 'other'

/** Why Graph refused. Exchange's application access policy answers 403 ErrorAccessDenied with "AppOnly AccessPolicy" in the
 *  message; any other 403 is a missing or unconsented permission; 404 is a mailbox that does not exist. Each of these an
 *  administrator can fix, so they are told apart from every other failure. */
export function classifyGraphFailure(status: number, body: string): GraphFailure {
  if (status === 403) return /AccessPolicy|RAOP/i.test(body) ? 'access-policy' : 'permission'
  if (status === 404) return 'mailbox'
  return 'other'
}

const POLICY = 'Microsoft Exchange is blocking the app (access policy). An administrator should check the application access policy for the organiser mailbox: see docs/calendar/teams-setup.md.'
const PERMISSION = 'Microsoft refused the app access to calendars. An administrator should check that Calendars.ReadWrite is added as an application permission and has admin consent.'
const MAILBOX = 'The organiser mailbox was not found. Check that TEAMS_ORGANIZER_UPN is a licensed user in the Microsoft 365 tenant.'

/** What the event form says when a meeting could not be created. Never Graph's own text, which can carry identifiers. */
export const TEAMS_FAILURE_MESSAGES: Record<GraphFailure, string> = {
  'access-policy': `${POLICY} The event was not saved.`,
  permission: `${PERMISSION} The event was not saved.`,
  mailbox: `${MAILBOX} The event was not saved.`,
  other: 'The Teams meeting could not be created, so the event was not saved. Try again, or turn off Online meeting to save it without one.',
}

export type TeamsTestReason = GraphFailure | 'token' | 'not-configured'

/** What the Settings "Test connection" button says for each way the test can fail. */
export const TEAMS_TEST_MESSAGES: Record<TeamsTestReason, string> = {
  'not-configured': 'Teams is not connected: some settings are missing (listed above).',
  token: 'Microsoft would not sign the app in. Check GRAPH_TENANT_ID and GRAPH_CLIENT_ID, and that GRAPH_CLIENT_SECRET is current (secrets expire).',
  'access-policy': POLICY,
  permission: PERMISSION,
  mailbox: MAILBOX,
  other: 'Microsoft Graph could not be reached or answered with an error. Try again; the server log has the detail.',
}

export type TeamsTestResult = { ok: true; message: string } | { ok: false; reason: TeamsTestReason; message: string }
