'use client'

import Link from 'next/link'
import { Archive, ArrowDownUp, ChevronLeft, ChevronRight, Download, Filter, LayoutGrid, List, MoreHorizontal, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { EmptyState, ErrorState, LoadingSkeleton, PermissionState } from '@/components/shared/state-feedback'
import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { StatusBadge } from '@/components/ui/status-badge'
import type { MockRecord, ModuleDefinition } from '../types'
import { hasSpecialWorkspace, SpecialWorkspace } from './special-workspaces'

type DemoState = 'populated' | 'loading' | 'empty' | 'error' | 'restricted'

export function ModuleWorkspace({ module, records, connected, total, page: serverPage, pageSize }: { module: ModuleDefinition; records: MockRecord[]; connected?: boolean; total?: number; page?: number; pageSize?: number }) {
  const [query, setQuery] = useState('')
  const [activeView, setActiveView] = useState(module.views[0])
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortMode, setSortMode] = useState<'name' | 'status' | 'updated'>('updated')
  const [displayMode, setDisplayMode] = useState<'list' | 'grid'>('list')
  const [demoPage, setDemoPage] = useState(1)
  const [demoState, setDemoState] = useState<DemoState>('populated')
  const [selected, setSelected] = useState<string[]>([])
  const [archiveRecord, setArchiveRecord] = useState<MockRecord | null>(null)
  const [toast, setToast] = useState('')
  const filtered = useMemo(() => records.filter((record) => Object.values(record).some((value) => value.toLowerCase().includes(query.toLowerCase()))).toSorted((a, b) => sortMode === 'name' ? a.name.localeCompare(b.name) : sortMode === 'status' ? a.status.localeCompare(b.status) : a.updated.localeCompare(b.updated)), [query, records, sortMode])
  const special = hasSpecialWorkspace(module.id, activeView)

  function confirmArchive() {
    setToast(`${archiveRecord?.name} was archived in this demo.`)
    setArchiveRecord(null)
    window.setTimeout(() => setToast(''), 3200)
  }

  return (
    <>
      <WorkspaceHeader category={module.category} title={module.label} action={module.id === 'settings' ? undefined : module.primaryAction} actionHref={module.id === 'settings' ? undefined : `${module.route}/new`} />
      <p className="-mt-4 mb-5 max-w-3xl text-sm text-muted-foreground">{module.description}</p>

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border" aria-label={`${module.label} views`}>
        {module.views.map((view) => <button type="button" key={view} onClick={() => { setActiveView(view); if (view === 'Grid') setDisplayMode('grid'); if (view === 'List') setDisplayMode('list') }} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${activeView === view ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{view}</button>)}
      </nav>

      {special ? <SpecialWorkspace moduleId={module.id} view={activeView} /> : <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1 sm:max-w-xs"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={`Search ${module.label}`} placeholder={`Search ${module.label.toLowerCase()}...`} className="h-10 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm outline-none focus:border-ring" /></div>
            <div className="relative"><button type="button" onClick={() => setFilterOpen((value) => !value)} aria-expanded={filterOpen} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium"><Filter className="size-4" />Filters</button>{filterOpen ? <div className="absolute top-full left-0 z-30 mt-2 w-72 rounded-xl border border-border bg-card p-4 shadow-xl"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Filter {module.label}</p><button type="button" onClick={() => setFilterOpen(false)} className="text-xs text-muted-foreground">Close</button></div><div className="mt-4 space-y-3">{module.filters.map((filter) => <label key={filter} className="block text-xs font-medium text-muted-foreground">{filter}<select className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"><option>All {filter.toLowerCase()}</option><option>Active</option><option>Needs attention</option></select></label>)}</div><div className="mt-4 flex gap-2"><button type="button" onClick={() => { setFilterOpen(false); setToast('Filters applied to this demo view.'); window.setTimeout(() => setToast(''), 2600) }} className="flex-1 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-primary-foreground">Apply filters</button><button type="button" onClick={() => setFilterOpen(false)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Reset</button></div></div> : null}</div>
            <button type="button" onClick={() => setSortMode((current) => current === 'updated' ? 'name' : current === 'name' ? 'status' : 'updated')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium"><ArrowDownUp className="size-4" />Sort: {sortMode}</button>
            <button type="button" onClick={() => { setToast(`${module.label} export prepared. No file was generated in demo mode.`); window.setTimeout(() => setToast(''), 3000) }} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium"><Download className="size-4" />Export</button>
          </div>
          <div className="flex items-center gap-2">
            {!connected ? <>
              <label className="sr-only" htmlFor={`${module.id}-state`}>Preview screen state</label>
              <select id={`${module.id}-state`} value={demoState} onChange={(event) => setDemoState(event.target.value as DemoState)} className="h-10 rounded-lg border border-border bg-background px-3 text-xs text-muted-foreground">
                <option value="populated">Populated</option><option value="loading">Loading state</option><option value="empty">Empty state</option><option value="error">Error state</option><option value="restricted">Restricted state</option>
              </select>
            </> : null}
            <div className="flex rounded-lg border border-border p-1"><button type="button" onClick={() => setDisplayMode('list')} aria-label="List view" className={`rounded-md p-1.5 ${displayMode === 'list' ? 'bg-muted' : 'text-muted-foreground'}`}><List className="size-4" /></button><button type="button" onClick={() => setDisplayMode('grid')} aria-label="Grid view" className={`rounded-md p-1.5 ${displayMode === 'grid' ? 'bg-muted' : 'text-muted-foreground'}`}><LayoutGrid className="size-4" /></button></div>
          </div>
        </div>

        {selected.length && !connected ? <div className="flex items-center justify-between bg-muted/60 px-5 py-2.5 text-sm"><span><strong>{selected.length}</strong> selected</span><button type="button" onClick={() => setArchiveRecord(records.find((record) => selected.includes(record.id)) ?? null)} className="inline-flex items-center gap-2 font-medium text-destructive"><Archive className="size-4" />Archive selected</button></div> : null}

        {demoState === 'loading' ? <LoadingSkeleton /> : null}
        {demoState === 'empty' ? <EmptyState /> : null}
        {demoState === 'error' ? <ErrorState /> : null}
        {demoState === 'restricted' ? <PermissionState /> : null}
        {demoState === 'populated' && filtered.length === 0 ? <EmptyState search /> : null}
        {demoState === 'populated' && filtered.length && displayMode === 'list' ? <DataTable module={module} records={filtered} selected={selected} onSelected={setSelected} onArchive={connected ? undefined : setArchiveRecord} /> : null}
        {demoState === 'populated' && filtered.length && displayMode === 'grid' ? <RecordGrid module={module} records={filtered} onArchive={connected ? undefined : setArchiveRecord} /> : null}

        {demoState === 'populated' && filtered.length ? (
          connected ? (
            // Real count from the server, not an invented range — full
            // server-driven page navigation isn't wired yet, so the
            // prev/next controls are omitted rather than shown as fake.
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted-foreground">
              <span>Showing {filtered.length} of {total ?? filtered.length} record{(total ?? filtered.length) === 1 ? '' : 's'}{serverPage && pageSize && total && total > pageSize ? ` (page ${serverPage})` : ''}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted-foreground"><span>Showing {demoPage === 1 ? '1' : '9'}–{demoPage === 1 ? filtered.length : Math.min(16, Math.max(filtered.length, 16))} of {Math.max(filtered.length, 24)} records</span><div className="flex items-center gap-1"><button type="button" onClick={() => setDemoPage((current) => Math.max(1, current - 1))} disabled={demoPage === 1} aria-label="Previous page" className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronLeft className="size-4" /></button><span className="px-2 text-foreground">{demoPage}</span><button type="button" onClick={() => setDemoPage((current) => Math.min(3, current + 1))} disabled={demoPage === 3} aria-label="Next page" className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronRight className="size-4" /></button></div></div>
          )
        ) : null}
      </section>}

      {toast ? <div role="status" className="fixed right-6 bottom-6 z-50 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-primary-foreground shadow-xl">{toast}</div> : null}
      {!connected ? <ConfirmationDialog open={Boolean(archiveRecord)} title={`${module.archiveLabel ?? `Archive ${module.singular}`}?`} description={`This will remove ${archiveRecord?.name ?? 'this record'} from active views. This demo action can be reset by refreshing the browser.`} confirmLabel={module.archiveLabel ?? 'Archive'} onCancel={() => setArchiveRecord(null)} onConfirm={confirmArchive} /> : null}
    </>
  )
}

