'use client'

import { CheckCircle2, Download, FileSpreadsheet, FileText, X } from 'lucide-react'
import { useState } from 'react'

type ExportScope = 'view' | 'selected' | 'all'
type ExportFormat = 'CSV' | 'XLSX' | 'PDF'

export function ExportDialog({ open, title, selectedCount = 0, allowPdf = true, onClose }: { open: boolean; title: string; selectedCount?: number; allowPdf?: boolean; onClose: () => void }) {
  const [scope, setScope] = useState<ExportScope>(selectedCount ? 'selected' : 'view')
  const [format, setFormat] = useState<ExportFormat>('XLSX')
  const [status, setStatus] = useState<'idle' | 'preparing' | 'ready'>('idle')
  if (!open) return null

  const prepare = () => {
    setStatus('preparing')
    window.setTimeout(() => setStatus('ready'), 700)
  }

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/30 p-4" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="export-title" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
      <header className="flex items-start justify-between border-b border-border p-6"><div><p className="text-xs font-semibold tracking-wide text-brand uppercase">Export</p><h2 id="export-title" className="mt-1 text-lg font-bold">Export {title}</h2><p className="mt-1 text-sm text-muted-foreground">Choose which records and format to prepare.</p></div><button type="button" onClick={onClose} aria-label="Close export" className="rounded-lg p-2 hover:bg-muted"><X className="size-4" /></button></header>
      {status === 'ready' ? <div className="p-8 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success"><CheckCircle2 className="size-6" /></span><h3 className="mt-4 font-semibold">Export ready</h3><p className="mt-1 text-sm text-muted-foreground">Your {format} export has been prepared for download.</p><div className="mt-6 flex justify-center gap-2"><button type="button" onClick={() => setStatus('idle')} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Prepare another</button><button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"><Download className="size-4" />Download</button></div></div> : <div className="space-y-6 p-6">
        <fieldset><legend className="text-sm font-semibold">Records</legend><div className="mt-3 grid gap-2 sm:grid-cols-3">{[
          ['view','Current view','Filters applied'],
          ['selected','Selected',selectedCount ? `${selectedCount} records` : 'None selected'],
          ['all','All records','Complete register'],
        ].map(([value,label,detail]) => <label key={value} className={`rounded-xl border p-3 ${scope === value ? 'border-brand bg-brand-soft' : 'border-border'} ${value === 'selected' && !selectedCount ? 'opacity-50' : 'cursor-pointer'}`}><input type="radio" name="export-scope" value={value} checked={scope === value} disabled={value === 'selected' && !selectedCount} onChange={() => setScope(value as ExportScope)} className="sr-only" /><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></label>)}</div></fieldset>
        <fieldset><legend className="text-sm font-semibold">Format</legend><div className="mt-3 grid grid-cols-3 gap-2">{(['CSV','XLSX',...(allowPdf ? ['PDF'] : [])] as ExportFormat[]).map((value) => <button key={value} type="button" onClick={() => setFormat(value)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold ${format === value ? 'border-brand bg-brand-soft text-brand' : 'border-border'}`}>{value === 'PDF' ? <FileText className="size-4" /> : <FileSpreadsheet className="size-4" />}{value}</button>)}</div></fieldset>
      </div>}
      {status !== 'ready' ? <footer className="flex justify-end gap-2 border-t border-border p-5"><button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="button" disabled={status === 'preparing'} onClick={prepare} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Download className="size-4" />{status === 'preparing' ? 'Preparing…' : 'Prepare export'}</button></footer> : null}
    </section>
  </div>
}
