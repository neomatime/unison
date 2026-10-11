'use client'

import { useActionState, useState, useTransition } from 'react'

import { FormError } from '@/components/ui/form-layout'
import { voidPaymentAction } from '../actions/payments'

/** A small "Void" control: it asks for a reason first. The payment stays on the list, struck through. */
export function VoidPaymentForm({ paymentId, label }: { paymentId: string; label: string }) {
  const [open, setOpen] = useState(false)
  const [state, run, pending] = useActionState(voidPaymentAction.bind(null, paymentId), undefined)
  const [, startTransition] = useTransition()
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={`Void ${label}`} className="border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive">
        Void
      </button>
    )
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(() => run(data))
      }}
      className="flex flex-wrap items-start gap-2"
    >
      <input name="reason" required maxLength={500} placeholder="Reason for voiding" aria-label={`Reason for voiding ${label}`} className="unison-field min-h-9 w-56 rounded-none border border-border bg-card px-3 text-sm" />
      <button type="submit" disabled={pending} className="border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-60">
        {pending ? 'Voiding…' : 'Confirm void'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="border border-border px-3 py-1.5 text-xs font-semibold">Cancel</button>
      <FormError message={state?.error} />
    </form>
  )
}
