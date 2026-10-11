'use client'

import { useActionState } from 'react'

import type { ActionState } from '@/features/documents/types'
import {
  addSupportAction, changeTierAction, createTopUpAction, setPackageAction,
} from '../actions/billing'

const field = 'h-10 w-full rounded-none border border-border bg-background px-3 text-sm'
const button = 'bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60'

function Feedback({ state }: { state: ActionState }) {
  if (state?.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>
  if (state?.success) return <p role="status" className="text-sm text-success">{state.success}</p>
  return null
}

type Option = { key: string; label: string }

export function SetPackageForm({ clientId, retainers, projects, hasActiveRetainer }: { clientId: string; retainers: Option[]; projects: Option[]; hasActiveRetainer: boolean }) {
  const [state, action, pending] = useActionState(setPackageAction.bind(null, clientId), undefined)
  return (
    <form action={action} className="grid gap-3 border-t border-border p-5 md:grid-cols-[2fr_1fr_auto]">
      <select name="packageKey" aria-label="Package" required defaultValue="" className={field}>
        <option value="" disabled>Choose a package</option>
        <optgroup label="Retainer">
          {retainers.map((o) => <option key={o.key} value={o.key} disabled={hasActiveRetainer}>{o.label}</option>)}
        </optgroup>
        <optgroup label="Project">
          {projects.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </optgroup>
      </select>
      <input name="startDate" type="date" aria-label="Start date (leave empty for today)" className={field} />
      <button disabled={pending} className={button}>{pending ? 'Saving…' : 'Record package'}</button>
      {hasActiveRetainer ? <p className="text-xs text-[var(--briefing-muted)] md:col-span-3">This client already has an active retainer. Use Change tier to move them to another tier.</p> : null}
      <div className="md:col-span-3"><Feedback state={state} /></div>
    </form>
  )
}

export function ChangeTierForm({ engagementId, tiers }: { engagementId: string; tiers: Option[] }) {
  const [state, action, pending] = useActionState(changeTierAction.bind(null, engagementId), undefined)
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
      <select name="packageKey" aria-label="New tier" required defaultValue="" className={field}>
        <option value="" disabled>Change tier to…</option>
        {tiers.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      <input name="startDate" type="date" required aria-label="New tier starts on" className={field} />
      <button disabled={pending} className={button}>{pending ? 'Saving…' : 'Change tier'}</button>
      <div className="md:col-span-3"><Feedback state={state} /></div>
    </form>
  )
}

export function AddSupportForm({ engagementId, services }: { engagementId: string; services: Option[] }) {
  const [state, action, pending] = useActionState(addSupportAction.bind(null, engagementId), undefined)
  if (services.length === 0) return null
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
      <select name="serviceKey" aria-label="Support service" required defaultValue="" className={field}>
        <option value="" disabled>Add a signed support service…</option>
        {services.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      <input name="startDate" type="date" aria-label="Starts on (leave empty for today)" className={field} />
      <button disabled={pending} className={button}>{pending ? 'Saving…' : 'Add service'}</button>
      <div className="md:col-span-3"><Feedback state={state} /></div>
    </form>
  )
}

export function TopUpForm({ engagementId, rateLabel }: { engagementId: string; rateLabel: string }) {
  const [state, action, pending] = useActionState(createTopUpAction.bind(null, engagementId), undefined)
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
      <input name="credits" inputMode="numeric" pattern="[0-9]*" required aria-label="Extra credits" placeholder="Extra credits" className={field} />
      <p className="self-center text-xs text-[var(--briefing-muted)]">{rateLabel}</p>
      <button disabled={pending} className={button}>{pending ? 'Building…' : 'Build top-up invoice'}</button>
      <div className="md:col-span-3"><Feedback state={state} /></div>
    </form>
  )
}
