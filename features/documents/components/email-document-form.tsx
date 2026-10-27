'use client'

import { useActionState, useTransition } from 'react'

import { TextAreaField, TextField } from '@/components/ui/form-fields'
import { FormError } from '@/components/ui/form-layout'
import { emailDocumentAction } from '../actions/email'
import type { DocumentKind } from '../vocabulary'
import { WELCOME_EMAIL_NOTE, WELCOME_EMAIL_TITLE } from '../welcome-email-copy'

/**
 * One recipient, a subject and a message; the PDF is attached by the server. The action is called by hand so a
 * failed send keeps what was typed (React resets a form after its action), and a second send is possible after a
 * success: each one is recorded. When `defaults.portal` is true the server sends the branded email with a secure
 * link, and the message is the personal note inside it. When `defaults.welcome` is true (the first invoice of a billing plan) the
 * server sends the HIMARK Welcome Email: its subject and message are fixed, so they are shown as a note instead of as fields (the
 * values still travel as hidden fields, which the action requires and then ignores), and only the recipient can be changed.
 */
export function EmailDocumentForm({ kind, id, defaults }: { kind: DocumentKind; id: string; defaults: { to: string; subject: string; body: string; portal: boolean; welcome: boolean } }) {
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
        {defaults.welcome ? null : <TextField name="subject" label="Subject" required defaultValue={defaults.subject} />}
      </div>
      {defaults.welcome ? (
        <div role="note" className="space-y-1 border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{WELCOME_EMAIL_TITLE}</p>
          <p>Subject: {defaults.subject}</p>
          <p>{WELCOME_EMAIL_NOTE}</p>
          <input type="hidden" name="subject" value={defaults.subject} />
          <input type="hidden" name="body" value={defaults.body} />
        </div>
      ) : (
        <>
          <TextAreaField name="body" label={defaults.portal ? 'Personal note' : 'Message'} rows={10} defaultValue={defaults.body} />
          <p className="text-xs text-muted-foreground">
            {defaults.portal
              ? 'The secure quotation link and the PDF are added for you. Replies go to your own email address.'
              : 'The PDF is attached. Replies go to your own email address.'}
          </p>
        </>
      )}
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
