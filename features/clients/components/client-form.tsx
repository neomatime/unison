'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { SelectField, TextAreaField, TextField } from '@/components/ui/form-fields'
import { FormError, FormFooter, FormSection } from '@/components/ui/form-layout'
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
      <FormSection title="Company information" description="Core details for this client record.">
        <TextField name="name" label="Company name" required defaultValue={client?.name} />
        <TextField name="industry" label="Industry" defaultValue={client?.industry} />
        <TextField name="website" label="Website" defaultValue={client?.website} />
        <TextField name="service" label="Primary engagement" defaultValue={client?.service} />
      </FormSection>

      <FormSection title="Primary contact" description="The main relationship contact for this client.">
        <TextField name="contactName" label="Contact name" defaultValue={client?.contact_name} />
        <TextField name="contactEmail" label="Contact email" type="email" defaultValue={client?.contact_email} />
        <TextField name="contactPhone" label="Contact phone" type="tel" defaultValue={client?.contact_phone} />
        <TextField name="billingEmail" label="Billing email" type="email" defaultValue={client?.billing_email} />
      </FormSection>

      <FormSection title="Status and health" description="Drives where this client appears across the workspace.">
        <SelectField name="status" label="Status" options={statusOptions} defaultValue={client?.status ?? 'Onboarding'} />
        <SelectField name="health" label="Client health" options={healthOptions} defaultValue={client?.health ?? 'New'} />
        <TextAreaField
          name="notes"
          label="Notes"
          defaultValue={client?.notes}
          placeholder="Add relevant context and internal notes"
          className="md:col-span-2"
        />
      </FormSection>

      <FormError message={state?.error} />

      <FormFooter
        cancelHref={backHref}
        submitLabel={mode === 'create' ? 'Create Client' : 'Save Changes'}
        pending={pending}
      />
    </form>
  </>
}
