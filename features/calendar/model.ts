// The calendar's date and layout logic. Pure: no directive, no imports, so the unit tests can load it directly and the
// server and client components share one copy.
//
// Every day and time here is Africa/Johannesburg (SAST, UTC+2). South Africa has had no daylight saving since 1944, so
// a fixed two-hour offset is exact and needs no timezone database. Days are handled as "day numbers" (whole days since
// 1970-01-01 on the SAST calendar) and written as 'YYYY-MM-DD' keys; times are epoch milliseconds, as stored.

export const CALENDAR_TIMEZONE = 'Africa/Johannesburg'
const OFFSET_MS = 2 * 60 * 60 * 1000
const MINUTE = 60_000
const DAY_MS = 86_400_000

export const CALENDAR_VIEWS = ['month', 'week', 'day', 'agenda', 'list'] as const
export type CalendarView = (typeof CALENDAR_VIEWS)[number]
export type ColorBy = 'status' | 'type'
export type DayKey = string

/** The fields a calendar view needs from a calendar_events row. */
export type CalendarEvent = {
  id: string
  title: string
  eventType: string
  startAt: string
  endAt: string
  allDay: boolean
  status: string
  location?: string | null
  owner?: string | null
  project?: string | null
  client?: string | null
  teamsJoinUrl?: string | null
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const

const pad = (value: number) => String(value).padStart(2, '0')

// ---- Days -------------------------------------------------------------------------------------------------------

/** The SAST day a moment falls on. */
export const dayNumberOf = (ms: number) => Math.floor((ms + OFFSET_MS) / DAY_MS)
/** The moment a SAST day begins (its 00:00). */
export const dayStartMs = (day: number) => day * DAY_MS - OFFSET_MS

export function dayToKey(day: number): DayKey {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' to a day number, or null when it is not a real date (2026-02-30, 2026-13-01, garbage). */
export function keyToDay(key: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ''))
  if (!match) return null
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const ms = Date.UTC(year, month - 1, date)
  const check = new Date(ms)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) return null
  return ms / DAY_MS
}

const mustDay = (key: DayKey) => keyToDay(key) ?? 0

export const todayKey = (nowMs: number): DayKey => dayToKey(dayNumberOf(nowMs))

export const addDays = (key: DayKey, count: number): DayKey => dayToKey(mustDay(key) + count)

/** Monday = 0 … Sunday = 6. */
export function weekdayIndex(key: DayKey): number {
  const sundayFirst = (((mustDay(key) + 4) % 7) + 7) % 7
  return (sundayFirst + 6) % 7
}

export const startOfWeek = (key: DayKey): DayKey => addDays(key, -weekdayIndex(key))

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function splitKey(key: DayKey): { year: number; month: number; date: number } {
  const [year, month, date] = key.split('-').map(Number)
  return { year, month, date }
}

/** Moves by whole months, keeping the day of the month where the target month has it and clamping where it does not. */
export function addMonths(key: DayKey, count: number): DayKey {
  const { year, month, date } = splitKey(key)
  const index = year * 12 + (month - 1) + count
  const targetYear = Math.floor(index / 12)
  const targetMonth = (index % 12) + 1
  return `${targetYear}-${pad(targetMonth)}-${pad(Math.min(date, daysInMonth(targetYear, targetMonth)))}`
}

export const startOfMonth = (key: DayKey): DayKey => `${key.slice(0, 7)}-01`
export function endOfMonth(key: DayKey): DayKey {
  const { year, month } = splitKey(key)
  return `${key.slice(0, 7)}-${pad(daysInMonth(year, month))}`
}

/** The month as whole Monday-to-Sunday weeks, so the grid has no ragged edges. */
export function monthGrid(key: DayKey): DayKey[][] {
  const first = startOfWeek(startOfMonth(key))
  const last = addDays(startOfWeek(endOfMonth(key)), 6)
  const total = mustDay(last) - mustDay(first) + 1
  const weeks: DayKey[][] = []
  for (let week = 0; week < total / 7; week += 1) weeks.push(Array.from({ length: 7 }, (_, index) => addDays(first, week * 7 + index)))
  return weeks
}

