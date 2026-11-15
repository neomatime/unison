import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addMonths,
  canJoin,
  eventTone,
  groupAgenda,
  isoToLocalInput,
  keyToDay,
  layoutDay,
  layoutWeek,
  localInputToIso,
  monthGrid,
  newEventHref,
  parseCalendarParams,
  parseNewEventTimes,
  safeJoinUrl,
  slotToRange,
  spansInRange,
  startOfWeek,
  stepAnchor,
  timeLabel,
  todayKey,
  toSpan,
  viewRange,
  viewTitle,
  weekDays,
  weekdayIndex,
  type CalendarEvent,
} from '../../features/calendar/model.ts'

// 2026-11-16 is a Monday.
const event = (id: string, startAt: string, endAt: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id, title: `Event ${id}`, eventType: 'Internal', startAt, endAt, allDay: false, status: 'Confirmed', ...extra,
})

test('days: week starts on Monday and the weekday index is right', () => {
  assert.equal(weekdayIndex('2026-11-16'), 0)
  assert.equal(weekdayIndex('2026-11-22'), 6)
  assert.equal(startOfWeek('2026-11-19'), '2026-11-16')
  assert.deepEqual(weekDays('2026-11-22'), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
})

test('days: keys that are not real dates are rejected', () => {
  assert.equal(keyToDay('2026-02-30'), null)
  assert.equal(keyToDay('2026-13-01'), null)
  assert.equal(keyToDay('soon'), null)
  assert.notEqual(keyToDay('2028-02-29'), null)
})

test('today is the SAST day, not the UTC day', () => {
  // 22:30 UTC on the 15th is 00:30 SAST on the 16th.
  assert.equal(todayKey(Date.UTC(2026, 10, 15, 22, 30)), '2026-11-16')
  assert.equal(todayKey(Date.UTC(2026, 10, 15, 21, 59)), '2026-11-15')
})

test('months: moving by a month clamps the day and crosses years', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15')
  assert.equal(addMonths('2026-01-15', -1), '2025-12-15')
  assert.equal(stepAnchor('month', '2026-03-31', 1), '2026-04-01')
})

test('month grid: whole Monday-to-Sunday weeks that contain the month', () => {
  const weeks = monthGrid('2026-11-10')
  assert.ok(weeks.every((week) => week.length === 7 && weekdayIndex(week[0]) === 0))
  assert.equal(weeks[0][0], '2026-10-26')
  assert.equal(weeks[weeks.length - 1][6], '2026-12-06')
  assert.equal(weeks.length, 6)
  // February 2027 starts on a Monday and has 28 days: exactly four weeks.
  assert.equal(monthGrid('2027-02-10').length, 4)
})

test('view ranges and titles', () => {
  assert.deepEqual(viewRange('week', '2026-11-18'), { first: '2026-11-16', last: '2026-11-22' })
  assert.deepEqual(viewRange('day', '2026-11-18'), { first: '2026-11-18', last: '2026-11-18' })
  assert.deepEqual(viewRange('agenda', '2026-11-18'), { first: '2026-11-01', last: '2026-11-30' })
  assert.equal(viewTitle('month', '2026-11-18'), 'November 2026')
  assert.equal(viewTitle('week', '2026-11-18'), '16 – 22 November 2026')
  assert.equal(viewTitle('week', '2026-11-30'), '30 Nov – 6 Dec 2026')
  assert.equal(viewTitle('day', '2026-11-16'), 'Monday 16 November 2026')
})

test('address parameters fall back to the month of today', () => {
  const now = Date.UTC(2026, 10, 15, 10)
  assert.deepEqual(parseCalendarParams({}, now), { view: 'month', date: '2026-11-15' })
  assert.deepEqual(parseCalendarParams({ view: 'week', date: '2026-12-01' }, now), { view: 'week', date: '2026-12-01' })
  assert.deepEqual(parseCalendarParams({ view: 'weird', date: '2026-02-30' }, now), { view: 'month', date: '2026-11-15' })
})

