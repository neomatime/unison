import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTeamsEventBody, buildTeamsEventUpdate, readTeamsMeeting, teamsConnectionStatus, withJoinLink } from '../../lib/integrations/teams-meeting.ts'

const complete = { GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's', TEAMS_ORGANIZER_UPN: 'meetings@example.com' }

test('connection: connected only when every setting is present, and the missing ones are named', () => {
  assert.deepEqual(teamsConnectionStatus(complete), { connected: true, missing: [] })
  assert.deepEqual(teamsConnectionStatus({}), { connected: false, missing: ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'TEAMS_ORGANIZER_UPN'] })
  assert.deepEqual(teamsConnectionStatus({ ...complete, TEAMS_ORGANIZER_UPN: '  ' }).missing, ['TEAMS_ORGANIZER_UPN'])
})

test('connection: the status never carries a value', () => {
  assert.ok(!JSON.stringify(teamsConnectionStatus({ ...complete, GRAPH_CLIENT_SECRET: '' })).includes('meetings@example.com'))
})

test('request: a Teams meeting event is sent in UTC with the Teams provider', () => {
  const body = buildTeamsEventBody({ subject: 'Kick-off', startIso: '2026-11-16T10:00:00.000Z', endIso: '2026-11-16T11:00:00.000Z', description: 'Agenda' })
  assert.equal(body.isOnlineMeeting, true)
  assert.equal(body.onlineMeetingProvider, 'teamsForBusiness')
  assert.deepEqual(body.start, { dateTime: '2026-11-16T10:00:00.000', timeZone: 'UTC' })
  assert.deepEqual(body.end, { dateTime: '2026-11-16T11:00:00.000', timeZone: 'UTC' })
  assert.equal(body.body.content, 'Agenda')
  assert.ok(!('attendees' in body))
})

test('request: an update carries only the title and times', () => {
  const update = buildTeamsEventUpdate({ subject: 'Moved', startIso: '2026-11-17T10:00:00.000Z', endIso: '2026-11-17T11:00:00.000Z' })
  assert.deepEqual(Object.keys(update).sort(), ['end', 'start', 'subject'])
})

test('response: the event id and join link are read, and a missing link is an error', () => {
  assert.deepEqual(readTeamsMeeting({ id: 'AAA', onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/x' } }), { eventId: 'AAA', joinUrl: 'https://teams.microsoft.com/l/meetup-join/x' })
  assert.throws(() => readTeamsMeeting({ id: 'AAA', onlineMeeting: null }))
  assert.throws(() => readTeamsMeeting({ id: 'AAA', onlineMeeting: { joinUrl: 'http://insecure' } }))
  assert.throws(() => readTeamsMeeting(null))
})

test('description: the join line is added once', () => {
  const url = 'https://teams.microsoft.com/l/meetup-join/x'
  assert.equal(withJoinLink('', url), `Join Microsoft Teams meeting: ${url}`)
  const once = withJoinLink('Agenda', url)
  assert.equal(once, `Agenda\n\nJoin Microsoft Teams meeting: ${url}`)
  assert.equal(withJoinLink(once, url), once)
})

test('failure: the Exchange access policy 403 is told apart, anything else is generic', async () => {
  const { classifyGraphFailure, TEAMS_FAILURE_MESSAGES } = await import('../../lib/integrations/teams-meeting.ts')
  const policy = '{"error":{"code":"ErrorAccessDenied","message":"Access to OData is disabled: [RAOP] : Blocked by tenant configured AppOnly AccessPolicy settings."}}'
  assert.equal(classifyGraphFailure(403, policy), 'access-policy')
  assert.equal(classifyGraphFailure(403, '{"error":{"code":"Authorization_RequestDenied"}}'), 'other')
  assert.equal(classifyGraphFailure(500, policy), 'other')
  assert.equal(classifyGraphFailure(401, ''), 'other')
  assert.match(TEAMS_FAILURE_MESSAGES['access-policy'], /^Microsoft Exchange is blocking the app \(access policy\)\./)
  assert.match(TEAMS_FAILURE_MESSAGES['access-policy'], /teams-setup\.md/)
  // The messages never carry Graph's own text.
  assert.ok(!Object.values(TEAMS_FAILURE_MESSAGES).some((message) => /ErrorAccessDenied|RAOP|OData/.test(message)))
})
