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
export type TeamsMeetingInput = { subject: string; startIso: string; endIso: string; bodyHtml?: string | null }

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
  }
}

/** The part of the body that changes when an event is edited later: title, time and, when given, the invitation text. */
export function buildTeamsEventUpdate(input: Pick<TeamsMeetingInput, 'subject' | 'startIso' | 'endIso' | 'bodyHtml'>) {
  const { subject, start, end, body } = buildTeamsEventBody(input)
  return input.bodyHtml == null ? { subject, start, end } : { subject, start, end, body }
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

export type GraphFailure = 'access-policy' | 'other'

/** Why Graph refused. Exchange's application access policy answers 403 ErrorAccessDenied with "AppOnly AccessPolicy" in
 *  the message; that one an administrator can fix, so it is told apart from every other failure. */
export function classifyGraphFailure(status: number, body: string): GraphFailure {
  return status === 403 && /AccessPolicy|RAOP/i.test(body) ? 'access-policy' : 'other'
}

/** What the form says for each failure. Never Graph's own text, which can carry identifiers. */
export const TEAMS_FAILURE_MESSAGES: Record<GraphFailure, string> = {
  'access-policy':
    'Microsoft Exchange is blocking the app (access policy). An administrator should check the application access policy for the organiser mailbox: see docs/calendar/teams-setup.md. The event was not saved.',
  other: 'The Teams meeting could not be created, so the event was not saved. Try again, or turn off Online meeting to save it without one.',
}
