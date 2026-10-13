'use client'

import { useActionState } from 'react'

import { fillDocumentTermsAction } from '../actions/document-terms'
import type { OfferingOption } from '../queries/document-terms'

/** The offering picker (quotes) and the Fill terms button. Nothing typed is replaced without the tick box. */
export function FillTermsForm({
  kind, id, options, selected, hasTypedTerms,
}: {
  kind: 'quote' | 'invoice'
  id: string
  options: OfferingOption[]
  selected: string[]
  hasTypedTerms: boolean
}) {
  const [state, action, pending] = useActionState(fillDocumentTermsAction.bind(null, kind, id), undefined)
  const showPicker = kind === 'quote'
  return (
    <form action={action} className="space-y-4 px-5 py-4">
      {showPicker ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-foreground">What is being sold</legend>
          <input type="hidden" name="offeringsShown" value="1" />
          {options.length === 0 ? <p className="text-sm text-[var(--briefing-muted)]">No offerings have terms templates yet.</p> : null}
          <div className="grid gap-1.5 sm:grid-cols-2">
            {options.map((option) => (
              <label key={option.token} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="offering" value={option.token} defaultChecked={selected.includes(option.token)} disabled={!option.hasTerms} className="mt-1" />
                <span className={option.hasTerms ? '' : 'text-[var(--briefing-muted)]'}>
                  {option.title}
                  {option.hasTerms ? '' : ' (no approved terms)'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {hasTypedTerms ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="confirm" value="yes" />
          Replace the terms I have typed
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-60">
          {pending ? 'Filling…' : 'Fill terms'}
        </button>
        {state?.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
        {state?.success ? <p role="status" className="text-sm text-foreground">{state.success}</p> : null}
      </div>
    </form>
  )
}