export function weekDays(key: DayKey): DayKey[] {
  const first = startOfWeek(key)
  return Array.from({ length: 7 }, (_, index) => addDays(first, index))
}

// ---- Views ------------------------------------------------------------------------------------------------------

export type DayRange = { first: DayKey; last: DayKey }

/** The days a view shows. Agenda and list cover the anchor's month. */
export function viewRange(view: CalendarView, key: DayKey): DayRange {
  if (view === 'day') return { first: key, last: key }
  if (view === 'week') {
    const days = weekDays(key)
    return { first: days[0], last: days[6] }
  }
  if (view === 'month') {
    const weeks = monthGrid(key)
    return { first: weeks[0][0], last: weeks[weeks.length - 1][6] }
  }
  return { first: startOfMonth(key), last: endOfMonth(key) }
}

/** Previous (-1) or next (1): a day, a week or a month, whichever the view moves by. */
export function stepAnchor(view: CalendarView, key: DayKey, direction: -1 | 1): DayKey {
  if (view === 'day') return addDays(key, direction)
  if (view === 'week') return addDays(key, direction * 7)
  return addMonths(startOfMonth(key), direction)
}

export function viewTitle(view: CalendarView, key: DayKey): string {
  const { year, month, date } = splitKey(key)
  if (view === 'day') return `${WEEKDAYS[weekdayIndex(key)]} ${date} ${MONTHS[month - 1]} ${year}`
  if (view === 'week') {
    const days = weekDays(key)
    const a = splitKey(days[0])
    const b = splitKey(days[6])
    if (a.year !== b.year) return `${a.date} ${MONTHS[a.month - 1].slice(0, 3)} ${a.year} – ${b.date} ${MONTHS[b.month - 1].slice(0, 3)} ${b.year}`
    if (a.month !== b.month) return `${a.date} ${MONTHS[a.month - 1].slice(0, 3)} – ${b.date} ${MONTHS[b.month - 1].slice(0, 3)} ${b.year}`
    return `${a.date} – ${b.date} ${MONTHS[b.month - 1]} ${b.year}`
  }
  return `${MONTHS[month - 1]} ${year}`
}

export function dayLabel(key: DayKey, long = false): string {
  const { date, month } = splitKey(key)
  const weekday = WEEKDAYS[weekdayIndex(key)]
  return `${long ? weekday : weekday.slice(0, 3)} ${date} ${long ? MONTHS[month - 1] : MONTHS[month - 1].slice(0, 3)}`
}

/** A reader's request for a view and a date, from the page address. Anything unusable falls back to the month of today. */
export function parseCalendarParams(params: { view?: string | string[]; date?: string | string[] }, nowMs: number): { view: CalendarView; date: DayKey } {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
  const view = (CALENDAR_VIEWS as readonly string[]).includes(one(params.view) ?? '') ? (one(params.view) as CalendarView) : 'month'
  const date = keyToDay(one(params.date)) === null ? todayKey(nowMs) : (one(params.date) as DayKey)
  return { view, date }
}

// ---- Times ------------------------------------------------------------------------------------------------------

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** 'YYYY-MM-DDTHH:mm' on the SAST clock (what a datetime-local field holds) to an ISO instant, or null when invalid. */
export function localInputToIso(value: string | null | undefined): string | null {
  const match = LOCAL_INPUT.exec(String(value ?? '').trim())
  if (!match) return null
  const [year, month, date, hour, minute] = match.slice(1).map(Number)
  if (hour > 23 || minute > 59 || keyToDay(`${match[1]}-${match[2]}-${match[3]}`) === null) return null
  return new Date(Date.UTC(year, month - 1, date, hour, minute) - OFFSET_MS).toISOString()
}

/** An ISO instant to the SAST clock as a datetime-local value. A value already in that shape passes through. */
export function isoToLocalInput(value: string | null | undefined): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (LOCAL_INPUT.test(text)) return text
  const ms = Date.parse(text)
  if (Number.isNaN(ms)) return ''
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 16)
}

