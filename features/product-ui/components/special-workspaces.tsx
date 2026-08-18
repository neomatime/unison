'use client'

import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Brain,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CreditCard,
  Database,
  Download,
  FileText,
  GripVertical,
  Mail,
  MessageSquare,
  Monitor,
  Palette,
  PanelsTopLeft,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

export function hasSpecialWorkspace(moduleId: string, view: string) {
  return moduleId === 'calendar'
    || moduleId === 'forecast'
    || moduleId === 'atlas'
    || moduleId === 'settings'
    || moduleId === 'sales'
    || moduleId === 'team'
    || moduleId === 'hr'
    || (moduleId === 'leave' && ['Approvals', 'Calendar', 'Balances'].includes(view))
    || (moduleId === 'projects' && ['Board', 'Timeline'].includes(view))
    || (moduleId === 'tasks' && view === 'Board')
    || (moduleId === 'knowledge' && view === 'Knowledge Home')
}

export function SpecialWorkspace({ moduleId, view }: { moduleId: string; view: string }) {
  if (moduleId === 'calendar') return <CalendarWorkspace view={view} />
  if (moduleId === 'forecast') return <ForecastWorkspace view={view} />
  if (moduleId === 'atlas') return <AtlasWorkspace view={view} />
  if (moduleId === 'settings') return <SettingsWorkspace view={view} />
  if (moduleId === 'sales') return view === 'Pipeline' ? <PipelineWorkspace /> : <SalesSubview view={view} />
  if (moduleId === 'projects') return view === 'Board' ? <ProjectBoard /> : <ProjectTimeline />
  if (moduleId === 'tasks') return <TaskBoard />
  if (moduleId === 'team') return <TeamSubview view={view} />
  if (moduleId === 'hr') return <HrSubview view={view} />
  if (moduleId === 'leave') return <LeaveSubview view={view} />
  if (moduleId === 'knowledge' && view === 'Knowledge Home') return <KnowledgeHome />
  return null
}

const calendarEvents = [
  { day: 11, time: '09:00', title: 'Leadership stand-up', owner: 'Neo Morake', color: 'bg-info-soft text-info' },
  { day: 12, time: '11:30', title: 'Meridian workshop', owner: 'Amara Dlamini', color: 'bg-brand-soft text-brand' },
  { day: 13, time: '14:00', title: 'Identity review', owner: 'Lethabo Nkosi', color: 'bg-warning-soft text-warning' },
  { day: 14, time: '16:00', title: 'Proposal deadline', owner: 'Neo Morake', color: 'bg-muted text-foreground' },
  { day: 17, time: '08:30', title: 'Zanele returns', owner: 'People team', color: 'bg-info-soft text-info' },
]

function CalendarWorkspace({ view }: { view: string }) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [selected, setSelected] = useState<(typeof calendarEvents)[number] | null>(null)
  const month = monthOffset === 0 ? 'August 2026' : monthOffset < 0 ? 'July 2026' : 'September 2026'
  return <>
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div><h2 className="font-semibold">{month}</h2><p className="text-xs text-muted-foreground">{view} view · Africa/Johannesburg</p></div>
        <div className="flex gap-2"><button type="button" onClick={() => setMonthOffset(0)} className="rounded-lg border border-border px-3 py-2 text-sm">Today</button><button type="button" aria-label="Previous period" onClick={() => setMonthOffset(-1)} className="rounded-lg border border-border p-2"><ChevronLeft className="size-4" /></button><button type="button" aria-label="Next period" onClick={() => setMonthOffset(1)} className="rounded-lg border border-border p-2"><ChevronRight className="size-4" /></button></div>
      </div>
      {view === 'Month' ? <MonthCalendar onSelect={setSelected} /> : view === 'Week' ? <WeekCalendar onSelect={setSelected} /> : view === 'Day' ? <DayCalendar onSelect={setSelected} /> : <AgendaCalendar onSelect={setSelected} />}
    </section>
    {selected ? <EventDrawer event={selected} onClose={() => setSelected(null)} /> : null}
  </>
}

function MonthCalendar({ onSelect }: { onSelect: (event: (typeof calendarEvents)[number]) => void }) {
  return <><div className="grid grid-cols-7 border-b border-border bg-muted/30 text-center text-xs font-semibold text-muted-foreground">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <div key={day} className="p-3">{day}</div>)}</div><div className="grid grid-cols-7">{Array.from({ length: 35 }, (_, index) => { const day = index - 3; const event = calendarEvents.find((candidate) => candidate.day === day); return <div key={index} className="min-h-28 border-r border-b border-border p-2"><span className={`text-xs ${day < 1 || day > 31 ? 'text-muted-foreground/40' : 'text-muted-foreground'}`}>{day > 0 && day <= 31 ? day : ''}</span>{event ? <button type="button" onClick={() => onSelect(event)} className={`mt-2 block w-full rounded-md px-2 py-1.5 text-left text-xs font-medium ${event.color}`}>{event.title}</button> : null}</div>})}</div></>
}

function WeekCalendar({ onSelect }: { onSelect: (event: (typeof calendarEvents)[number]) => void }) {
  return <div className="grid min-w-[800px] grid-cols-7 overflow-x-auto">{['Mon 10','Tue 11','Wed 12','Thu 13','Fri 14','Sat 15','Sun 16'].map((day, index) => <div key={day} className="min-h-[520px] border-r border-border p-3"><p className="border-b border-border pb-3 text-center text-xs font-semibold">{day}</p>{calendarEvents.filter((event) => event.day === index + 10).map((event) => <button type="button" key={event.title} onClick={() => onSelect(event)} className={`mt-4 w-full rounded-lg p-3 text-left text-xs ${event.color}`}><span className="block font-semibold">{event.time}</span><span className="mt-1 block">{event.title}</span></button>)}</div>)}</div>
}

