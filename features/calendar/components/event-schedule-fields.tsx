'use client'

import { AlertTriangle, CalendarClock } from 'lucide-react'

import { AppInput } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatMinutes } from '../description'
import { addMinutesToInput, durationOfInputs, findClashes, localInputToIso, timeLabel } from '../model'
import { useSchedule } from './schedule-context'

const QUICK = [15, 30, 45, 60, 90, 120]
const field = 'mt-1.5 h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-brand'

/** Starts and ends for the Details tab. Moving the start moves the end with it, keeping the length; the length can be set from a
 *  few quick choices; an overlap with another event is warned about; and the Scheduler button opens the day to place it on. */
export function ScheduleFields() {
  const { start, end, events, ignoreId, changeStart, setEnd, setTab } = useSchedule()
  const length = durationOfInputs(start, end)
  const startIso = localInputToIso(start)
  const endIso = localInputToIso(end)
  const valid = startIso !== null && endIso !== null && length !== null && length >= 0
  const clashes = valid ? findClashes(events, startIso, endIso, ignoreId) : []

  return (
    <div className="flex flex-col gap-4 md:col-span-2">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="text-sm font-medium">Starts
          <AppInput name="startAt" type="datetime-local" required value={start} onChange={(event) => changeStart(event.target.value)} className={field} />
        </label>
        <label className="text-sm font-medium">Ends
          <AppInput name="endAt" type="datetime-local" required value={end} onChange={(event) => setEnd(event.target.value)} className={field} />
        </label>
        <button
          type="button"
          onClick={() => setTab('scheduler')}
          className="inline-flex h-11 items-center justify-center gap-2 border border-border bg-card px-4 text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <CalendarClock aria-hidden="true" className="size-4 text-brand" />Scheduler
        </button>
      </div>
      <div role="group" aria-label="Length" className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Length</span>
        {QUICK.map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={!startIso}
            aria-pressed={length === minutes}
            onClick={() => setEnd(addMinutesToInput(start, minutes))}
            className={cn('h-8 border px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50', length === minutes ? 'border-brand bg-brand text-white' : 'border-border bg-card hover:bg-accent')}
          >
            {formatMinutes(minutes)}
          </button>
        ))}
        {length !== null && length > 0 && !QUICK.includes(length) ? <span className="text-xs text-muted-foreground">{formatMinutes(length)}</span> : null}
      </div>
      {length !== null && length < 0 ? <p role="alert" className="text-sm text-danger">The event ends before it starts.</p> : null}
      {clashes.length ? (
        <p role="status" className="flex items-start gap-2 border border-warning bg-warning-soft px-3 py-2 text-sm text-foreground">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            This overlaps {clashes.length === 1 ? 'another event' : `${clashes.length} other events`}:{' '}
            {clashes.map((event, index) => <span key={event.id}>{index ? ', ' : ''}<strong className="font-semibold">{event.title}</strong> ({timeLabel(Date.parse(event.startAt))}–{timeLabel(Date.parse(event.endAt))})</span>)}. You can still save it.
          </span>
        </p>
      ) : null}
    </div>
  )
}
