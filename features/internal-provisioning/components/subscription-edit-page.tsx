'use client'

import { CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { UnsavedForm } from '@/components/shared/unsaved-form'
import { unisonTiers } from '@/config/unison-tiers'
import { InternalPageHeader } from './internal-primitives'

type Subscription = { id: string; organisation: string; tier: string; status: string; start: string; renewal: string; cycle: string; seats: string }

export function SubscriptionEditPage({ subscription }: { subscription: Subscription }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    sessionStorage.setItem(`unison:internal-subscription:${subscription.id}`, JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))))
    window.setTimeout(() => { setSaving(false); setDone(true) }, 350)
  }
  return <><InternalPageHeader title="Update Subscription" description={`Review tier, dates, billing cycle and configured seats for ${subscription.organisation}.`} />{done ? <section className="border border-success/25 bg-card p-10 text-center"><CheckCircle2 className="mx-auto size-10 text-success" /><h2 className="mt-4 font-brand text-xl font-medium uppercase">Subscription updated</h2><p className="mt-2 text-sm text-muted-foreground">The current internal UI session reflects the updated metadata.</p><button type="button" onClick={() => router.push('/internal/subscriptions')} className="mt-6 bg-brand px-5 py-2.5 text-sm font-medium text-white">Return to subscriptions</button></section> : <UnsavedForm onSubmit={submit} className="border border-border bg-card"><header className="border-b border-border p-6"><p className="text-[0.625rem] tracking-[0.14em] text-brand uppercase">Subscription record</p><h2 className="mt-2 font-brand text-lg font-medium tracking-[0.05em] uppercase">{subscription.organisation}</h2></header><div className="grid gap-5 p-6 sm:grid-cols-2 lg:p-8"><Select name="tier" label="UNISON tier" value={subscription.tier} options={unisonTiers.map((tier) => tier.label)} /><Select name="status" label="Status" value={subscription.status} options={['Active', 'Pending', 'Paused', 'Cancelled']} /><Field name="start" label="Start date" value={subscription.start} /><Field name="renewal" label="Renewal date" value={subscription.renewal} /><Select name="cycle" label="Billing cycle" value={subscription.cycle} options={['Monthly', 'Quarterly', 'Annual']} /><Field name="seats" label="Configured seats" value={subscription.seats} type="number" /></div><footer className="flex justify-end gap-2 border-t border-border p-5"><button type="button" onClick={() => router.back()} className="border border-border px-4 py-2 text-sm font-medium">Cancel</button><button type="submit" disabled={saving} className="bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save subscription'}</button></footer></UnsavedForm>}</>
}

function Field({ name, label, value, type = 'text' }: { name: string; label: string; value: string; type?: string }) { return <label className="text-sm font-medium">{label}<input name={name} type={type} defaultValue={value} required className="mt-2 h-11 w-full border border-border bg-background px-3 outline-none focus:border-brand" /></label> }
function Select({ name, label, value, options }: { name: string; label: string; value: string; options: string[] }) { return <label className="text-sm font-medium">{label}<select name={name} defaultValue={value} required className="mt-2 h-11 w-full border border-border bg-background px-3 outline-none focus:border-brand">{options.map((option) => <option key={option}>{option}</option>)}</select></label> }
