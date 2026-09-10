'use client'

import { AlertTriangle, CheckCircle2, ChevronRight, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useShellContext } from '@/components/layout/shell-context'
import { UnsavedForm } from '@/components/shared/unsaved-form'
import { WorkPage } from '@/components/shared/work-page'
import { collectionStorageKey, type CollectionRoutePayload } from '../collection-route-storage'
import type { PortableCollection } from '@/features/data-portability/portable-collections'

function usePayload(slug: string) {
  const { organization } = useShellContext()
  const [payload, setPayload] = useState<CollectionRoutePayload>()
  useEffect(() => { const raw = sessionStorage.getItem(collectionStorageKey(organization.id, slug)); if (raw) { try { setPayload(JSON.parse(raw) as CollectionRoutePayload) } catch { /* stale UI draft */ } } }, [organization.id, slug])
  return { organization, payload }
}

export function CollectionActionPage({ slug, action, record }: { slug: string; action: string; record: string }) {
  const router = useRouter()
  const { organization, payload } = usePayload(slug)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const needsOwner = /assign|reassign|delegate|move/i.test(action)
  const needsOutcome = /status|complete|close|resolve|mitigate|escalate|pause|resume|publish|submit|approve|reject/i.test(action)
  if (!payload) return <WorkPage title="Record action unavailable" description="Return to the register and choose the action again." parent={{ label: 'Back', href: '/' }}><section className="border border-border bg-card p-8 text-sm text-muted-foreground">No active register context is available in this browser session.</section></WorkPage>
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); sessionStorage.setItem(`unison:collection-action:${organization.id}:${slug}`, JSON.stringify({ action, record, values: Object.fromEntries(new FormData(event.currentTarget)) })); window.setTimeout(() => { setSaving(false); setDone(true) }, 350) }
  return <WorkPage category={payload.title} title={action} description={`Complete this governed action for ${record}.`} parent={{ label: payload.title, href: payload.returnHref }} guidance={<><p className="font-semibold text-foreground">Record history</p><p className="mt-2">Provide enough context for other workspace members to understand the action later.</p></>}>
    {done ? <section className="border border-success/25 bg-card p-10 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-4 text-xl font-semibold">Action prepared</h2><button type="button" onClick={() => router.push(payload.returnHref)} className="mt-6 bg-brand px-5 py-2.5 text-sm font-semibold text-white">Return to register</button></section> : <UnsavedForm onSubmit={submit} className="border border-border bg-card"><header className="border-b border-border p-6"><p className="text-xs tracking-[0.16em] text-brand uppercase">{payload.singular} action</p><h2 className="mt-2 text-lg font-semibold">{record}</h2></header><div className="space-y-5 p-6 lg:p-8">{needsOwner ? <label className="block text-sm font-medium">Assignee / destination<select name="destination" required className="mt-2 h-11 w-full border border-border bg-background px-3"><option>Neo Morake</option><option>Amara Dlamini</option><option>Transformation Portfolio</option><option>Claims Modernisation Programme</option></select></label> : null}{needsOutcome ? <label className="block text-sm font-medium">Outcome<select name="outcome" required className="mt-2 h-11 w-full border border-border bg-background px-3"><option>Confirm {action.toLowerCase()}</option><option>Save as draft</option><option>Request review</option></select></label> : null}<label className="block text-sm font-medium">Comment<textarea name="comment" rows={5} className="mt-2 w-full border border-border bg-background p-3" /></label></div><footer className="flex justify-end gap-2 border-t border-border p-5"><button type="button" onClick={() => router.back()} className="border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="submit" disabled={saving} className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Confirm action'}</button></footer></UnsavedForm>}
  </WorkPage>
}

