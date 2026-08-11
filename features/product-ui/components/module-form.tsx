'use client'

import { ArrowLeft, Check, Info } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { moduleFixtures } from '../mocks/modules'
import type { FieldDefinition, ModuleDefinition } from '../types'

export function ModuleForm({ module, mode, recordId }: { module: ModuleDefinition; mode: 'create' | 'edit'; recordId?: string }) {
  const router = useRouter()
  const record = moduleFixtures[module.id]?.find((item) => item.id === recordId)
  const [saved, setSaved] = useState(false)
  const sections = [...new Set(module.fields.map((field) => field.section))]

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaved(true)
    window.setTimeout(() => {
      window.dispatchEvent(new Event('unison:navigation-start'))
      router.push(record ? `${module.route}/${record.id}` : `${module.route}/${moduleFixtures[module.id]?.[0]?.id ?? 'new-record'}`)
    }, 850)
  }

  return <>
    <WorkspaceHeader category={module.category} title={`${mode === 'create' ? 'Create' : 'Edit'} ${module.singular}`} />
    <Link href={record ? `${module.route}/${record.id}` : module.route} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to {record ? record.name : module.label}</Link>
    <form onSubmit={submit} className="mx-auto max-w-5xl space-y-5">
      {sections.map((section) => <section key={section} className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]"><div className="mb-5"><h2 className="font-semibold text-foreground">{section}</h2><p className="mt-1 text-sm text-muted-foreground">Provide the information used across the {module.label.toLowerCase()} workspace.</p></div><div className="grid gap-5 md:grid-cols-2">{module.fields.filter((field) => field.section === section).map((field) => <Field key={field.name} field={field} value={record?.[field.name] ?? (field.name === 'name' ? record?.name : '')} />)}</div></section>)}
      <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-border bg-card/95 px-5 py-4 shadow-xl backdrop-blur"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Info className="size-4" />Changes are stored only in this browser demo.</p><div className="flex gap-2"><Link href={record ? `${module.route}/${record.id}` : module.route} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</Link><button type="submit" className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-primary-foreground">{mode === 'create' ? `Create ${module.singular}` : 'Save Changes'}</button></div></div>
    </form>
    {saved ? <div role="status" className="fixed right-6 bottom-6 flex items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-medium text-primary-foreground shadow-xl"><Check className="size-4 text-brand" />Saved successfully</div> : null}
  </>
}

function Field({ field, value }: { field: FieldDefinition; value?: string }) {
  const shared = 'mt-1.5 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20'
  return <label className={field.type === 'textarea' ? 'md:col-span-2' : ''}><span className="text-sm font-medium text-foreground">{field.label}{field.required ? <span className="text-destructive"> *</span> : null}</span>{field.type === 'textarea' ? <textarea defaultValue={value} placeholder={field.placeholder} rows={5} className={`${shared} py-3`} /> : field.type === 'select' ? <select defaultValue={value} className={shared}><option value="">Select {field.label.toLowerCase()}</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input type={field.type ?? 'text'} defaultValue={value} placeholder={field.placeholder} required={field.required} className={shared} />}</label>
}
