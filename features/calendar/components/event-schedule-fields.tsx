'use client'

import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'

import { AppInput } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatMinutes } from '../description'
import {
  addMinutesToInput,
  dayLabel,
  dayNumberOf,
  dayToKey,
  durationOfInputs,
  findClashes,
  layoutDay,
  localInputToIso,
  minutesLabel,
  shiftEnd,
  spansInRange,
  timeLabel,
  type CalendarEvent,
} from '../model'

const QUICK = [15, 30, 45, 60, 90, 120]
const HOUR_PX = 36
const NEW_ID = '__new__'
const field = 'mt-1.5 h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-brand'

/** Starts and ends for the event form. Moving the start moves the end with it, keeping the length; the length can be set
 *  from a few quick choices; and the day is drawn beside the fields so a clash with another event is seen before saving. */
export function ScheduleFields({ startValue, endValue, events, ignoreId }: { startValue: string; endValue: string; events: CalendarEvent[]; ignoreId?: string }) {
  const [start, setStart] = useState(startValue)
  const [end, setEnd] = useState(endValue)
  const length = durationOfInputs(start, end)
  const startIso = localInputToIso(start)
  const endIso = localInputToIso(end)
  const valid = startIso !== null && endIso !== null && length !== null && length >= 0
  const clashes = valid ? findClashes(events, startIso, endIso, ignoreId) : []

  return (
    <div className="grid gap-5 md:col-span-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="flex flex-col gap-4">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium">Starts
            <AppInput name="startAt" type="datetime-local" required value={start} onChange={(event) => { setEnd(shiftEnd(start, end, event.target.value)); setStart(event.target.value) }} className={field} />
          </label>
          <label className="text-sm font-medium">Ends
            <AppInput name="endAt" type="datetime-local" required value={end} onChange={(event) => setEnd(event.target.value)} className={field} />
          </label>
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
      <DayPreview events={events} ignoreId={ignoreId} startIso={valid ? startIso : null} endIso={valid ? endIso : null} clashIds={clashes.map((event) => event.id)} />
    </div>
  )
}

function DayPreview({ events, ignoreId, startIso, endIso, clashIds }: { events: CalendarEvent[]; ignoreId?: string; startIso: string | null; endIso: string | null; clashIds: string[] }) {
  if (!startIso || !endIso) {
    return <aside aria-label="Day preview" className="border border-border bg-muted/40 p-4 text-sm text-muted-foreground">Pick a start and end to see the day.</aside>
  }
  const key = dayToKey(dayNumberOf(Date.parse(startIso)))
  const proposed: CalendarEvent = { id: NEW_ID, title: 'This event', eventType: 'Internal', startAt: startIso, endAt: endIso, allDay: false, status: 'Confirmed' }
  const others = events.filter((event) => event.id !== ignoreId)
  const spans = spansInRange([...others, proposed], { first: key, last: key })
  const { allDay, timed } = layoutDay(key, spans)
  const first = Math.min(7 * 60, ...timed.map((item) => Math.floor(item.startMin / 60) * 60))
  const last = Math.max(19 * 60, ...timed.map((item) => Math.ceil(item.endMin / 60) * 60))
  const hours = Array.from({ length: (last - first) / 60 }, (_, index) => first / 60 + index)

  return (
    <aside aria-label="Day preview" className="border border-border bg-card">
      <h3 className="border-b border-border bg-muted px-3 py-2 text-xs font-medium text-foreground">{dayLabel(key, true)}</h3>
      {allDay.filter((span) => span.event.id !== NEW_ID).map((span) => (
        <p key={span.event.id} className="truncate border-b border-border bg-accent px-3 py-1 text-xs text-muted-foreground">All day · {span.event.title}</p>
      ))}
      <div className="relative max-h-72 overflow-y-auto">
        <div className="relative" style={{ height: hours.length * HOUR_PX }}>
          {hours.map((hour, index) => (
            <div key={hour} style={{ top: index * HOUR_PX, height: HOUR_PX }} className="absolute right-0 left-0 border-t border-border first:border-t-0">
              <span className="absolute top-0.5 left-2 text-[10px] text-muted-foreground">{minutesLabel(hour * 60)}</span>
            </div>
          ))}
          {timed.map((item) => {
            const mine = item.span.event.id === NEW_ID
            const clash = clashIds.includes(item.span.event.id)
            return (
              <div
                key={`${item.span.event.id}-${item.startMin}`}
                title={`${mine ? 'This event' : item.span.event.title}, ${minutesLabel(item.startMin)}–${minutesLabel(item.endMin)}`}
                style={{ top: ((item.startMin - first) / 60) * HOUR_PX, height: Math.max(16, ((item.endMin - item.startMin) / 60) * HOUR_PX - 1), left: `calc(2.75rem + (100% - 3rem) * ${item.column / item.columns})`, width: `calc((100% - 3rem) / ${item.columns} - 2px)` }}
                className={cn('absolute overflow-hidden border px-1.5 text-[11px] leading-4', mine ? 'z-10 border-dashed border-brand bg-brand-soft font-medium text-brand' : clash ? 'border-warning bg-warning-soft text-foreground' : 'border-border bg-muted text-muted-foreground')}
              >
                <span className="block truncate">{item.span.event.title}</span>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
