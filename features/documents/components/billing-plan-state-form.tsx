'use client'

import { useActionState, useTransition } from 'react'

import { FormError } from '@/components/ui/form-layout'
import { setBillingPlanStateAction } from '../actions/billing-plan'
import { PLAN_STATE_CONTROLS } from '../billing-plan-view'

/**
 * One control of a billing plan: pause, resume or end, with the reason beside its button. A reason is required to pause and to end and
 * optional to resume; ending asks first, because it cannot be undone. The action is called by hand rather than through <form action>,
 * because React empties a form after its action runs and a reason that was refused would be lost.
 */
export function BillingPlanStateForm({ planId, action }: { planId: string; action: 'pause' | 'resume' | 'end' }) {
  const control = PLAN_STATE_CONTROLS[action]
  const [state, run, pending] = useActionState(setBillingPlanStateAction.bind(null, planId, action), undefined)
  const [, startTransition] = useTransition()
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (control.confirmText && !window.confirm(control.confirmText)) return
        const data = new FormData(event.currentTarget)
        startTransition(() => run(data))
      }}
      className="flex flex-wrap items-start gap-2"
    >
      <input
        name="reason"
        required={control.reasonRequired}
        maxLength={500}
        placeholder={control.reasonLabel}
        aria-label={control.reasonLabel}
        className="unison-field min-h-9 w-64 max-w-full rounded-none border border-border bg-card px-3 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className={`border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${control.tone === 'danger' ? 'border-destructive/30 text-destructive' : 'border-border text-foreground'}`}
      >
        {pending ? control.pendingLabel : control.label}
      </button>
      <div className="basis-full empty:hidden">
        <FormError message={state?.error} />
      </div>
      {state?.success ? <p role="status" className="basis-full text-xs text-success">{state.success}</p> : null}
    </form>
  )
}
