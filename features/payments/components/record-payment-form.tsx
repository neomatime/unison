'use client'

import { useActionState, useEffect, useRef, useTransition } from 'react'

import { FieldLabel, TextField, fieldClasses } from '@/components/ui/form-fields'
import { FormError } from '@/components/ui/form-layout'
import { recordPaymentAction } from '../actions/payments'
import { PAYMENT_METHODS } from '../vocabulary'

/**
 * Amount, date, method and reference. The action is called by hand so a failed save keeps what was typed (React resets
 * a form after its action); a successful one clears the form, so the same payment is not recorded twice.
 */
export function RecordPaymentForm({ invoiceId, balanceLabel, today }: { invoiceId: string; balanceLabel: string; today: string }) {
  const [state, run, pending] = useActionState(recordPaymentAction.bind(null, invoiceId), undefined)
  const [, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state])
  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(() => run(data))
      }}
      className="space-y-4 px-5 py-4"
    >
      <div className="grid gap-4 md:grid-cols-4">
        <TextField name="amount" label={`Amount (balance ${balanceLabel})`} required placeholder="0.00" />
        <label className="group block">
          <FieldLabel label="Date received" required />
          <input type="date" name="receivedOn" required defaultValue={today} max={today} className={fieldClasses} />
        </label>
        <label className="group block">
          <FieldLabel label="Method" />
          <select name="method" defaultValue="Bank transfer" className={fieldClasses}>
            {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
        </label>
        <TextField name="reference" label="Reference (optional)" />
      </div>
      <FormError message={state?.error} />
      {state?.success && !pending ? (
        <p role="status" className="border border-success/25 bg-success-soft/45 px-4 py-3 text-sm text-success">{state.success}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="unison-action-control rounded-none bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-60"
      >
        {pending ? 'Recording…' : 'Record payment'}
      </button>
    </form>
  )
}
