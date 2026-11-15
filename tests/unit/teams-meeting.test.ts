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
  const body = buildTeamsEventBody({ subject: 'Kick-off', startIso: '2026-11-16T10:00:00.000Z', endIso: '2026-11-16T11:00:00.000Z', bodyHtml: '<p>Agenda</p>' })
  assert.equal(body.isOnlineMeeting, true)
  assert.equal(body.onlineMeetingProvider, 'teamsForBusiness')
  assert.deepEqual(body.start, { dateTime: '2026-11-16T10:00:00.000', timeZone: 'UTC' })
  assert.deepEqual(body.end, { dateTime: '2026-11-16T11:00:00.000', timeZone: 'UTC' })
  assert.deepEqual(body.body, { contentType: 'html', content: '<p>Agenda</p>' })
  assert.ok(!('attendees' in body))
})

test('request: an update carries the title and times, and the text only when given', () => {
  const update = buildTeamsEventUpdate({ subject: 'Moved', startIso: '2026-11-17T10:00:00.000Z', endIso: '2026-11-17T11:00:00.000Z' })
  assert.deepEqual(Object.keys(update).sort(), ['end', 'start', 'subject'])
  const withText = buildTeamsEventUpdate({ subject: 'Moved', startIso: '2026-11-17T10:00:00.000Z', endIso: '2026-11-17T11:00:00.000Z', bodyHtml: '<p>x</p>' })
  assert.deepEqual(Object.keys(withText).sort(), ['body', 'end', 'start', 'subject'])
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
  assert.equal(classifyGraphFailure(403, '{"error":{"code":"Authorization_RequestDenied"}}'), 'permission')
  assert.equal(classifyGraphFailure(404, '{"error":{"code":"ErrorInvalidUser"}}'), 'mailbox')
  assert.equal(classifyGraphFailure(500, policy), 'other')
  assert.equal(classifyGraphFailure(401, ''), 'other')
  assert.match(TEAMS_FAILURE_MESSAGES['access-policy'], /^Microsoft Exchange is blocking the app \(access policy\)\./)
  assert.match(TEAMS_FAILURE_MESSAGES['access-policy'], /teams-setup\.md/)
  // The messages never carry Graph's own text.
  assert.ok(!Object.values(TEAMS_FAILURE_MESSAGES).some((message) => /ErrorAccessDenied|RAOP|OData/.test(message)))
})

test('attendees: they go on the Graph event as required attendees, and an update can clear them', () => {
  const people = [{ name: 'Thandi', email: 'thandi@example.com' }]
  const times = { subject: 'Kick-off', startIso: '2026-11-16T10:00:00.000Z', endIso: '2026-11-16T11:00:00.000Z' }
  const body = buildTeamsEventBody({ ...times, attendees: people })
  assert.deepEqual(body.attendees, [{ emailAddress: { address: 'thandi@example.com', name: 'Thandi' }, type: 'required' }])
  // No one invited: no attendees key at all, so no invitation goes out.
  assert.ok(!('attendees' in buildTeamsEventBody({ ...times, attendees: [] })))
  assert.ok(!('attendees' in buildTeamsEventUpdate(times)))
  assert.deepEqual(buildTeamsEventUpdate({ ...times, attendees: [] }).attendees, [])
  assert.equal(buildTeamsEventUpdate({ ...times, attendees: people }).attendees?.length, 1)
})

test('connection test: every failure has a plain message that never carries Graph text or a secret', async () => {
  const { TEAMS_TEST_MESSAGES, TEAMS_FAILURE_MESSAGES } = await import('../../lib/integrations/teams-meeting.ts')
  assert.deepEqual(Object.keys(TEAMS_TEST_MESSAGES).sort(), ['access-policy', 'mailbox', 'not-configured', 'other', 'permission', 'token'])
  assert.match(TEAMS_TEST_MESSAGES['access-policy'], /^Microsoft Exchange is blocking the app \(access policy\)\./)
  assert.match(TEAMS_FAILURE_MESSAGES.permission, /Calendars\.ReadWrite/)
  for (const message of [...Object.values(TEAMS_TEST_MESSAGES), ...Object.values(TEAMS_FAILURE_MESSAGES)]) assert.ok(!/ErrorAccessDenied|RAOP|OData|Bearer|eyJ/.test(message))
  // Naming a setting is fine; no message holds a value.
  assert.ok(!Object.values(TEAMS_TEST_MESSAGES).some((message) => /@/.test(message)))
})
