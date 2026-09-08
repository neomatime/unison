'use client'

import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { UnsavedForm } from '@/components/shared/unsaved-form'
import { getEntitledModuleIds, getTier, unisonTiers, type UnisonTierId } from '@/config/unison-tiers'
import { subscriptions, tenants } from '../data'
import { InternalPageHeader } from './internal-primitives'

export function InternalCreatePage({ kind }: { kind: 'support' | 'knowledge' }) {
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const support = kind === 'support'
  const backHref = support ? '/internal/support' : '/internal/knowledge'
  const title = support ? 'Create Support Ticket' : 'Create Knowledge Article'
  const description = support ? 'Capture an internal tenant or provisioning support request.' : 'Prepare internal operating guidance for HIMARK administrators.'

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    sessionStorage.setItem(`unison:internal:${kind}:draft`, JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))))
    window.setTimeout(() => { setSaving(false); setDone(true) }, 350)
  }

  return <>
    <InternalPageHeader title={title} description={description} />
    <Link href={backHref} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Back to {support ? 'Support Tickets' : 'Knowledge Base'}</Link>
    {done ? <section className="border border-success/25 bg-card p-10 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-4 font-brand text-xl font-medium tracking-[0.04em] uppercase">{support ? 'Ticket prepared' : 'Article prepared'}</h2><p className="mt-2 text-sm text-muted-foreground">The UI draft is stored for this browser session.</p><Link href={backHref} className="mt-6 inline-flex bg-brand px-5 py-2.5 text-sm font-medium text-white">Return to register</Link></section> : <UnsavedForm onSubmit={submit} className="border border-border bg-card">
      <header className="border-b border-border p-6"><p className="text-[0.625rem] font-medium tracking-[0.14em] text-brand uppercase">HIMARK Internal</p><h2 className="mt-2 font-brand text-lg font-medium tracking-[0.06em] uppercase">{support ? 'Ticket details' : 'Article details'}</h2></header>
      <div className="grid gap-5 p-6 lg:grid-cols-2 lg:p-8">
        <Field name={support ? 'subject' : 'title'} label={support ? 'Subject' : 'Title'} required />
        <Field name={support ? 'organisation' : 'category'} label={support ? 'Organisation' : 'Category'} required />
        {support ? <label className="text-sm font-medium">Priority<select name="priority" className="mt-2 h-11 w-full border border-border bg-background px-3"><option>Medium</option><option>Low</option><option>High</option><option>Critical</option></select></label> : null}
        <label className="text-sm font-medium lg:col-span-2">Description<textarea name="description" required rows={7} className="mt-2 w-full border border-border bg-background p-3 outline-none focus:border-brand" /></label>
      </div>
      <footer className="flex justify-end gap-2 border-t border-border p-5"><Link href={backHref} className="border border-border px-4 py-2 text-sm font-medium">Cancel</Link><button type="submit" disabled={saving} className="bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving…' : support ? 'Create Ticket' : 'Create Article'}</button></footer>
    </UnsavedForm>}
  </>
}

