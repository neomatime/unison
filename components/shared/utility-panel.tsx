'use client'

import Link from 'next/link'
import {
  Bell,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  Command,
  FileQuestion,
  Keyboard,
  Search,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'

export type UtilityPanelKind = 'help' | 'notifications' | 'search'

export function UtilityPanel({ kind, open, onClose }: { kind: UtilityPanelKind; open: boolean; onClose: () => void }) {
  if (!open) return null
  const title = kind === 'help' ? 'Help & resources' : kind === 'notifications' ? 'Notifications' : 'Search UNISON'
  return <div className="fixed inset-0 z-[60]" role="presentation">
    <button type="button" aria-label={`Close ${title}`} className="absolute inset-0 bg-foreground/20" onClick={onClose} />
    <aside role="dialog" aria-modal="true" aria-label={title} className="absolute top-0 right-0 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
      <header className="flex items-center justify-between border-b border-border p-5">
        <div className="flex items-center gap-3">
          {kind === 'help' ? <CircleHelp className="size-5" /> : kind === 'notifications' ? <Bell className="size-5" /> : <Search className="size-5" />}
          <h2 className="font-semibold">{title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close panel" className="rounded-lg p-2 hover:bg-muted"><X className="size-4" /></button>
      </header>
      <div className="flex-1 overflow-y-auto p-5">{kind === 'help' ? <HelpContent /> : kind === 'notifications' ? <NotificationContent /> : <SearchContent onClose={onClose} />}</div>
    </aside>
  </div>
}

function HelpContent() {
  const [selected, setSelected] = useState('')
  const resources: Array<[LucideIcon, string, string]> = [
    [BookOpen, 'UNISON guide', 'Browse module and workflow guidance'],
    [Keyboard, 'Keyboard shortcuts', 'Move through the product efficiently'],
    [FileQuestion, 'Contact support', 'Get help from the product team'],
  ]
  return <div className="space-y-3">
    {resources.map(([Icon, title, description]) => <button type="button" key={title} onClick={() => setSelected(title)} className="flex w-full items-center gap-4 rounded-xl border border-border p-4 text-left hover:bg-muted/40">
      <span className="flex size-10 items-center justify-center rounded-lg bg-muted"><Icon className="size-5" /></span>
      <span><span className="block text-sm font-semibold">{title}</span><span className="text-xs text-muted-foreground">{description}</span></span>
    </button>)}
    <div className="mt-6 rounded-xl bg-muted/60 p-4">
      <p className="text-sm font-semibold">{selected || 'Product UI demonstration'}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{selected ? `${selected} is ready as a designed demo state. Production content can be connected without changing this flow.` : 'This environment uses local mock state while preserving every intended interaction.'}</p>
    </div>
  </div>
}

function NotificationContent() {
  const [read, setRead] = useState<boolean[]>([false, false, false, true])
  const notifications = [
    ['Invoice INV-1327 is overdue', 'Finance · 12 min ago'],
    ['Northstar project moved to At Risk', 'Projects · 38 min ago'],
    ['Expense awaiting your approval', 'Finance · 1h ago'],
    ['Atlas generated 3 new insights', 'Atlas · 2h ago'],
  ]
  return <div>
    <div className="flex items-center justify-between"><p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Today</p><button type="button" onClick={() => setRead(notifications.map(() => true))} className="text-xs font-medium text-brand">Mark all read</button></div>
    <div className="mt-3 space-y-2">{notifications.map(([title, meta], index) => <button type="button" key={title} onClick={() => setRead((current) => current.map((value, itemIndex) => itemIndex === index ? true : value))} className="flex w-full gap-3 rounded-xl border border-border p-4 text-left hover:bg-muted/40">
      <span className={`mt-1 size-2 rounded-full ${read[index] ? 'bg-muted' : 'bg-warning'}`} />
      <span><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-xs text-muted-foreground">{meta}</span></span>
    </button>)}</div>
    {read.every(Boolean) ? <div className="mt-8 text-center"><CheckCircle2 className="mx-auto size-6 text-brand" /><p className="mt-2 text-sm text-muted-foreground">You are all caught up</p></div> : null}
  </div>
}

function SearchContent({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => [
    ['Clients', 'Meridian Advisory', '/operations/clients/meridian-advisory'],
    ['Projects', 'Northstar Brand Transformation', '/operations/projects/northstar-rebrand'],
    ['Invoices', 'INV-1327', '/finance/invoices/inv-1327'],
    ['Knowledge', 'Client Onboarding Playbook', '/knowledge/client-onboarding-playbook'],
  ].filter((item) => item.join(' ').toLowerCase().includes(query.toLowerCase())), [query])
  return <div>
    <label className="relative block"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records, people and knowledge..." className="h-11 w-full rounded-xl border border-border bg-background pr-3 pl-9 text-sm outline-none focus:border-ring" /></label>
    <p className="mt-6 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{query ? 'Search results' : 'Suggested results'}</p>
    <div className="mt-2 space-y-1">{results.map(([category, label, href]) => <Link key={href} href={href} onClick={onClose} className="flex items-center justify-between rounded-lg px-3 py-3 hover:bg-muted"><span><span className="block text-xs text-muted-foreground">{category}</span><span className="block text-sm font-medium">{label}</span></span><Command className="size-4 text-muted-foreground" /></Link>)}{results.length === 0 ? <p className="rounded-xl bg-muted/50 p-5 text-center text-sm text-muted-foreground">No records match “{query}”.</p> : null}</div>
  </div>
}