test('times: the form clock is SAST and round-trips', () => {
  assert.equal(localInputToIso('2026-11-16T12:00'), '2026-11-16T10:00:00.000Z')
  assert.equal(isoToLocalInput('2026-11-16T10:00:00.000Z'), '2026-11-16T12:00')
  assert.equal(isoToLocalInput('2026-11-16T12:00'), '2026-11-16T12:00')
  assert.equal(localInputToIso('2026-11-16T25:00'), null)
  assert.equal(localInputToIso('2026-02-30T10:00'), null)
  assert.equal(localInputToIso(''), null)
  assert.equal(timeLabel(Date.parse('2026-11-16T10:05:00Z')), '12:05')
})

test('spans: a timed event ending at midnight does not run into the next day', () => {
  const span = toSpan(event('a', '2026-11-16T08:00:00Z', '2026-11-16T22:00:00Z'))!
  assert.equal(span.firstDay, span.lastDay)
  // 22:00Z is 00:00 SAST on the 17th: exclusive.
  const overnight = toSpan(event('b', '2026-11-16T20:00:00Z', '2026-11-17T02:00:00Z'))!
  assert.equal(overnight.lastDay - overnight.firstDay, 1)
})

test('spans: an all-day event covers its first through last day, inclusive', () => {
  const span = toSpan(event('c', '2026-11-16T00:00:00Z', '2026-11-18T00:00:00Z', { allDay: true }))!
  assert.equal(span.lastDay - span.firstDay, 2)
  const single = toSpan(event('d', '2026-11-16T09:00:00Z', '2026-11-16T09:00:00Z', { allDay: true }))!
  assert.equal(single.lastDay, single.firstDay)
  assert.equal(toSpan(event('e', 'nope', 'nope')), null)
})

test('spans in a range: only events that touch it, longest first on a day', () => {
  const events = [
    event('in', '2026-11-17T08:00:00Z', '2026-11-17T09:00:00Z'),
    event('out', '2026-12-17T08:00:00Z', '2026-12-17T09:00:00Z'),
    event('runs-in', '2026-11-12T08:00:00Z', '2026-11-16T09:00:00Z'),
  ]
  const spans = spansInRange(events, { first: '2026-11-16', last: '2026-11-22' })
  assert.deepEqual(spans.map((span) => span.event.id), ['runs-in', 'in'])
})

test('week layout: a multi-day event is one bar, clipped to the week, and lanes are reused', () => {
  const days = weekDays('2026-11-16')
  const spans = spansInRange(
    [
      event('long', '2026-11-12T08:00:00Z', '2026-11-18T09:00:00Z'),
      event('mon', '2026-11-16T08:00:00Z', '2026-11-16T09:00:00Z'),
      event('fri', '2026-11-20T08:00:00Z', '2026-11-20T09:00:00Z'),
    ],
    { first: days[0], last: days[6] },
  )
  const layout = layoutWeek(days, spans, 3)
  const long = layout.segments.find((segment) => segment.span.event.id === 'long')!
  assert.deepEqual([long.startCol, long.endCol, long.lane, long.continuesBefore, long.continuesAfter], [0, 2, 0, true, false])
  assert.equal(layout.segments.find((segment) => segment.span.event.id === 'mon')!.lane, 1)
  // Friday is free of the long bar, so it takes the first lane.
  assert.equal(layout.segments.find((segment) => segment.span.event.id === 'fri')!.lane, 0)
  assert.deepEqual(layout.total, [2, 1, 1, 0, 1, 0, 0])
})

test('week layout: events past the lane limit are counted for "+ N more"', () => {
  const days = weekDays('2026-11-16')
  const events = ['a', 'b', 'c', 'd', 'e'].map((id) => event(id, '2026-11-17T08:00:00Z', '2026-11-17T09:00:00Z'))
  const layout = layoutWeek(days, spansInRange(events, { first: days[0], last: days[6] }), 3)
  assert.equal(layout.segments.length, 3)
  assert.equal(layout.hidden[1], 2)
  assert.equal(layout.total[1], 5)
  assert.equal(layout.hidden[0], 0)
})

