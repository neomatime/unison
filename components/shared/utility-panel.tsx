'use client'

import Link from 'next/link'
import { Bell, BookOpen, CheckCircle2, CircleHelp, Command, FileQuestion, Keyboard, LoaderCircle, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useShellContext } from '@/components/layout/shell-context'
import { createBrowserSupabase } from '@/lib/supabase/client'

export type UtilityPanelKind = 'help' | 'notifications' | 'search'

export function UtilityPanel({ kind, open, onClose }: { kind: UtilityPanelKind; open: boolean; onClose: () => void }) {
  if (!open) return null
  const title = kind === 'help' ? 'Help & resources' : kind === 'notifications' ? 'Notifications' : 'Search UNISON'
  return <div className="fixed inset-0 z-[60]" role="presentation">
    <button type="button" aria-label={`Close ${title}`} className="absolute inset-0 bg-foreground/20" onClick={onClose} />
    <aside role="dialog" aria-modal="true" aria-label={title} className="unison-drawer-enter absolute top-0 right-0 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl">
      <header className="flex items-center justify-between border-b border-border p-5"><div className="flex items-center gap-3">{kind === 'help' ? <CircleHelp className="size-5" /> : kind === 'notifications' ? <Bell className="size-5" /> : <Search className="size-5" />}<h2 className="unison-section-title text-sm">{title}</h2></div><button type="button" onClick={onClose} aria-label="Close panel" className="p-2 transition-colors hover:bg-muted"><X className="size-4" /></button></header>
      <div className="flex-1 overflow-y-auto p-5">{kind === 'help' ? <HelpContent onClose={onClose} /> : kind === 'notifications' ? <NotificationContent onClose={onClose} /> : <SearchContent onClose={onClose} />}</div>
    </aside>
  </div>
}

function HelpContent({ onClose }: { onClose: () => void }) {
  return <div className="space-y-3">
    <ResourceLink href="/knowledge" icon={<BookOpen className="size-5" />} title="UNISON guide" description="Browse module and workflow guidance" onClick={onClose} />
    <div className="border border-border p-4"><div className="flex items-center gap-4"><span className="flex size-10 items-center justify-center border border-border bg-muted/40"><Keyboard className="size-5" /></span><span><span className="unison-record-name block text-sm">Keyboard shortcuts</span><span className="text-xs text-muted-foreground">Move through the product efficiently</span></span></div><dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-xs"><dt className="text-muted-foreground">Open global search</dt><dd><kbd className="border border-border bg-muted px-1.5 py-0.5">Ctrl / ⌘ K</kbd></dd><dt className="text-muted-foreground">Close a panel</dt><dd><kbd className="border border-border bg-muted px-1.5 py-0.5">Esc</kbd></dd></dl></div>
    <ResourceLink href="/support/new" icon={<FileQuestion className="size-5" />} title="Contact support" description="Create and track a support request" onClick={onClose} />
    <Link href="/support" onClick={onClose} className="block border border-brand/20 bg-brand-soft/20 p-4 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft/40">View your support tickets</Link>
  </div>
}

function ResourceLink({ href, icon, title, description, onClick }: { href: string; icon: ReactNode; title: string; description: string; onClick: () => void }) {
  return <Link href={href} onClick={onClick} className="flex w-full items-center gap-4 border border-border p-4 text-left transition-colors hover:bg-muted/40"><span className="flex size-10 items-center justify-center border border-border bg-muted/40">{icon}</span><span><span className="unison-record-name block text-sm">{title}</span><span className="text-xs text-muted-foreground">{description}</span></span></Link>
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
  if (error && !notifications.length) return <div className="border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-3 border border-destructive/25 px-3 py-2 text-xs font-semibold">Try again</button></div>
  const unread = notifications.filter((item) => !item.read_at).length
  return <div><div className="flex items-center justify-between"><p className="unison-metric-label text-xs text-muted-foreground">{unread ? `${unread} unread` : 'Recent activity'}</p>{unread ? <button type="button" onClick={() => void markRead()} className="text-xs font-medium text-brand">Mark all read</button> : null}</div>{error ? <p role="alert" className="mt-3 text-xs text-destructive">{error}</p> : null}<div className="mt-3 space-y-2">{notifications.map((item) => {
    const content = <><span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read_at ? 'bg-muted' : 'bg-warning'}`} /><span><span className="block text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{item.category} · {relativeTime(item.created_at)}</span><span className="mt-1 block text-sm font-medium">{item.title}</span>{item.body ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.body}</span> : null}</span></>
    return item.href ? <Link key={item.id} href={item.href} onClick={() => { void markRead(item.id); onClose() }} className="flex w-full gap-3 border border-border p-4 text-left transition-colors hover:bg-muted/40">{content}</Link> : <button type="button" key={item.id} onClick={() => void markRead(item.id)} className="flex w-full gap-3 border border-border p-4 text-left transition-colors hover:bg-muted/40">{content}</button>
  })}</div>{!notifications.length || !unread ? <div className="mt-8 text-center"><CheckCircle2 className="mx-auto size-6 text-brand" /><p className="mt-2 text-sm text-muted-foreground">You are all caught up</p></div> : null}</div>
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
  return <div><label className="relative block"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records, people and support..." className="h-10 w-full rounded-none border border-border bg-background pr-3 pl-9 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/15" /></label><p className="unison-metric-label mt-6 text-xs text-muted-foreground">{query.trim().length < 2 ? 'Enter at least two characters' : loading ? 'Searching…' : `${results.length} result${results.length === 1 ? '' : 's'}`}</p>{error ? <p role="alert" className="mt-3 border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}<div className="mt-2 space-y-1">{results.map((result) => <Link key={`${result.resource}:${result.record_id}`} href={result.href} onClick={onClose} className="flex items-center justify-between px-3 py-3 transition-colors hover:bg-muted"><span className="min-w-0"><span className="block text-xs text-muted-foreground">{humanize(result.resource)}</span><span className="unison-record-name block truncate text-sm">{result.title}</span>{result.subtitle ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{result.subtitle}</span> : null}</span><Command className="ml-3 size-4 shrink-0 text-muted-foreground" /></Link>)}{query.trim().length >= 2 && !loading && !error && results.length === 0 ? <p className="border border-border bg-muted/35 p-5 text-center text-sm text-muted-foreground">No records match “{query.trim()}”.</p> : null}</div></div>
}

function humanize(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium' }).format(new Date(value))
}
