'use client'

import { useActionState, useId, useState, useTransition } from 'react'

import { FormError, FormSection } from '@/components/ui/form-layout'
import { setBillingRemindersEnabledAction } from '../actions/billing-reminders-switch'

/**
 * The payment reminders switch, a small form of its own under the automatic sending switch so that saving one never touches the
 * other. It cannot be switched on while billing plans are off, but it can always be switched off.
 */
export function BillingRemindersSwitch({ enabled, plansEnabled, canEdit }: { enabled: boolean; plansEnabled: boolean; canEdit: boolean }) {
  const [state, run, pending] = useActionState(setBillingRemindersEnabledAction, undefined)
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
      {canEdit && !plansEnabled && !enabled ? (
        <p role="note" className="border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Turn on billing plans first.
        </p>
      ) : null}
      <FormSection title="Payment reminders" columns={1}>
        <fieldset disabled={!canEdit || (!plansEnabled && !enabled)} className="m-0 min-w-0 space-y-3 border-0 p-0">
          <label className="flex items-start gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={enabled}
              aria-describedby={helpId}
              className="mt-1"
            />
            <span>Send friendly payment reminders</span>
          </label>
          <p id={helpId} className="text-sm text-muted-foreground">
            For an unpaid invoice from a billing plan, a reminder goes to the client 3 days after the due date and then every week, up to
            five. A payment in full stops them at once. You can pause reminders on one invoice, and after the fifth you are told and given
            a task to follow up yourself. Invoices that fell due before this is switched on are never reminded.
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
          {pending ? 'Saving\u2026' : 'Save reminder setting'}
        </button>
      </div>
    </form>
  )
}