test('day layout: overlapping events sit side by side, separate ones keep the full width', () => {
  const key = '2026-11-16'
  const spans = spansInRange(
    [
      event('a', '2026-11-16T07:00:00Z', '2026-11-16T09:00:00Z'), // 09:00-11:00
      event('b', '2026-11-16T08:00:00Z', '2026-11-16T09:30:00Z'), // 10:00-11:30, overlaps a
      event('c', '2026-11-16T08:30:00Z', '2026-11-16T09:00:00Z'), // 10:30-11:00, overlaps both
      event('d', '2026-11-16T12:00:00Z', '2026-11-16T13:00:00Z'), // 14:00-15:00, alone
      event('x', '2026-11-16T00:00:00Z', '2026-11-16T00:00:00Z', { allDay: true }),
    ],
    { first: key, last: key },
  )
  const { allDay, timed } = layoutDay(key, spans)
  assert.deepEqual(allDay.map((span) => span.event.id), ['x'])
  const find = (id: string) => timed.find((item) => item.span.event.id === id)!
  assert.deepEqual([find('a').column, find('b').column, find('c').column], [0, 1, 2])
  assert.equal(find('a').columns, 3)
  assert.equal(find('d').columns, 1)
  assert.equal(find('d').column, 0)
  assert.equal(find('a').startMin, 9 * 60)
})

test('day layout: a column is reused once its event has ended', () => {
  const key = '2026-11-16'
  const spans = spansInRange(
    [
      event('a', '2026-11-16T07:00:00Z', '2026-11-16T09:00:00Z'), // 09:00-11:00
      event('b', '2026-11-16T08:00:00Z', '2026-11-16T10:00:00Z'), // 10:00-12:00
      event('c', '2026-11-16T09:00:00Z', '2026-11-16T10:00:00Z'), // 11:00-12:00: a has ended
    ],
    { first: key, last: key },
  )
  const { timed } = layoutDay(key, spans)
  const find = (id: string) => timed.find((item) => item.span.event.id === id)!
  assert.equal(find('c').column, 0)
  assert.equal(find('c').columns, 2)
})

test('day layout: a short event is drawn at least half an hour tall; an overnight event is clipped to the day', () => {
  const key = '2026-11-16'
  const spans = spansInRange(
    [event('s', '2026-11-16T07:00:00Z', '2026-11-16T07:10:00Z'), event('n', '2026-11-16T20:00:00Z', '2026-11-17T02:00:00Z')],
    { first: key, last: key },
  )
  const { timed } = layoutDay(key, spans)
  const short = timed.find((item) => item.span.event.id === 's')!
  assert.equal(short.endMin - short.startMin, 30)
  const night = timed.find((item) => item.span.event.id === 'n')!
  assert.equal(night.startMin, 22 * 60)
  assert.equal(night.endMin, 1440)
  // The next morning it shows from midnight.
  const next = layoutDay('2026-11-17', spansInRange([event('n', '2026-11-16T20:00:00Z', '2026-11-17T02:00:00Z')], { first: '2026-11-17', last: '2026-11-17' }))
  assert.equal(next.timed[0].startMin, 0)
  assert.equal(next.timed[0].endMin, 4 * 60)
})

test('agenda: only days with events, a multi-day event on each of its days, all-day first', () => {
  const range = { first: '2026-11-16', last: '2026-11-22' }
  const spans = spansInRange(
    [
      event('t', '2026-11-17T08:00:00Z', '2026-11-17T09:00:00Z'),
      event('a', '2026-11-17T00:00:00Z', '2026-11-18T00:00:00Z', { allDay: true }),
    ],
    range,
  )
  const agenda = groupAgenda(spans, range)
  assert.deepEqual(agenda.map((day) => day.key), ['2026-11-17', '2026-11-18'])
  assert.deepEqual(agenda[0].spans.map((span) => span.event.id), ['a', 't'])
})

