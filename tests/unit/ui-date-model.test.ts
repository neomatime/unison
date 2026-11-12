import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clampTime,
  compareDates,
  daysInMonth,
  displayValue,
  formatDate,
  formatDateTime,
  monthGrid,
  parseDate,
  parseTime,
  shiftDate,
} from '../../lib/ui/date-model.ts'

test('dates round-trip in the exact string a native date input carried', () => {
  assert.deepEqual(parseDate('2026-11-12'), { year: 2026, month: 11, day: 12 })
  assert.equal(formatDate({ year: 2026, month: 1, day: 5 }), '2026-01-05')
})

test('parseDate rejects blanks and days that do not exist', () => {
  assert.equal(parseDate(''), null)
  assert.equal(parseDate(null), null)
  assert.equal(parseDate('2026-02-30'), null)
  assert.equal(parseDate('2026-13-01'), null)
  assert.deepEqual(parseDate('2024-02-29'), { year: 2024, month: 2, day: 29 })
  assert.equal(parseDate('2026-02-29'), null)
})

test('date-time values keep the datetime-local shape and read the date part from it too', () => {
  const date = { year: 2026, month: 11, day: 12 }
  assert.equal(formatDateTime(date, { hour: 9, minute: 5 }), '2026-11-12T09:05')
  assert.deepEqual(parseDate('2026-11-12T09:05'), date)
  assert.deepEqual(parseTime('2026-11-12T09:05'), { hour: 9, minute: 5 })
  assert.equal(parseTime('2026-11-12'), null)
  assert.equal(parseTime('2026-11-12T24:00'), null)
})

test('displayValue shows a short readable form, with the time only when asked', () => {
  assert.equal(displayValue('2026-11-12', false), '12 Nov 2026')
  assert.equal(displayValue('2026-11-12T14:30', true), '12 Nov 2026, 14:30')
  assert.equal(displayValue('2026-11-12T14:30', false), '12 Nov 2026')
  assert.equal(displayValue('', false), '')
})

test('shiftDate moves by days and months and clamps to the end of a shorter month', () => {
  assert.deepEqual(shiftDate({ year: 2026, month: 12, day: 31 }, { days: 1 }), { year: 2027, month: 1, day: 1 })
  assert.deepEqual(shiftDate({ year: 2026, month: 1, day: 31 }, { months: 1 }), { year: 2026, month: 2, day: 28 })
  assert.deepEqual(shiftDate({ year: 2026, month: 1, day: 15 }, { months: -1 }), { year: 2025, month: 12, day: 15 })
  assert.deepEqual(shiftDate({ year: 2026, month: 3, day: 1 }, { months: 12 }), { year: 2027, month: 3, day: 1 })
  assert.equal(daysInMonth(2024, 2), 29)
})

test('monthGrid is six Sunday-first weeks that contain the whole month', () => {
  const grid = monthGrid(2026, 11)
  assert.equal(grid.length, 42)
  // 1 November 2026 is a Sunday.
  assert.deepEqual(grid[0], { year: 2026, month: 11, day: 1, inMonth: true })
  assert.equal(grid.filter((c) => c.inMonth).length, 30)
  assert.equal(grid[41].inMonth, false)
  const feb = monthGrid(2026, 2)
  assert.equal(feb[0].inMonth, true)
  assert.equal(compareDates(feb[0], { year: 2026, month: 2, day: 1 }), 0)
  const mid = monthGrid(2026, 4)
  assert.deepEqual([mid[0].year, mid[0].month, mid[0].day, mid[0].inMonth], [2026, 3, 29, false])
})

test('clampTime keeps hours and minutes in range', () => {
  assert.deepEqual(clampTime(30, -4), { hour: 23, minute: 0 })
  assert.deepEqual(clampTime(Number.NaN, 61), { hour: 0, minute: 59 })
})
