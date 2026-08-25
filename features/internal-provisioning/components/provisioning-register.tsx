'use client'

import { Archive, ChevronRight, CirclePause, ClipboardCheck, Copy, Gauge, PauseCircle, PlayCircle, Plus, Rocket, Search, Settings2, TriangleAlert, X } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { RowActionMenu } from '@/components/shared/row-action-menu'
import { ProgressBar } from '@/components/ui/progress-bar'

import { provisioningRecords as initialRecords } from '../data'
import { InternalMetric, InternalPageHeader, ProvisioningStatusBadge } from './internal-primitives'

export function ProvisioningRegister() {
  const [records, setRecords] = useState(initialRecords)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All statuses')
  const [selected, setSelected] = useState<(typeof initialRecords)[number] | null>(null)
  const [archive, setArchive] = useState<(typeof initialRecords)[number] | null>(null)
  const [message, setMessage] = useState('')
  const visible = useMemo(() => records.filter((record) => status === 'All statuses' || record.status === status).filter((record) => Object.values(record).join(' ').toLowerCase().includes(query.toLowerCase())), [query, records, status])
  const metrics = [
    ['Active Provisionings', '6', 'Across current clients', Settings2, 'brand'], ['Ready to Provision', '1', 'Awaiting final review', ClipboardCheck, 'success'], ['In Configuration', '2', 'Setup in progress', Gauge, 'brand'], ['Live This Month', '3', 'Provisioned successfully', Rocket, 'success'], ['Paused', '1', 'Owner action required', CirclePause, 'warning'], ['Failed', '1', 'Retry available', TriangleAlert, 'danger'],
  ] as const

  function updateStatus(recordId: string, next: string) { setRecords((current) => current.map((record) => record.id === recordId ? { ...record, status: next, updated: 'Just now' } : record)); setMessage(`Provisioning status changed to ${next}.`) }
  function duplicate(record: (typeof initialRecords)[number]) { const copy = { ...record, id: `${record.id}-copy-${Date.now()}`, organisation: `${record.organisation} — Copy`, status: 'Draft', progress: 0, updated: 'Just now' }; setRecords((current) => [copy, ...current]); setMessage(`${record.organisation} setup was duplicated.`) }

  return <>
    <InternalPageHeader title="Client Provisioning" description="Configure and provision UNISON client organisations from one controlled internal workspace." actions={<Link href="/internal/provisioning/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white"><Plus className="size-4" />New Client Provisioning</Link>} />
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">{metrics.map(([label, value, detail, icon, tone]) => <InternalMetric key={label} label={label} value={value} detail={detail} icon={icon} tone={tone} />)}</section>
    <section className="mt-5 overflow-hidden rounded-xl border border-border bg-card"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div><h2 className="text-sm font-bold">Provisioning Register</h2><p className="mt-1 text-xs text-muted-foreground">Draft, active and completed client provisioning journeys.</p></div><div className="flex gap-2"><label className="relative"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search provisioning..." className="h-10 w-64 rounded-lg border border-border bg-background pr-3 pl-9 text-sm" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter provisioning status" className="h-10 rounded-lg border border-border bg-card px-3 text-xs font-semibold"><option>All statuses</option>{[...new Set(records.map((record) => record.status))].map((item) => <option key={item}>{item}</option>)}</select></div></header>{visible.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-left"><thead><tr className="bg-muted/35 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{['Organisation', 'Tier', 'Implementation Owner', 'Modules', 'Progress', 'Target Go-Live', 'Status', 'Last Updated', 'Actions'].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map((record) => <tr key={record.id} className="border-t border-border hover:bg-muted/20"><td className="px-4 py-4"><Link href={`/internal/provisioning/${record.id}`} className="text-sm font-bold hover:text-brand">{record.organisation}</Link></td><td className="px-4 py-4 text-xs">{record.tier}</td><td className="px-4 py-4 text-xs text-muted-foreground">{record.owner}</td><td className="px-4 py-4 text-xs font-semibold">{record.modules}</td><td className="px-4 py-4"><div className="flex min-w-32 items-center gap-2"><ProgressBar value={record.progress} /><span className="text-xs font-semibold">{record.progress}%</span></div></td><td className="px-4 py-4 text-xs">{record.goLive}</td><td className="px-4 py-4"><ProvisioningStatusBadge status={record.status} /></td><td className="px-4 py-4 text-xs text-muted-foreground">{record.updated}</td><td className="px-4 py-4"><RowActionMenu label={record.organisation} actions={[
          { id: 'continue', label: 'Continue Setup', onSelect: () => window.location.assign(`/internal/provisioning/${record.id}`) },
          { id: 'view', label: 'View', onSelect: () => setSelected(record) },
          { id: 'edit', label: 'Edit', onSelect: () => window.location.assign(`/internal/provisioning/${record.id}`) },
          { id: 'duplicate', label: 'Duplicate Setup', onSelect: () => duplicate(record) },
          record.status === 'Paused' ? { id: 'resume', label: 'Resume', onSelect: () => updateStatus(record.id, 'Configuration') } : { id: 'pause', label: 'Pause', onSelect: () => updateStatus(record.id, 'Paused') },
          { id: 'archive', label: 'Archive', tone: 'danger', onSelect: () => setArchive(record) },
        ]} /></td></tr>)}</tbody></table></div> : <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><Search className="size-8 text-muted-foreground" /><h3 className="mt-4 font-semibold">No matching provisionings</h3><p className="mt-1 text-sm text-muted-foreground">Change the search or status filter.</p></div>}<footer className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground"><span>{visible.length} provisioning records</span><span>No provisioning record is permanently deleted.</span></footer></section>
    {selected ? <ProvisioningDrawer record={selected} onClose={() => setSelected(null)} /> : null}
    <ConfirmationDialog open={Boolean(archive)} title="Archive provisioning setup?" description={`${archive?.organisation ?? 'This setup'} will move out of active internal views. It can be restored later.`} confirmLabel="Archive Setup" onCancel={() => setArchive(null)} onConfirm={() => { if (archive) updateStatus(archive.id, 'Archived'); setArchive(null) }} />
    {message ? <button type="button" role="status" onClick={() => setMessage('')} className="fixed right-6 bottom-6 z-[100] flex items-center gap-3 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-primary-foreground shadow-xl">{message}<X className="size-3.5" /></button> : null}
  </>
}

function ProvisioningDrawer({ record, onClose }: { record: (typeof initialRecords)[number]; onClose: () => void }) { return <div className="fixed inset-0 z-[90]" onMouseDown={onClose}><div className="absolute inset-0 bg-foreground/25" /><aside role="dialog" aria-modal="true" aria-labelledby="provisioning-detail-title" onMouseDown={(event) => event.stopPropagation()} className="absolute top-0 right-0 h-full w-full max-w-lg border-l border-border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-brand uppercase">Provisioning Detail</p><h2 id="provisioning-detail-title" className="mt-1 text-xl font-bold">{record.organisation}</h2><div className="mt-2"><ProvisioningStatusBadge status={record.status} /></div></div><button type="button" onClick={onClose} aria-label="Close provisioning detail"><X className="size-4" /></button></div><div className="mt-8 space-y-5">{[['Tier', record.tier], ['Implementation Owner', record.owner], ['Modules', record.modules], ['Progress', `${record.progress}%`], ['Target Go-Live', record.goLive], ['Last Updated', record.updated]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}</div><ProgressBar value={record.progress} className="mt-7" /><Link href={`/internal/provisioning/${record.id}`} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white">Continue Setup<ChevronRight className="size-4" /></Link></aside></div> }
