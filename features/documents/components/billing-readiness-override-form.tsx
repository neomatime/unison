'use client'

import { useActionState, useTransition } from 'react'

import { FormError } from '@/components/ui/form-layout'
import { setBillingReadinessOverrideAction } from '../actions/billing-readiness'

/**
 * Decide that the work may start anyway ("Start anyway", a reason is required), or take that decision back ("Remove this decision",
 * a reason is optional). The action is called by hand rather than through <form action>, because React empties a form after its action
 * runs and a reason that was refused would be lost.
 */
export function BillingReadinessOverrideForm({ quoteId, override }: { quoteId: string; override: boolean }) {
  const [state, run, pending] = useActionState(setBillingReadinessOverrideAction.bind(null, quoteId, override), undefined)
  const [, startTransition] = useTransition()
  const label = override ? 'Start anyway' : 'Remove this decision'
  const reasonLabel = override ? 'Why can the work start before this is met?' : 'Reason for removing (optional)'
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
        required={override}
        maxLength={500}
        placeholder={reasonLabel}
        aria-label={reasonLabel}
        className="unison-field min-h-9 w-72 max-w-full rounded-none border border-border bg-card px-3 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-60"
      >
        {pending ? 'Saving\u2026' : label}
      </button>
      <div className="basis-full empty:hidden">
        <FormError message={state?.error} />
      </div>
      {state?.success ? <p role="status" className="basis-full text-xs text-success">{state.success}</p> : null}
    </form>
  )
}