function DayCalendar({ onSelect }: { onSelect: (event: (typeof calendarEvents)[number]) => void }) {
  return <div className="divide-y divide-border">{Array.from({ length: 10 }, (_, index) => { const hour = index + 8; const event = hour === 9 ? calendarEvents[0] : hour === 11 ? calendarEvents[1] : null; return <div key={hour} className="grid min-h-16 grid-cols-[70px_1fr] p-3"><span className="text-xs text-muted-foreground">{String(hour).padStart(2, '0')}:00</span>{event ? <button type="button" onClick={() => onSelect(event)} className={`rounded-lg px-3 py-2 text-left text-sm font-medium ${event.color}`}>{event.title}</button> : <span />}</div>})}</div>
}

function AgendaCalendar({ onSelect }: { onSelect: (event: (typeof calendarEvents)[number]) => void }) {
  return <div className="divide-y divide-border">{calendarEvents.map((event) => <button type="button" key={event.title} onClick={() => onSelect(event)} className="flex w-full items-center gap-5 p-5 text-left hover:bg-muted/30"><span className="w-14 text-center"><span className="block text-xs text-muted-foreground">AUG</span><span className="block text-xl font-bold">{event.day}</span></span><span className={`size-2 rounded-full ${event.color.split(' ')[0]}`} /><span><span className="block text-sm font-semibold">{event.title}</span><span className="text-xs text-muted-foreground">{event.time} · {event.owner}</span></span><ChevronRight className="ml-auto size-4 text-muted-foreground" /></button>)}</div>
}

function EventDrawer({ event, onClose }: { event: (typeof calendarEvents)[number]; onClose: () => void }) {
  const [message, setMessage] = useState('')
  return <div className="fixed inset-0 z-50"><button type="button" aria-label="Close event" onClick={onClose} className="absolute inset-0 bg-foreground/20" /><aside className="absolute top-0 right-0 h-full w-full max-w-md border-l border-border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-brand">CALENDAR EVENT</p><h2 className="mt-2 text-xl font-bold">{event.title}</h2></div><button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 hover:bg-muted"><X className="size-4" /></button></div><div className="mt-8 space-y-4 rounded-xl bg-muted/50 p-5 text-sm"><p><span className="text-muted-foreground">When</span><span className="float-right font-medium">{event.day} Aug · {event.time}</span></p><p><span className="text-muted-foreground">Owner</span><span className="float-right font-medium">{event.owner}</span></p><p><span className="text-muted-foreground">Location</span><span className="float-right font-medium">HIMARK Workspace</span></p></div><div className="mt-6 flex gap-2"><button type="button" onClick={() => setMessage('Event edit form opened.')} className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-primary-foreground">Edit event</button><button type="button" onClick={() => setMessage('Event summary was shared.')} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">Share</button></div>{message ? <p role="status" className="mt-4 text-sm font-medium text-brand">{message}</p> : null}</aside></div>
}

