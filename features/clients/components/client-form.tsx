'use client'

import Link from 'next/link'
import { Info } from 'lucide-react'
import { useActionState } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import type { ClientRecord } from '../queries/get-client'

type ActionState = { error?: string } | undefined
type ClientFormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

const statusOptions = ['Onboarding', 'Active', 'Archived'] as const
const healthOptions = ['New', 'Healthy', 'Watch', 'Stable', 'At Risk'] as const

export function ClientForm({ mode, client, action }: { mode: 'create' | 'edit'; client?: ClientRecord; action: ClientFormAction }) {
  const [state, formAction, pending] = useActionState(action, undefined)
  const backHref = client ? `/operations/clients/${client.id}` : '/operations/clients'

  return <>
    <WorkspaceHeader
      category="Operations"
      parent={{ label: 'Clients', href: '/operations/clients' }}
      title={mode === 'create' ? 'Create Client' : `Edit ${client?.name ?? 'Client'}`}
      description={mode === 'create' ? 'Add a new client to UNISON.' : 'Update this client’s record.'}
    />
    <Link href={backHref} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
      Back to {client ? client.name : 'Clients'}
    </Link>

    <form action={formAction} className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
        <div className="mb-5">
          <h2 className="font-semibold text-foreground">Company information</h2>
          <p className="mt-1 text-sm text-muted-foreground">Core details for this client record.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField name="name" label="Company name" required defaultValue={client?.name} />
          <TextField name="industry" label="Industry" defaultValue={client?.industry ?? ''} />
          <TextField name="website" label="Website" defaultValue={client?.website ?? ''} />
          <TextField name="service" label="Primary engagement" defaultValue={client?.service ?? ''} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
        <div className="mb-5">
          <h2 className="font-semibold text-foreground">Primary contact</h2>
          <p className="mt-1 text-sm text-muted-foreground">The main relationship contact for this client.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField name="contactName" label="Contact name" defaultValue={client?.contact_name ?? ''} />
          <TextField name="contactEmail" label="Contact email" type="email" defaultValue={client?.contact_email ?? ''} />
          <TextField name="contactPhone" label="Contact phone" type="tel" defaultValue={client?.contact_phone ?? ''} />
          <TextField name="billingEmail" label="Billing email" type="email" defaultValue={client?.billing_email ?? ''} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-[0_1px_2px_rgb(16_32_46_/_0.04)]">
        <div className="mb-5">
          <h2 className="font-semibold text-foreground">Status and health</h2>
          <p className="mt-1 text-sm text-muted-foreground">Drives where this client appears across the workspace.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <SelectField name="status" label="Status" options={statusOptions} defaultValue={client?.status ?? 'Onboarding'} />
          <SelectField name="health" label="Client health" options={healthOptions} defaultValue={client?.health ?? 'New'} />
        </div>
        <div className="mt-5">
          <TextAreaField name="notes" label="Notes" defaultValue={client?.notes ?? ''} placeholder="Add relevant context and internal notes" />
        </div>
      </section>

      {state?.error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-border bg-card/95 px-5 py-4 shadow-xl backdrop-blur">
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Info className="size-4" />Changes are saved to UNISON&rsquo;s database.</p>
        <div className="flex gap-2">
          <Link href={backHref} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</Link>
          <button type="submit" disabled={pending} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {pending ? 'Saving…' : mode === 'create' ? 'Create Client' : 'Save Changes'}
          </button>
        </div>
      </div>
    </form>
  </>
}

function TextField({ name, label, type = 'text', required, defaultValue }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string | null }) {
  return <label className="block">
    <span className="text-sm font-medium text-foreground">{label}{required ? <span className="text-destructive"> *</span> : null}</span>
    <input
      name={name}
      type={type}
      required={required}
      defaultValue={defaultValue ?? ''}
      className="mt-1.5 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
    />
  </label>
}

function TextAreaField({ name, label, defaultValue, placeholder }: { name: string; label: string; defaultValue?: string | null; placeholder?: string }) {
  return <label className="block">
    <span className="text-sm font-medium text-foreground">{label}</span>
    <textarea
      name={name}
      rows={5}
      defaultValue={defaultValue ?? ''}
      placeholder={placeholder}
      className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
    />
  </label>
}

function SelectField<T extends readonly string[]>({ name, label, options, defaultValue }: { name: string; label: string; options: T; defaultValue: string }) {
  return <label className="block">
    <span className="text-sm font-medium text-foreground">{label}</span>
    <select
      name={name}
      defaultValue={defaultValue}
      className="mt-1.5 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
    >
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>
}