export function CollectionImportPage({ slug, portableCollection, title, returnHref }: { slug: string; portableCollection?: PortableCollection; title?: string; returnHref?: string }) {
  const router = useRouter()
  const { payload: storedPayload } = usePayload(slug)
  const payload = storedPayload ?? (portableCollection && title && returnHref ? {
    title, singular: title, description: `Import ${title.toLowerCase()}.`, fields: [], records: [], returnHref, portableCollection,
  } : undefined)
  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<{
    fileName: string; collection: string; rowCount: number; validCount: number; skippedCount: number;
    headers: string[]; requiredColumns: string[]; preview: Record<string, unknown>[];
    issues: Array<{ row: number; field?: string; message: string }>; fatal: boolean; importedCount?: number;
  } | null>(null)
  const labels = ['Upload', 'Map fields', 'Validate', 'Review']
  if (!payload) return <WorkPage title="Import unavailable" description="Return to the register and start the import again." parent={{ label: 'Back', href: '/' }}><section className="border border-border bg-card p-8 text-sm text-muted-foreground">No active register context is available in this browser session.</section></WorkPage>
  if (!payload.portableCollection) return <WorkPage title="Import unavailable" description="This register does not expose a persistent import target." parent={{ label: payload.title, href: payload.returnHref }}><section className="border border-border bg-card p-8 text-sm text-muted-foreground">Choose Import from a persistent register.</section></WorkPage>

  async function send(selectedFile: File, commit: boolean) {
    setBusy(true)
    setError('')
    const body = new FormData()
    body.set('collection', payload!.portableCollection!)
    body.set('file', selectedFile)
    body.set('commit', String(commit))
    try {
      const response = await fetch('/api/records/import', { method: 'POST', body })
      const result = await response.json() as typeof summary & { message?: string }
      if (!response.ok) throw new Error(result?.message ?? 'The file could not be imported.')
      setSummary(result)
      if (commit) setDone(true)
      else setStep(1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The file could not be imported.')
    } finally {
      setBusy(false)
    }
  }

  function choose(selected: File | undefined) {
    if (!selected) return
    setFile(selected)
    setSummary(null)
    setDone(false)
    void send(selected, false)
  }

  if (done) return <WorkPage category={payload.title} title={`Import ${payload.title}`} description="The validated records are now available to your organization." parent={{ label: payload.title, href: payload.returnHref }}><section className="border border-success/25 bg-card p-10 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-4 text-xl font-semibold">Import complete</h2><p className="mt-2 text-sm text-muted-foreground">{summary?.importedCount ?? summary?.validCount ?? 0} records were added from {summary?.fileName}.</p><button type="button" onClick={() => { router.push(payload.returnHref); router.refresh() }} className="mt-6 bg-brand px-5 py-2.5 text-sm font-semibold text-white">Return to register</button></section></WorkPage>

  return <WorkPage category={payload.title} title={`Import ${payload.title}`} description="Upload, map and validate records before adding them." parent={{ label: payload.title, href: payload.returnHref }}>
    <section className="border border-border bg-card"><header className="grid grid-cols-4 gap-2 border-b border-border p-6">{labels.map((label, index) => <div key={label} className={`border-b-2 pb-2 text-xs font-semibold ${index === step ? 'border-brand text-brand' : index < step ? 'border-success text-success' : 'border-border text-muted-foreground'}`}>{index + 1}. {label}</div>)}</header><div className="min-h-[420px] p-6 lg:p-8">
      {step === 0 ? <label className="block cursor-pointer border-2 border-dashed border-border p-12 text-center hover:bg-muted/20"><Upload className="mx-auto size-7 text-muted-foreground" /><h2 className="mt-3 font-semibold">Choose a CSV or XLSX file</h2><p className="mt-1 text-xs text-muted-foreground">Up to 5,000 records · Maximum 10 MB · First row must contain headers</p><span className="mt-5 inline-flex border border-border px-4 py-2 text-sm font-semibold">{busy ? <><LoaderCircle className="mr-2 size-4 animate-spin" />Reading file…</> : 'Choose file'}</span><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => choose(event.target.files?.[0])} className="sr-only" /></label> : null}
      {step === 1 && summary ? <div><div className="flex items-center gap-3 border border-border p-4"><FileSpreadsheet className="size-5 text-brand" /><div><p className="text-sm font-semibold">{summary.fileName}</p><p className="text-xs text-muted-foreground">{summary.rowCount} rows · {summary.headers.length} detected columns</p></div></div><h2 className="mt-6 text-sm font-semibold">Automatic field mapping</h2><p className="mt-1 text-xs text-muted-foreground">Headers are matched by field name. Required columns are highlighted.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{summary.headers.map((header) => <div key={header} className="flex items-center gap-3 border border-border px-3 py-2 text-sm"><span className="flex-1">{header}</span><ChevronRight className="size-3.5 text-muted-foreground" /><span className="text-xs text-success">Detected</span></div>)}</div><p className="mt-5 text-xs text-muted-foreground">Required: {summary.requiredColumns.join(', ')}</p></div> : null}
      {step === 2 && summary ? <div><div className="grid gap-3 sm:grid-cols-3"><div className="border border-border p-4"><p className="text-2xl font-semibold">{summary.rowCount}</p><p className="text-xs text-muted-foreground">Rows read</p></div><div className="border border-success/25 p-4"><p className="text-2xl font-semibold text-success">{summary.validCount}</p><p className="text-xs text-muted-foreground">Valid rows</p></div><div className="border border-warning/25 p-4"><p className="text-2xl font-semibold text-warning">{summary.skippedCount}</p><p className="text-xs text-muted-foreground">Rows skipped</p></div></div>{summary.issues.length ? <div className="mt-5 max-h-64 overflow-y-auto border border-border"><h2 className="sticky top-0 bg-card px-4 py-3 text-sm font-semibold">Validation issues</h2>{summary.issues.map((issue, index) => <div key={`${issue.row}-${issue.field}-${index}`} className="flex gap-3 border-t border-border px-4 py-3 text-xs"><AlertTriangle className="size-4 shrink-0 text-warning" /><span>Row {issue.row}{issue.field ? ` · ${issue.field}` : ''}: {issue.message}</span></div>)}</div> : <div className="mt-5 flex items-center gap-3 border border-success/25 bg-success-soft p-4"><CheckCircle2 className="size-5 text-success" /><p className="text-sm font-semibold">Every row passed structural validation.</p></div>}</div> : null}
      {step === 3 && summary ? <div><div className={`flex items-center gap-3 border p-5 ${summary.fatal || !summary.validCount ? 'border-destructive/25' : 'border-success/25'}`}>{summary.fatal || !summary.validCount ? <AlertTriangle className="size-6 text-destructive" /> : <CheckCircle2 className="size-6 text-success" />}<div><h2 className="font-semibold">{summary.fatal || !summary.validCount ? 'Import cannot continue' : 'Ready to import'}</h2><p className="text-sm text-muted-foreground">{summary.validCount} valid records will be added to {summary.collection}. {summary.skippedCount ? `${summary.skippedCount} invalid rows will be skipped.` : 'No rows will be skipped.'}</p></div></div>{summary.preview.length ? <div className="mt-5 overflow-x-auto border border-border"><table className="w-full min-w-[640px] text-left text-xs"><thead><tr className="bg-muted/40">{Object.keys(summary.preview[0]).slice(0, 6).map((key) => <th key={key} className="px-3 py-2 font-semibold">{key.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{summary.preview.map((row, index) => <tr key={index} className="border-t border-border">{Object.keys(summary.preview[0]).slice(0, 6).map((key) => <td key={key} className="max-w-48 truncate px-3 py-2 text-muted-foreground">{String(row[key] ?? '—')}</td>)}</tr>)}</tbody></table></div> : null}</div> : null}
      {error ? <p role="alert" className="mt-5 border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">{error}</p> : null}
    </div><footer className="flex justify-between border-t border-border p-5"><button type="button" disabled={busy} onClick={step ? () => setStep((value) => value - 1) : () => router.back()} className="border border-border px-4 py-2 text-sm font-medium disabled:opacity-50">{step ? 'Back' : 'Cancel'}</button>{step > 0 ? <button type="button" disabled={busy || (step === 3 && (!file || summary?.fatal || !summary?.validCount))} onClick={step === 3 ? () => file && void send(file, true) : () => setStep((value) => value + 1)} className="inline-flex items-center bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}{step === 3 ? busy ? 'Importing…' : 'Complete import' : 'Continue'}</button> : null}</footer></section>
  </WorkPage>
}
