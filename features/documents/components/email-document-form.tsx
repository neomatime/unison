'use client'

import { useActionState, useTransition } from 'react'

import { TextAreaField, TextField } from '@/components/ui/form-fields'
import { FormError } from '@/components/ui/form-layout'
import { emailDocumentAction } from '../actions/email'
import type { DocumentKind } from '../vocabulary'

/**
 * One recipient, a subject and a message; the PDF is attached by the server. The action is called by hand so a
 * failed send keeps what was typed (React resets a form after its action), and a second send is possible after a
 * success: each one is recorded.
 */
export function EmailDocumentForm({ kind, id, defaults }: { kind: DocumentKind; id: string; defaults: { to: string; subject: string; body: string } }) {
  const [state, run, pending] = useActionState(emailDocumentAction.bind(null, kind, id), undefined)
  const [, startTransition] = useTransition()
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(() => run(data))
      }}
      className="space-y-4 px-5 py-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextField name="to" label="To" type="email" required defaultValue={defaults.to} placeholder="client@example.com" />
        <TextField name="subject" label="Subject" required defaultValue={defaults.subject} />
      </div>
      <TextAreaField name="body" label="Message" rows={10} defaultValue={defaults.body} />
      <p className="text-xs text-muted-foreground">The PDF is attached. Replies go to your own email address.</p>
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
        {pending ? 'Sending…' : 'Send email'}
      </button>
    </form>
  )
}
