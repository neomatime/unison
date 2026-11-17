import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { buildAccessEntries, mayChangeRole, mayChooseAdvanceRole } from '../../features/memberships/access-model.ts'

const members = [
  { userId: 'u-neo', name: 'Neo Matime', email: 'neo.matime@himark.co.za', roleId: 'owner', status: 'active' },
  { userId: 'u-info', name: 'HIMARK Enquiries', email: 'info@himark.co.za', roleId: 'member', status: 'active' },
  { userId: 'u-gone', name: 'Gone', email: 'gone@himark.co.za', roleId: 'member', status: 'removed' },
]
const directory = [
  { name: 'Neo Matime', email: 'neo.matime@himark.co.za' },
  { name: 'Thelma Mothiba', email: 'thelma.mothiba@himark.co.za' },
  { name: 'Neo Mokgwadi', email: 'neo.mokgwadi@himark.co.za' },
  { name: 'Shared', email: 'shared@himark.co.za' },
]

test('Users & access lists members, then directory people who have not signed in, minus the hidden', () => {
  const entries = buildAccessEntries({ members, directory, hidden: ['SHARED@himark.co.za'], pending: { 'thelma.mothiba@himark.co.za': 'admin' } })
  assert.deepEqual(entries.map((entry) => entry.name), ['HIMARK Enquiries', 'Neo Matime', 'Neo Mokgwadi', 'Thelma Mothiba'])
  assert.deepEqual(entries.map((entry) => entry.signedIn), [true, true, false, false])
  const thelma = entries.find((entry) => entry.name === 'Thelma Mothiba')!
  assert.equal(thelma.roleId, 'admin')
  assert.equal(thelma.chosenInAdvance, true)
  const mokgwadi = entries.find((entry) => entry.name === 'Neo Mokgwadi')!
  assert.equal(mokgwadi.roleId, 'member', 'the default role until one is chosen')
  assert.equal(mokgwadi.chosenInAdvance, false)
  assert.equal(entries.some((entry) => entry.name === 'Gone'), false, 'removed members are not listed')
})

test('only an Owner changes a role, never their own, and Owner cannot be chosen in advance', () => {
  assert.equal(mayChangeRole('owner', 'a', 'b'), true)
  assert.equal(mayChangeRole('owner', 'a', 'a'), false)
  assert.equal(mayChangeRole('admin', 'a', 'b'), false)
  assert.equal(mayChangeRole('member', 'a', 'b'), false)
  assert.equal(mayChooseAdvanceRole('admin', 'member'), true)
  assert.equal(mayChooseAdvanceRole('owner', 'admin'), true)
  assert.equal(mayChooseAdvanceRole('owner', 'owner'), false)
  assert.equal(mayChooseAdvanceRole('member', 'member'), false)
})

test('Settings is one frame: the tabs live in a shared layout and the tab pages bring no heading of their own', () => {
  const layout = readFileSync('app/(unison)/settings/(tabs)/layout.tsx', 'utf8')
  assert.match(layout, /OrganizationSettingsFrame/)
  const frame = readFileSync('features/organizations/components/organization-profile-screen.tsx', 'utf8')
  assert.match(frame, /<AutomationSettingsNav/)
  const nav = readFileSync('features/platform-automation/components/automation-nav.tsx', 'utf8')
  assert.match(nav, /'Users & access'/)
  for (const tab of ['page.tsx', 'access/page.tsx', 'integrations/page.tsx', 'automations/page.tsx', 'jobs/page.tsx']) {
    const source = readFileSync(`app/(unison)/settings/(tabs)/${tab}`, 'utf8')
    assert.doesNotMatch(source, /WorkspaceHeader|AutomationSettingsNav/, `${tab} must not repeat the heading or tabs`)
  }
  const pages = readFileSync('features/platform-automation/components/platform-pages.tsx', 'utf8')
  for (const title of ['Integrations', 'Automations', 'Jobs & schedules']) assert.doesNotMatch(pages, new RegExp(`WorkspaceHeader category="Settings" title="${title}"`))
})

test('the role actions are guarded, and the database keeps the advance role for the first sign-in', () => {
  const action = readFileSync('features/memberships/actions/set-role.ts', 'utf8')
  assert.match(action, /mayChangeRole/)
  assert.match(action, /mayChooseAdvanceRole/)
  assert.match(action, /listDirectoryPeople/, 'the address must really be in the directory')
  const sql = readFileSync('supabase/migrations/20261117120000_pending_access.sql', 'utf8')
  assert.match(sql, /before insert on public\.memberships/)
  assert.match(sql, /role_id in \('admin', 'member'\)/)
})
