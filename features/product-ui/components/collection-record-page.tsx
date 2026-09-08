'use client'

import { ArrowRight, Pencil } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { WorkPage } from '@/components/shared/work-page'
import { UnsavedForm } from '@/components/shared/unsaved-form'
import { FormFooter, FormSection } from '@/components/ui/form-layout'
import { useShellContext } from '@/components/layout/shell-context'
import { HealthBadge } from '@/features/delivery/components/delivery-primitives'
import { collectionRoute, collectionStorageKey, type CollectionRoutePayload } from '../collection-route-storage'
import type { CollectionField, CollectionRecord } from './record-collection-workspace'

const fallbackFields: CollectionField[] = [
  { id: 'name', label: 'Name', required: true },
  { id: 'context', label: 'Description / context', type: 'textarea', required: true },
  { id: 'owner', label: 'Owner' },
  { id: 'status', label: 'Status', type: 'select', options: ['Draft', 'In Progress', 'Under Review', 'Approved', 'Complete'] },
]

export function CollectionRecordPage({ slug, recordId, mode }: { slug: string; recordId?: string; mode: 'create' | 'view' | 'edit' }) {
  const router = useRouter()
  const { organization } = useShellContext()
  const [payload, setPayload] = useState<CollectionRoutePayload | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    const raw = window.sessionStorage.getItem(collectionStorageKey(organization.id, slug))
    if (!raw) { setMissing(true); return }
    try { setPayload(JSON.parse(raw) as CollectionRoutePayload) } catch { setMissing(true) }
  }, [organization.id, slug])

  const record = useMemo(() => payload?.records.find((item) => item.id === recordId), [payload, recordId])
  if (missing) return <WorkPage title="Record unavailable" parent={{ label: 'previous workspace', href: '/' }}><p className="border border-border bg-card p-6 text-sm text-muted-foreground">Open this record from its register so UNISON can restore its workspace context.</p></WorkPage>
  if (!payload) return <div aria-label="Loading record workspace" className="h-72 animate-pulse border border-border bg-card" />
  if (mode !== 'create' && !record) return <WorkPage title="Record not found" parent={{ label: payload.title, href: payload.returnHref }}><p className="border border-border bg-card p-6 text-sm text-muted-foreground">This record is no longer available in the current workspace.</p></WorkPage>

  const title = mode === 'create' ? `New ${payload.singular}` : mode === 'edit' ? `Edit ${record?.name}` : String(record?.name)
  const description = mode === 'view' ? record?.context : mode === 'create' ? `Create a ${payload.singular.toLowerCase()} in ${payload.title}.` : `Update this ${payload.singular.toLowerCase()} record.`
  const parent = { label: payload.title, href: payload.returnHref }

  if (mode === 'view' && record) return <WorkPage title={title} description={description} parent={parent}>
    <div className="flex justify-end"><Link href={collectionRoute(slug, record.id, true)} className="inline-flex h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-brand-foreground"><Pencil className="size-4" />Edit {payload.singular.toLowerCase()}</Link></div>
    <section className="border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-6 py-4"><h2 className="unison-section-title text-sm">Overview</h2><HealthBadge>{record.status}</HealthBadge></header>
      <dl className="grid gap-px bg-border sm:grid-cols-2">{Object.entries(record).filter(([key]) => !['archived'].includes(key)).map(([key, value]) => <div key={key} className="bg-card p-5"><dt className="unison-metric-label text-[0.65rem] text-muted-foreground">{key.replace(/([A-Z])/g, ' $1')}</dt><dd className="mt-2 text-sm font-medium">{String(value ?? '—')}</dd></div>)}</dl>
    </section>
  </WorkPage>

  const fields = payload.fields.length ? payload.fields : fallbackFields
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!payload) return
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    const id = record?.id ?? `${payload.singular.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`
    const next: CollectionRecord = { id, name: values.name, context: values.context || values.description || 'No additional context', owner: values.owner || 'Unassigned', status: values.status || 'Draft', updated: 'Just now', ...values }
    const records = record ? payload.records.map((item) => item.id === record.id ? next : item) : [next, ...payload.records]
    window.sessionStorage.setItem(collectionStorageKey(organization.id, slug), JSON.stringify({ ...payload, records }))
    router.push(collectionRoute(slug, id))
  }

  return <WorkPage title={title} description={description} parent={parent} guidance={<><p className="font-medium text-foreground">Complete the record</p><p className="mt-2">Required fields, ownership and status should be reviewed before saving.</p></>}>
    <UnsavedForm onSubmit={submit}>
      <FormSection title={`${payload.singular} details`} description={`Information used throughout the ${payload.title.toLowerCase()} workspace.`}>
        {fields.map((field) => <CollectionFieldInput key={field.id} field={field} value={record?.[field.id]} />)}
      </FormSection>
      <FormFooter cancelHref={record ? collectionRoute(slug, record.id) : payload.returnHref} submitLabel={mode === 'create' ? `Create ${payload.singular}` : 'Save changes'} note="Changes are stored in this browser workspace." />
    </UnsavedForm>
  </WorkPage>
}

function CollectionFieldInput({ field, value }: { field: CollectionField; value?: string | boolean }) {
  const classes = 'mt-1.5 min-h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10'
  return <label className={field.type === 'textarea' ? 'md:col-span-2' : ''}><span className="text-sm font-medium">{field.label}{field.required ? <span className="text-destructive"> *</span> : null}</span>{field.type === 'textarea' ? <textarea name={field.id} defaultValue={String(value ?? '')} required={field.required} rows={5} className={`${classes} py-3`} /> : field.type === 'select' ? <select name={field.id} defaultValue={String(value ?? field.options?.[0] ?? '')} className={classes}>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input name={field.id} type={field.type ?? 'text'} defaultValue={String(value ?? '')} required={field.required} placeholder={field.placeholder} className={classes} />}</label>
}
