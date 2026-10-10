'use client'

import { useActionState } from 'react'

import type { ActionState } from '../types'

/** A one-click action (archive, make primary, mark done) with its own error line and an optional confirm. */
export function ActionButton({
  action,
  label,
  confirmText,
  tone,
}: {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>
  label: string
  confirmText?: string
  tone?: 'danger'
}) {
  const [state, run, pending] = useActionState(action, undefined)
  return (
    <form
      action={run}
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault()
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className={`border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${tone === 'danger' ? 'border-destructive/30 text-destructive' : 'border-border text-foreground'}`}
      >
        {pending ? 'Working…' : label}
      </button>
      {state?.error ? <p role="alert" className="mt-1 text-xs text-destructive">{state.error}</p> : null}
    </form>
  )
}
