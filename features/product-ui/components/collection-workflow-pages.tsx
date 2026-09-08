'use client'

import { CheckCircle2, ChevronRight, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useShellContext } from '@/components/layout/shell-context'
import { UnsavedForm } from '@/components/shared/unsaved-form'
import { WorkPage } from '@/components/shared/work-page'
import { collectionStorageKey, type CollectionRoutePayload } from '../collection-route-storage'

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

export function CollectionImportPage({ slug }: { slug: string }) {
  const router = useRouter()
  const { payload } = usePayload(slug)
  const [step, setStep] = useState(0)
  const labels = ['Upload', 'Map fields', 'Validate', 'Review']
  if (!payload) return <WorkPage title="Import unavailable" description="Return to the register and start the import again." parent={{ label: 'Back', href: '/' }}><section className="border border-border bg-card p-8 text-sm text-muted-foreground">No active register context is available in this browser session.</section></WorkPage>
  return <WorkPage category={payload.title} title={`Import ${payload.title}`} description="Upload, map and validate records before adding them." parent={{ label: payload.title, href: payload.returnHref }}>
    <section className="border border-border bg-card"><header className="grid grid-cols-4 gap-2 border-b border-border p-6">{labels.map((label, index) => <div key={label} className={`border-b-2 pb-2 text-xs font-semibold ${index === step ? 'border-brand text-brand' : index < step ? 'border-success text-success' : 'border-border text-muted-foreground'}`}>{index + 1}. {label}</div>)}</header><div className="min-h-[420px] p-6 lg:p-8">{step === 0 ? <div className="border-2 border-dashed border-border p-12 text-center"><Upload className="mx-auto size-7 text-muted-foreground" /><h2 className="mt-3 font-semibold">Drop a CSV or XLSX file here</h2><p className="mt-1 text-xs text-muted-foreground">Up to 5,000 records · Maximum 10 MB</p><button type="button" onClick={() => setStep(1)} className="mt-5 border border-border px-4 py-2 text-sm font-semibold">Choose file</button></div> : step === 1 ? <div className="space-y-3">{payload.fields.map((field) => <div key={field.id} className="grid grid-cols-[1fr_40px_1fr] items-center gap-3"><span className="bg-muted px-3 py-2 text-sm">{field.label}</span><ChevronRight className="size-4 text-muted-foreground" /><select className="h-10 border border-border bg-card px-3 text-sm"><option>{field.label}</option><option>Do not import</option></select></div>)}</div> : step === 2 ? <div className="space-y-3">{[['126', 'Valid rows', 'success'], ['4', 'Missing required values', 'warning'], ['2', 'Possible duplicates', 'warning']].map(([value, label, tone]) => <div key={label} className="flex items-center gap-3 border border-border p-4"><span className={tone === 'success' ? 'text-success' : 'text-warning'}>{value}</span><span className="text-sm font-medium">{label}</span></div>)}</div> : <div className="border border-border p-6"><div className="flex items-center gap-3"><CheckCircle2 className="size-6 text-success" /><div><h2 className="font-semibold">Ready to import</h2><p className="text-sm text-muted-foreground">126 valid records will be added. Six flagged rows will be skipped.</p></div></div></div>}</div><footer className="flex justify-between border-t border-border p-5"><button type="button" onClick={step ? () => setStep((value) => value - 1) : () => router.back()} className="border border-border px-4 py-2 text-sm font-medium">{step ? 'Back' : 'Cancel'}</button><button type="button" onClick={step === 3 ? () => router.push(payload.returnHref) : () => setStep((value) => value + 1)} className="bg-brand px-4 py-2 text-sm font-semibold text-white">{step === 3 ? 'Complete import' : 'Continue'}</button></footer></section>
  </WorkPage>
}
