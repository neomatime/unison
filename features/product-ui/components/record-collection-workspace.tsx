'use client'

import {
  Archive,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FileText,
  Filter,
  Import,
  Link2,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { useShellContext } from '@/components/layout/shell-context'
import { collectionRoute, collectionSlug, collectionStorageKey } from '../collection-route-storage'

import { ExportDialog } from '@/components/shared/export-dialog'
import { RowActionMenu } from '@/components/shared/row-action-menu'
import { ErrorState, LoadingSkeleton, PermissionState } from '@/components/shared/state-feedback'
import { HealthBadge } from '@/features/delivery/components/delivery-primitives'
import type { PortableCollection } from '@/features/data-portability/portable-collections'

export type CollectionRecord = {
  id: string
  name: string
  context: string
  status: string
  owner: string
  updated: string
  archived?: boolean
  [key: string]: string | boolean | undefined
}

export type CollectionField = {
  id: string
  label: string
  type?: 'text' | 'textarea' | 'select' | 'date'
  required?: boolean
  options?: string[]
  placeholder?: string
}

export type CollectionConfig = {
  title: string
  singular: string
  description: string
  primaryAction?: string
  records: CollectionRecord[]
  fields?: CollectionField[]
  filters?: string[]
  columns?: Array<{ id: string; label: string }>
  detailTabs?: string[]
  allowImport?: boolean
  portableCollection?: PortableCollection
  allowLink?: boolean
  contextualActions?: string[]
  emptyDescription?: string
  recordHref?: (record: CollectionRecord) => string
  recordHrefBase?: string
  state?: 'loaded' | 'loading' | 'error' | 'restricted'
}

const defaultFields: CollectionField[] = [
  { id: 'name', label: 'Name', required: true },
  { id: 'context', label: 'Description / context', type: 'textarea', required: true },
  { id: 'owner', label: 'Owner', type: 'select', options: ['Neo Morake', 'Amara Dlamini', 'Thabo Mokoena', 'Naledi Maseko'] },
  { id: 'status', label: 'Status', type: 'select', options: ['Draft', 'In Progress', 'Under Review', 'Approved', 'Complete'] },
]

const defaultColumns = [
  { id: 'name', label: 'Record' },
  { id: 'context', label: 'Context' },
  { id: 'owner', label: 'Owner' },
  { id: 'status', label: 'Status' },
  { id: 'updated', label: 'Last updated' },
]

export function RecordCollectionWorkspace({ config, compact = false, onPrimaryAction }: { config: CollectionConfig; compact?: boolean; onPrimaryAction?: () => void }) {
  const [records, setRecords] = useState(config.records)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All status')
  const [archived, setArchived] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [archiveTarget, setArchiveTarget] = useState<CollectionRecord | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [sortAscending, setSortAscending] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [message, setMessageState] = useState('')
  const router = useRouter()
  const pathname = usePathname()
  const { organization } = useShellContext()
  const slug = collectionSlug(pathname, config.title)
  const storageKey = collectionStorageKey(organization.id, slug)
  const fields = config.fields ?? defaultFields
  const columns = config.columns ?? defaultColumns
  const hasConfiguredRecordRoute = Boolean(config.recordHref || config.recordHrefBase)

  function recordRoute(record: CollectionRecord) {
    if (config.recordHref) return config.recordHref(record)
    if (config.recordHrefBase) {
      return `${config.recordHrefBase}/${encodeURIComponent(record.id)}`
    }
    return collectionRoute(slug, record.id)
  }

  useEffect(() => {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as { records?: CollectionRecord[] }
      if (payload.records) setRecords(payload.records)
    } catch { /* A stale browser draft should not break the register. */ }
  }, [storageKey])

  useEffect(() => setRecords(config.records), [config.records])

  function persistRoutePayload() {
    window.sessionStorage.setItem(storageKey, JSON.stringify({
      title: config.title,
      singular: config.singular,
      description: config.description,
      fields,
      records,
      returnHref: pathname,
      portableCollection: config.portableCollection,
    }))
  }

  function openRecord(mode: 'create' | 'view' | 'edit', record?: CollectionRecord) {
    persistRoutePayload()
    router.push(mode === 'create' ? collectionRoute(slug) : collectionRoute(slug, record?.id, mode === 'edit'))
  }

  function openAction(action: string, recordLabel: string) {
    persistRoutePayload()
    router.push(`/records/${encodeURIComponent(slug)}/action?action=${encodeURIComponent(action)}&record=${encodeURIComponent(recordLabel)}`)
  }

  function openImport() {
    persistRoutePayload()
    const params = new URLSearchParams({ collection: config.portableCollection!, return: pathname })
    router.push(`/records/${encodeURIComponent(slug)}/import?${params}`)
  }

  const setMessage = (value: string) => setMessageState(value)

  const visible = useMemo(() => records
    .filter((record) => Boolean(record.archived) === archived)
    .filter((record) => status === 'All status' || record.status === status)
    .filter((record) => Object.values(record).some((value) => String(value).toLowerCase().includes(query.toLowerCase())))
    .toSorted((a, b) => sortAscending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)), [archived, query, records, sortAscending, status])
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const paged = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const duplicate = (record: CollectionRecord) => {
    const copy = { ...record, id: `${record.id}-copy-${Date.now()}`, name: `${record.name} — Copy`, status: 'Draft', updated: 'Just now' }
    setRecords((current) => [copy, ...current])
    setMessage(`${record.name} was duplicated as a draft.`)
  }

  const confirmArchive = () => {
    if (!archiveTarget) return
    setRecords((current) => current.map((record) => record.id === archiveTarget.id ? { ...record, archived: true, status: 'Archived', updated: 'Just now' } : record))
    setSelected((current) => current.filter((id) => id !== archiveTarget.id))
    setMessage(`${archiveTarget.name} was archived.`)
    setArchiveTarget(null)
  }

  const restore = (record: CollectionRecord) => {
    setRecords((current) => current.map((item) => item.id === record.id ? { ...item, archived: false, status: 'Draft', updated: 'Just now' } : item))
    setMessage(`${record.name} was restored to active records.`)
  }

  const archiveSelected = () => {
    setRecords((current) => current.map((record) => selected.includes(record.id) ? { ...record, archived: true, status: 'Archived', updated: 'Just now' } : record))
    setMessage(`${selected.length} ${config.singular.toLowerCase()} record${selected.length === 1 ? '' : 's'} archived.`)
    setSelected([])
  }

  const statuses = [...new Set(records.filter((record) => !record.archived).map((record) => record.status))]

  if (config.state && config.state !== 'loaded') return <section className="overflow-hidden rounded-xl border border-border bg-card"><header className="border-b border-border px-5 py-4"><h2 className="unison-section-title text-xs">{config.title}</h2><p className="mt-1 text-xs text-muted-foreground">{config.description}</p></header>{config.state === 'loading' ? <LoadingSkeleton /> : config.state === 'error' ? <ErrorState /> : <PermissionState />}</section>

  return <>
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div><h2 className="unison-section-title text-xs">{config.title}</h2><p className="mt-1 text-xs text-muted-foreground">{config.description}</p></div>
        <div className="flex flex-wrap gap-2">
          {config.allowImport && config.portableCollection ? <button type="button" onClick={openImport} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"><Import className="size-3.5" />Import</button> : null}
          {config.allowLink ? <button type="button" onClick={() => setMessage(`Select a record to link to ${config.title.toLowerCase()}.`)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"><Link2 className="size-3.5" />Link existing</button> : null}
          <button type="button" onClick={onPrimaryAction ?? (() => openRecord('create'))} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3 text-xs font-semibold text-white"><Plus className="size-3.5" />{config.primaryAction ?? `Add ${config.singular}`}</button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label className="relative min-w-56 flex-1 sm:max-w-sm"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} aria-label={`Search ${config.title}`} placeholder={`Search ${config.title.toLowerCase()}...`} className="h-10 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm outline-none focus:border-brand" /></label>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} aria-label="Filter by status" className="h-10 rounded-lg border border-border bg-card px-3 text-xs font-medium"><option>All status</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select>
          {(config.filters ?? []).slice(0, 2).map((filter) => <select key={filter} aria-label={`${filter} filter`} className="h-10 rounded-lg border border-border bg-card px-3 text-xs font-medium"><option>All {filter.toLowerCase()}</option><option>Needs attention</option><option>Assigned to me</option></select>)}
          <button type="button" onClick={() => setSortAscending((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"><ArrowDownUp className="size-3.5" />{sortAscending ? 'A–Z' : 'Z–A'}</button>
        </div>
        <div className="relative flex items-center gap-2">
          <button type="button" aria-expanded={columnsOpen} onClick={() => setColumnsOpen((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"><Columns3 className="size-3.5" />Columns</button>
          {columnsOpen ? <div className="absolute top-full right-0 z-30 mt-2 w-56 rounded-xl border border-border bg-card p-3 shadow-xl"><p className="text-xs font-semibold">Visible columns</p>{columns.map((column) => <label key={column.id} className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" defaultChecked />{column.label}</label>)}</div> : null}
          {config.portableCollection ? <button type="button" onClick={() => setExportOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"><FileText className="size-3.5" />Export</button> : null}
          <button type="button" onClick={() => { setArchived((value) => !value); setSelected([]); setPage(1) }} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${archived ? 'border-brand bg-brand-soft text-brand' : 'border-border'}`}>{archived ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}{archived ? 'Active' : 'Archived'}</button>
        </div>
      </div>

      {selected.length ? <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-soft px-5 py-3 text-sm"><span><strong>{selected.length}</strong> selected</span><div className="flex gap-2">{config.contextualActions?.slice(0, 2).map((action) => <button key={action} type="button" onClick={() => openAction(action, `${selected.length} selected records`)} className="rounded-lg border border-brand/20 bg-card px-3 py-1.5 text-xs font-semibold">{action}</button>)}<button type="button" onClick={archiveSelected} className="inline-flex items-center gap-1 rounded-lg border border-destructive/20 bg-card px-3 py-1.5 text-xs font-semibold text-destructive"><Archive className="size-3.5" />Archive</button></div></div> : null}

      {visible.length ? <div className="overflow-x-auto"><table className={`w-full text-left ${compact ? 'min-w-[720px]' : 'min-w-[920px]'}`}><thead><tr className="bg-muted/30 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase"><th className="w-12 px-5 py-3"><input type="checkbox" aria-label="Select all visible records" checked={paged.length > 0 && paged.every((record) => selected.includes(record.id))} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...paged.map((record) => record.id)])] : selected.filter((id) => !paged.some((record) => record.id === id)))} /></th>{columns.map((column) => <th key={column.id} className="px-4 py-3">{column.label}</th>)}<th className="w-16 px-4 py-3">Actions</th></tr></thead><tbody>{paged.map((record) => <tr key={record.id} className="border-t border-border hover:bg-muted/25"><td className="px-5 py-3.5"><input type="checkbox" aria-label={`Select ${record.name}`} checked={selected.includes(record.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, record.id] : selected.filter((id) => id !== record.id))} /></td>{columns.map((column, index) => <td key={column.id} className="max-w-64 px-4 py-3.5 text-xs">{index === 0 ? <a href={recordRoute(record)} onClick={hasConfiguredRecordRoute ? undefined : (event) => { event.preventDefault(); openRecord('view', record) }} className="unison-record-name text-left text-sm hover:text-brand hover:underline">{String(record[column.id] ?? record.name)}</a> : column.id === 'status' ? <HealthBadge>{String(record.status)}</HealthBadge> : <span className="text-muted-foreground">{String(record[column.id] ?? '—')}</span>}</td>)}<td className="px-4 py-3.5"><RowActionMenu label={record.name} actions={record.archived ? [
          { id: 'view', label: 'View', onSelect: () => hasConfiguredRecordRoute ? router.push(recordRoute(record)) : openRecord('view', record) },
          { id: 'restore', label: 'Restore', onSelect: () => restore(record) },
        ] : [
          { id: 'view', label: 'View', onSelect: () => hasConfiguredRecordRoute ? router.push(recordRoute(record)) : openRecord('view', record) },
          { id: 'edit', label: 'Edit', onSelect: () => hasConfiguredRecordRoute ? router.push(`${recordRoute(record)}/edit`) : openRecord('edit', record) },
          { id: 'duplicate', label: 'Duplicate', onSelect: () => duplicate(record) },
          ...(config.contextualActions ?? []).slice(0, 2).map((action) => ({ id: action.toLowerCase().replaceAll(' ', '-'), label: action, onSelect: () => openAction(action, record.name) })),
          { id: 'archive', label: 'Archive', tone: 'danger' as const, onSelect: () => setArchiveTarget(record) },
      ]} /></td></tr>)}</tbody></table></div> : <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">{archived ? <Archive className="size-5" /> : <Filter className="size-5" />}</span><h3 className="mt-4 font-semibold">{archived ? `No archived ${config.title.toLowerCase()}` : `No ${config.title.toLowerCase()} yet`}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{archived ? 'Archived records will appear here and can be restored.' : config.emptyDescription ?? `Add the first ${config.singular.toLowerCase()} to begin.`}</p>{!archived ? <button type="button" onClick={onPrimaryAction ?? (() => openRecord('create'))} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"><Plus className="size-4" />{config.primaryAction ?? `Add ${config.singular}`}</button> : null}</div>}

      {visible.length ? <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground"><span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visible.length)} of {visible.length}</span><div className="flex items-center gap-3"><label className="flex items-center gap-2">Rows<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground"><option>5</option><option>10</option><option>25</option></select></label><div className="flex items-center gap-1"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page" className="rounded-lg border border-border p-1.5 disabled:opacity-40"><ChevronLeft className="size-3.5" /></button><span className="px-2 text-foreground">{currentPage} / {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Next page" className="rounded-lg border border-border p-1.5 disabled:opacity-40"><ChevronRight className="size-3.5" /></button></div></div></footer> : null}
    </section>

    <ArchiveDialog record={archiveTarget} singular={config.singular} onClose={() => setArchiveTarget(null)} onConfirm={confirmArchive} />
    {config.portableCollection ? <ExportDialog open={exportOpen} title={config.title} collection={config.portableCollection} visibleIds={visible.map((record) => record.id)} selectedIds={selected} onClose={() => setExportOpen(false)} /> : null}
    {message ? <button type="button" role="status" onClick={() => setMessage('')} className="fixed right-6 bottom-6 z-[100] max-w-sm rounded-xl bg-foreground px-4 py-3 text-left text-sm font-medium text-primary-foreground shadow-xl">{message}<X className="ml-3 inline size-3.5 opacity-60" /></button> : null}
  </>
}

function ArchiveDialog({ record, singular, onClose, onConfirm }: { record: CollectionRecord | null; singular: string; onClose: () => void; onConfirm: () => void }) {
  if (!record) return null
  return <div className="fixed inset-0 z-[95] flex items-center justify-center bg-foreground/30 p-4" onMouseDown={onClose}><section role="alertdialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"><span className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><Archive className="size-5" /></span><h2 className="mt-4 text-lg font-bold">Archive {singular.toLowerCase()}?</h2><p className="mt-2 text-sm leading-6 text-muted-foreground"><strong>{record.name}</strong> will leave active views. It can be restored from the Archived view.</p><label className="mt-5 block text-sm font-medium">Reason <span className="font-normal text-muted-foreground">(optional)</span><textarea rows={3} placeholder="Add context for other workspace members" className="mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-sm" /></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="button" onClick={onConfirm} className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white">Archive {singular}</button></div></section></div>
}
