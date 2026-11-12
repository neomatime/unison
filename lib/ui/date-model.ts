/**
 * The pure half of the shared date picker. Values are the exact strings a
 * native input carried: `YYYY-MM-DD` for a date, `YYYY-MM-DDTHH:mm` for a
 * date-time. Nothing here touches the clock or a time zone.
 */

export type DateParts = { year: number; month: number; day: number }
export type TimeParts = { hour: number; minute: number }

const DATE = /^(\d{4})-(\d{2})-(\d{2})/
const TIME = /T(\d{2}):(\d{2})/

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function parseDate(value: string | null | undefined): DateParts | null {
  const match = DATE.exec(value ?? '')
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

export function parseTime(value: string | null | undefined): TimeParts | null {
  const match = TIME.exec(value ?? '')
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour > 23 || minute > 59 ? null : { hour, minute }
}

const two = (n: number) => String(n).padStart(2, '0')

export function formatDate(parts: DateParts): string {
  return `${String(parts.year).padStart(4, '0')}-${two(parts.month)}-${two(parts.day)}`
}

export function formatDateTime(date: DateParts, time: TimeParts): string {
  return `${formatDate(date)}T${two(time.hour)}:${two(time.minute)}`
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? ''
}

/** Human label shown in the field, e.g. `12 Nov 2026` or `12 Nov 2026, 14:30`. */
export function displayValue(value: string | null | undefined, withTime: boolean): string {
  const date = parseDate(value)
  if (!date) return ''
  const label = `${date.day} ${monthName(date.month).slice(0, 3)} ${date.year}`
  const time = withTime ? parseTime(value) : null
  return time ? `${label}, ${two(time.hour)}:${two(time.minute)}` : label
}

/** Moves a date by whole days or months, clamping the day to the target month. */
export function shiftDate(date: DateParts, change: { days?: number; months?: number }): DateParts {
  if (change.months) {
    const total = date.year * 12 + (date.month - 1) + change.months
    const year = Math.floor(total / 12)
    const month = (total % 12) + 1
    return { year, month, day: Math.min(date.day, daysInMonth(year, month)) }
  }
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + (change.days ?? 0)))
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() }
}

export type CalendarCell = DateParts & { inMonth: boolean }

/** Six rows of seven days starting on Sunday, padded with the neighbouring months. */
export function monthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const cells: CalendarCell[] = []
  for (let i = 0; i < 42; i += 1) {
    const d = shiftDate({ year, month, day: 1 }, { days: i - first })
    cells.push({ ...d, inMonth: d.month === month })
  }
  return cells
}

export function compareDates(a: DateParts, b: DateParts): number {
  return a.year - b.year || a.month - b.month || a.day - b.day
}

export function clampTime(hour: number, minute: number): TimeParts {
  const h = Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.trunc(hour))) : 0
  const m = Number.isFinite(minute) ? Math.min(59, Math.max(0, Math.trunc(minute))) : 0
  return { hour: h, minute: m }
}
