import assert from 'node:assert/strict'
import test from 'node:test'

import { isEmail, parseAttendees, suggestPeople } from '../../features/calendar/attendees.ts'

test('email: a plain address is accepted; spaces, a missing domain or an angle-bracket form are not', () => {
  assert.equal(isEmail('thandi@example.com'), true)
  assert.equal(isEmail('thandi.nkosi+crm@sub.example.co.za'), true)
  assert.equal(isEmail('thandi@example'), false)
  assert.equal(isEmail('Thandi <thandi@example.com>'), false)
  assert.equal(isEmail('a b@example.com'), false)
  assert.equal(isEmail(''), false)
})

test('attendees: invalid entries dropped, addresses lower-cased and kept once, the name falls back to the address', () => {
  const list = parseAttendees(JSON.stringify([
    { name: ' Thandi ', email: 'Thandi@Example.com' },
    { name: 'Again', email: 'thandi@example.com' },
    { email: 'sam@example.com' },
    { name: 'Bad', email: 'nope' },
    'junk',
  ]))
  assert.deepEqual(list, [{ name: 'Thandi', email: 'thandi@example.com' }, { name: 'sam@example.com', email: 'sam@example.com' }])
  assert.deepEqual(parseAttendees('not json'), [])
  assert.deepEqual(parseAttendees(null), [])
  assert.equal(parseAttendees(Array.from({ length: 80 }, (_, i) => ({ email: `p${i}@example.com` }))).length, 50)
})

test('suggestions: match name, email or group, skip people already invited, best matches first', () => {
  const people = [
    { name: 'Neo Matime', email: 'neo@himark.co.za', group: 'Team' },
    { name: 'Thandi Nkosi', email: 'thandi@kopano.example', group: 'Kopano Ridge' },
    { name: 'Anthony Dlamini', email: 'ant@kopano.example', group: 'Kopano Ridge' },
  ]
  assert.deepEqual(suggestPeople(people, 'kopano', []).map((p) => p.name), ['Anthony Dlamini', 'Thandi Nkosi'])
  assert.deepEqual(suggestPeople(people, 'th', []).map((p) => p.name), ['Thandi Nkosi', 'Anthony Dlamini'])
  assert.deepEqual(suggestPeople(people, '', [{ name: 'Neo', email: 'NEO@himark.co.za' }]).map((p) => p.name), ['Anthony Dlamini', 'Thandi Nkosi'])
  assert.deepEqual(suggestPeople(people, 'zzz', []), [])
})
