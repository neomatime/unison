import assert from 'node:assert/strict'
import test from 'node:test'

import { bandFor, isDateWithinDays } from '../../features/delivery/overview-bands.ts'

test('delivery health values collapse into the four executive bands', () => {
  assert.equal(bandFor('On Track'), 'On track')
  assert.equal(bandFor('Healthy'), 'On track')
  assert.equal(bandFor('Watch'), 'Watch')
  assert.equal(bandFor('At Risk'), 'At Risk')
  assert.equal(bandFor('Critical'), 'Critical')
})

test('project date windows include today and the horizon but exclude overdue dates', () => {
  const today = '2026-09-05'

  assert.equal(isDateWithinDays('2026-09-05', today, 30), true)
  assert.equal(isDateWithinDays('2026-10-05', today, 30), true)
  assert.equal(isDateWithinDays('2026-09-04', today, 30), false)
  assert.equal(isDateWithinDays('2026-10-06', today, 30), false)
  assert.equal(isDateWithinDays(null, today, 30), false)
})