function RecordGrid({ module, records, onArchive }: { module: ModuleDefinition; records: MockRecord[]; onArchive?: (record: MockRecord) => void }) {
  return <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">{records.map((record) => <article key={record.id} className="rounded-xl border border-border p-5 transition-shadow hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><Link href={`${module.route}/${record.id}`} className="font-semibold hover:underline">{record.name}</Link><p className="mt-1 text-xs text-muted-foreground">Owned by {record.owner}</p></div><StatusBadge tone={statusTone(record.status)}>{record.status}</StatusBadge></div><div className="mt-6 grid grid-cols-2 gap-3 text-xs"><div><p className="text-muted-foreground">Last activity</p><p className="mt-1 font-medium">{record.updated}</p></div><div><p className="text-muted-foreground">Context</p><p className="mt-1 font-medium">{record.client ?? record.project ?? record.type ?? module.category}</p></div></div><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><Link href={`${module.route}/${record.id}`} className="text-xs font-semibold">Open record</Link>{onArchive ? <button type="button" onClick={() => onArchive(record)} className="text-xs font-medium text-destructive">Archive</button> : null}</div></article>)}</div>
}

function DataTable({ module, records, selected, onSelected, onArchive }: { module: ModuleDefinition; records: MockRecord[]; selected: string[]; onSelected: (ids: string[]) => void; onArchive?: (record: MockRecord) => void }) {
  const visibleColumns = module.columns.slice(0, 7)
  const [actionRecord, setActionRecord] = useState<string | null>(null)
  return <div className="overflow-x-auto"><table className="w-full min-w-[880px] border-collapse text-left"><thead><tr className="border-b border-border bg-muted/30 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase"><th className="w-12 px-5 py-3"><input type="checkbox" aria-label="Select all records" checked={selected.length === records.length} onChange={(event) => onSelected(event.target.checked ? records.map((record) => record.id) : [])} /></th>{visibleColumns.map((column) => <th key={column} className="px-3 py-3">{column}</th>)}<th className="w-12 px-3 py-3"><SlidersHorizontal className="size-3.5" /></th></tr></thead><tbody>{records.map((record) => <tr key={record.id} className="group border-b border-border last:border-b-0 hover:bg-muted/30"><td className="px-5 py-4"><input type="checkbox" aria-label={`Select ${record.name}`} checked={selected.includes(record.id)} onChange={(event) => onSelected(event.target.checked ? [...selected, record.id] : selected.filter((id) => id !== record.id))} /></td>{visibleColumns.map((column, index) => <td key={column} className="max-w-56 px-3 py-4 text-sm"><Cell module={module} record={record} column={column} primary={index === 0} /></td>)}<td className="relative px-3 py-4"><button type="button" aria-label={`Actions for ${record.name}`} aria-expanded={actionRecord === record.id} onClick={() => setActionRecord((current) => current === record.id ? null : record.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><MoreHorizontal className="size-4" /></button>{actionRecord === record.id ? <div className="absolute top-12 right-4 z-20 w-36 rounded-lg border border-border bg-card p-1 shadow-xl"><Link href={`${module.route}/${record.id}`} className="block rounded-md px-3 py-2 text-xs hover:bg-muted">View</Link><Link href={`${module.route}/${record.id}/edit`} className="block rounded-md px-3 py-2 text-xs hover:bg-muted">Edit</Link>{onArchive ? <button type="button" onClick={() => { setActionRecord(null); onArchive(record) }} className="block w-full rounded-md px-3 py-2 text-left text-xs text-destructive hover:bg-muted">Archive</button> : null}</div> : null}</td></tr>)}</tbody></table></div>
}

function Cell({ module, record, column, primary }: { module: ModuleDefinition; record: MockRecord; column: string; primary: boolean }) {
  const value = recordValue(record, column)
  if (primary) return <Link href={`${module.route}/${record.id}`} className="font-semibold text-foreground hover:underline">{record.name}</Link>
  if (column === 'Status' || column === 'Risk' || column === 'Client Health' || column === 'Stage') return <StatusBadge tone={statusTone(value)}>{value}</StatusBadge>
  return <span className="text-muted-foreground">{value}</span>
}

function statusTone(value: string): 'brand' | 'warning' | 'info' | 'neutral' {
  if (/paid|active|healthy|approved|accepted|on track|published|configured/i.test(value)) return 'brand'
  if (/risk|overdue|rejected|declined|watch/i.test(value)) return 'warning'
  if (/review|new|progress|issued|awaiting|interview|assessment/i.test(value)) return 'info'
  return 'neutral'
}

function recordValue(record: MockRecord, column: string) {
  const aliases: Record<string, string> = { Client: 'client', 'Primary Contact': 'contact', 'Service / Engagement': 'service', 'Account Owner': 'owner', 'Active Projects': 'projects', 'Client Health': 'health', 'Last Activity': 'updated', Project: 'name', Progress: 'progress', 'Next Milestone': 'milestone', 'Due Date': 'due', Task: 'name', Assignee: 'owner', Priority: 'priority', Event: 'name', Source: 'source', Date: 'date', Time: 'time', Company: 'name', 'Estimated Value': 'value', Quote: 'name', Total: 'total', Expiry: 'expiry', Opportunity: 'name', 'Client / Prospect': 'client', Stage: 'status', Value: 'value', Probability: 'probability', 'Expected Close': 'close', Invoice: 'name', Balance: 'balance', Expense: 'name', Category: 'category', Vendor: 'vendor', Amount: 'amount', Forecast: 'name', Period: 'period', Actual: 'actual', Projected: 'projected', Variance: 'variance', Employee: 'name', 'Job Title': 'title', Department: 'department', Team: 'team', Manager: 'owner', 'Start Date': 'start', Record: 'name', Type: 'type', 'Leave Type': 'type', From: 'from', To: 'to', Days: 'days', Approver: 'owner', Title: 'name', Owner: 'owner', 'Related Record': 'related', Visibility: 'visibility', Updated: 'updated', Insight: 'name', Module: 'module', Confidence: 'confidence', Generated: 'updated', Setting: 'name', Area: 'area', 'Last Changed': 'updated', Status: 'status' }
  return record[aliases[column] ?? column.toLowerCase()] ?? '—'
}