test('colour: status and type each map to a tone, with no green and a neutral fallback', () => {
  assert.equal(eventTone({ status: 'Confirmed', eventType: 'Internal' }, 'status'), 'brand')
  assert.equal(eventTone({ status: 'Tentative', eventType: 'Internal' }, 'status'), 'amber')
  assert.equal(eventTone({ status: 'Confirmed', eventType: 'Delivery' }, 'type'), 'indigo')
  assert.equal(eventTone({ status: 'Odd', eventType: 'Odd' }, 'type'), 'slate')
})

test('joining: only plain https links, and not for a cancelled or finished event', () => {
  assert.equal(safeJoinUrl('https://teams.microsoft.com/l/meetup-join/abc'), 'https://teams.microsoft.com/l/meetup-join/abc')
  assert.equal(safeJoinUrl('javascript:alert(1)'), null)
  assert.equal(safeJoinUrl('http://teams.microsoft.com/x'), null)
  assert.equal(safeJoinUrl('https://x.example/a b'), null)
  assert.equal(safeJoinUrl(null), null)
  assert.equal(canJoin({ teamsJoinUrl: 'https://teams.microsoft.com/l/x', status: 'Confirmed' }), true)
  assert.equal(canJoin({ teamsJoinUrl: 'https://teams.microsoft.com/l/x', status: 'Cancelled' }), false)
  assert.equal(canJoin({ teamsJoinUrl: null, status: 'Confirmed' }), false)
})

test('new event: a click on a slot gives a half-hour-snapped hour on the SAST clock', () => {
  assert.deepEqual(slotToRange('2026-11-16', 9 * 60 + 40), { start: '2026-11-16T09:30', end: '2026-11-16T10:30' })
  assert.deepEqual(slotToRange('2026-11-16', 23 * 60 + 45), { start: '2026-11-16T23:30', end: '2026-11-17T00:30' })
  assert.equal(newEventHref('/operations/calendar', { start: '2026-11-16T09:30', end: '2026-11-16T10:30' }), '/operations/calendar/new?start=2026-11-16T09%3A30&end=2026-11-16T10%3A30')
})

test('new event: the requested times are checked and completed', () => {
  assert.deepEqual(parseNewEventTimes({ start: '2026-11-16T09:30', end: '2026-11-16T11:00' }), { startAt: '2026-11-16T09:30', endAt: '2026-11-16T11:00' })
  assert.deepEqual(parseNewEventTimes({ start: '2026-11-16' }), { startAt: '2026-11-16T09:00', endAt: '2026-11-16T10:00' })
  assert.deepEqual(parseNewEventTimes({ start: '2026-11-16T09:30', end: '2026-11-16T08:00' }), { startAt: '2026-11-16T09:30', endAt: '2026-11-16T10:30' })
  assert.deepEqual(parseNewEventTimes({ start: 'garbage' }), {})
  assert.deepEqual(parseNewEventTimes({}), {})
})

test('moving: by days keeps the time of day and the length; to a slot keeps the length', async () => {
  const { moveByDays, moveToSlot, snapMinute, daysBetween } = await import('../../features/calendar/model.ts')
  const e = { startAt: '2026-11-16T12:00:00.000Z', endAt: '2026-11-16T14:00:00.000Z' }
  assert.deepEqual(moveByDays(e, 2), { startAt: '2026-11-18T12:00:00.000Z', endAt: '2026-11-18T14:00:00.000Z' })
  assert.deepEqual(moveByDays(e, -1), { startAt: '2026-11-15T12:00:00.000Z', endAt: '2026-11-15T14:00:00.000Z' })
  // 09:30 SAST on the 17th is 07:30Z, and the two hours are kept.
  assert.deepEqual(moveToSlot(e, '2026-11-17', 9 * 60 + 30), { startAt: '2026-11-17T07:30:00.000Z', endAt: '2026-11-17T09:30:00.000Z' })
  assert.equal(snapMinute(607), 600)
  assert.equal(snapMinute(-20), 0)
  assert.equal(snapMinute(5000), 1425)
  assert.equal(daysBetween('2026-11-16', '2026-11-20'), 4)
})