function PipelineWorkspace() {
  const [selected, setSelected] = useState('')
  const stages: Array<[string, string[]]> = [['Lead', ['Riverton Transformation', 'Altura Market Entry']], ['Qualified', ['Harbour Growth Strategy']], ['Discovery', ['Veridian Digital Platform', 'Kopano Advisory']], ['Proposal', ['Meridian Expansion']], ['Negotiation', ['Northstar Renewal']], ['Won', ['Aurelia Platform']]]
  return <><div className="grid min-w-[1100px] grid-cols-6 gap-3 overflow-x-auto pb-3">{stages.map(([stage, cards]) => <section key={stage} className="rounded-xl bg-muted/50 p-3"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{stage}</h2><span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">{cards.length}</span></div><div className="space-y-2">{cards.map((card, index) => <button type="button" onClick={() => setSelected(card)} key={card} className="w-full rounded-lg border border-border bg-card p-3 text-left shadow-sm"><span className="text-sm font-semibold">{card}</span><span className="mt-1 block text-xs text-muted-foreground">{index % 2 ? 'R260K' : 'R480K'} · {40 + index * 15}%</span><span className="mt-3 flex items-center justify-between text-[0.6875rem] text-muted-foreground"><span>Neo Morake</span><span>Sep 2026</span></span></button>)}</div></section>)}</div>{selected ? <InlineNotice message={`${selected} opportunity preview opened.`} onClose={() => setSelected('')} /> : null}</>
}

function ProjectBoard() { return <Board columns={[['Planning',['Aurelia research sprint']],['On Track',['Meridian Growth Programme','Aurelia Client Platform']],['At Risk',['Northstar Brand Transformation']],['Review',['Kopano Service Blueprint']],['Complete',['Copperleaf Discovery']]]} /> }
function TaskBoard() { return <Board columns={[['To do',['Approve workshop brief','Confirm interview panel']],['In progress',['Review campaign budget','Prepare prototype walkthrough']],['Blocked',['Northstar identity approval']],['Review',['Invoice schedule update']],['Complete',['Client research synthesis']]]} /> }

type BoardColumn = { title: string; cards: string[] }
type BoardDropTarget = { columnIndex: number; cardIndex: number }
type BoardDrag = {
  card: string
  fromColumn: number
  fromIndex: number
  pointerId: number
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
}
type BoardCandidate = BoardDrag & { startX: number; startY: number }

function Board({ columns }: { columns: Array<[string, string[]]> }) {
  const [selected, setSelected] = useState('')
  const [boardColumns, setBoardColumns] = useState<BoardColumn[]>(() => columns.map(([title, cards]) => ({ title, cards: [...cards] })))
  const [drag, setDrag] = useState<BoardDrag | null>(null)
  const [dropTarget, setDropTarget] = useState<BoardDropTarget | null>(null)
  const [moveMessage, setMoveMessage] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const candidateRef = useRef<BoardCandidate | null>(null)
  const dragRef = useRef<BoardDrag | null>(null)
  const dropTargetRef = useRef<BoardDropTarget | null>(null)
  const frameRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)

  function setActiveDropTarget(next: BoardDropTarget | null) {
    const current = dropTargetRef.current
    if (current?.columnIndex === next?.columnIndex && current?.cardIndex === next?.cardIndex) return
    dropTargetRef.current = next
    setDropTarget(next)
  }

  function locateDropTarget(clientX: number, clientY: number) {
    const element = document.elementFromPoint(clientX, clientY)
    const columnElement = element?.closest('[data-board-column-index]') as HTMLElement | null
    if (!columnElement) return null
    const columnIndex = Number(columnElement.dataset.boardColumnIndex)
    const cardElement = element?.closest('[data-board-card-index]') as HTMLElement | null
    if (!cardElement) return { columnIndex, cardIndex: boardColumns[columnIndex].cards.length }
    const cardIndex = Number(cardElement.dataset.boardCardIndex)
    const bounds = cardElement.getBoundingClientRect()
    return { columnIndex, cardIndex: cardIndex + (clientY > bounds.top + bounds.height / 2 ? 1 : 0) }
  }

  function autoScroll(clientX: number) {
    const scroller = scrollRef.current
    if (!scroller) return
    const bounds = scroller.getBoundingClientRect()
    if (clientX < bounds.left + 56) scroller.scrollLeft -= 18
    if (clientX > bounds.right - 56) scroller.scrollLeft += 18
  }

  function beginPointer(event: React.PointerEvent<HTMLButtonElement>, card: string, columnIndex: number, cardIndex: number) {
    if (event.button !== 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    suppressClickRef.current = false
    candidateRef.current = {
      card,
      fromColumn: columnIndex,
      fromIndex: cardIndex,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      width: bounds.width,
    }
  }

  function movePointer(event: React.PointerEvent<HTMLButtonElement>) {
    const candidate = candidateRef.current
    if (!candidate || candidate.pointerId !== event.pointerId) return
    if (!dragRef.current && Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY) < 6) return
    event.preventDefault()
    suppressClickRef.current = true
    autoScroll(event.clientX)
    setActiveDropTarget(locateDropTarget(event.clientX, event.clientY))
    const next = { ...candidate, x: event.clientX, y: event.clientY }
    dragRef.current = next
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      setDrag(next)
      frameRef.current = null
    })
  }

  function endPointer(event: React.PointerEvent<HTMLButtonElement>) {
    const activeDrag = dragRef.current
    const target = dropTargetRef.current
    candidateRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (activeDrag && target) {
      setBoardColumns((current) => {
        const next = current.map((column) => ({ ...column, cards: [...column.cards] }))
        const [movedCard] = next[activeDrag.fromColumn].cards.splice(activeDrag.fromIndex, 1)
        let insertIndex = target.cardIndex
        if (target.columnIndex === activeDrag.fromColumn && insertIndex > activeDrag.fromIndex) insertIndex -= 1
        insertIndex = Math.max(0, Math.min(insertIndex, next[target.columnIndex].cards.length))
        next[target.columnIndex].cards.splice(insertIndex, 0, movedCard)
        setMoveMessage(`${movedCard} moved to ${next[target.columnIndex].title}.`)
        setSelected('')
        return next
      })
    }
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    dragRef.current = null
    setDrag(null)
    setActiveDropTarget(null)
    window.setTimeout(() => { suppressClickRef.current = false }, 0)
  }

  function cancelPointer(event: React.PointerEvent<HTMLButtonElement>) {
    candidateRef.current = null
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    setDrag(null)
    setActiveDropTarget(null)
  }

  return <>
    <div ref={scrollRef} className="overflow-x-auto pb-3">
      <div className="grid min-w-[1000px] grid-cols-5 gap-3">
        {boardColumns.map((column, columnIndex) => {
          const isTarget = Boolean(drag && dropTarget?.columnIndex === columnIndex)
          return <section key={column.title} data-board-column-index={columnIndex} className={`min-h-80 rounded-xl border p-3 transition-colors duration-150 ${isTarget ? 'border-brand/40 bg-brand-soft/40' : 'border-transparent bg-muted/50'}`}>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{column.title}</h2><span className="rounded-full bg-card px-2 text-xs text-muted-foreground">{column.cards.length}</span></div>
            <div className="min-h-60">
              {column.cards.map((card, cardIndex) => <div key={card} data-board-card-index={cardIndex}>
                {isTarget && dropTarget?.cardIndex === cardIndex ? <DropIndicator /> : null}
                <button
                  type="button"
                  onPointerDown={(event) => beginPointer(event, card, columnIndex, cardIndex)}
                  onPointerMove={movePointer}
                  onPointerUp={endPointer}
                  onPointerCancel={cancelPointer}
                  onClick={(event) => { if (suppressClickRef.current) { event.preventDefault(); return } setSelected(card); setMoveMessage('') }}
                  className={`group mb-2 block w-full touch-none select-none rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-[transform,box-shadow,opacity] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${drag?.card === card ? 'opacity-25' : 'cursor-grab opacity-100'}`}
                >
                  <BoardCardContent card={card} index={cardIndex} />
                </button>
              </div>)}
              {isTarget && dropTarget?.cardIndex === column.cards.length ? <DropIndicator /> : null}
              {drag && column.cards.length === 0 ? <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-brand/30 text-xs font-medium text-brand">Drop card here</div> : null}
            </div>
          </section>
        })}
      </div>
    </div>
    {drag ? <div aria-hidden="true" className="pointer-events-none fixed top-0 left-0 z-[70] will-change-transform" style={{ width: drag.width, transform: `translate3d(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px, 0) rotate(1deg)` }}><div className="rounded-lg border border-brand/30 bg-card p-3 text-left shadow-2xl ring-2 ring-brand/10"><BoardCardContent card={drag.card} index={drag.fromIndex} dragging /></div></div> : null}
    {selected ? <InlineNotice message={`${selected} detail drawer opened.`} onClose={() => setSelected('')} /> : null}
    {moveMessage ? <InlineNotice message={moveMessage} onClose={() => setMoveMessage('')} /> : null}
  </>
}

