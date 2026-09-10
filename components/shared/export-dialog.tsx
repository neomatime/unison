'use client'

import { CheckCircle2, Download, FileSpreadsheet, FileText, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { PortableCollection } from '@/features/data-portability/portable-collections'

type ExportScope = 'view' | 'selected' | 'all'
type ExportFormat = 'CSV' | 'XLSX' | 'PDF'

export function ExportDialog({ open, title, collection, visibleIds, selectedIds, allowPdf = true, onClose }: { open: boolean; title: string; collection: PortableCollection; visibleIds: string[]; selectedIds: string[]; allowPdf?: boolean; onClose: () => void }) {
  const selectedCount = selectedIds.length
  const [scope, setScope] = useState<ExportScope>(selectedCount ? 'selected' : 'view')
  const [format, setFormat] = useState<ExportFormat>('XLSX')
  const [status, setStatus] = useState<'idle' | 'preparing' | 'ready' | 'error'>('idle')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl) }, [downloadUrl])
  if (!open) return null

  const prepare = async () => {
    setStatus('preparing')
    setMessage('')
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    const ids = scope === 'selected' ? selectedIds : scope === 'view' ? visibleIds : []
    const params = new URLSearchParams({ collection, format: format.toLowerCase() })
    if (ids.length) params.set('ids', ids.join(','))
    try {
      const response = await fetch(`/api/records/export?${params}`, { cache: 'no-store' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string }
        throw new Error(body.message ?? 'The export could not be prepared.')
      }
      setDownloadUrl(URL.createObjectURL(await response.blob()))
      setStatus('ready')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The export could not be prepared.')
      setStatus('error')
    }
  }

  const close = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    setDownloadUrl('')
    setStatus('idle')
    setMessage('')
    onClose()
  }

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/30 p-4" onMouseDown={close}>
    <section role="dialog" aria-modal="true" aria-labelledby="export-title" onMouseDown={(event) => event.stopPropagation()} className="unison-dialog-enter w-full max-w-lg rounded-none border border-border bg-card shadow-2xl">
      <header className="flex items-start justify-between border-b border-border p-6"><div><p className="unison-metric-label text-xs text-brand">Export</p><h2 id="export-title" className="unison-section-title mt-1 text-sm">Export {title}</h2><p className="mt-1 text-sm text-muted-foreground">Choose which records and format to prepare.</p></div><button type="button" onClick={close} aria-label="Close export" className="p-2 transition-colors hover:bg-muted"><X className="size-4" /></button></header>
      {status === 'ready' ? <div className="p-8 text-center"><span className="mx-auto flex size-12 items-center justify-center border border-success/20 bg-success-soft text-success"><CheckCircle2 className="size-6" /></span><h3 className="mt-4 font-medium">Export ready</h3><p className="mt-1 text-sm text-muted-foreground">Your {format} export contains real data from the active organization.</p><div className="mt-6 flex justify-center gap-2"><button type="button" onClick={() => setStatus('idle')} className="rounded-none border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Prepare another</button><a href={downloadUrl} download={`unison-${collection}.${format.toLowerCase()}`} onClick={() => window.setTimeout(close, 250)} className="inline-flex items-center gap-2 rounded-none bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"><Download className="size-4" />Download</a></div></div> : <div className="space-y-6 p-6">
        <fieldset><legend className="text-sm font-semibold">Records</legend><div className="mt-3 grid gap-2 sm:grid-cols-3">{[
          ['view','Current view','Filters applied'],
          ['selected','Selected',selectedCount ? `${selectedCount} records` : 'None selected'],
          ['all','All records','Complete register'],
        ].map(([value,label,detail]) => <label key={value} className={`rounded-none border p-3 transition-colors ${scope === value ? 'border-brand bg-brand-soft' : 'border-border'} ${value === 'selected' && !selectedCount ? 'opacity-50' : 'cursor-pointer hover:bg-muted/40'}`}><input type="radio" name="export-scope" value={value} checked={scope === value} disabled={value === 'selected' && !selectedCount} onChange={() => setScope(value as ExportScope)} className="sr-only" /><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></label>)}</div></fieldset>
        <fieldset><legend className="text-sm font-medium">Format</legend><div className="mt-3 grid grid-cols-3 gap-2">{(['CSV','XLSX',...(allowPdf ? ['PDF'] : [])] as ExportFormat[]).map((value) => <button key={value} type="button" onClick={() => setFormat(value)} className={`flex items-center justify-center gap-2 rounded-none border px-3 py-3 text-sm font-medium transition-colors ${format === value ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-muted/40'}`}>{value === 'PDF' ? <FileText className="size-4" /> : <FileSpreadsheet className="size-4" />}{value}</button>)}</div></fieldset>
      </div>}
      {status === 'error' ? <p role="alert" className="border-t border-destructive/20 bg-destructive/5 px-6 py-3 text-sm text-destructive">{message}</p> : null}
      {status !== 'ready' ? <footer className="flex justify-end gap-2 border-t border-border p-5"><button type="button" onClick={close} className="rounded-none border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancel</button><button type="button" disabled={status === 'preparing'} onClick={prepare} className="inline-flex items-center gap-2 rounded-none bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-60"><Download className="size-4" />{status === 'preparing' ? 'Preparing…' : 'Prepare export'}</button></footer> : null}
    </section>
  </div>
}