export function InternalTierChangePage({ source, recordId }: { source: 'tenants' | 'subscriptions'; recordId: string }) {
  const record = source === 'tenants' ? tenants.find((item) => item.id === recordId) : subscriptions.find((item) => item.id === recordId)
  const backHref = source === 'tenants' ? '/internal/tenants' : '/internal/subscriptions'
  const currentId = unisonTiers.find((tier) => tier.label === record?.tier)?.id ?? 'core'
  const [selected, setSelected] = useState<UnisonTierId>(currentId)
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  if (!record) return <><InternalPageHeader title="Tier change unavailable" description="The requested internal record could not be found." /><Link href={backHref} className="text-sm font-medium text-brand">Return to register</Link></>
  const currentModules = getEntitledModuleIds(currentId)
  const nextModules = getEntitledModuleIds(selected)
  const added = nextModules.filter((moduleId) => !currentModules.includes(moduleId))
  const removed = currentModules.filter((moduleId) => !nextModules.includes(moduleId))
  const labels = ['Current Tier', 'Select New Tier', 'Module Impact', 'Review']

  function confirm() {
    sessionStorage.setItem(`unison:internal:tier:${source}:${recordId}`, selected)
    setDone(true)
  }

  return <>
    <InternalPageHeader title="Change UNISON Tier" description={`Review entitlement impact for ${record.organisation}.`} />
    <Link href={backHref} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Back to {source === 'tenants' ? 'Tenants' : 'Subscriptions'}</Link>
    {done ? <section className="border border-success/25 bg-card p-10 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-4 font-brand text-xl font-medium tracking-[0.04em] uppercase">Tier change prepared</h2><p className="mt-2 text-sm text-muted-foreground">{record.organisation} is set to {getTier(selected).label} in this UI session.</p><Link href={backHref} className="mt-6 inline-flex bg-brand px-5 py-2.5 text-sm font-medium text-white">Return to register</Link></section> : <section className="border border-border bg-card">
      <header className="grid grid-cols-2 gap-2 border-b border-border p-6 lg:grid-cols-4">{labels.map((label, index) => <div key={label} className={`border-b-2 pb-2 text-xs font-medium ${index === step ? 'border-brand text-brand' : index < step ? 'border-success text-foreground' : 'border-border text-muted-foreground'}`}>{index + 1}. {label}</div>)}</header>
      <div className="min-h-[390px] p-6 lg:p-8">{step === 0 ? <div className="border border-border p-6"><p className="text-xs text-muted-foreground">Current Tier</p><p className="mt-2 font-brand text-lg font-medium tracking-[0.035em]">{record.tier}</p><p className="mt-2 text-sm text-muted-foreground">{currentModules.length} modules currently entitled.</p></div> : null}{step === 1 ? <div className="grid gap-3 sm:grid-cols-2">{unisonTiers.map((tier) => <button type="button" onClick={() => setSelected(tier.id)} key={tier.id} className={`border p-5 text-left hover:border-brand/40 ${selected === tier.id ? 'border-brand bg-brand-soft/30' : 'border-border'}`}><div className="flex justify-between"><p className="font-brand font-medium tracking-[0.035em]">{tier.label}</p>{selected === tier.id ? <Check className="size-4 text-brand" /> : null}</div><p className="mt-2 text-xs text-muted-foreground">{tier.moduleIds.length} modules · {tier.includedGroups.length} groups</p></button>)}</div> : null}{step === 2 ? <div className="grid gap-4 sm:grid-cols-2"><Impact title="Modules becoming available" modules={added} tone="success" /><Impact title="Modules being disabled" modules={removed} tone="warning" /><div className="flex gap-3 border border-warning/25 bg-warning-soft p-4 text-sm text-warning sm:col-span-2"><AlertTriangle className="size-4 shrink-0" />Data is not deleted when a module is disabled. It remains preserved for reactivation.</div></div> : null}{step === 3 ? <div className="space-y-4"><div className="flex items-center justify-between border border-border p-6"><div><p className="text-xs text-muted-foreground">Current Tier</p><p className="mt-1 font-medium">{record.tier}</p></div><ChevronRight className="size-5 text-muted-foreground" /><div className="text-right"><p className="text-xs text-muted-foreground">New Tier</p><p className="mt-1 font-medium text-brand">{getTier(selected).label}</p></div></div><div className="border border-border bg-muted/40 p-5 text-sm text-muted-foreground">{nextModules.length} modules will be entitled. {added.length} become available and {removed.length} will be hidden.</div></div> : null}</div>
      <footer className="flex justify-between border-t border-border p-5"><button type="button" onClick={step ? () => setStep((value) => value - 1) : undefined} disabled={!step} className="inline-flex h-10 items-center gap-2 border border-border px-4 text-sm font-medium disabled:opacity-40"><ChevronLeft className="size-4" />Back</button>{step < 3 ? <button type="button" onClick={() => setStep((value) => value + 1)} className="inline-flex h-10 items-center gap-2 bg-brand px-4 text-sm font-medium text-white">Continue<ChevronRight className="size-4" /></button> : <button type="button" onClick={confirm} className="h-10 bg-brand px-4 text-sm font-medium text-white">Confirm Tier Change</button>}</footer>
    </section>}
  </>
}

function Field({ name, label, required }: { name: string; label: string; required?: boolean }) { return <label className="text-sm font-medium">{label}<input name={name} required={required} className="mt-2 h-11 w-full border border-border bg-background px-3 outline-none focus:border-brand" /></label> }
function Impact({ title, modules, tone }: { title: string; modules: string[]; tone: 'success' | 'warning' }) { return <div className="border border-border p-5"><h3 className="font-brand text-sm font-medium tracking-[0.05em]">{title}</h3><div className="mt-4 space-y-2">{modules.length ? modules.map((moduleId) => <div key={moduleId} className="flex items-center gap-2 text-xs"><span className={`size-2 rounded-full ${tone === 'success' ? 'bg-success' : 'bg-warning'}`} />{moduleId}</div>) : <p className="text-xs text-muted-foreground">No module changes in this direction.</p>}</div></div> }
