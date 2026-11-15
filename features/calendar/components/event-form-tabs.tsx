'use client'

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { shiftEnd, type CalendarEvent } from '../model'
import { ScheduleContext, type EventFormTab as Tab, type Schedule } from './schedule-context'
import { SchedulerPanel } from './scheduler-panel'

/** The event form's two tabs, as in Teams: Details, where the event is set up, and Scheduler, where its time is placed on a day.
 *  Both stay in the page while hidden, so every field is still sent when the form is saved. The start and end are shared, so a
 *  change in one tab shows in the other. */
export function EventFormTabs({ startValue, endValue, events, ignoreId, details }: { startValue: string; endValue: string; events: CalendarEvent[]; ignoreId?: string; details: ReactNode }) {
  const [start, setStart] = useState(startValue)
  const [end, setEnd] = useState(endValue)
  const [tab, setTab] = useState<Tab>('details')
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ details: null, scheduler: null })

  const value = useMemo<Schedule>(
    () => ({
      start,
      end,
      events,
      ignoreId,
      changeStart: (next) => {
        setEnd(shiftEnd(start, end, next))
        setStart(next)
      },
      setEnd,
      setRange: (nextStart, nextEnd) => {
        setStart(nextStart)
        setEnd(nextEnd)
      },
      tab,
      setTab,
    }),
    [start, end, events, ignoreId, tab],
  )

  const tabs: Array<{ id: Tab; label: string }> = [{ id: 'details', label: 'Details' }, { id: 'scheduler', label: 'Scheduler' }]

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next: Tab = tab === 'details' ? 'scheduler' : 'details'
    setTab(next)
    refs.current[next]?.focus()
  }

  return (
    <ScheduleContext.Provider value={value}>
      <div className="md:col-span-2">
        <div role="tablist" aria-label="Event sections" onKeyDown={onKeyDown} className="flex gap-6 border-b border-border">
          {tabs.map((item) => (
            <button
              key={item.id}
              ref={(node) => {
                refs.current[item.id] = node
              }}
              type="button"
              role="tab"
              id={`event-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`event-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              className={cn('-mb-px border-b-2 py-3 text-sm font-medium outline-none focus-visible:text-brand', tab === item.id ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="event-panel-details" aria-labelledby="event-tab-details" hidden={tab !== 'details'} className="mt-5 grid gap-5 md:grid-cols-2">
          {details}
        </div>
        <div role="tabpanel" id="event-panel-scheduler" aria-labelledby="event-tab-scheduler" hidden={tab !== 'scheduler'} className="mt-5">
          <SchedulerPanel />
        </div>
      </div>
    </ScheduleContext.Provider>
  )
}
