import assert from 'node:assert/strict'
import test from 'node:test'

import {
  bandFor,
  HEALTH_BANDS,
  isDateOverdue,
  isDateWithinDays,
  positionNarrative,
  type HealthBand,
} from '../../features/delivery/overview-bands.ts'

function counts(
  positive: number,
  watch: number,
  atRisk: number,
  critical: number,
): Record<HealthBand, number> {
  return {
    'On Track / Healthy': positive,
    Watch: watch,
    'At Risk': atRisk,
    Critical: critical,
  }
}

test('delivery health values collapse into four explicitly named executive bands', () => {
  assert.deepEqual(HEALTH_BANDS, ['On Track / Healthy', 'Watch', 'At Risk', 'Critical'])
  assert.equal(bandFor('On Track'), 'On Track / Healthy')
  assert.equal(bandFor('Healthy'), 'On Track / Healthy')
  assert.equal(bandFor('Watch'), 'Watch')
  assert.equal(bandFor('At Risk'), 'At Risk')
  assert.equal(bandFor('Critical'), 'Critical')
})

test('an unknown health value fails instead of being silently reported as Critical', () => {
  assert.throws(() => bandFor('Blocked'), /Unsupported project health: Blocked/)
})

test('project date windows include the start and exclude the end', () => {
  const today = '2026-09-05'

  assert.equal(isDateWithinDays('2026-09-05', today, 7), true)
  assert.equal(isDateWithinDays('2026-09-11', today, 7), true)
  assert.equal(isDateWithinDays('2026-09-12', today, 7), false)
  assert.equal(isDateWithinDays('2026-10-04', today, 30), true)
  assert.equal(isDateWithinDays('2026-10-05', today, 30), false)
  assert.equal(isDateWithinDays('2026-09-04', today, 30), false)
  assert.equal(isDateWithinDays(null, today, 30), false)
})

test('project date windows work across month and year boundaries', () => {
  const start = '2026-12-29'

  assert.equal(isDateWithinDays('2027-01-04', start, 7), true)
  assert.equal(isDateWithinDays('2027-01-05', start, 7), false)
})

test('project date windows reject invalid inputs and non-positive windows', () => {
  assert.equal(isDateWithinDays('2026-02-30', '2026-02-01', 30), false)
  assert.equal(isDateWithinDays('not-a-date', '2026-02-01', 30), false)
  assert.equal(isDateWithinDays('2026-02-01', 'not-a-date', 30), false)
  assert.equal(isDateWithinDays('2026-02-01', '2026-02-01', 0), false)
  assert.equal(isDateWithinDays('2026-02-01', '2026-02-01', -1), false)
  assert.equal(isDateWithinDays('2026-02-01', '2026-02-01', 1.5), false)
})

test('overdue dates are strictly before today', () => {
  const today = '2026-09-05'

  assert.equal(isDateOverdue('2026-09-04', today), true)
  assert.equal(isDateOverdue('2026-09-05', today), false)
  assert.equal(isDateOverdue('2026-09-06', today), false)
  assert.equal(isDateOverdue(null, today), false)
  assert.equal(isDateOverdue('not-a-date', today), false)
  assert.equal(isDateOverdue('2026-09-04', 'not-a-date'), false)
})

test('position narrative has a deliberate zero-project state', () => {
  assert.deepEqual(positionNarrative({ activeProjects: 0, healthCounts: counts(0, 0, 0, 0) }), {
    headline: 'No active delivery yet.',
    description: 'Create or activate a project to begin building a live delivery briefing.',
  })
})

test('position narrative refuses inconsistent totals rather than publishing misleading copy', () => {
  assert.throws(
    () => positionNarrative({ activeProjects: 2, healthCounts: counts(1, 0, 0, 0) }),
    /Project health counts \(1\) do not match active projects \(2\)/,
  )
})

test('position narrative reports Critical and At Risk counts without inventing causes', () => {
  assert.deepEqual(positionNarrative({ activeProjects: 4, healthCounts: counts(1, 0, 2, 1) }), {
    headline: 'Delivery requires intervention.',
    description: '1 of 4 active projects is marked Critical. 2 of 4 active projects are marked At Risk.',
  })
})

test('position narrative distinguishes At Risk, Watch, and positive delivery states', () => {
  assert.deepEqual(positionNarrative({ activeProjects: 3, healthCounts: counts(2, 0, 1, 0) }), {
    headline: 'Delivery needs focused attention.',
    description: '1 of 3 active projects is marked At Risk. No active project is marked Critical.',
  })

  assert.deepEqual(positionNarrative({ activeProjects: 3, healthCounts: counts(2, 1, 0, 0) }), {
    headline: 'Delivery remains broadly on track.',
    description: '1 of 3 active projects is marked Watch. No active project is marked At Risk or Critical.',
  })

  assert.deepEqual(positionNarrative({ activeProjects: 1, healthCounts: counts(1, 0, 0, 0) }), {
    headline: 'Delivery remains on track.',
    description: 'The active project is recorded as On Track or Healthy.',
  })
})
