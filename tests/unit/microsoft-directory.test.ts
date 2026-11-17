import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { directoryPeople } from '../../lib/integrations/microsoft-directory-model.ts'

const rows = [
  { id: '1', displayName: 'Thelma Mothiba', mail: 'Thelma.Mothiba@himark.co.za', accountEnabled: true, userType: 'Member', jobTitle: 'Analyst' },
  { id: '2', displayName: 'Neo Matime', mail: null, userPrincipalName: 'neo.matime@himark.co.za', accountEnabled: true, userType: 'Member' },
  { id: '3', displayName: 'Outside Guest', mail: 'guest@gmail.com', accountEnabled: true, userType: 'Guest' },
  { id: '4', displayName: 'Guest on domain', mail: 'g@himark.co.za', accountEnabled: true, userType: 'Guest' },
  { id: '5', displayName: 'Shared inbox', mail: 'old@himark.co.za', accountEnabled: false, userType: 'Member' },
  { id: '6', displayName: 'Other company', mail: 'x@himark.com', accountEnabled: true, userType: 'Member' },
  { id: '7', displayName: '', mail: 'noname@himark.co.za', accountEnabled: true },
]

test('the directory keeps enabled members on the organisation domain, sorted by name', () => {
  const people = directoryPeople(rows, '@HIMARK.co.za')
  assert.deepEqual(people.map((p) => p.email), ['neo.matime@himark.co.za', 'noname@himark.co.za', 'thelma.mothiba@himark.co.za'])
  assert.equal(people[2].jobTitle, 'Analyst')
  assert.equal(people[1].name, 'noname@himark.co.za', 'a missing display name falls back to the address')
})

test('no domain or malformed rows give nobody, never everybody', () => {
  assert.deepEqual(directoryPeople(rows, ''), [])
  assert.deepEqual(directoryPeople(rows, null), [])
  assert.deepEqual(directoryPeople('nonsense', 'himark.co.za'), [])
  assert.deepEqual(directoryPeople([null, 3, {}], 'himark.co.za'), [])
})

test('the Team page reads the directory, falls back honestly and never deletes', () => {
  const query = readFileSync('features/operations/queries/phase-four.ts', 'utf8')
  const fn = query.slice(query.indexOf('export async function listMicrosoftTeamMembers'), query.indexOf('export async function listTeamMembers'))
  assert.match(fn, /listDirectoryPeople/)
  assert.match(fn, /team_microsoft_user_ids/)
  assert.match(fn, /User\.Read\.All/)
  assert.doesNotMatch(fn, /\.delete\(/)
  const graph = readFileSync('lib/integrations/microsoft-directory.ts', 'utf8')
  assert.match(graph, /method|headers/)
  assert.doesNotMatch(graph, /method: '(POST|PATCH|PUT|DELETE)'/, 'read only')
})

import { normalizeHiddenEmail, withoutHidden } from '../../features/operations/team-hidden.ts'

test('the hide list matches addresses without regard to case and only accepts real addresses', () => {
  assert.equal(normalizeHiddenEmail('  Info@HIMARK.co.za '), 'info@himark.co.za')
  assert.equal(normalizeHiddenEmail('not an email'), null)
  assert.equal(normalizeHiddenEmail(''), null)
  const people = [{ email: 'Info@himark.co.za', name: 'a' }, { email: 'neo@himark.co.za', name: 'b' }]
  assert.deepEqual(withoutHidden(people, ['info@himark.co.za']).map((p) => p.name), ['b'])
  assert.equal(withoutHidden(people, []).length, 2)
})

test('only an Owner or Admin may change the hide list, and nothing is deleted from team_members', () => {
  const action = readFileSync('features/operations/actions/team-hidden.ts', 'utf8')
  assert.match(action, /members\.manage/)
  assert.doesNotMatch(action, /from\("team_members"\)/)
  const sql = readFileSync('supabase/migrations/20261117110000_team_hidden_addresses.sql', 'utf8')
  assert.match(sql, /has_role\(organization_id, array\['owner','admin'\]\)/)
  const register = readFileSync('features/operations/components/phase-four-register.tsx', 'utf8')
  assert.match(register, /canManage \? <HiddenAddresses/)
})
