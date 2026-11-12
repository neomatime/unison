'use client'

import Link from 'next/link'
import { Bell, BookOpen, CheckCircle2, ChevronRight, CircleHelp, Command, FileQuestion, LifeBuoy, LoaderCircle, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'

import { useShellContext } from '@/components/layout/shell-context'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { groupNotifications } from '@/lib/ui/notification-groups'

export type UtilityPanelKind = 'help' | 'notifications' | 'search'

export function UtilityPanel({ kind, open, onClose }: { kind: UtilityPanelKind; open: boolean; onClose: () => void }) {
  const title = kind === 'help' ? 'Help & resources' : kind === 'notifications' ? 'Notifications' : 'Search UNISON'
  const panel = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = panel.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    first?.focus()
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previousFocus.current?.focus() }
  }, [onClose, open])
  if (!open) return null
  return <div className="unison-overlay-enter fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]" role="presentation">
    <button type="button" aria-label={`Close ${title}`} className="absolute inset-0 bg-foreground/20" onClick={onClose} />
    <aside ref={panel} role="dialog" aria-modal="true" aria-label={title} className="unison-dialog-enter relative flex max-h-[80vh] w-full max-w-xl flex-col border border-border bg-card shadow-2xl">
      <header className="flex items-center justify-between border-b border-border p-5"><div className="flex items-center gap-3">{kind === 'help' ? <CircleHelp className="size-5" /> : kind === 'notifications' ? <Bell className="size-5" /> : <Search className="size-5" />}<h2 className="unison-section-title text-sm">{title}</h2></div><button type="button" onClick={onClose} aria-label="Close panel" className="unison-action-control p-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><X className="size-4" /></button></header>
      <div className="flex-1 overflow-y-auto p-5">{kind === 'help' ? <HelpContent onClose={onClose} /> : kind === 'notifications' ? <NotificationContent onClose={onClose} /> : <SearchContent onClose={onClose} />}</div>
    </aside>
  </div>
}

function HelpContent({ onClose }: { onClose: () => void }) {
  return <div>
    <h3 className="mb-2 text-xs font-medium text-muted-foreground">Get help</h3>
    <ul className="divide-y divide-border/70 border border-border">
      <li><ResourceLink href="/knowledge" icon={<BookOpen className="size-[1.125rem]" strokeWidth={1.75} />} title="UNISON guide" description="Module and workflow guidance" onClick={onClose} /></li>
      <li><ResourceLink href="/support/new" icon={<FileQuestion className="size-[1.125rem]" strokeWidth={1.75} />} title="Contact support" description="Create a support request" onClick={onClose} /></li>
      <li><ResourceLink href="/support" icon={<LifeBuoy className="size-[1.125rem]" strokeWidth={1.75} />} title="Your support tickets" description="Follow your open requests" onClick={onClose} /></li>
    </ul>
    <h3 className="mt-6 mb-2 text-xs font-medium text-muted-foreground">Keyboard shortcuts</h3>
    <dl className="divide-y divide-border/70 border border-border text-sm">
      <div className="flex items-center justify-between px-4 py-3"><dt className="text-foreground">Open search</dt><dd><kbd className="border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">Ctrl / ⌘ K</kbd></dd></div>
      <div className="flex items-center justify-between px-4 py-3"><dt className="text-foreground">Close a panel</dt><dd><kbd className="border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">Esc</kbd></dd></div>
    </dl>
  </div>
}

function ResourceLink({ href, icon, title, description, onClick }: { href: string; icon: ReactNode; title: string; description: string; onClick: () => void }) {
  return <Link href={href} onClick={onClick} className="unison-interactive-card flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand">
    <span className="flex size-9 shrink-0 items-center justify-center bg-muted text-muted-foreground">{icon}</span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{title}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </Link>
}

type NotificationRecord = { id: string; title: string; body: string | null; category: string; href: string | null; read_at: string | null; created_at: string }

