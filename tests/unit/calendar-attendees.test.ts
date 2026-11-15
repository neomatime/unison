import assert from 'node:assert/strict'
import test from 'node:test'

import { isEmail, parseAttendees } from '../../features/calendar/attendees.ts'

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

test('optional attendees: kept as optional, and someone listed as both is required', () => {
  const list = parseAttendees([
    { name: 'Thandi', email: 'thandi@example.com' },
    { name: 'Sam', email: 'sam@example.com', optional: true },
    { name: 'Sam again', email: 'sam@example.com' },
    { name: 'Lee', email: 'lee@example.com', optional: true },
    { name: 'Lee again', email: 'lee@example.com', optional: true },
    { name: 'Odd', email: 'odd@example.com', optional: 'yes' },
  ])
  assert.deepEqual(list, [
    { name: 'Thandi', email: 'thandi@example.com' },
    { name: 'Sam', email: 'sam@example.com' },
    { name: 'Lee', email: 'lee@example.com', optional: true },
    { name: 'Odd', email: 'odd@example.com' },
  ])
  assert.ok(!('optional' in list[1]))
})

test('search text: plain letters and address marks only, long enough, so it can only be matched as text', async () => {
  const { cleanSearch } = await import('../../features/calendar/attendees.ts')
  assert.equal(cleanSearch('  Thandi   Nkosi '), 'Thandi Nkosi')
  assert.equal(cleanSearch('thandi@kopano.example'), 'thandi@kopano.example')
  assert.equal(cleanSearch("O'Brien-Smith"), "O'Brien-Smith")
  assert.equal(cleanSearch('Ñandi Ångström'), 'Ñandi Ångström')
  // Characters that mean something in a database filter are dropped.
  assert.equal(cleanSearch('a,b),full_name.eq.x%_*'), 'abfullname.eq.x')
  assert.equal(cleanSearch('x'), '')
  assert.equal(cleanSearch('%%'), '')
  assert.equal(cleanSearch(null), '')
  assert.equal(cleanSearch('a'.repeat(200)).length, 60)
})
