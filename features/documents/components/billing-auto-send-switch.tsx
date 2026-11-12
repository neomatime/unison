'use client'

import { useActionState, useId, useState, useTransition } from 'react'

import { FormError, FormSection } from '@/components/ui/form-layout'
import { setBillingAutoSendEnabledAction } from '../actions/billing-auto-switch'

/**
 * The automatic sending switch, a small form of its own under the billing plans switch so that saving one never touches the other.
 * It cannot be switched on while billing plans are off, but it can always be switched off.
 */
export function BillingAutoSendSwitch({ enabled, plansEnabled, canEdit }: { enabled: boolean; plansEnabled: boolean; canEdit: boolean }) {
  const [state, run, pending] = useActionState(setBillingAutoSendEnabledAction, undefined)
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
      className="space-y-5"
    >
      {!canEdit ? (
        <p role="note" className="border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Only an owner or admin can change this.
        </p>
      ) : null}
      {canEdit && !plansEnabled && !enabled ? (
        <p role="note" className="border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Turn on billing plans first.
        </p>
      ) : null}
      <FormSection title="Automatic sending" columns={1}>
        <fieldset disabled={!canEdit || (!plansEnabled && !enabled)} className="m-0 min-w-0 space-y-3 border-0 p-0">
          <label className="flex items-start gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={enabled}
              aria-describedby={helpId}
              className="mt-1"
            />
            <span>Issue and email each month&apos;s invoice automatically</span>
          </label>
          <p id={helpId} className="text-sm text-muted-foreground">
            Each day, every month of an approved billing plan that has come due is issued and emailed to the client with its PDF, bank
            details and payment reference. A month that fails its checks, or that is due together with another month, waits for you and
            you are told. The first invoice is still approved by hand.
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
          disabled={!canEdit || (!plansEnabled && !enabled) || pending}
          aria-busy={pending || undefined}
          className="unison-action-control rounded-none bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-60"
        >
          {pending ? 'Saving\u2026' : 'Save automatic sending'}
        </button>
      </div>
    </form>
  )
}
