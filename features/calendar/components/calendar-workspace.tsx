'use client'

import { ChevronLeft, ChevronRight, Plus, Video } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent, type MouseEvent, type MutableRefObject, type ReactNode } from 'react'

import { Dropdown } from '@/components/ui/select'
import { StatusDot } from '@/components/ui/status-dot'
import { cn } from '@/lib/utils'
import { rescheduleEventAction } from '../actions'
import {
  CALENDAR_VIEWS,
  WEEKDAYS,
  canJoin,
  dayLabel,
  daysBetween,
  eventTone,
  groupAgenda,
  joinUrlOf,
  layoutDay,
  layoutWeek,
  legendFor,
  minutesLabel,
  monthGrid,
  moveByDays,
  moveToSlot,
  newEventHref,
  safeJoinUrl,
  slotToRange,
  snapMinute,
  spansInRange,
  splitKey,
  stepAnchor,
  timeLabel,
  viewRange,
  viewTitle,
  weekDays,
  type CalendarEvent,
  type CalendarView,
  type ColorBy,
  type DayKey,
  type EventTone,
  type Span,
} from '../model'

const BASE = '/operations/calendar'
const HOUR_PX = 48
const MONTH_LANES = 3
const VIEW_LABELS: Record<CalendarView, string> = { month: 'Month', week: 'Week', day: 'Day', agenda: 'Agenda', list: 'List' }

// A tone is a left bar and a soft fill from the product's own tokens. Square corners, thin borders, no green.
const TONE: Record<EventTone, string> = {
  brand: 'border-l-brand bg-brand-soft',
  navy: 'border-l-foreground bg-accent',
  slate: 'border-l-muted-foreground bg-muted',
  amber: 'border-l-warning bg-warning-soft',
  indigo: 'border-l-info bg-info-soft',
  red: 'border-l-danger bg-danger-soft',
}

const BAR: Record<EventTone, string> = {
  brand: 'bg-brand',
  navy: 'bg-foreground',
  slate: 'bg-muted-foreground',
  amber: 'bg-warning',
  indigo: 'bg-info',
  red: 'bg-danger',
}

/** What is being dragged: the event, and where on it the pointer took hold. */
type DragInfo = { id: string; grabDay?: DayKey; offsetMinutes?: number }
type Dnd = { drag: MutableRefObject<DragInfo | null>; move: (id: string, build: (event: CalendarEvent) => { startAt: string; endAt: string }) => void }

const phoneQuery = '(max-width: 639px)'
function usePhone() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(phoneQuery)
      query.addEventListener('change', notify)
      return () => query.removeEventListener('change', notify)
    },
    () => window.matchMedia(phoneQuery).matches,
    () => false,
  )
}

type Props = {
  events: CalendarEvent[]
  initialView: CalendarView
  initialDate: DayKey
  /** Today on the Johannesburg calendar, worked out on the server so the first paint matches. */
  today: DayKey
  teamsConnected: boolean
  /** The existing register, kept as the List view with its import, export and archive features. */
  listPanel: ReactNode
}

