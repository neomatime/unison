'use client'

import {
  Archive,
  ArrowDownUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FileText,
  Filter,
  Import,
  Link2,
  LoaderCircle,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { ExportDialog } from '@/components/shared/export-dialog'
import { RowActionMenu } from '@/components/shared/row-action-menu'
import { ErrorState, LoadingSkeleton, PermissionState } from '@/components/shared/state-feedback'
import { HealthBadge } from '@/features/delivery/components/delivery-primitives'

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
  allowLink?: boolean
  contextualActions?: string[]
  emptyDescription?: string
  recordHref?: (record: CollectionRecord) => string
  state?: 'loaded' | 'loading' | 'error' | 'restricted'
}

type Panel = { kind: 'create' | 'edit' | 'view'; record?: CollectionRecord } | null

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
  const [panel, setPanel] = useState<Panel>(null)
  const [archiveTarget, setArchiveTarget] = useState<CollectionRecord | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [sortAscending, setSortAscending] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [message, setMessageState] = useState('')
  const [workflow, setWorkflow] = useState('')
  const columns = config.columns ?? defaultColumns

  const setMessage = (value: string) => {
    if (/ panel opened|select a record to link/i.test(value)) {
      setWorkflow(value.replace(/ panel opened/i, ''))
      return
    }
    setMessageState(value)
  }

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

  if (config.state && config.state !== 'loaded') return <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]"><header className="border-b border-border px-5 py-4"><h2 className="text-sm font-semibold">{config.title}</h2><p className="mt-1 text-xs text-muted-foreground">{config.description}</p></header>{config.state === 'loading' ? <LoadingSkeleton /> : config.state === 'error' ? <ErrorState /> : <PermissionState />}</section>

  return <>
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div><h2 className="text-sm font-semibold">{config.title}</h2><p className="mt-1 text-xs text-muted-foreground">{config.description}</p></div>
        <div className="flex flex-wrap gap-2">
          {config.allowImport ? <button type="button" onClick={() => setImportOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"><Import className="size-3.5" />Import</button> : null}
          {config.allowLink ? <button type="button" onClick={() => setMessage(`Select a record to link to ${config.title.toLowerCase()}.`)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"><Link2 className="size-3.5" />Link existing</button> : null}
          <button type="button" onClick={onPrimaryAction ?? (() => setPanel({ kind: 'create' }))} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3 text-xs font-semibold text-white"><Plus className="size-3.5" />{config.primaryAction ?? `Add ${config.singular}`}</button>
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
          <button type="button" onClick={() => setExportOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"><FileText className="size-3.5" />Export</button>
          <button type="button" onClick={() => { setArchived((value) => !value); setSelected([]); setPage(1) }} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${archived ? 'border-brand bg-brand-soft text-brand' : 'border-border'}`}>{archived ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}{archived ? 'Active' : 'Archived'}</button>
        </div>
      </div>

      {selected.length ? <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-soft px-5 py-3 text-sm"><span><strong>{selected.length}</strong> selected</span><div className="flex gap-2">{config.contextualActions?.slice(0, 2).map((action) => <button key={action} type="button" onClick={() => setMessage(`${action} panel opened for ${selected.length} records.`)} className="rounded-lg border border-brand/20 bg-card px-3 py-1.5 text-xs font-semibold">{action}</button>)}<button type="button" onClick={archiveSelected} className="inline-flex items-center gap-1 rounded-lg border border-destructive/20 bg-card px-3 py-1.5 text-xs font-semibold text-destructive"><Archive className="size-3.5" />Archive</button></div></div> : null}

      {visible.length ? <div className="overflow-x-auto"><table className={`w-full text-left ${compact ? 'min-w-[720px]' : 'min-w-[920px]'}`}><thead><tr className="bg-muted/30 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase"><th className="w-12 px-5 py-3"><input type="checkbox" aria-label="Select all visible records" checked={paged.length > 0 && paged.every((record) => selected.includes(record.id))} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...paged.map((record) => record.id)])] : selected.filter((id) => !paged.some((record) => record.id === id)))} /></th>{columns.map((column) => <th key={column.id} className="px-4 py-3">{column.label}</th>)}<th className="w-16 px-4 py-3">Actions</th></tr></thead><tbody>{paged.map((record) => <tr key={record.id} className="border-t border-border hover:bg-muted/25"><td className="px-5 py-3.5"><input type="checkbox" aria-label={`Select ${record.name}`} checked={selected.includes(record.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, record.id] : selected.filter((id) => id !== record.id))} /></td>{columns.map((column, index) => <td key={column.id} className="max-w-64 px-4 py-3.5 text-xs">{index === 0 ? config.recordHref ? <a href={config.recordHref(record)} className="text-left text-sm font-semibold hover:text-brand hover:underline">{String(record[column.id] ?? record.name)}</a> : <button type="button" onClick={() => setPanel({ kind: 'view', record })} className="text-left text-sm font-semibold hover:text-brand hover:underline">{String(record[column.id] ?? record.name)}</button> : column.id === 'status' ? <HealthBadge>{String(record.status)}</HealthBadge> : <span className="text-muted-foreground">{String(record[column.id] ?? '—')}</span>}</td>)}<td className="px-4 py-3.5"><RowActionMenu label={record.name} actions={record.archived ? [
          { id: 'view', label: 'View', onSelect: () => config.recordHref ? window.location.assign(config.recordHref(record)) : setPanel({ kind: 'view', record }) },
          { id: 'restore', label: 'Restore', onSelect: () => restore(record) },
        ] : [
          { id: 'view', label: 'View', onSelect: () => config.recordHref ? window.location.assign(config.recordHref(record)) : setPanel({ kind: 'view', record }) },
          { id: 'edit', label: 'Edit', onSelect: () => setPanel({ kind: 'edit', record }) },
          { id: 'duplicate', label: 'Duplicate', onSelect: () => duplicate(record) },
          ...(config.contextualActions ?? []).slice(0, 2).map((action) => ({ id: action.toLowerCase().replaceAll(' ', '-'), label: action, onSelect: () => setMessage(`${action} panel opened for ${record.name}.`) })),
          { id: 'archive', label: 'Archive', tone: 'danger' as const, onSelect: () => setArchiveTarget(record) },
      ]} /></td></tr>)}</tbody></table></div> : <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">{archived ? <Archive className="size-5" /> : <Filter className="size-5" />}</span><h3 className="mt-4 font-semibold">{archived ? `No archived ${config.title.toLowerCase()}` : `No ${config.title.toLowerCase()} yet`}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{archived ? 'Archived records will appear here and can be restored.' : config.emptyDescription ?? `Add the first ${config.singular.toLowerCase()} to begin.`}</p>{!archived ? <button type="button" onClick={onPrimaryAction ?? (() => setPanel({ kind: 'create' }))} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"><Plus className="size-4" />{config.primaryAction ?? `Add ${config.singular}`}</button> : null}</div>}

      {visible.length ? <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground"><span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visible.length)} of {visible.length}</span><div className="flex items-center gap-3"><label className="flex items-center gap-2">Rows<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground"><option>5</option><option>10</option><option>25</option></select></label><div className="flex items-center gap-1"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page" className="rounded-lg border border-border p-1.5 disabled:opacity-40"><ChevronLeft className="size-3.5" /></button><span className="px-2 text-foreground">{currentPage} / {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Next page" className="rounded-lg border border-border p-1.5 disabled:opacity-40"><ChevronRight className="size-3.5" /></button></div></div></footer> : null}
    </section>

    <RecordPanel panel={panel} config={config} onClose={() => setPanel(null)} onSave={(record, originalId) => {
      setRecords((current) => originalId ? current.map((item) => item.id === originalId ? record : item) : [record, ...current])
      setPanel({ kind: 'view', record })
      setMessage(`${record.name} was ${originalId ? 'updated' : 'created'} successfully.`)
    }} onEdit={(record) => setPanel({ kind: 'edit', record })} onDuplicate={duplicate} onArchive={(record) => { setPanel(null); setArchiveTarget(record) }} />
    <ArchiveDialog record={archiveTarget} singular={config.singular} onClose={() => setArchiveTarget(null)} onConfirm={confirmArchive} />
    <ExportDialog open={exportOpen} title={config.title} selectedCount={selected.length} onClose={() => setExportOpen(false)} />
    <ImportDialog open={importOpen} title={config.title} onClose={() => setImportOpen(false)} onComplete={() => { setImportOpen(false); setMessage(`${config.title} import was validated and is ready for review.`) }} />
    <ContextActionDialog action={workflow} onClose={() => setWorkflow('')} onConfirm={() => { setMessageState(`${workflow} completed successfully.`); setWorkflow('') }} />
    {message ? <button type="button" role="status" onClick={() => setMessage('')} className="fixed right-6 bottom-6 z-[100] max-w-sm rounded-xl bg-foreground px-4 py-3 text-left text-sm font-medium text-primary-foreground shadow-xl">{message}<X className="ml-3 inline size-3.5 opacity-60" /></button> : null}
  </>
}

function ContextActionDialog({ action, onClose, onConfirm }: { action: string; onClose: () => void; onConfirm: () => void }) {
  if (!action) return null
  const label = action.split(' for ')[0]
  const needsOwner = /assign|reassign|delegate|move/i.test(label)
  const needsStatus = /status|complete|close|resolve|mitigate|escalate|pause|resume|publish|submit|approve|reject/i.test(label)

  return <div className="fixed inset-0 z-[96] flex items-center justify-center bg-foreground/30 p-4" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="context-action-title" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
      <p className="text-xs font-semibold tracking-wide text-brand uppercase">Record action</p>
      <h2 id="context-action-title" className="mt-2 text-lg font-bold">{label}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Review the affected record and provide the information required to complete this action.</p>
      <div className="mt-5 space-y-4">
        {needsOwner ? <label className="block text-sm font-medium">Assignee / destination<select className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"><option>Neo Morake</option><option>Amara Dlamini</option><option>Transformation Portfolio</option><option>Claims Modernisation Programme</option></select></label> : null}
        {needsStatus ? <label className="block text-sm font-medium">Outcome<select className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"><option>Confirm {label.toLowerCase()}</option><option>Save as draft</option><option>Request review</option></select></label> : null}
        <label className="block text-sm font-medium">Comment <span className="font-normal text-muted-foreground">(optional)</span><textarea rows={4} placeholder="Add context for the activity history" className="mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-sm" /></label>
      </div>
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="button" onClick={onConfirm} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Confirm</button></div>
    </section>
  </div>
}

function RecordPanel({ panel, config, onClose, onSave, onEdit, onDuplicate, onArchive }: { panel: Panel; config: CollectionConfig; onClose: () => void; onSave: (record: CollectionRecord, originalId?: string) => void; onEdit: (record: CollectionRecord) => void; onDuplicate: (record: CollectionRecord) => void; onArchive: (record: CollectionRecord) => void }) {
  const [tab, setTab] = useState('Overview')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  if (!panel) return null
  const fields = config.fields ?? defaultFields
  const tabs = config.detailTabs ?? ['Overview', 'Related records', 'Documents', 'Comments', 'Activity']
  const record = panel.record

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    if (!values.name?.trim()) { setError(`${config.singular} name is required.`); return }
    setSaving(true)
    window.setTimeout(() => {
      onSave({ id: record?.id ?? `${config.singular.toLowerCase().replaceAll(' ', '-')}-${Date.now()}`, name: values.name, context: values.context || values.description || 'No additional context', owner: values.owner || 'Neo Morake', status: values.status || 'Draft', updated: 'Just now', ...values }, record?.id)
      setSaving(false)
    }, 550)
  }

  return <div className="fixed inset-0 z-[80]"><button type="button" aria-label={`Close ${config.singular}`} onClick={onClose} className="absolute inset-0 bg-foreground/25" /><aside role="dialog" aria-modal="true" aria-labelledby="record-panel-title" className="absolute top-0 right-0 flex h-full w-full max-w-2xl flex-col border-l border-border bg-card shadow-2xl">
    <header className="flex items-start justify-between border-b border-border p-6"><div><p className="text-xs font-semibold tracking-wide text-brand uppercase">{panel.kind === 'create' ? `New ${config.singular}` : config.singular}</p><h2 id="record-panel-title" className="mt-1 text-xl font-bold">{panel.kind === 'create' ? config.primaryAction ?? `Add ${config.singular}` : record?.name}</h2>{record ? <p className="mt-1 text-sm text-muted-foreground">{record.id} · Updated {record.updated}</p> : <p className="mt-1 text-sm text-muted-foreground">Complete the required information below.</p>}</div><button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-muted" aria-label="Close"><X className="size-4" /></button></header>
    {panel.kind === 'view' && record ? <>
      <div className="border-b border-border px-6 pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><HealthBadge>{record.status}</HealthBadge><span className="text-xs text-muted-foreground">Owner: {record.owner}</span></div><div className="flex gap-2"><button type="button" onClick={() => onEdit(record)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Edit</button><RowActionMenu label={record.name} actions={[{ id:'duplicate',label:'Duplicate',onSelect:()=>onDuplicate(record) },{ id:'archive',label:'Archive',tone:'danger',onSelect:()=>onArchive(record) }]} /></div></div><nav className="mt-4 flex gap-1 overflow-x-auto">{tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-xs font-semibold ${tab === item ? 'border-brand text-brand' : 'border-transparent text-muted-foreground'}`}>{item}</button>)}</nav></div>
      <div className="flex-1 overflow-y-auto p-6"><DetailContent tab={tab} record={record} config={config} /></div>
    </> : <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col"><div className="flex-1 space-y-5 overflow-y-auto p-6">{error ? <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}<div className="grid gap-5 sm:grid-cols-2">{fields.map((field) => <CollectionInput key={field.id} field={field} value={record?.[field.id]} />)}</div><div className="rounded-xl border border-info/20 bg-info-soft/40 p-4"><p className="text-sm font-semibold">Review before saving</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Required fields, ownership and status are checked before the record is added to the workspace.</p></div></div><footer className="flex items-center justify-between border-t border-border p-5"><button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</button><div className="flex gap-2"><button type="button" onClick={() => setError('')} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Save draft</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}{saving ? 'Saving…' : panel.kind === 'create' ? `Create ${config.singular}` : 'Save changes'}</button></div></footer></form>}
  </aside></div>
}

function CollectionInput({ field, value }: { field: CollectionField; value?: string | boolean }) {
  const classes = 'mt-1.5 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10'
  return <label className={field.type === 'textarea' ? 'sm:col-span-2' : ''}><span className="text-sm font-medium">{field.label}{field.required ? <span className="text-destructive"> *</span> : null}</span>{field.type === 'textarea' ? <textarea name={field.id} defaultValue={String(value ?? '')} required={field.required} placeholder={field.placeholder} rows={5} className={`${classes} py-3`} /> : field.type === 'select' ? <select name={field.id} defaultValue={String(value ?? field.options?.[0] ?? '')} className={classes}>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input name={field.id} type={field.type ?? 'text'} defaultValue={String(value ?? '')} required={field.required} placeholder={field.placeholder} className={classes} />}</label>
}

function DetailContent({ tab, record, config }: { tab: string; record: CollectionRecord; config: CollectionConfig }) {
  if (/version/i.test(tab)) return <div className="overflow-hidden rounded-xl border border-border"><table className="w-full text-left"><thead><tr className="bg-muted/40 text-xs text-muted-foreground"><th className="px-4 py-3">Version</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Uploaded by</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>{[['v3.0','Today',record.owner,'Current'],['v2.0','12 Aug 2026','Amara Dlamini','Superseded'],['v1.0','02 Aug 2026','Thabo Mokoena','Archived']].map((row) => <tr key={row[0]} className="border-t border-border text-xs"><td className="px-4 py-3 font-semibold">{row[0]}</td><td className="px-4 py-3 text-muted-foreground">{row[1]}</td><td className="px-4 py-3">{row[2]}</td><td className="px-4 py-3"><HealthBadge>{row[3]}</HealthBadge></td><td className="px-4 py-3"><button type="button" className="font-semibold text-brand">Compare</button></td></tr>)}</tbody></table><div className="flex justify-end gap-2 border-t border-border p-4"><button type="button" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Compare versions</button><button type="button" className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">Upload new version</button></div></div>
  if (/preview/i.test(tab)) return <div className="grid gap-5 lg:grid-cols-[1fr_220px]"><div className="flex min-h-96 items-center justify-center rounded-xl border border-border bg-muted/30"><div className="text-center"><FileText className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 text-sm font-semibold">Controlled document preview</p><p className="mt-1 text-xs text-muted-foreground">{record.name}</p></div></div><aside className="rounded-xl border border-border p-4"><h3 className="text-sm font-semibold">File details</h3><div className="mt-4 space-y-4">{[['Type',String(record.type ?? 'PDF')],['Size',String(record.size ?? '2.4 MB')],['Version',String(record.version ?? 'v1.0')],['Owner',record.owner],['Classification',String(record.classification ?? 'Internal')]].map(([label,value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>)}</div></aside></div>
  if (/document|evidence/i.test(tab)) return <div><EmptyDetail icon={Upload} title="Linked documents and evidence" description="Attach an existing controlled document or upload new evidence for this record." actions={['Attach existing', 'Upload document']} /></div>
  if (/comment/i.test(tab)) return <div><EmptyDetail icon={MessageSquare} title="Comments" description="Discuss this record with project owners and governance reviewers." actions={['Add comment']} /></div>
  if (/activity|history/i.test(tab)) return <div className="space-y-4">{['Record created','Owner assigned','Status reviewed','Context updated'].map((item,index) => <div key={item} className="flex gap-3"><span className="mt-1 flex size-7 items-center justify-center rounded-full bg-muted"><CheckCircle2 className="size-3.5 text-brand" /></span><div><p className="text-sm font-medium">{item}</p><p className="mt-0.5 text-xs text-muted-foreground">{index + 1} day{index ? 's' : ''} ago · {record.owner}</p></div></div>)}</div>
  if (/traceability/i.test(tab)) return <div><div className="rounded-xl border border-border p-5"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand" /><h3 className="font-semibold">Delivery lineage</h3></div><div className="mt-5 flex flex-wrap items-center gap-2">{['Requirement','Process','Deliverable','Test Case','Approval','Release'].map((item,index) => <div key={item} className="flex items-center gap-2"><span className={`rounded-lg border px-3 py-2 text-xs font-semibold ${index < 4 ? 'border-success/30 bg-success-soft text-success' : 'border-warning/30 bg-warning-soft text-warning'}`}>{item}</span>{index < 5 ? <ChevronRight className="size-3 text-muted-foreground" /> : null}</div>)}</div><p className="mt-5 text-xs text-warning">Two downstream links require attention before the next governance gate.</p></div></div>
  return <div className="space-y-5"><section className="rounded-xl border border-border p-5"><h3 className="font-semibold">{record.name}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{record.context}</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{Object.entries(record).filter(([key]) => !['id','name','context','archived'].includes(key)).slice(0,8).map(([key,value]) => <div key={key} className="rounded-lg bg-muted/50 p-3"><p className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{key.replace(/([A-Z])/g,' $1')}</p><p className="mt-1 text-sm font-medium">{String(value)}</p></div>)}</div></section><EmptyDetail icon={Link2} title={`Related ${config.title.toLowerCase()}`} description="Connect this record to other governed project information." actions={['Link record']} /></div>
}
function EmptyDetail({ icon: Icon, title, description, actions }: { icon: typeof Upload; title: string; description: string; actions: string[] }) {
  const [action, setAction] = useState('')
  const [complete, setComplete] = useState('')

  return <><div className="rounded-xl border border-dashed border-border p-8 text-center"><Icon className="mx-auto size-6 text-muted-foreground" /><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{description}</p><div className="mt-5 flex justify-center gap-2">{actions.map((item) => <button key={item} type="button" onClick={() => setAction(item)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold first:bg-brand first:text-white">{item}</button>)}</div>{complete ? <p role="status" className="mt-4 text-xs font-semibold text-success">{complete}</p> : null}</div><ContextActionDialog action={action} onClose={() => setAction('')} onConfirm={() => { setComplete(`${action} completed successfully.`); setAction('') }} /></>
}

function ArchiveDialog({ record, singular, onClose, onConfirm }: { record: CollectionRecord | null; singular: string; onClose: () => void; onConfirm: () => void }) {
  if (!record) return null
  return <div className="fixed inset-0 z-[95] flex items-center justify-center bg-foreground/30 p-4" onMouseDown={onClose}><section role="alertdialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"><span className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><Archive className="size-5" /></span><h2 className="mt-4 text-lg font-bold">Archive {singular.toLowerCase()}?</h2><p className="mt-2 text-sm leading-6 text-muted-foreground"><strong>{record.name}</strong> will leave active views. It can be restored from the Archived view.</p><label className="mt-5 block text-sm font-medium">Reason <span className="font-normal text-muted-foreground">(optional)</span><textarea rows={3} placeholder="Add context for other workspace members" className="mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-sm" /></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="button" onClick={onConfirm} className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white">Archive {singular}</button></div></section></div>
}

function ImportDialog({ open, title, onClose, onComplete }: { open: boolean; title: string; onClose: () => void; onComplete: () => void }) {
  const [step, setStep] = useState(0)
  if (!open) return null
  const steps = ['Upload', 'Map fields', 'Validate', 'Review']
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/30 p-4" onMouseDown={onClose}><section role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"><header className="flex items-start justify-between border-b border-border p-6"><div><p className="text-xs font-semibold text-brand">IMPORT</p><h2 className="mt-1 text-xl font-bold">Import {title}</h2><p className="mt-1 text-sm text-muted-foreground">Upload, map and validate records before adding them.</p></div><button type="button" onClick={onClose} aria-label="Close import" className="rounded-lg p-2 hover:bg-muted"><X className="size-4" /></button></header><div className="p-6"><div className="mb-6 grid grid-cols-4 gap-2">{steps.map((label,index) => <div key={label} className={`rounded-lg px-3 py-2 text-xs font-semibold ${index === step ? 'bg-brand text-white' : index < step ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}>{index + 1}. {label}</div>)}</div>{step === 0 ? <div className="rounded-xl border-2 border-dashed border-border p-10 text-center"><Upload className="mx-auto size-7 text-muted-foreground" /><h3 className="mt-3 font-semibold">Drop a CSV or XLSX file here</h3><p className="mt-1 text-xs text-muted-foreground">Up to 5,000 records · Maximum 10 MB</p><button type="button" className="mt-5 rounded-lg border border-border px-4 py-2 text-sm font-semibold">Choose file</button></div> : step === 1 ? <div className="space-y-3">{['Requirement ID','Title','Description','Type','Priority','Owner','Status'].map((field) => <div key={field} className="grid grid-cols-[1fr_40px_1fr] items-center gap-3"><span className="rounded-lg bg-muted px-3 py-2 text-sm">{field}</span><ChevronRight className="size-4 text-muted-foreground" /><select className="h-10 rounded-lg border border-border bg-card px-3 text-sm"><option>{field}</option><option>Do not import</option></select></div>)}</div> : step === 2 ? <div className="space-y-3">{[['126','Valid rows','success'],['4','Missing required values','warning'],['2','Possible duplicates','warning']].map(([value,label,tone]) => <div key={label} className="flex items-center gap-3 rounded-xl border border-border p-4"><span className={`flex size-9 items-center justify-center rounded-lg font-bold ${tone === 'success' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>{value}</span><span className="text-sm font-medium">{label}</span><button type="button" className="ml-auto text-xs font-semibold text-brand">Review</button></div>)}</div> : <div className="rounded-xl border border-border p-6"><div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-success" /><div><h3 className="font-semibold">Ready to import</h3><p className="text-sm text-muted-foreground">126 valid records will be added. Six flagged rows will be skipped.</p></div></div><label className="mt-5 flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked />Skip duplicate records</label></div>}</div><footer className="flex items-center justify-between border-t border-border p-5"><button type="button" onClick={step ? () => setStep((value) => value - 1) : onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">{step ? 'Back' : 'Cancel'}</button><button type="button" onClick={step === steps.length - 1 ? onComplete : () => setStep((value) => value + 1)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">{step === steps.length - 1 ? 'Complete import' : 'Continue'}</button></footer></section></div>
}