export function timeLabel(ms: number): string {
  const minutes = (((ms + OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / MINUTE
  return `${pad(Math.floor(minutes / 60))}:${pad(Math.floor(minutes % 60))}`
}

export function minutesLabel(minutes: number): string {
  const clamped = Math.max(0, Math.min(1440, minutes))
  return `${pad(Math.floor(clamped / 60) % 24)}:${pad(clamped % 60)}`
}

// ---- Events as spans of days -------------------------------------------------------------------------------------

export type Span = {
  event: CalendarEvent
  startMs: number
  endMs: number
  firstDay: number
  lastDay: number
  allDay: boolean
}

/** An event as the days it covers. An all-day event covers its first through last day; a timed event that ends exactly
 *  at midnight does not cover the day that begins there. Null when the dates cannot be read. */
export function toSpan(event: CalendarEvent): Span | null {
  const start = Date.parse(event.startAt)
  const end = Date.parse(event.endAt)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  const firstDay = dayNumberOf(start)
  if (event.allDay) {
    const lastDay = Math.max(firstDay, dayNumberOf(end))
    return { event, startMs: dayStartMs(firstDay), endMs: dayStartMs(lastDay + 1), firstDay, lastDay, allDay: true }
  }
  const safeEnd = Math.max(end, start)
  const lastDay = safeEnd > start ? Math.max(firstDay, dayNumberOf(safeEnd - 1)) : firstDay
  return { event, startMs: start, endMs: safeEnd, firstDay, lastDay, allDay: false }
}

const bySpanOrder = (a: Span, b: Span) =>
  a.firstDay - b.firstDay ||
  b.lastDay - b.firstDay - (a.lastDay - a.firstDay) ||
  Number(b.allDay) - Number(a.allDay) ||
  a.startMs - b.startMs ||
  a.event.title.localeCompare(b.event.title)

/** The spans that touch a range of days, in the order a calendar lists them. Archived or unreadable events are left out
 *  by the caller; unreadable dates are dropped here. */
export function spansInRange(events: readonly CalendarEvent[], range: DayRange): Span[] {
  const first = mustDay(range.first)
  const last = mustDay(range.last)
  return events
    .map(toSpan)
    .filter((span): span is Span => span !== null && span.lastDay >= first && span.firstDay <= last)
    .sort(bySpanOrder)
}

// ---- Month and the all-day strip: bars across a week --------------------------------------------------------------

export type WeekSegment = { span: Span; startCol: number; endCol: number; lane: number; continuesBefore: boolean; continuesAfter: boolean }
export type WeekLayout = {
  days: DayKey[]
  /** Segments in a visible lane. */
  segments: WeekSegment[]
  /** Per day, how many events are on it but did not fit in a visible lane. */
  hidden: number[]
  /** Per day, how many events are on it. */
  total: number[]
}

/** Lays one week's all-day and multi-day events out as bars, each in the first lane that is free for its columns. Events
 *  past maxLanes are not placed and are counted per day, for the "+ N more" link. */
export function layoutWeek(days: DayKey[], spans: readonly Span[], maxLanes: number): WeekLayout {
  const weekFirst = mustDay(days[0])
  const weekLast = weekFirst + 6
  const lanes: boolean[][] = []
  const segments: WeekSegment[] = []
  const hidden = Array.from({ length: 7 }, () => 0)
  const total = Array.from({ length: 7 }, () => 0)

  for (const span of [...spans].sort(bySpanOrder)) {
    if (span.lastDay < weekFirst || span.firstDay > weekLast) continue
    const startCol = Math.max(span.firstDay, weekFirst) - weekFirst
    const endCol = Math.min(span.lastDay, weekLast) - weekFirst
    for (let col = startCol; col <= endCol; col += 1) total[col] += 1
    let lane = 0
    while (lanes[lane]?.slice(startCol, endCol + 1).some(Boolean)) lane += 1
    if (lane >= maxLanes) {
      for (let col = startCol; col <= endCol; col += 1) hidden[col] += 1
      continue
    }
    lanes[lane] ??= Array.from({ length: 7 }, () => false)
    for (let col = startCol; col <= endCol; col += 1) lanes[lane][col] = true
    segments.push({ span, startCol, endCol, lane, continuesBefore: span.firstDay < weekFirst, continuesAfter: span.lastDay > weekLast })
  }
  return { days, segments, hidden, total }
}

// ---- Week and day: events down a column of hours ------------------------------------------------------------------

export type TimedPlacement = {
  span: Span
  /** Minutes from the top of the day, clipped to this day. */
  startMin: number
  endMin: number
  /** Which side-by-side column the event sits in, and how many columns its overlapping group has. */
  column: number
  columns: number
}

/** The shortest an event is drawn, in minutes, so a ten-minute call is still a block that can be read and clicked. */
export const MIN_DRAWN_MINUTES = 30

/** Places a day's timed events. Events that overlap share the width: each overlapping group is split into as many
 *  columns as it needs, and each event takes the first column that is free when it starts. */
export function layoutDay(key: DayKey, spans: readonly Span[]): { allDay: Span[]; timed: TimedPlacement[] } {
  const day = mustDay(key)
  const dayStart = dayStartMs(day)
  const allDay = spans.filter((span) => span.allDay && span.firstDay <= day && span.lastDay >= day).sort(bySpanOrder)
  const items = spans
    .filter((span) => !span.allDay && span.firstDay <= day && span.lastDay >= day)
    .map((span) => {
      const startMin = Math.max(0, Math.round((span.startMs - dayStart) / MINUTE))
      const endMin = Math.min(1440, Math.round((span.endMs - dayStart) / MINUTE))
      return { span, startMin, endMin, drawnEnd: Math.min(1440, Math.max(endMin, startMin + MIN_DRAWN_MINUTES)) }
    })
    .sort((a, b) => a.startMin - b.startMin || b.drawnEnd - a.drawnEnd || a.span.event.title.localeCompare(b.span.event.title))

  const timed: TimedPlacement[] = []
  let group: Array<(typeof items)[number] & { column: number }> = []
  let groupEnd = -1
  let groupColumns = 0
  const flush = () => {
    for (const item of group) timed.push({ span: item.span, startMin: item.startMin, endMin: item.drawnEnd, column: item.column, columns: groupColumns })
    group = []
    groupColumns = 0
    groupEnd = -1
  }
  let columnEnds: number[] = []
  for (const item of items) {
    if (group.length && item.startMin >= groupEnd) {
      flush()
      columnEnds = []
    }
    let column = columnEnds.findIndex((end) => end <= item.startMin)
    if (column === -1) column = columnEnds.length
    columnEnds[column] = item.drawnEnd
    group.push({ ...item, column })
    groupColumns = Math.max(groupColumns, column + 1)
    groupEnd = Math.max(groupEnd, item.drawnEnd)
  }
  if (group.length) flush()
  return { allDay, timed }
}

// ---- Agenda -----------------------------------------------------------------------------------------------------

export type AgendaDay = { key: DayKey; spans: Span[] }

/** Only the days that have something on them, in order. An event that runs over several days is listed on each. */
export function groupAgenda(spans: readonly Span[], range: DayRange): AgendaDay[] {
  const first = mustDay(range.first)
  const last = mustDay(range.last)
  const days: AgendaDay[] = []
  for (let day = first; day <= last; day += 1) {
    const here = spans.filter((span) => span.firstDay <= day && span.lastDay >= day).sort(bySpanOrder)
    if (here.length) days.push({ key: dayToKey(day), spans: here.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMs - b.startMs) })
  }
  return days
}

// ---- Colour -----------------------------------------------------------------------------------------------------

/** The palette is the product's own: blue and navy, with amber and a red for what needs a second look. No green. */
export type EventTone = 'brand' | 'navy' | 'slate' | 'amber' | 'indigo' | 'red'

const STATUS_TONES: Record<string, EventTone> = { Confirmed: 'brand', Tentative: 'amber', Cancelled: 'red', Complete: 'slate' }
const TYPE_TONES: Record<string, EventTone> = { Internal: 'slate', 'Client Meeting': 'brand', Milestone: 'amber', Governance: 'navy', Delivery: 'indigo' }

export function eventTone(event: Pick<CalendarEvent, 'status' | 'eventType'>, colorBy: ColorBy): EventTone {
  return (colorBy === 'status' ? STATUS_TONES[event.status] : TYPE_TONES[event.eventType]) ?? 'slate'
}

export function legendFor(colorBy: ColorBy): Array<{ label: string; tone: EventTone }> {
  const table = colorBy === 'status' ? STATUS_TONES : TYPE_TONES
  return Object.entries(table).map(([label, tone]) => ({ label, tone }))
}

// ---- Joining and creating ----------------------------------------------------------------------------------------

/** A join link is only offered when it is a plain https address, whatever is in the database. */
export function safeJoinUrl(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim()
  return /^https:\/\/[^\s<>"']+$/i.test(text) ? text : null
}

/** Whether Join is worth showing: there is a link and the event is not cancelled or already complete. */
export const canJoin = (event: Pick<CalendarEvent, 'teamsJoinUrl' | 'status'>): boolean =>
  safeJoinUrl(event.teamsJoinUrl) !== null && event.status !== 'Cancelled' && event.status !== 'Complete'

/** A start and end for a click on an empty slot: the clicked minute, snapped down to the half hour, for an hour. */
export function slotToRange(key: DayKey, minute: number, durationMinutes = 60): { start: string; end: string } {
  const snapped = Math.max(0, Math.min(1439, Math.floor(minute / 30) * 30))
  const startMs = dayStartMs(mustDay(key)) + snapped * MINUTE
  const toInput = (ms: number) => new Date(ms + OFFSET_MS).toISOString().slice(0, 16)
  return { start: toInput(startMs), end: toInput(startMs + durationMinutes * MINUTE) }
}

export function newEventHref(base: string, range: { start: string; end: string }): string {
  return `${base}/new?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`
}

/** The start and end a new-event page was asked for. A date alone means 09:00; no end means an hour later; an end before
 *  the start is replaced the same way. Anything unreadable is ignored, and the form opens empty. */
export function parseNewEventTimes(params: { start?: string; end?: string }): { startAt?: string; endAt?: string } {
  const asInput = (value: string | undefined) => {
    const text = String(value ?? '').trim()
    if (keyToDay(text) !== null) return `${text}T09:00`
    return localInputToIso(text) ? text : null
  }
  const start = asInput(params.start)
  if (!start) return {}
  const startMs = Date.parse(localInputToIso(start) as string)
  const end = asInput(params.end)
  const endMs = end ? Date.parse(localInputToIso(end) as string) : Number.NaN
  const resolved = Number.isNaN(endMs) || endMs < startMs ? isoToLocalInput(new Date(startMs + 60 * MINUTE).toISOString()) : (end as string)
  return { startAt: start, endAt: resolved }
}

// ---- Moving an event (drag and drop) -------------------------------------------------------------------------------

/** Rounds a minute of the day to the nearest step, kept inside the day. */
export function snapMinute(minute: number, step = 15): number {
  return Math.max(0, Math.min(1440 - step, Math.round(minute / step) * step))
}

/** Whole days later (or earlier) at the same time of day. Johannesburg has no daylight saving, so a day is always 24 hours. */
export function moveByDays(event: Pick<CalendarEvent, 'startAt' | 'endAt'>, days: number): { startAt: string; endAt: string } {
  const shift = days * DAY_MS
  return { startAt: new Date(Date.parse(event.startAt) + shift).toISOString(), endAt: new Date(Date.parse(event.endAt) + shift).toISOString() }
}

/** To a day and a start minute, keeping how long the event lasts. */
export function moveToSlot(event: Pick<CalendarEvent, 'startAt' | 'endAt'>, key: DayKey, startMinute: number): { startAt: string; endAt: string } {
  const duration = Math.max(0, Date.parse(event.endAt) - Date.parse(event.startAt))
  const start = dayStartMs(mustDay(key)) + startMinute * MINUTE
  return { startAt: new Date(start).toISOString(), endAt: new Date(start + duration).toISOString() }
}

export const daysBetween = (from: DayKey, to: DayKey): number => mustDay(to) - mustDay(from)
