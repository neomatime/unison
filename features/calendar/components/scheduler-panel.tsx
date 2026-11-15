'use client'

import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { formatMinutes } from '../description'
import { addMinutesToInput, dayLabel, findFreeSlots, inputFromKeyMinute, inputToKeyMinute, layoutDay, minutesLabel, spansInRange } from '../model'
import { useSchedule } from './schedule-context'

const HOUR_W = 64
const LANE_H = 28
const STEP = 15

type Drag = { mode: 'move' | 'start' | 'end'; originX: number; origStart: number; origEnd: number; startMin: number; endMin: number }

const snap = (minutes: number) => Math.round(minutes / STEP) * STEP

/** The Scheduler tab: the event's day as a line of hours. The event is a block on it that can be dragged to another time or
 *  stretched by either end; the other events of the day show as busy time, so a clash is seen as it is made; and free times of
 *  the same length are offered. Everything changes the same start and end the Details tab shows. */
export function SchedulerPanel() {
  const { start, end, events, ignoreId, setRange, setTab } = useSchedule()
  const from = inputToKeyMinute(start)
  const to = inputToKeyMinute(end)
  const scroller = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  const minutes = inputMinutes(start, end)
  const valid = from !== null && to !== null && minutes !== null && minutes > 0
  const key = from?.key ?? ''
  const origStart = from?.minute ?? 0
  const origEnd = origStart + (valid ? (minutes as number) : 60)
  const startMin = drag ? drag.startMin : origStart
  const endMin = drag ? drag.endMin : origEnd

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, ((origStart - 90) / 60) * HOUR_W)
    // Once per day shown; dragging must not move the view under the pointer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!from || !valid) {
    return (
      <div className="border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
        <p>Pick a start and an end on the Details tab to place the event on a day.</p>
        <button type="button" onClick={() => setTab('details')} className={backButton}><ArrowLeft aria-hidden="true" className="size-4" />Back to details</button>
      </div>
    )
  }

  const others = events.filter((event) => event.id !== ignoreId)
  const spans = spansInRange(others, { first: key, last: key })
  const { allDay, timed } = layoutDay(key, spans)
  const lanes = Math.max(1, ...timed.map((item) => item.columns))
  const length = origEnd - origStart
  const clashes = timed.filter((item) => item.startMin < endMin && item.endMin > startMin && item.span.event.status !== 'Cancelled')
  const slots = findFreeSlots(others, length, key, { count: 4, ignoreId })

  const place = (nextStart: number, nextEnd: number) => setRange(inputFromKeyMinute(key, nextStart), inputFromKeyMinute(key, nextEnd))
  // A click on an empty place on the event's line puts the event there, its middle at the click.
  const placeAt = (minute: number) => {
    const next = Math.max(0, Math.min(1440 - STEP, snap(minute - (endMin - startMin) / 2)))
    place(next, next + (endMin - startMin))
  }
  const shiftDay = (days: number) => setRange(addMinutesToInput(start, days * 1440), addMinutesToInput(end, days * 1440))

  const grab = (mode: Drag['mode']) => ({
    onPointerDown: (down: PointerEvent<HTMLElement>) => {
      if (down.button !== 0) return
      down.preventDefault()
      down.stopPropagation()
      try {
        down.currentTarget.setPointerCapture(down.pointerId)
      } catch {
        // The pointer is already gone.
      }
      setDrag({ mode, originX: down.clientX, origStart, origEnd, startMin: origStart, endMin: origEnd })
    },
    onPointerMove: (move: PointerEvent<HTMLElement>) => {
      if (!drag || drag.mode !== mode) return
      const delta = snap(((move.clientX - drag.originX) / HOUR_W) * 60)
      if (mode === 'move') {
        const next = Math.max(0, Math.min(1440 - STEP, drag.origStart + delta))
        setDrag({ ...drag, startMin: next, endMin: next + (drag.origEnd - drag.origStart) })
      } else if (mode === 'start') {
        setDrag({ ...drag, startMin: Math.max(0, Math.min(drag.origEnd - STEP, drag.origStart + delta)) })
      } else {
        setDrag({ ...drag, endMin: Math.max(drag.origStart + STEP, Math.min(1440, drag.origEnd + delta)) })
      }
    },
    onPointerUp: () => {
      if (!drag || drag.mode !== mode) return
      const done = drag
      setDrag(null)
      if (done.startMin !== done.origStart || done.endMin !== done.origEnd) place(done.startMin, done.endMin)
    },
    onPointerCancel: () => setDrag(null),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setTab('details')} className={backButton}><ArrowLeft aria-hidden="true" className="size-4" />Back</button>
        <div className="flex items-center gap-2" role="group" aria-label="Day">
          <button type="button" aria-label="Previous day" onClick={() => shiftDay(-1)} className={cn(navButton, 'w-9 px-0')}><ChevronLeft aria-hidden="true" className="mx-auto size-4" /></button>
          <button type="button" aria-label="Next day" onClick={() => shiftDay(1)} className={cn(navButton, 'w-9 px-0')}><ChevronRight aria-hidden="true" className="mx-auto size-4" /></button>
        </div>
        <h3 aria-live="polite" className="text-sm font-medium text-foreground">
          {dayLabel(key, true)} · {minutesLabel(startMin)}–{minutesLabel(endMin)} <span className="font-normal text-muted-foreground">({formatMinutes(endMin - startMin)})</span>
        </h3>
        {clashes.length ? <span role="status" className="border border-warning bg-warning-soft px-2 py-1 text-xs text-foreground">Overlaps {clashes.length === 1 ? clashes[0].span.event.title : `${clashes.length} events`}</span> : null}
      </div>

      <div className="border border-border bg-card">
        <div ref={scroller} className="overflow-x-auto">
          <div className="relative" style={{ width: 24 * HOUR_W + 128 }}>
            <div className="flex border-b border-border bg-muted text-[11px] text-muted-foreground">
              <div className="sticky left-0 z-20 w-32 shrink-0 border-r border-border bg-muted px-3 py-2">Time</div>
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} style={{ width: HOUR_W }} className="shrink-0 border-l border-border px-1.5 py-2 first:border-l-0">{minutesLabel(hour * 60)}</div>
              ))}
            </div>

            {allDay.length ? (
              <Row label="All day" height={LANE_H}>
                <p className="absolute top-1 left-2 truncate text-xs text-muted-foreground">{allDay.map((span) => span.event.title).join(' · ')}</p>
              </Row>
            ) : null}

            <Row label="This event" height={44} onPlace={placeAt}>
              <div
                role="group"
                data-block=""
                aria-label={`This event, ${minutesLabel(startMin)} to ${minutesLabel(endMin)}`}
                style={{ left: (startMin / 60) * HOUR_W, width: Math.max(12, ((endMin - startMin) / 60) * HOUR_W) }}
                className={cn('absolute top-1.5 bottom-1.5 z-10 flex cursor-grab items-center overflow-hidden border px-2 text-xs font-medium select-none touch-none', clashes.length ? 'border-warning bg-warning-soft text-foreground' : 'border-brand bg-brand-soft text-brand', drag?.mode === 'move' && 'cursor-grabbing')}
                {...grab('move')}
              >
                <span className="truncate">{minutesLabel(startMin)}–{minutesLabel(endMin)}</span>
                <span data-handle="" aria-hidden="true" title="Drag to change the start" className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-brand/30 hover:bg-brand/60" {...grab('start')} />
                <span data-handle="" aria-hidden="true" title="Drag to change the end" className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-brand/30 hover:bg-brand/60" {...grab('end')} />
              </div>
            </Row>

            <Row label="Calendar" height={lanes * LANE_H + 8}>
              {timed.length ? null : <p className="absolute top-2 left-3 text-xs text-muted-foreground">Nothing else on this day.</p>}
              {timed.map((item) => {
                const clash = item.startMin < endMin && item.endMin > startMin && item.span.event.status !== 'Cancelled'
                return (
                  <div
                    key={`${item.span.event.id}-${item.startMin}`}
                    title={`${item.span.event.title}, ${minutesLabel(item.startMin)}–${minutesLabel(item.endMin)}`}
                    style={{ left: (item.startMin / 60) * HOUR_W, width: Math.max(8, ((item.endMin - item.startMin) / 60) * HOUR_W - 1), top: 4 + item.column * LANE_H, height: LANE_H - 3 }}
                    className={cn('absolute overflow-hidden border px-1.5 text-[11px] leading-6', clash ? 'border-warning bg-warning-soft text-foreground' : 'border-border bg-muted text-muted-foreground', item.span.event.status === 'Cancelled' && 'line-through')}
                  >
                    <span className="block truncate">{item.span.event.title}</span>
                  </div>
                )
              })}
            </Row>

            <div aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 z-0 border-x border-brand/60 bg-brand/10" style={{ left: 128 + (startMin / 60) * HOUR_W, width: ((endMin - startMin) / 60) * HOUR_W }} />
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Time suggestions for {formatMinutes(length)}, on weekdays between 08:00 and 17:00</p>
        {slots.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {slots.map((slot) => (
              <li key={`${slot.key}-${slot.startMin}`}>
                <button type="button" onClick={() => setRange(inputFromKeyMinute(slot.key, slot.startMin), inputFromKeyMinute(slot.key, slot.startMin + length))} className="h-9 border border-border bg-card px-3 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40">
                  {dayLabel(slot.key)} · {minutesLabel(slot.startMin)}–{minutesLabel(slot.startMin + length)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No free time of that length in the next two weeks.</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Availability of attendees from Microsoft is not connected yet, so only events in UNISON are shown as busy.</p>
      </div>
    </div>
  )
}

const backButton = 'inline-flex h-9 items-center gap-2 border border-border bg-card px-3 text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40'
const navButton = 'h-9 border border-border bg-card text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40'

/** The minutes from a start to an end, both datetime-local values. */
function inputMinutes(start: string, end: string): number | null {
  const a = inputToKeyMinute(start)
  const b = inputToKeyMinute(end)
  if (!a || !b) return null
  const days = Math.round((Date.parse(`${b.key}T00:00:00Z`) - Date.parse(`${a.key}T00:00:00Z`)) / 86_400_000)
  return days * 1440 + b.minute - a.minute
}

/** One line of the timeline: a label that stays in view while the hours scroll, and the hours behind. Clicking an empty place
 *  on it calls onPlace with that minute. */
function Row({ label, height, children, onPlace }: { label: string; height: number; children: ReactNode; onPlace?: (minute: number) => void }) {
  return (
    <div className="flex border-b border-border last:border-b-0">
      <div className="sticky left-0 z-20 flex w-32 shrink-0 items-center border-r border-border bg-card px-3 text-xs font-medium text-foreground">{label}</div>
      <div
        onClick={onPlace ? (event) => (event.target as HTMLElement).closest('[data-block]') ? undefined : onPlace(((event.clientX - event.currentTarget.getBoundingClientRect().left) / HOUR_W) * 60) : undefined}
        className={cn('relative shrink-0', onPlace && 'cursor-pointer')}
        style={{ width: 24 * HOUR_W, height, backgroundImage: `repeating-linear-gradient(to right, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${HOUR_W}px)` }}
      >
        {children}
      </div>
    </div>
  )
}
