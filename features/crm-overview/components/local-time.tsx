'use client'

import { useClockValue } from './use-clock'

const LOCALE = 'en-ZA'

function relativeText(iso: string, now: number): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.round((then - now) / 1000)
  const abs = Math.abs(seconds)
  const formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })
  if (abs < 60) return 'just now'
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return formatter.format(Math.round(seconds / 3600), 'hour')
  if (abs < 7 * 86_400) return formatter.format(Math.round(seconds / 86_400), 'day')
  return new Date(iso).toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' })
}

/** An event time in the VIEWER's timezone, relative while it is recent. */
export function RelativeTime({ iso }: { iso: string }) {
  const text = useClockValue(() => relativeText(iso, Date.now()))
  const full = useClockValue(() => (Number.isNaN(new Date(iso).getTime()) ? '' : new Date(iso).toLocaleString(LOCALE)))
  return <time dateTime={iso} title={full || undefined} className="whitespace-nowrap">{text || ' '}</time>
}

/** A task due date in the viewer's timezone, flagged once it has passed. */
export function DueDate({ iso }: { iso: string }) {
  const label = useClockValue(() => {
    const due = new Date(iso)
    return Number.isNaN(due.getTime()) ? '' : due.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' })
  })
  // A second snapshot rather than a flag packed into the label: each is a plain
  // string, so React can compare them by value between renders.
  const overdue = useClockValue(() => (new Date(iso).getTime() < Date.now() ? 'overdue' : '')) === 'overdue'
  return (
    <time dateTime={iso} className={overdue ? 'whitespace-nowrap font-medium text-destructive' : 'whitespace-nowrap'}>
      {label || ' '}
      {overdue ? <span className="ml-1.5 text-[0.6875rem] uppercase">Overdue</span> : null}
    </time>
  )
}