function NotificationContent({ onClose }: { onClose: () => void }) {
  const { organization } = useShellContext()
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const supabase = useMemo(() => createBrowserSupabase(), [])
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' })
      const payload = await response.json() as { notifications?: NotificationRecord[]; message?: string }
      if (!response.ok) throw new Error(payload.message ?? 'Notifications are unavailable.')
      setNotifications(payload.notifications ?? [])
      setError('')
      window.dispatchEvent(new CustomEvent('unison:notification-count', { detail: (payload.notifications ?? []).filter((item) => !item.read_at).length }))
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Notifications are unavailable.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const channel = supabase.channel(`notification-panel:${organization.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `organization_id=eq.${organization.id}` }, () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load, organization.id, supabase])

  async function markRead(id?: string) {
    const response = await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { id } : { all: true }) })
    if (!response.ok) return setError('The notification could not be updated.')
    const now = new Date().toISOString()
    setNotifications((current) => current.map((item) => !id || item.id === id ? { ...item, read_at: item.read_at ?? now } : item))
    window.dispatchEvent(new CustomEvent('unison:notification-count', { detail: id ? Math.max(0, notifications.filter((item) => !item.read_at).length - 1) : 0 }))
  }

  if (loading) return <div className="flex min-h-48 items-center justify-center"><LoaderCircle className="size-5 animate-spin text-brand" /><span className="sr-only">Loading notifications</span></div>
  if (error && !notifications.length) return <div className="unison-live-region border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive"><p>{error}</p><button type="button" onClick={() => void load()} className="unison-action-control mt-3 border border-destructive/25 px-3 py-2 text-xs font-semibold">Try again</button></div>
  const unread = notifications.filter((item) => !item.read_at).length
  const groups = groupNotifications(notifications, new Date())
  const rowClass = 'unison-interactive-card flex w-full gap-3 px-4 py-3.5 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand'
  return <div>
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-foreground">{unread ? `${unread} unread` : 'Nothing new'}</p>
      {unread ? <button type="button" onClick={() => void markRead()} className="text-sm font-medium text-brand hover:underline">Mark all read</button> : null}
    </div>
    {error ? <p role="alert" className="mt-3 text-xs text-destructive">{error}</p> : null}
    {groups.map((group) => <section key={group.label} aria-label={group.label}>
      <h3 className="mt-5 mb-2 text-xs font-medium text-muted-foreground">{group.label}</h3>
      <ul className="divide-y divide-border/70 border border-border">{group.items.map((item) => {
        const content = <>
          <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read_at ? 'bg-transparent' : 'bg-warning'}`} />
          <span className="min-w-0 flex-1">
            <span className={`block text-sm ${item.read_at ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>{item.title}</span>
            {item.body ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{item.body}</span> : null}
            <span className="mt-1.5 block text-xs text-muted-foreground">{humanize(item.category)} · {relativeTime(item.created_at)}</span>
          </span>
        </>
        return <li key={item.id}>{item.href
          ? <Link href={item.href} onClick={() => { void markRead(item.id); onClose() }} className={rowClass}>{content}</Link>
          : <button type="button" onClick={() => void markRead(item.id)} className={rowClass}>{content}</button>}</li>
      })}</ul>
    </section>)}
    {!notifications.length ? <div className="px-4 py-14 text-center"><CheckCircle2 className="mx-auto size-6 text-brand" aria-hidden="true" /><p className="mt-3 text-sm font-medium text-foreground">You are all caught up</p><p className="mt-1 text-xs text-muted-foreground">New activity on your leads, quotes and invoices will show here.</p></div> : null}
  </div>
}

type SearchResult = { resource: string; record_id: string; title: string; subtitle: string; href: string }

function SearchContent({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const normalized = query.trim()
    if (normalized.length < 2) { setResults([]); setLoading(false); setError(''); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`, { signal: controller.signal, cache: 'no-store' })
        const payload = await response.json() as { results?: SearchResult[]; message?: string }
        if (!response.ok) throw new Error(payload.message ?? 'Search is unavailable.')
        setResults(payload.results ?? [])
        setError('')
      } catch (searchError) {
        if (!(searchError instanceof DOMException && searchError.name === 'AbortError')) setError(searchError instanceof Error ? searchError.message : 'Search is unavailable.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query])
  const normalized = query.trim()
  const groups = results.reduce<Array<{ resource: string; items: SearchResult[] }>>((all, result) => {
    const found = all.find((group) => group.resource === result.resource)
    if (found) found.items.push(result)
    else all.push({ resource: result.resource, items: [result] })
    return all
  }, [])
  const body = useRef<HTMLDivElement>(null)
  // Arrow keys move from the box down through the results and back up to the box.
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const links = Array.from(body.current?.querySelectorAll<HTMLAnchorElement>('a[data-result]') ?? [])
    const box = body.current?.querySelector<HTMLInputElement>('input')
    if (!links.length) return
    const at = links.indexOf(document.activeElement as HTMLAnchorElement)
    event.preventDefault()
    if (event.key === 'ArrowDown') links[Math.min(links.length - 1, at + 1)]?.focus()
    else if (at <= 0) box?.focus()
    else links[at - 1]?.focus()
  }
  return <div ref={body} onKeyDown={onKeyDown}>
    <label className="relative block">
      <span className="sr-only">Search records, people and support</span>
      <Search className="absolute top-1/2 left-3.5 size-[1.125rem] -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients, leads, quotes, invoices and people…" className="unison-field h-12 w-full rounded-none border border-border bg-background pr-3 pl-11 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/15" />
    </label>
    <p className="sr-only" aria-live="polite">{normalized.length < 2 ? 'Enter at least two characters' : loading ? 'Searching' : `${results.length} result${results.length === 1 ? '' : 's'}`}</p>
    {error ? <p role="alert" className="unison-live-region mt-4 border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
    {normalized.length < 2 ? <p className="mt-5 text-sm text-muted-foreground">Type at least two characters. Use the arrow keys to move through the results.</p> : null}
    {normalized.length >= 2 && loading && !results.length ? <p className="mt-5 text-sm text-muted-foreground">Searching…</p> : null}
    {groups.map((group) => <section key={group.resource} aria-label={humanize(group.resource)}>
      <h3 className="mt-5 mb-2 text-xs font-medium text-muted-foreground">{humanize(group.resource)}</h3>
      <ul className="divide-y divide-border/70 border border-border">{group.items.map((result) => <li key={`${result.resource}:${result.record_id}`}>
        <Link data-result href={result.href} onClick={onClose} className="unison-action-control flex items-center gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand">
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{result.title}</span>{result.subtitle ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{result.subtitle}</span> : null}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      </li>)}</ul>
    </section>)}
    {normalized.length >= 2 && !loading && !error && results.length === 0 ? <div className="unison-live-region mt-5 px-4 py-10 text-center"><p className="text-sm font-medium text-foreground">No records match “{normalized}”</p><p className="mt-1 text-xs text-muted-foreground">Check the spelling, or try fewer words.</p></div> : null}
  </div>
}

function humanize(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' }).format(new Date(value))
}
