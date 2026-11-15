import assert from 'node:assert/strict'
import test from 'node:test'

import { countIntegrations, hiveIntegration, teamsIntegration } from '../../features/platform-automation/built-in-integrations.ts'

test('Teams: connected with all settings, not connected with none, needs attention when only some are set', () => {
  const connected = teamsIntegration({ connected: true, missing: [] }, 'neo.matime@himark.co.za')
  assert.equal(connected.status, 'Connected')
  assert.match(connected.detail, /neo\.matime@himark\.co\.za/)
  assert.equal(teamsIntegration({ connected: false, missing: ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'TEAMS_ORGANIZER_UPN'] }, null).status, 'Not connected')
  const partly = teamsIntegration({ connected: false, missing: ['GRAPH_CLIENT_SECRET', 'TEAMS_ORGANIZER_UPN'] }, null)
  assert.equal(partly.status, 'Needs attention')
  assert.equal(partly.detail, 'Missing GRAPH_CLIENT_SECRET, TEAMS_ORGANIZER_UPN')
})

test('HIVE: on when a live feed key exists, off without one, and not guessed for someone who cannot see keys', () => {
  assert.equal(hiveIntegration({ hasLiveKey: true, lastReadAt: '2026-11-15T08:00:00Z' }).status, 'Connected')
  assert.equal(hiveIntegration({ hasLiveKey: true, lastReadAt: null }).detail, 'Key created, not read yet')
  assert.equal(hiveIntegration({ hasLiveKey: false, lastReadAt: null }).status, 'Not connected')
  assert.equal(hiveIntegration(null).status, 'Admin only')
})

test('counts: both built-ins count as connections, only connected ones as active, partly set ones need attention', () => {
  const teams = teamsIntegration({ connected: true, missing: [] }, 'a@b.co')
  const hive = hiveIntegration({ hasLiveKey: true, lastReadAt: null })
  assert.deepEqual(countIntegrations([teams, hive], { total: 0, connected: 0, errors: 0 }), { connections: 2, active: 2, attention: 0 })
  const off = teamsIntegration({ connected: false, missing: ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'TEAMS_ORGANIZER_UPN'] }, null)
  assert.deepEqual(countIntegrations([off, hiveIntegration(null)], { total: 0, connected: 0, errors: 0 }), { connections: 2, active: 0, attention: 0 })
  const partly = teamsIntegration({ connected: false, missing: ['TEAMS_ORGANIZER_UPN'] }, null)
  assert.deepEqual(countIntegrations([partly, hive], { total: 3, connected: 2, errors: 1 }), { connections: 5, active: 3, attention: 2 })
})