test('joining: a Teams link pasted into the location is a join link, any other link is not', async () => {
  const { canJoin, joinUrlOf, teamsLink } = await import('../../features/calendar/model.ts')
  const teams = 'https://teams.microsoft.com/l/meetup-join/abc'
  assert.equal(teamsLink(teams), teams)
  assert.equal(teamsLink('https://teams.live.com/meet/123'), 'https://teams.live.com/meet/123')
  assert.equal(teamsLink('https://zoom.us/j/1'), null)
  assert.equal(teamsLink('https://teams.microsoft.com.evil.example/x'), null)
  assert.equal(joinUrlOf({ teamsJoinUrl: null, location: teams }), teams)
  assert.equal(joinUrlOf({ teamsJoinUrl: 'https://teams.microsoft.com/l/stored', location: teams }), 'https://teams.microsoft.com/l/stored')
  assert.equal(joinUrlOf({ teamsJoinUrl: null, location: 'In-Person' }), null)
  assert.equal(canJoin({ teamsJoinUrl: null, location: teams, status: 'Confirmed' }), true)
  assert.equal(canJoin({ teamsJoinUrl: null, location: teams, status: 'Cancelled' }), false)
})

test('form times: the end follows the start and keeps the length', async () => {
  const { addMinutesToInput, durationOfInputs, shiftEnd, findClashes } = await import('../../features/calendar/model.ts')
  assert.equal(addMinutesToInput('2026-11-18T09:00', 90), '2026-11-18T10:30')
  assert.equal(addMinutesToInput('2026-11-18T23:30', 60), '2026-11-19T00:30')
  assert.equal(addMinutesToInput('nope', 60), '')
  assert.equal(durationOfInputs('2026-11-18T09:00', '2026-11-18T10:30'), 90)
  assert.equal(durationOfInputs('', '2026-11-18T10:30'), null)
  assert.equal(shiftEnd('2026-11-18T09:00', '2026-11-18T10:30', '2026-11-19T14:00'), '2026-11-19T15:30')
  // No length to keep (end before start, or nothing yet): an hour.
  assert.equal(shiftEnd('2026-11-18T09:00', '2026-11-18T08:00', '2026-11-19T14:00'), '2026-11-19T15:00')
  assert.equal(shiftEnd('', '', '2026-11-19T14:00'), '2026-11-19T15:00')

  const base = { eventType: 'Internal', allDay: false, status: 'Confirmed' }
  const events = [
    { ...base, id: 'a', title: 'A', startAt: '2026-11-18T07:00:00Z', endAt: '2026-11-18T08:00:00Z' }, // 09:00-10:00
    { ...base, id: 'b', title: 'B', startAt: '2026-11-18T08:00:00Z', endAt: '2026-11-18T09:00:00Z' }, // 10:00-11:00
    { ...base, id: 'c', title: 'C', startAt: '2026-11-18T07:30:00Z', endAt: '2026-11-18T08:30:00Z', status: 'Cancelled' },
    { ...base, id: 'd', title: 'D', startAt: '2026-11-18T00:00:00Z', endAt: '2026-11-18T00:00:00Z', allDay: true },
  ]
  const at = (a: string, b: string) => findClashes(events, a, b).map((event) => event.id)
  assert.deepEqual(at('2026-11-18T07:30:00Z', '2026-11-18T08:30:00Z'), ['a', 'b'])
  // Touching is not clashing.
  assert.deepEqual(at('2026-11-18T08:00:00Z', '2026-11-18T08:30:00Z'), ['b'])
  assert.deepEqual(at('2026-11-18T09:00:00Z', '2026-11-18T10:00:00Z'), [])
  assert.deepEqual(findClashes(events, '2026-11-18T07:30:00Z', '2026-11-18T08:30:00Z', 'a').map((event) => event.id), ['b'])
})