function BoardCardContent({ card, index, dragging }: { card: string; index: number; dragging?: boolean }) {
  return <><span className="flex items-start gap-2"><GripVertical className={`mt-0.5 size-4 shrink-0 transition-colors ${dragging ? 'text-brand' : 'text-muted-foreground/40 group-hover:text-muted-foreground'}`} /><span className="block text-sm font-semibold">{card}</span></span><span className="mt-2 block pl-6 text-xs text-muted-foreground">{index % 2 ? 'Amara Dlamini' : 'Neo Morake'} · {index + 2} actions</span></>
}

function DropIndicator() { return <div className="mb-2 flex h-2 items-center"><span className="size-2 rounded-full bg-brand" /><span className="h-0.5 flex-1 rounded-full bg-brand" /></div> }

function ProjectTimeline() {
  const [selected, setSelected] = useState('')
  const items: Array<[string, number, number]> = [['Meridian Growth Programme',18,72],['Northstar Transformation',28,58],['Aurelia Client Platform',12,44],['Atlas Development',45,86]]
  return <><section className="overflow-x-auto rounded-xl border border-border bg-card p-5"><div className="min-w-[900px]"><div className="grid grid-cols-[240px_1fr] border-b border-border pb-3 text-xs font-semibold text-muted-foreground"><span>Project</span><div className="grid grid-cols-6 text-center"><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span><span>Jan</span></div></div>{items.map(([name,start,width],index) => <button type="button" onClick={() => setSelected(name)} key={name} className="grid w-full grid-cols-[240px_1fr] items-center border-b border-border py-5 text-left"><span><span className="block text-sm font-semibold">{name}</span><span className="text-xs text-muted-foreground">{index % 2 ? 'Client delivery' : 'Strategic programme'}</span></span><span className="relative h-8 rounded bg-muted/50"><span style={{ left: `${start}%`, width: `${width / 2}%` }} className={`absolute top-1 h-6 rounded ${index === 1 ? 'bg-warning/70' : 'bg-chart-4/70'}`} /></span></button>)}</div></section>{selected ? <InlineNotice message={`${selected} timeline details opened.`} onClose={() => setSelected('')} /> : null}</>
}

function SalesSubview({ view }: { view: string }) {
  if (view === 'Forecast') return <ForecastWorkspace view="Commercial Forecast" />
  const labels: Record<string,string[]> = { Opportunities:['Riverton Transformation','Harbour Growth Strategy','Veridian Platform'], Proposals:['Meridian Expansion Proposal','Kopano Advisory Proposal','Altura Discovery Proposal'], Contracts:['Northstar Renewal Agreement','Aurelia Platform MSA','Meridian Advisory Retainer'], Renewals:['Northstar Annual Renewal','Copperleaf Advisory Retainer','Aurelia Support Renewal'] }
  return <CollectionCards title={view} items={labels[view] ?? labels.Opportunities} />
}

function TeamSubview({ view }: { view: string }) {
  if (view === 'Org Chart') return <section className="rounded-xl border border-border bg-card p-8 text-center"><Person name="Neo Morake" role="Chief Executive Officer" /><div className="mx-auto h-8 w-px bg-border" /><div className="mx-auto grid max-w-3xl gap-5 border-t border-border pt-8 sm:grid-cols-3"><Person name="Amara Dlamini" role="Strategy Director" /><Person name="Lethabo Nkosi" role="Product Lead" /><Person name="Zanele Khumalo" role="Finance Manager" /></div></section>
  if (view === 'Departments') return <CollectionCards title="Departments" items={['Executive · 3 people','Consulting · 12 people','Digital · 9 people','Finance · 4 people','Operations · 6 people']} />
  if (view === 'Teams') return <CollectionCards title="Teams" items={['Leadership','Growth','Platforms','Client Delivery','Operations']} />
  return <CollectionCards title="Team Directory" items={['Neo Morake · Chief Executive Officer','Amara Dlamini · Strategy Director','Lethabo Nkosi · Product Lead','Zanele Khumalo · Finance Manager']} />
}

function Person({ name, role }: { name: string; role: string }) {
  const [open, setOpen] = useState(false)
  return <button type="button" onClick={() => setOpen((value) => !value)} className="mx-auto w-full max-w-52 rounded-xl border border-border bg-card p-4 shadow-sm"><span className="mx-auto flex size-10 items-center justify-center rounded-full bg-foreground text-xs font-bold text-primary-foreground">{name.split(' ').map((part) => part[0]).join('')}</span><span className="mt-3 block text-sm font-semibold">{name}</span><span className="text-xs text-muted-foreground">{role}</span>{open ? <span className="mt-2 block text-xs font-medium text-brand">Profile preview open</span> : null}</button>
}

function HrSubview({ view }: { view: string }) {
  const data: Record<string,string[]> = { Recruitment:['Senior Experience Designer · Interview','Commercial Director · Screening','Operations Coordinator · Offer'], Candidates:['Karabo Maseko · Assessment','Mia Daniels · Interview','Tshepo Radebe · Screening'], Onboarding:['Kea Motloung · 82% complete','Riya Patel · 56% complete','Michael Du Toit · Starts 01 Sep'], Performance:['Q3 Executive Reviews','Growth Team Check-ins','2026 Goal Progress'], Learning:['Consulting Excellence Programme','Leadership Foundations','Information Security'], Policies:['Hybrid Work Policy','Travel and Expense Policy','Performance Review Standard'], Offboarding:['Transition checklist · 1 active','Equipment returns · 2 pending','Exit interviews · 1 scheduled'] }
  return <CollectionCards title={view} items={data[view] ?? []} />
}

function LeaveSubview({ view }: { view: string }) {
  if (view === 'Balances') return <LeaveBalances />
  if (view === 'Calendar') return <CalendarWorkspace view="Agenda" />
  return <ApprovalCollection />
}