export function CalendarWorkspace({ events: saved, initialView, initialDate, today, teamsConnected, listPanel }: Props) {
  const [view, setView] = useState<CalendarView>(initialView)
  const [anchor, setAnchor] = useState<DayKey>(initialDate)
  const [colorBy, setColorBy] = useState<ColorBy>('status')
  const phone = usePhone()
  const router = useRouter()
  // A moved event shows in its new place at once; if saving fails it goes back.
  const [moved, setMoved] = useState<Record<string, { startAt: string; endAt: string }>>({})
  const [notice, setNotice] = useState<{ kind: 'saving' | 'error'; text: string } | null>(null)
  const drag = useRef<DragInfo | null>(null)
  const events = saved.map((event) => (moved[event.id] ? { ...event, ...moved[event.id] } : event))

  async function move(id: string, build: (event: CalendarEvent) => { startAt: string; endAt: string }) {
    const current = events.find((event) => event.id === id)
    if (!current) return
    const next = build(current)
    if (next.startAt === current.startAt && next.endAt === current.endAt) return
    setMoved((all) => ({ ...all, [id]: next }))
    setNotice({ kind: 'saving', text: 'Saving…' })
    const result = await rescheduleEventAction(id, next.startAt, next.endAt).catch(() => ({ ok: false as const, error: 'The event could not be moved. Check your connection and try again.' }))
    if (result.ok) {
      setNotice(null)
      router.refresh()
    } else {
      setMoved((all) => ({ ...all, [id]: { startAt: current.startAt, endAt: current.endAt } }))
      setNotice({ kind: 'error', text: result.error })
    }
  }
  const dnd: Dnd = { drag, move }

  function go(nextView: CalendarView, nextAnchor: DayKey) {
    setView(nextView)
    setAnchor(nextAnchor)
    const url = new URL(window.location.href)
    url.searchParams.set('view', nextView)
    url.searchParams.set('date', nextAnchor)
    window.history.replaceState(null, '', url)
  }

  // On a phone the month and week grids are too small to read, so they show as an agenda over the same days.
  const showing: CalendarView = phone && (view === 'month' || view === 'week') ? 'agenda' : view
  const range = viewRange(showing === 'agenda' && view !== 'agenda' ? view : showing, anchor)
  const spans = spansInRange(events, range)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2" role="group" aria-label="Move through the calendar">
          <button type="button" onClick={() => go(view, today)} className={buttonClass}>Today</button>
          {view === 'list' ? null : <>
            <button type="button" aria-label="Previous" onClick={() => go(view, stepAnchor(view, anchor, -1))} className={cn(buttonClass, 'w-9 px-0')}><ChevronLeft aria-hidden="true" className="mx-auto size-4" /></button>
            <button type="button" aria-label="Next" onClick={() => go(view, stepAnchor(view, anchor, 1))} className={cn(buttonClass, 'w-9 px-0')}><ChevronRight aria-hidden="true" className="mx-auto size-4" /></button>
          </>}
        </div>
        {view === 'list' ? null : <h2 aria-live="polite" className="font-brand text-lg font-light text-foreground sm:text-xl">{viewTitle(view, anchor)}</h2>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Calendar view" className="flex border border-border">
            {CALENDAR_VIEWS.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={view === name}
                onClick={() => go(name, anchor)}
                className={cn('h-9 px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40', (name === 'month' || name === 'week') && 'hidden sm:block', view === name ? 'bg-brand text-white' : 'bg-card text-foreground hover:bg-accent')}
              >
                {VIEW_LABELS[name]}
              </button>
            ))}
          </div>
          {view === 'list' ? null : (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Colour by
              <Dropdown value={colorBy} onChange={(event) => setColorBy(event.target.value as ColorBy)} className="h-9 w-28 text-sm">
                <option value="status">Status</option>
                <option value="type">Type</option>
              </Dropdown>
            </label>
          )}
          <span title={teamsConnected ? 'Events can be created with a Microsoft Teams meeting.' : 'Microsoft Teams is not connected, so events cannot be given a meeting link yet.'} className="inline-flex h-9 items-center gap-2 border border-border px-3 text-xs text-muted-foreground">
            <Video aria-hidden="true" className="size-3.5" />
            Teams {teamsConnected ? 'connected' : 'not connected'}
          </span>
          {view === 'list' ? null : (
            <Link href={newEventHref(BASE, slotToRange(view === 'day' ? anchor : today, 9 * 60))} className="inline-flex h-9 items-center gap-2 bg-brand px-4 text-sm font-medium text-white outline-none hover:bg-brand/90 focus-visible:ring-2 focus-visible:ring-ring/50">
              <Plus aria-hidden="true" className="size-4" />New Event
            </Link>
          )}
        </div>
      </div>

      {view === 'list' ? null : <Legend colorBy={colorBy} />}
      <p aria-live="polite" role={notice?.kind === 'error' ? 'alert' : undefined} className={cn('mt-2 text-xs', notice?.kind === 'error' ? 'border border-danger bg-danger-soft px-3 py-2 text-sm text-foreground' : 'text-muted-foreground', !notice && 'sr-only')}>{notice?.text ?? 'Drag an event to move it.'}</p>

      <div className="mt-3">
        {view === 'list' ? listPanel : null}
        {showing === 'month' ? <MonthView anchor={anchor} spans={spans} today={today} colorBy={colorBy} onOpenDay={(key) => go('day', key)} dnd={dnd} /> : null}
        {showing === 'week' ? <TimeGrid days={weekDays(anchor)} spans={spans} today={today} colorBy={colorBy} onOpenDay={(key) => go('day', key)} dnd={dnd} /> : null}
        {showing === 'day' ? <TimeGrid days={[anchor]} spans={spans} today={today} colorBy={colorBy} dnd={dnd} /> : null}
        {showing === 'agenda' ? <Agenda spans={spans} range={range} today={today} colorBy={colorBy} /> : null}
      </div>
    </div>
  )
}

