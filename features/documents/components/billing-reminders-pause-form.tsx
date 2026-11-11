'use client'

import { useActionState, useTransition } from 'react'

import { FormError } from '@/components/ui/form-layout'
import { setInvoiceRemindersPausedAction } from '../actions/billing-reminders'

/**
 * Pause or resume the reminders of one invoice, with the reason beside its button. A reason is required to pause and optional to
 * resume. The action is called by hand rather than through <form action>, because React empties a form after its action runs and a
 * reason that was refused would be lost.
 */
export function BillingRemindersPauseForm({ invoiceId, paused }: { invoiceId: string; paused: boolean }) {
  const [state, run, pending] = useActionState(setInvoiceRemindersPausedAction.bind(null, invoiceId, paused), undefined)
  const [, startTransition] = useTransition()
  const label = paused ? 'Pause reminders' : 'Resume reminders'
  const reasonLabel = paused ? 'Reason for pausing' : 'Reason for resuming (optional)'
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(() => run(data))
      }}
      className="flex flex-wrap items-start gap-2"
    >
      <input
        name="reason"
        required={paused}
        maxLength={500}
        placeholder={reasonLabel}
        aria-label={reasonLabel}
        className="unison-field min-h-9 w-64 max-w-full rounded-none border border-border bg-card px-3 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-60"
      >
        {pending ? (paused ? 'Pausing\u2026' : 'Resuming\u2026') : label}
      </button>
      <div className="basis-full empty:hidden">
        <FormError message={state?.error} />
      </div>
      {state?.success ? <p role="status" className="basis-full text-xs text-success">{state.success}</p> : null}
    </form>
  )
}
