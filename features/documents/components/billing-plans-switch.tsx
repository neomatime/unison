'use client'

import { useActionState, useId, useState, useTransition } from 'react'

import { FormError, FormSection } from '@/components/ui/form-layout'
import { setBillingPlansEnabledAction } from '../actions/billing-switch'

/** The billing plans switch, a small form of its own under the client portal switch so that saving one never touches the other. */
export function BillingPlansSwitch({ enabled, canEdit }: { enabled: boolean; canEdit: boolean }) {
  const [state, run, pending] = useActionState(setBillingPlansEnabledAction, undefined)
  const [, startTransition] = useTransition()
  const [dirty, setDirty] = useState(false)
  const helpId = useId()

  return (
    <form
      onChange={() => setDirty(true)}
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        setDirty(false)
        startTransition(() => run(data))
      }}
      className="mx-auto mt-5 max-w-5xl space-y-5"
    >
      {!canEdit ? (
        <p role="note" className="border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Only an owner or admin can change this.
        </p>
      ) : null}
      <FormSection title="Billing plans" columns={1}>
        <fieldset disabled={!canEdit} className="m-0 min-w-0 space-y-3 border-0 p-0">
          <label className="flex items-start gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={enabled}
              aria-describedby={helpId}
              className="mt-1"
            />
            <span>Create a billing plan when a client accepts a quote</span>
          </label>
          <p id={helpId} className="text-sm text-muted-foreground">
            When on, a quote accepted on the client portal moves its sales record to Won, gets a billing plan and a draft first invoice,
            and the owner is told. An owner or admin approves the first invoice before it is emailed. Monthly invoices are not sent
            automatically yet: create each month&apos;s invoice from the quote page.
          </p>
        </fieldset>
      </FormSection>

      <FormError message={state?.error} />
      {state?.success && !dirty && !pending ? (
        <p role="status" className="border border-success/25 bg-success-soft/45 px-4 py-3 text-sm text-success">{state.success}</p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canEdit || pending}
          aria-busy={pending || undefined}
          className="unison-action-control rounded-none bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-60"
        >
          {pending ? 'Saving\u2026' : 'Save billing setting'}
        </button>
      </div>
    </form>
  )
}
