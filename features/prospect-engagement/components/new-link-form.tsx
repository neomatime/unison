'use client'

import { useActionState } from 'react'

import { ACQUISITION_CHANNELS } from '../catalog'
import { createAcquisitionLinkAction } from '../actions'
import { Dropdown } from '@/components/ui/select'

type Option = { id: string; name: string }

export function NewLinkForm({ members, versions }: { members: Option[]; versions: Array<{ id: string; version: string; status: string }> }) {
  const [state, action, pending] = useActionState(createAcquisitionLinkAction, undefined)
  return (
    <form action={action} className="border border-border bg-card">
      <div className="grid gap-5 p-6 sm:grid-cols-2">
        <Field label="Link name" required><input name="name" required maxLength={120} className={input} placeholder="Mining Indaba 2027" /></Field>
        <Field label="Acquisition channel" required><Dropdown name="channel" required className={input} defaultValue="qr-code">{ACQUISITION_CHANNELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Dropdown></Field>
        <Field label="Campaign"><input name="campaignName" maxLength={160} className={input} placeholder="Africa mining campaign" /></Field>
        <Field label="Event"><input name="eventName" maxLength={160} className={input} placeholder="Mining Indaba" /></Field>
        <Field label="Assigned representative"><Dropdown name="assignedToId" className={input}><option value="">Assign automatically</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Dropdown></Field>
        <Field label="Referring employee"><Dropdown name="referringEmployeeId" className={input}><option value="">Not employee-specific</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Dropdown></Field>
        <Field label="Form version"><Dropdown name="formVersionId" className={input}><option value="">Always use the current published form</option>{versions.filter((version) => version.status !== 'draft').map((version) => <option key={version.id} value={version.id}>Version {version.version} · {version.status}</option>)}</Dropdown></Field>
      </div>
      {state?.error ? <p role="alert" className="mx-6 mb-5 border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">{state.error}</p> : null}
      <div className="flex justify-end border-t border-border p-5"><button disabled={pending} className="bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Creating…' : 'Create engagement link'}</button></div>
    </form>
  )
}

const input = 'mt-2 min-h-11 w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="text-sm font-medium">{label}{required ? <span className="ml-1 text-brand">*</span> : <span className="ml-2 text-xs font-normal text-muted-foreground">Optional</span>}{children}</label>
}

