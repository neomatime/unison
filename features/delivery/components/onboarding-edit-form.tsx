'use client'

import { Check, Info } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { onboardings } from '../data'

export function OnboardingEditForm({ onboardingId }: { onboardingId: string }) {
  const record = onboardings.find((item) => item.id === onboardingId) ?? onboardings[0]
  const [saved, setSaved] = useState(false)
  return <>
    <WorkspaceHeader category="Operations" parent={{ label: record.client, href: `/operations/onboarding/${record.id}` }} title="Edit Onboarding" description="Update ownership, timing and operational controls." />
    <form onSubmit={(event) => { event.preventDefault(); setSaved(true) }} className="mx-auto max-w-5xl space-y-5">
      <FormSection title="Onboarding details"><Field label="Client" value={record.client} disabled /><Field label="Onboarding Owner" value={record.owner} options={['Amara Dlamini', 'Neo Morake', 'Lethabo Nkosi']} /><Field label="Current Stage" value={record.stage} options={['Welcome', 'Company Setup', 'Information & Documentation', 'Agreements', 'Review & Approval', 'Go Live / Handover']} /><Field label="Target Go-Live" value="2026-09-18" type="date" /><Field label="Priority" value="High" options={['Normal', 'High', 'Critical']} /><Field label="Health" value={record.health} options={['On Track', 'Watch', 'At Risk']} /></FormSection>
      <FormSection title="Controls & handover"><Field label="Onboarding Type" value="Standard Client" options={['Standard Client', 'Growth Partner', 'Enterprise Client', 'Custom']} /><Field label="Template" value="Standard Client" options={['Standard Client', 'Growth Partner', 'Enterprise Client', 'Custom']} /><label className="md:col-span-2 text-sm font-medium">Notes<textarea rows={5} defaultValue="Coordinate document review and stakeholder readiness before the next stage." className="mt-1.5 w-full rounded-lg border border-border bg-background p-3 text-sm" /></label></FormSection>
      <footer className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Info className="size-4" />Changes are reviewed before returning to the onboarding record.</p><div className="flex gap-2"><Link href={`/operations/onboarding/${record.id}`} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</Link><button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Save Changes</button></div></footer>
    </form>
    {saved ? <div role="status" className="fixed right-6 bottom-6 flex items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm text-white shadow-xl"><Check className="size-4 text-success" />Onboarding updated successfully.</div> : null}
  </>
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-border bg-card p-6"><h2 className="mb-5 font-semibold">{title}</h2><div className="grid gap-5 md:grid-cols-2">{children}</div></section> }
function Field({ label, value, type = 'text', options, disabled }: { label: string; value: string; type?: string; options?: string[]; disabled?: boolean }) { const classes = 'mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:bg-muted disabled:text-muted-foreground'; return <label className="text-sm font-medium">{label}{options ? <select defaultValue={value} className={classes}>{options.map((option) => <option key={option}>{option}</option>)}</select> : <input type={type} defaultValue={value} disabled={disabled} className={classes} />}</label> }
