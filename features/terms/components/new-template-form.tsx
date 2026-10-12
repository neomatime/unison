'use client'

import { useActionState, useTransition } from 'react'

import { createTermsTemplateAction } from '../actions/terms'

const field = 'h-10 w-full rounded-none border border-border bg-background px-3 text-sm'

/** Owners and admins add a template for an offering that has none (the seeded ones are listed above). */
export function NewTemplateForm() {
  const [state, run, pending] = useActionState(createTermsTemplateAction, undefined)
  const [, startTransition] = useTransition()
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(() => run(data))
      }}
      className="grid gap-3 border border-border bg-card p-5 md:grid-cols-2"
    >
      <h2 className="unison-section-title text-xs text-foreground md:col-span-2">New template</h2>
      <label className="text-sm font-medium">
        For
        <select name="targetKind" required defaultValue="" aria-label="For" className={`${field} mt-1.5`}>
          <option value="" disabled>Choose…</option>
          <option value="retainer">A retainer tier</option>
          <option value="project">A project category</option>
          <option value="support">A support service</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Key
        <input name="targetKey" required pattern="[a-z0-9_]{1,60}" aria-label="Key" placeholder="for example website_care" className={`${field} mt-1.5`} />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">The rate card key: lowercase letters, numbers and underscores.</span>
      </label>
      <label className="text-sm font-medium">
        Applies to
        <select name="appliesTo" required defaultValue="quote" aria-label="Applies to" className={`${field} mt-1.5`}>
          <option value="quote">Quotes</option>
          <option value="invoice">Invoices</option>
          <option value="both">Quotes and invoices</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Title
        <input name="title" required maxLength={200} aria-label="Title" className={`${field} mt-1.5`} />
      </label>
      {state?.error ? <p role="alert" className="text-sm text-destructive md:col-span-2">{state.error}</p> : null}
      <div className="md:col-span-2">
        <button type="submit" disabled={pending} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Creating…' : 'Create template'}</button>
      </div>
    </form>
  )
}
