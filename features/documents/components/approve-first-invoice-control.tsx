'use client'

import { useActionState, useTransition } from 'react'

import { FormError } from '@/components/ui/form-layout'
import { approveFirstInvoiceAction } from '../actions/billing-plan'
import { BILLING_PLAN_COPY } from '../billing-plan-view'

/**
 * Approve and send the first invoice of a billing plan, and keep what happened on screen.
 *
 * The approval is final and the email goes to a client, so the person must be told how it ended: emailed to which address, approved
 * but not emailed and why, or (the email may have gone) what to check before sending again. The action refreshes the page in the same
 * round trip, and once the invoice is approved the button is no longer offered; the message therefore lives here, in a control the panel
 * keeps mounted in the same place, outside the condition that decides whether the button shows, so React keeps this state through that
 * refresh. `canApprove` is true only while the Draft first invoice awaits approval, the plan is active and nothing blocks it.
 *
 * The action is called by hand after the confirm step rather than through <form action>, as the other forms of this panel are.
 */
export function ApproveFirstInvoiceControl({ itemId, canApprove }: { itemId: string; canApprove: boolean }) {
  const [state, run, pending] = useActionState(approveFirstInvoiceAction.bind(null, itemId), undefined)
  const [, startTransition] = useTransition()
  return (
    <>
      {canApprove ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!window.confirm(BILLING_PLAN_COPY.approveConfirm)) return
            startTransition(() => run(new FormData(event.currentTarget)))
          }}
        >
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}
            className="border border-border px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-60"
          >
            {pending ? BILLING_PLAN_COPY.approvePendingLabel : BILLING_PLAN_COPY.approveLabel}
          </button>
        </form>
      ) : null}
      <FormError message={state?.error} />
      {state?.success ? <p role="status" className="border border-success/25 bg-success-soft/45 px-4 py-3 text-sm text-success">{state.success}</p> : null}
    </>
  )
}