function LeaveBalances() {
  const [selected, setSelected] = useState('')
  return <><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[['Annual Leave','16.5 days'],['Personal Leave','3 days'],['Sick Leave','10 days'],['Study Leave','2 days']].map(([label,value]) => <article key={label} className="rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p><div className="mt-4 h-1.5 rounded-full bg-muted"><div className="h-full w-2/3 rounded-full bg-chart-4" /></div><button type="button" onClick={() => setSelected(label)} className="mt-4 text-xs font-semibold">View history</button></article>)}</div>{selected ? <InlineNotice message={`${selected} balance history opened.`} onClose={() => setSelected('')} /> : null}</>
}

function ApprovalCollection() {
  const [status, setStatus] = useState<Record<string, string>>({})
  const items = ['Lethabo Nkosi · Personal Leave · 1 day','Mia Daniels · Annual Leave · 4 days','Tshepo Radebe · Study Leave · 2 days']
  return <section className="rounded-xl border border-border bg-card"><header className="border-b border-border p-5"><h2 className="font-semibold">Leave approvals</h2><p className="text-sm text-muted-foreground">Requests waiting for an executive decision.</p></header><div className="divide-y divide-border">{items.map((item) => <article key={item} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="text-sm font-semibold">{item}</p><p className="mt-1 text-xs text-muted-foreground">Submitted this week · Balance checked</p></div>{status[item] ? <span className="text-sm font-semibold text-brand">{status[item]}</span> : <div className="flex gap-2"><button type="button" onClick={() => setStatus((current) => ({...current,[item]:'Approved'}))} className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-primary-foreground">Approve</button><button type="button" onClick={() => setStatus((current) => ({...current,[item]:'Declined'}))} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Decline</button></div>}</article>)}</div></section>
}

function CollectionCards({ title, items }: { title: string; items: string[] }) {
  const [message, setMessage] = useState('')
  return <><section className="rounded-xl border border-border bg-card"><header className="flex items-center justify-between border-b border-border p-5"><div><h2 className="font-semibold">{title}</h2><p className="text-sm text-muted-foreground">HIMARK workspace · {items.length} current items</p></div><button type="button" onClick={() => setMessage(`New ${title.toLowerCase()} draft opened.`)} className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-primary-foreground">Create</button></header><div className="divide-y divide-border">{items.map((item,index) => <button type="button" onClick={() => setMessage(`${item} detail view opened.`)} key={item} className="flex w-full items-center justify-between p-5 text-left hover:bg-muted/30"><div><p className="text-sm font-semibold">{item}</p><p className="mt-1 text-xs text-muted-foreground">Updated {index + 1} days ago · Owned by {index % 2 ? 'Amara Dlamini' : 'Neo Morake'}</p></div><ChevronRight className="size-4 text-muted-foreground" /></button>)}</div></section>{message ? <InlineNotice message={message} onClose={() => setMessage('')} /> : null}</>
}

function ForecastWorkspace({ view }: { view: string }) {
  const [scenario, setScenario] = useState('Base')
  const bars = scenario === 'Growth' ? [44,58,56,69,66,78,75,88,84,94,92,100] : [38,51,47,63,58,72,68,83,78,91,88,96]
  return <div className="grid gap-5 xl:grid-cols-3"><section className="rounded-xl border border-border bg-card p-6 xl:col-span-2"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{view}</h2><p className="mt-1 text-sm text-muted-foreground">{scenario} scenario · FY 2026</p></div><div className="flex items-center gap-2"><select value={scenario} onChange={(event) => setScenario(event.target.value)} aria-label="Scenario" className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option>Base</option><option>Growth</option><option>Conservative</option></select><span className="text-2xl font-bold">R4.6M</span></div></div><div className="mt-8 flex h-64 items-end gap-3 border-b border-border">{bars.map((height,index) => <div key={index} className="group flex h-full flex-1 items-end"><div style={{ height: `${height}%` }} className="w-full rounded-t-md bg-chart-4/75 transition-colors group-hover:bg-chart-4" /></div>)}</div><div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>Jan</span><span>Mar</span><span>Jun</span><span>Sep</span><span>Dec</span></div></section><section className="rounded-xl border border-border bg-card p-6"><h2 className="font-semibold">Scenario summary</h2>{[['Revenue','R4.6M','+12.4%'],['Expenses','R2.9M','+4.1%'],['Operating cash','R1.1M','+8.7%'],['Confidence','84%','High']].map(([label,value,change]) => <div key={label} className="flex items-center justify-between border-b border-border py-4 last:border-0"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div><span className="text-xs font-semibold text-brand">{change}</span></div>)}</section></div>
}

function AtlasWorkspace({ view }: { view: string }) {
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  if (view === 'Ask Atlas') return <div className="grid min-h-[620px] gap-4 lg:grid-cols-[260px_1fr]"><aside className="rounded-xl border border-border bg-card p-4"><button type="button" onClick={() => { setMessage(''); setResponse('') }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2.5 text-sm font-semibold text-primary-foreground"><MessageSquare className="size-4" />New conversation</button><p className="mt-5 px-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">Recent</p>{['Executive priorities this week','Why is project margin down?','Renewal opportunities','Team capacity in September'].map((item) => <button type="button" key={item} onClick={() => { setMessage(item); setResponse('Atlas found three relevant patterns across the current HIMARK workspace.') }} className="mt-1 w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-muted">{item}</button>)}</aside><section className="flex flex-col rounded-xl border border-border bg-card"><div className="border-b border-border px-6 py-4"><div className="flex items-center gap-2"><Bot className="size-5 text-brand" /><h2 className="font-semibold">Ask Atlas</h2><span className="rounded-full bg-warning-soft px-2 py-0.5 text-[0.65rem] font-semibold text-warning">Demo</span></div></div><div className="flex flex-1 flex-col items-center justify-center px-6 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand"><Sparkles className="size-6" /></span><h3 className="mt-4 text-xl font-semibold">{response ? 'Atlas response' : 'What would you like to understand?'}</h3><p className="mt-2 max-w-lg text-sm text-muted-foreground">{response || 'Explore mock business context across projects, clients, finance and team activity.'}</p>{!response ? <div className="mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">{['What needs my attention today?','Summarize client health','Show projects at risk','Where are our growth opportunities?'].map((question) => <button type="button" key={question} onClick={() => setMessage(question)} className="rounded-lg border border-border p-3 text-left text-sm hover:bg-muted">{question}</button>)}</div> : <button type="button" onClick={() => setResponse('')} className="mt-5 text-sm font-semibold text-brand">Ask a follow-up</button>}</div><div className="border-t border-border p-4"><div className="flex items-end gap-2 rounded-xl border border-border bg-background p-2"><textarea value={message} onChange={(event) => setMessage(event.target.value)} aria-label="Ask Atlas" rows={2} placeholder="Ask about your business..." className="flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none" /><button type="button" onClick={() => message.trim() && setResponse('Atlas found three relevant patterns across the current HIMARK workspace. Commercial follow-up and one delivery risk need attention.')} aria-label="Send prompt" className="flex size-9 items-center justify-center rounded-lg bg-foreground text-primary-foreground"><Send className="size-4" /></button></div><p className="mt-2 text-center text-[0.6875rem] text-muted-foreground">Atlas responses are static mock UI in this phase.</p></div></section></div>
  if (view === 'Memory') return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[['Company Memory','1,284 records'],['Client Memory','436 records'],['Project Memory','718 records'],['Decision History','96 decisions']].map(([title,count]) => <article key={title} className="rounded-xl border border-border bg-card p-6"><Brain className="size-5 text-brand" /><h2 className="mt-5 font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{count}</p><button type="button" onClick={() => setActionMessage(`${title} explorer opened.`)} className="mt-6 inline-flex items-center gap-1 text-sm font-medium">Explore <ChevronRight className="size-4" /></button>{actionMessage.startsWith(title) ? <p className="mt-3 text-xs font-medium text-brand">{actionMessage}</p> : null}</article>)}</div>
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{['Margin pressure detected','Renewals can be accelerated','September capacity constraint','Proposal conversion improved','Client engagement declining','Cash collection ahead of plan'].map((title,index) => <article key={title} className="rounded-xl border border-border bg-card p-5"><div className="flex items-center justify-between"><span className="rounded-md bg-brand-soft px-2 py-1 text-xs font-semibold text-brand">{view}</span><span className="text-xs text-muted-foreground">{82 + index}% confidence</span></div><h2 className="mt-5 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Atlas found a meaningful pattern across current mock records that may require executive attention.</p><div className="mt-5 flex gap-2">{['Review','Approve','Dismiss'].map((action) => <button type="button" key={action} onClick={() => setActionMessage(`${title}: ${action.toLowerCase()} state saved.`)} className={action === 'Dismiss' ? 'px-3 py-2 text-xs text-muted-foreground' : 'rounded-lg border border-border px-3 py-2 text-xs font-semibold'}>{action}</button>)}</div>{actionMessage.startsWith(title) ? <p className="mt-3 text-xs font-medium text-brand">{actionMessage}</p> : null}</article>)}</div>
}

function SettingsWorkspace({ view }: { view: string }) {
  if (view === 'Modules') return <ModuleSettings />
  if (view === 'Integrations') return <IntegrationSettings />
  if (view === 'Roles & Permissions') return <RoleSettings />
  if (view === 'Audit Log') return <AuditLog />
  if (view === 'Users') return <UsersSettings />
  if (view === 'Teams') return <CollectionCards title="Workspace teams" items={['Leadership · 5 members','Growth · 8 members','Platforms · 6 members','Client Delivery · 12 members']} />
  if (view === 'Templates') return <CollectionCards title="Templates" items={['Client proposal','Project brief','Invoice email','Executive report']} />
  if (view === 'Custom Fields') return <CollectionCards title="Custom fields" items={['Client tier · Select','Project health · Status','Billing reference · Text','Renewal date · Date']} />
  if (view === 'Notifications') return <NotificationSettings />
  if (view === 'Appearance') return <AppearanceSettings />
  if (view === 'Security') return <SecuritySettings />
  if (view === 'Data') return <DataSettings />
  return <GenericSettings view={view} />
}

function DemoActionButton({ label, doneLabel }: { label: string; doneLabel: string }) {
  const [done, setDone] = useState(false)
  return <button type="button" onClick={() => setDone(true)} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-primary-foreground">{done ? doneLabel : label}</button>
}

function GenericSettings({ view }: { view: string }) {
  return <section className="rounded-xl border border-border bg-card p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{view}</h2><p className="mt-1 text-sm text-muted-foreground">Tenant-specific configuration for HIMARK.</p></div><DemoActionButton label="Save changes" doneLabel="Changes saved" /></div><div className="mt-6 grid gap-5 md:grid-cols-2">{['Display name','Primary contact','Default owner','Status'].map((label,index) => <label key={label} className="text-sm font-medium">{label}<input defaultValue={index === 0 ? 'HIMARK' : index === 1 ? 'operations@himark.co.za' : ''} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 outline-none" /></label>)}</div></section>
}

function ModuleSettings() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ Clients:true, Projects:true, Tasks:true, Calendar:true, Leads:true, Quotes:true, Sales:true, Invoices:true, Expenses:true, Forecast:true, Team:true, HR:true, Leave:true, Knowledge:true, Atlas:true })
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Object.keys(enabled).map((name) => <article key={name} className="flex items-center justify-between rounded-xl border border-border bg-card p-5"><div><h3 className="font-semibold">{name}</h3><p className="mt-1 text-xs text-muted-foreground">Available to HIMARK members</p></div><button type="button" role="switch" aria-checked={enabled[name]} onClick={() => setEnabled((current) => ({...current,[name]:!current[name]}))} className={`relative h-6 w-11 rounded-full transition-colors ${enabled[name] ? 'bg-brand' : 'bg-muted'}`}><span className={`absolute top-1 size-4 rounded-full bg-white shadow transition-transform ${enabled[name] ? 'left-6' : 'left-1'}`} /></button></article>)}</div>
}

function IntegrationSettings() {
  const items = [[PanelsTopLeft,'Microsoft 365'],[Mail,'Google Workspace'],[Database,'Supabase'],[BarChart3,'Accounting'],[CreditCard,'Payments'],[Mail,'Email'],[CalendarDays,'Calendar'],[Cloud,'Cloud Storage']] as const
  const [connected, setConnected] = useState<Record<string, boolean>>({ 'Microsoft 365': true })
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{items.map(([Icon,name]) => <article key={name} className="rounded-xl border border-border bg-card p-5"><span className="flex size-10 items-center justify-center rounded-xl bg-muted"><Icon className="size-5" /></span><h3 className="mt-5 font-semibold">{name}</h3><p className="mt-1 text-xs text-muted-foreground">Conceptual integration · UI only</p><button type="button" onClick={() => setConnected((current) => ({...current,[name]:!current[name]}))} className={`mt-5 w-full rounded-lg border px-3 py-2 text-sm font-semibold ${connected[name] ? 'border-brand text-brand' : 'border-border'}`}>{connected[name] ? 'Disconnect' : 'Connect'}</button></article>)}</div>
}

function RoleSettings() {
  const [created, setCreated] = useState(false)
  const permissions = ['Manage company','Manage users','Configure modules','View finance','Approve expenses','Access Atlas']
  const roles = created ? ['Admin','Executive','Manager','Team Member','Viewer','Custom'] : ['Admin','Executive','Manager','Team Member','Viewer']
  return <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border p-5"><div><h2 className="font-semibold">Roles & Permissions</h2><p className="text-sm text-muted-foreground">Visual permission matrix for HIMARK.</p></div><button type="button" onClick={() => setCreated(true)} className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-primary-foreground">{created ? 'Role created' : 'Create role'}</button></div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left"><thead><tr className="bg-muted/40 text-xs text-muted-foreground"><th className="p-4">Permission</th>{roles.map((role) => <th key={role} className="p-4 text-center">{role}</th>)}</tr></thead><tbody>{permissions.map((permission,index) => <tr key={permission} className="border-t border-border"><td className="p-4 text-sm font-medium">{permission}</td>{roles.map((role,roleIndex) => <td key={role} className="p-4 text-center">{roleIndex <= Math.max(0,3-index) ? <Check className="mx-auto size-4 text-brand" /> : <span className="text-muted-foreground">—</span>}</td>)}</tr>)}</tbody></table></div></section>
}

function UsersSettings() {
  const [invited, setInvited] = useState(false)
  return <section className="overflow-hidden rounded-xl border border-border bg-card"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div><h2 className="font-semibold">Users</h2><p className="text-sm text-muted-foreground">Manage access to the HIMARK tenant.</p></div><button type="button" onClick={() => setInvited(true)} className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-primary-foreground"><UserPlus className="size-4" />{invited ? 'Invitation sent' : 'Invite user'}</button></header><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead><tr className="bg-muted/40 text-xs text-muted-foreground"><th className="p-4">User</th><th className="p-4">Role</th><th className="p-4">Team</th><th className="p-4">Last active</th><th className="p-4">Status</th></tr></thead><tbody>{[['Neo Morake','Admin','Leadership','Now'],['Amara Dlamini','Executive','Leadership','12m ago'],['Lethabo Nkosi','Manager','Platforms','1h ago'],['Zanele Khumalo','Manager','Finance','Yesterday']].map((row) => <tr key={row[0]} className="border-t border-border">{row.map((cell,index) => <td key={cell} className="p-4 text-sm"><span className={index === 4 ? 'rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold text-brand' : ''}>{index === 4 ? 'Active' : cell}</span></td>)}</tr>)}</tbody></table></div></section>
}

function NotificationSettings() {
  const [enabled, setEnabled] = useState([true,true,false,true])
  return <section className="rounded-xl border border-border bg-card p-6"><div className="flex items-center gap-3"><Bell className="size-5" /><div><h2 className="font-semibold">Notification preferences</h2><p className="text-sm text-muted-foreground">Choose which tenant events reach your inbox.</p></div></div><div className="mt-6 divide-y divide-border">{['Executive approvals','Project risk changes','Invoice and payment updates','Atlas recommendations'].map((item,index) => <div key={item} className="flex items-center justify-between py-4"><div><p className="text-sm font-medium">{item}</p><p className="text-xs text-muted-foreground">Email and in-product notifications</p></div><button type="button" role="switch" aria-checked={enabled[index]} onClick={() => setEnabled((current) => current.map((value,itemIndex) => itemIndex === index ? !value : value))} className={`relative h-6 w-11 rounded-full ${enabled[index] ? 'bg-brand' : 'bg-muted'}`}><span className={`absolute top-1 size-4 rounded-full bg-white ${enabled[index] ? 'left-6' : 'left-1'}`} /></button></div>)}</div></section>
}

function AppearanceSettings() {
  const [theme, setTheme] = useState('Light')
  return <section className="rounded-xl border border-border bg-card p-6"><div className="flex items-center gap-3"><Palette className="size-5" /><div><h2 className="font-semibold">Appearance</h2><p className="text-sm text-muted-foreground">Preserve UNISON’s calm, premium workspace language.</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-3">{['Light','System','High contrast'].map((option) => <button type="button" onClick={() => setTheme(option)} key={option} className={`rounded-xl border p-4 text-left ${theme === option ? 'border-brand ring-2 ring-brand/10' : 'border-border'}`}><Monitor className="size-5" /><span className="mt-8 block text-sm font-semibold">{option}</span><span className="text-xs text-muted-foreground">Workspace theme</span></button>)}</div></section>
}

function SecuritySettings() {
  const [mfa, setMfa] = useState(true)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  return <section className="rounded-xl border border-border bg-card p-6"><div className="flex items-center gap-3"><ShieldCheck className="size-5" /><div><h2 className="font-semibold">Security</h2><p className="text-sm text-muted-foreground">Tenant access, sessions and authentication policy.</p></div></div><div className="mt-6 space-y-4"><div className="flex items-center justify-between rounded-xl border border-border p-4"><div><p className="text-sm font-semibold">Require multi-factor authentication</p><p className="text-xs text-muted-foreground">All tenant administrators and executives</p></div><button type="button" role="switch" aria-checked={mfa} onClick={() => setMfa((value) => !value)} className={`relative h-6 w-11 rounded-full ${mfa ? 'bg-brand' : 'bg-muted'}`}><span className={`absolute top-1 size-4 rounded-full bg-white ${mfa ? 'left-6' : 'left-1'}`} /></button></div><div className="rounded-xl border border-border p-4"><p className="text-sm font-semibold">Active sessions</p><p className="mt-1 text-xs text-muted-foreground">3 trusted devices · Last security review today</p><button type="button" onClick={() => setSessionsOpen((value) => !value)} className="mt-4 rounded-lg border border-border px-3 py-2 text-xs font-semibold">{sessionsOpen ? 'Hide sessions' : 'Review sessions'}</button>{sessionsOpen ? <div className="mt-4 space-y-2 text-xs text-muted-foreground"><p>Chrome · Johannesburg · Current session</p><p>Safari · Cape Town · 2 hours ago</p><p>Mobile · Johannesburg · Yesterday</p></div> : null}</div></div></section>
}

function DataSettings() {
  const [message, setMessage] = useState('')
  return <section className="rounded-xl border border-border bg-card p-6"><div><h2 className="font-semibold">Data management</h2><p className="mt-1 text-sm text-muted-foreground">Export, retention and tenant data controls.</p></div><div className="mt-6 grid gap-4 md:grid-cols-2">{[['Export tenant data','Create a portable archive of tenant records'],['Retention policy','Review how long archived records are kept'],['Import records','Upload validated CSV records'],['Data residency','South Africa · Primary region']].map(([title,description],index) => <article key={title} className="rounded-xl border border-border p-5"><Database className="size-5 text-brand" /><h3 className="mt-4 text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{description}</p><button type="button" onClick={() => setMessage(`${title} workflow opened.`)} className="mt-5 inline-flex items-center gap-2 text-xs font-semibold">{index === 0 ? <Download className="size-4" /> : null}Manage</button></article>)}</div>{message ? <InlineNotice message={message} onClose={() => setMessage('')} /> : null}</section>
}

function AuditLog() {
  const [query, setQuery] = useState('')
  const [exported, setExported] = useState(false)
  const rows = [['Neo Morake','Updated','Modules','Atlas access','10 Aug, 14:22','Success'],['Amara Dlamini','Archived','Clients','Copperleaf Partners','10 Aug, 11:08','Success'],['Lethabo Nkosi','Exported','Projects','Portfolio report','09 Aug, 16:40','Success']]
  const filtered = useMemo(() => rows.filter((row) => row.join(' ').toLowerCase().includes(query.toLowerCase())), [query])
  return <section className="overflow-hidden rounded-xl border border-border bg-card"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><label className="relative"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search audit log" className="h-10 rounded-lg border border-border bg-background pl-9 text-sm" /></label><button type="button" onClick={() => setExported(true)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold"><Download className="size-4" />{exported ? 'Export ready' : 'Export log'}</button></header><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left"><thead><tr className="bg-muted/40 text-xs text-muted-foreground">{['User','Action','Module','Record','Date / Time','Status'].map((head) => <th key={head} className="p-4">{head}</th>)}</tr></thead><tbody>{filtered.map((row) => <tr key={row.join()} className="border-t border-border">{row.map((cell) => <td key={cell} className="p-4 text-sm">{cell}</td>)}</tr>)}</tbody></table>{filtered.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No audit events match this search.</p> : null}</div></section>
}

function KnowledgeHome() {
  const [message, setMessage] = useState('')
  return <><div className="grid gap-5 xl:grid-cols-3"><section className="rounded-xl border border-border bg-card p-6 xl:col-span-2"><h2 className="font-semibold">Knowledge workspace</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{[['Company Knowledge','128 articles'],['Client Knowledge','84 articles'],['Project Knowledge','196 articles'],['SOPs & Policies','62 documents']].map(([title,count]) => <button type="button" onClick={() => setMessage(`${title} collection opened.`)} key={title} className="flex items-center gap-4 rounded-xl border border-border p-4 text-left hover:bg-muted/40"><span className="flex size-10 items-center justify-center rounded-lg bg-muted"><BookOpen className="size-5" /></span><span><span className="block text-sm font-semibold">{title}</span><span className="text-xs text-muted-foreground">{count}</span></span><ChevronRight className="ml-auto size-4 text-muted-foreground" /></button>)}</div></section><aside className="rounded-xl border border-border bg-card p-6"><h2 className="font-semibold">Recently updated</h2>{['Client Onboarding Playbook','Proposal Quality Standard','Northstar Decision Register'].map((item) => <button type="button" onClick={() => setMessage(`${item} article opened.`)} key={item} className="flex w-full items-center gap-3 border-b border-border py-4 text-left last:border-0"><FileText className="size-4 text-muted-foreground" /><span><span className="block text-sm font-medium">{item}</span><span className="text-xs text-muted-foreground">Updated this week</span></span></button>)}</aside></div>{message ? <InlineNotice message={message} onClose={() => setMessage('')} /> : null}</>
}

function InlineNotice({ message, onClose }: { message: string; onClose: () => void }) {
  return <div role="status" className="mt-4 flex items-center justify-between rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm font-medium text-brand"><span>{message}</span><button type="button" aria-label="Dismiss message" onClick={onClose}><X className="size-4" /></button></div>
}