const buttonClass = 'h-9 border border-border bg-card px-3 text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40'

function Legend({ colorBy }: { colorBy: ColorBy }) {
  return (
    <ul aria-label={`Colours show the event ${colorBy}`} className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {legendFor(colorBy).map((item) => (
        <li key={item.label} className="flex items-center gap-1.5"><span aria-hidden="true" className={cn('size-2.5 border border-border border-l-[3px]', TONE[item.tone])} />{item.label}</li>
      ))}
    </ul>
  )
}

function chipClass(event: CalendarEvent, colorBy: ColorBy) {
  return cn(
    'flex items-center gap-1 truncate border border-border border-l-[3px] px-1.5 text-xs text-foreground outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/50',
    TONE[eventTone(event, colorBy)],
    event.status === 'Tentative' && 'border-dashed',
    event.status === 'Cancelled' && 'text-muted-foreground line-through',
  )
}

const eventHref = (event: CalendarEvent) => `${BASE}/${event.id}`
const describe = (span: Span) => `${span.event.title}, ${span.allDay ? 'all day' : `${timeLabel(span.startMs)} to ${timeLabel(span.endMs)}`}, ${span.event.status}`

function JoinButton({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
  const url = canJoin(event) ? joinUrlOf(event) : null
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Join ${event.title} on Microsoft Teams`} className={cn('inline-flex shrink-0 items-center gap-1 bg-brand font-medium text-white outline-none hover:bg-brand/90 focus-visible:ring-2 focus-visible:ring-ring/50', compact ? 'ml-auto h-full px-1.5 text-[11px] leading-[18px]' : 'px-3 py-1.5 text-xs')}>
      <Video aria-hidden="true" className="size-3" />Join
    </a>
  )
}

// ---- Month ---------------------------------------------------------------------------------------------------------

function columnAt(event: DragEvent<HTMLElement>, row: HTMLElement) {
  const box = row.getBoundingClientRect()
  return Math.max(0, Math.min(6, Math.floor(((event.clientX - box.left) / box.width) * 7)))
}

function MonthView({ anchor, spans, today, colorBy, onOpenDay, dnd }: { anchor: DayKey; spans: Span[]; today: DayKey; colorBy: ColorBy; onOpenDay: (key: DayKey) => void; dnd: Dnd }) {
  const [over, setOver] = useState<DayKey | null>(null)
  const weeks = monthGrid(anchor)
  const month = splitKey(anchor).month
  const rows: CSSProperties = { gridTemplateRows: `28px repeat(${MONTH_LANES}, 22px) 20px` }
  return (
    <div aria-label={viewTitle('month', anchor)} className="border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-muted text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((name) => <div key={name} className="px-2 py-2">{name.slice(0, 3)}</div>)}
      </div>
      {weeks.map((days) => {
        const layout = layoutWeek(days, spans, MONTH_LANES)
        return (
          <div
            key={days[0]}
            data-week=""
            className="relative grid grid-cols-7 border-b border-border pb-1 last:border-b-0"
            style={rows}
            onDragOver={(event) => {
              if (!dnd.drag.current) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              const key = days[columnAt(event, event.currentTarget)]
              if (key !== over) setOver(key)
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null)
            }}
            onDrop={(event) => {
              const info = dnd.drag.current
              dnd.drag.current = null
              setOver(null)
              if (!info?.grabDay) return
              event.preventDefault()
              const delta = daysBetween(info.grabDay, days[columnAt(event, event.currentTarget)])
              if (delta) dnd.move(info.id, (moving) => moveByDays(moving, delta))
            }}
          >
            {days.map((key, col) => {
              const { month: m, date } = splitKey(key)
              const isToday = key === today
              return (
                <div key={key} style={{ gridColumn: col + 1, gridRow: '1 / -1' }} className={cn('relative min-w-0 border-r border-border last:border-r-0', m !== month && 'bg-muted/50', over === key && 'bg-brand-soft outline outline-1 -outline-offset-1 outline-brand')}>
                  <Link href={newEventHref(BASE, slotToRange(key, 9 * 60))} aria-label={`New event on ${dayLabel(key, true)}`} className="absolute inset-0 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50" />
                  <button
                    type="button"
                    onClick={() => onOpenDay(key)}
                    aria-label={`${dayLabel(key, true)}, open day`}
                    aria-current={isToday ? 'date' : undefined}
                    className={cn('relative z-10 m-1 inline-flex h-5 min-w-5 items-center justify-center px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50', isToday ? 'bg-brand font-semibold text-white' : m !== month ? 'text-muted-foreground' : 'text-foreground hover:bg-accent')}
                  >
                    {date === 1 ? `${date} ${dayLabel(key).split(' ')[2]}` : date}
                  </button>
                </div>
              )
            })}
            {layout.segments.map((segment) => {
              const { event } = segment.span
              const timed = !segment.span.allDay && segment.startCol === segment.endCol && !segment.continuesBefore
              return (
                <div
                  key={`${event.id}-${segment.startCol}`}
                  style={{ gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`, gridRow: segment.lane + 2 }}
                  className={cn(chipClass(event, colorBy), 'relative z-10 mx-1 my-px pr-0 focus-within:ring-2 focus-within:ring-ring/50', segment.continuesBefore && 'border-l-0', segment.continuesAfter && 'border-r-0')}
                >
                  <Link
                    href={eventHref(event)}
                    aria-label={describe(segment.span)}
                    title={describe(segment.span)}
                    draggable
                    onDragStart={(drag) => {
                      const row = drag.currentTarget.closest('[data-week]') as HTMLElement
                      drag.dataTransfer.effectAllowed = 'move'
                      drag.dataTransfer.setData('text/plain', segment.span.event.id)
                      dnd.drag.current = { id: segment.span.event.id, grabDay: days[columnAt(drag, row)] }
                    }}
                    onDragEnd={() => {
                      dnd.drag.current = null
                      setOver(null)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1 outline-none"
                  >
                    {timed ? <span className="shrink-0 text-muted-foreground">{timeLabel(segment.span.startMs)}</span> : null}
                    <span className="truncate">{event.title}</span>
                  </Link>
                  {canJoin(event) ? <JoinButton event={event} compact /> : joinUrlOf(event) ? <Video aria-label="Teams meeting" className="mr-1 size-3 shrink-0 text-brand" /> : null}
                </div>
              )
            })}
            {layout.hidden.map((count, col) =>
              count ? (
                <button
                  key={days[col]}
                  type="button"
                  onClick={() => onOpenDay(days[col])}
                  aria-label={`${count} more events on ${dayLabel(days[col], true)}, open day`}
                  style={{ gridColumn: col + 1, gridRow: MONTH_LANES + 2 }}
                  className="relative z-10 mx-1 truncate text-left text-xs font-medium text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  + {count} more
                </button>
              ) : null,
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---- Week and day --------------------------------------------------------------------------------------------------

function TimeGrid({ days, spans, today, colorBy, onOpenDay, dnd }: { days: DayKey[]; spans: Span[]; today: DayKey; colorBy: ColorBy; onOpenDay?: (key: DayKey) => void; dnd: Dnd }) {
  const router = useRouter()
  const scroller = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState<number | null>(null)
  const single = days.length === 1
  const columns = `56px repeat(${days.length}, minmax(0, 1fr))`

  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX
  }, [days[0], days.length])

  const week = layoutWeek(days.length === 7 ? days : [days[0], ...Array.from({ length: 6 }, () => days[0])], spans.filter((span) => span.allDay), 99)
  const strip = days.length === 7 ? week : { ...week, segments: week.segments.filter((segment) => segment.startCol === 0).map((segment) => ({ ...segment, endCol: 0, lane: segment.lane })) }
  const lanes = strip.segments.reduce((max, segment) => Math.max(max, segment.lane + 1), 0)
  const nowMinutes = now === null ? null : Math.round(((now + 2 * 3_600_000) % 86_400_000) / 60_000)

  function clickColumn(event: MouseEvent<HTMLDivElement>, key: DayKey) {
    if ((event.target as HTMLElement).closest('a')) return
    const box = event.currentTarget.getBoundingClientRect()
    router.push(newEventHref(BASE, slotToRange(key, ((event.clientY - box.top) / HOUR_PX) * 60)))
  }

  return (
    <div className="overflow-x-auto border border-border bg-card">
      <div className={single ? '' : 'min-w-[720px]'}>
        <div className="grid border-b border-border bg-muted" style={{ gridTemplateColumns: columns }}>
          <div />
          {days.map((key) => {
            const isToday = key === today
            return (
              <div key={key} className="relative border-l border-border px-2 py-2 text-xs">
                {onOpenDay ? (
                  <button type="button" onClick={() => onOpenDay(key)} aria-current={isToday ? 'date' : undefined} className={cn('font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50', isToday ? 'text-brand' : 'text-foreground')}>{dayLabel(key)}</button>
                ) : <span className={cn('font-medium', isToday ? 'text-brand' : 'text-foreground')}>{dayLabel(key, true)}</span>}
                <Link href={newEventHref(BASE, slotToRange(key, 9 * 60))} className="sr-only focus:not-sr-only focus:ml-2 focus:text-brand focus:underline">New event</Link>
              </div>
            )
          })}
        </div>

        {lanes ? (
          <div className="grid border-b border-border" style={{ gridTemplateColumns: columns, gridTemplateRows: `repeat(${lanes}, 22px)` }}>
            <div style={{ gridRow: `1 / span ${lanes}` }} className="px-2 py-1 text-[11px] text-muted-foreground">All day</div>
            {strip.segments.map((segment) => (
              <Link key={segment.span.event.id} href={eventHref(segment.span.event)} aria-label={describe(segment.span)} style={{ gridColumn: `${segment.startCol + 2} / ${segment.endCol + 3}`, gridRow: segment.lane + 1 }} className={cn(chipClass(segment.span.event, colorBy), 'mx-1 my-px')}>
                <span className="truncate">{segment.span.event.title}</span>
              </Link>
            ))}
          </div>
        ) : null}

        <div ref={scroller} className="max-h-[640px] overflow-y-auto">
          <div className="grid" style={{ gridTemplateColumns: columns }}>
            <div className="relative" style={{ height: 24 * HOUR_PX }}>
              {Array.from({ length: 24 }, (_, hour) => hour > 0 ? <span key={hour} style={{ top: hour * HOUR_PX - 7 }} className="absolute right-2 text-[11px] text-muted-foreground">{minutesLabel(hour * 60)}</span> : null)}
            </div>
            {days.map((key) => {
              const { timed } = layoutDay(key, spans)
              return (
                <div
                  key={key}
                  onClick={(event) => clickColumn(event, key)}
                  onDragOver={(event) => {
                    if (!dnd.drag.current) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(event) => {
                    const info = dnd.drag.current
                    dnd.drag.current = null
                    if (!info) return
                    event.preventDefault()
                    const box = event.currentTarget.getBoundingClientRect()
                    const minute = snapMinute(((event.clientY - box.top) / HOUR_PX) * 60 - (info.offsetMinutes ?? 0))
                    dnd.move(info.id, (moving) => moveToSlot(moving, key, minute))
                  }}
                  className={cn('relative cursor-cell border-l border-border', key === today && 'bg-brand-soft/40')}
                  style={{ height: 24 * HOUR_PX, backgroundImage: 'repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px, transparent 48px)' }}
                >
                  {timed.map((item) => {
                    const { event } = item.span
                    return (
                      <Link
                        key={`${event.id}-${item.startMin}`}
                        href={eventHref(event)}
                        aria-label={describe(item.span)}
                        title={describe(item.span)}
                        draggable={item.span.firstDay === item.span.lastDay}
                        onDragStart={(drag) => {
                          const box = drag.currentTarget.getBoundingClientRect()
                          drag.dataTransfer.effectAllowed = 'move'
                          drag.dataTransfer.setData('text/plain', event.id)
                          dnd.drag.current = { id: event.id, offsetMinutes: Math.max(0, ((drag.clientY - box.top) / HOUR_PX) * 60) }
                        }}
                        onDragEnd={() => {
                          dnd.drag.current = null
                        }}
                        style={{ top: (item.startMin / 60) * HOUR_PX, height: Math.max(18, ((item.endMin - item.startMin) / 60) * HOUR_PX - 2), left: `calc(${(item.column / item.columns) * 100}% + 1px)`, width: `calc(${100 / item.columns}% - 3px)` }}
                        className={cn(chipClass(event, colorBy), 'absolute z-10 flex-col items-start gap-0 overflow-hidden py-0.5 whitespace-normal')}
                      >
                        <span className="w-full truncate font-medium">{event.title}</span>
                        <span className="w-full truncate text-[11px] text-muted-foreground">{timeLabel(item.span.startMs)}–{timeLabel(item.span.endMs)}</span>
                        {joinUrlOf(event) ? <Video aria-label="Teams meeting" className="size-3 text-brand" /> : null}
                      </Link>
                    )
                  })}
                  {key === today && nowMinutes !== null ? <div aria-hidden="true" style={{ top: (nowMinutes / 60) * HOUR_PX }} className="pointer-events-none absolute right-0 left-0 z-20 h-px bg-danger"><span className="absolute -top-[3px] -left-1 size-[7px] rounded-full bg-danger" /></div> : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Agenda --------------------------------------------------------------------------------------------------------

function Agenda({ spans, range, today, colorBy }: { spans: Span[]; range: { first: DayKey; last: DayKey }; today: DayKey; colorBy: ColorBy }) {
  const days = groupAgenda(spans, range)
  if (!days.length) {
    return (
      <div className="border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No events in this period.</p>
        <Link href={newEventHref(BASE, slotToRange(range.first, 9 * 60))} className="mt-4 inline-flex h-9 items-center gap-2 bg-brand px-4 text-sm font-medium text-white"><Plus aria-hidden="true" className="size-4" />New event</Link>
      </div>
    )
  }
  return (
    <div className="border border-border bg-card">
      {days.map((day) => (
        <section key={day.key} aria-label={dayLabel(day.key, true)} className="border-b border-border last:border-b-0">
          <h3 className={cn('flex items-center gap-2 bg-muted px-4 py-2 text-sm font-medium', day.key === today ? 'text-brand' : 'text-foreground')}>
            {dayLabel(day.key, true)}{day.key === today ? <span className="bg-brand px-1.5 text-[11px] text-white">Today</span> : null}
          </h3>
          <ul>
            {day.spans.map((span) => {
              const { event } = span
              return (
                <li key={`${event.id}-${day.key}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 first:border-t-0">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{span.allDay ? 'All day' : `${timeLabel(span.startMs)} – ${timeLabel(span.endMs)}`}</span>
                  <span aria-hidden="true" className={cn('h-8 w-1 shrink-0', BAR[eventTone(event, colorBy)])} />
                  <Link href={eventHref(event)} className="min-w-0 flex-1 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">
                    <span className={cn('block truncate text-sm font-medium text-foreground', event.status === 'Cancelled' && 'line-through')}>{event.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[event.eventType, event.location && !safeJoinUrl(event.location) ? event.location : null, event.client, event.owner && event.owner !== 'Unassigned' ? event.owner : null].filter(Boolean).join(' · ')}</span>
                  </Link>
                  <StatusDot status={event.status} />
                  <JoinButton event={event} />
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
