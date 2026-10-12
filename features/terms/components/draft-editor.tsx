'use client'

import { useActionState, useState, useTransition } from 'react'

import { placeholderProblems } from '../placeholders'
import { saveTermsDraftAction } from '../actions/terms'

const field = 'h-10 w-full rounded-none border border-border bg-background px-3 text-sm'
const area = 'mt-1.5 w-full rounded-none border border-border bg-background px-3 py-2 text-sm font-mono'

type Start = { body: string; inclusions: string; effectiveFrom: string | null; changeNote: string | null }

/**
 * The draft of a template: one clause per line, the service inclusions, an effective date and a change note.
 * "Save draft" keeps it; "Save and approve" fixes it as a new approved version.
 * A failed save keeps what was typed (the action is called by hand, as in the price list form).
 */
export function DraftEditor({ templateId, start, hasDraft, savedAt }: { templateId: string; start: Start; hasDraft: boolean; savedAt: string | null }) {
  const [state, run, pending] = useActionState(saveTermsDraftAction.bind(null, templateId), undefined)
  const [, startTransition] = useTransition()
  const [body, setBody] = useState(start.body)
  const [inclusions, setInclusions] = useState(start.inclusions)
  // This component is not re-keyed when the page re-renders after a save or approve, so the outcome message that useActionState
  // holds stays visible. When the starting text really changes (a draft was saved, discarded or restored, or another version
  // became the start), the fields are reset to it: the controlled ones through state, the uncontrolled ones through fieldsKey.
  const startKey = JSON.stringify([start.body, start.inclusions, start.effectiveFrom, start.changeNote])
  const [seenStart, setSeenStart] = useState(startKey)
  const [fieldsKey, setFieldsKey] = useState(0)
  if (seenStart !== startKey) {
    setSeenStart(startKey)
    setBody(start.body)
    setInclusions(start.inclusions)
    setFieldsKey((value) => value + 1)
  }
  const problems = [...new Set([...placeholderProblems(body), ...placeholderProblems(inclusions)])]
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
        const data = new FormData(event.currentTarget, submitter)
        startTransition(() => run(data))
      }}
      className="grid gap-3 px-5 py-4 md:grid-cols-2"
    >
      <p className="text-xs text-[var(--briefing-muted)] md:col-span-2">
        {hasDraft ? 'Editing the draft.' : 'Saving starts a new draft from the wording shown below.'} An approved version cannot be edited; approving this draft creates the next version.
        {hasDraft && savedAt ? ` Last saved ${savedAt}.` : ''}
      </p>
      <label className="text-sm font-medium md:col-span-2">
        Terms and conditions (one clause per line)
        <textarea name="body" rows={12} value={body} onChange={(event) => setBody(event.target.value)} aria-label="Terms and conditions" className={area} />
      </label>
      <label className="text-sm font-medium md:col-span-2">
        Service inclusions (one per line)
        <textarea name="inclusions" rows={5} value={inclusions} onChange={(event) => setInclusions(event.target.value)} aria-label="Service inclusions" className={area} />
      </label>
      {problems.length > 0 ? (
        <p role="status" className="text-xs text-amber-800 md:col-span-2">
          Not a placeholder UNISON knows: {problems.join(', ')}. Use only {'{{monthly_fee}}'}, {'{{monthly_credits}}'}, {'{{initiative_limit}}'}, {'{{valid_days}}'} and {'{{payment_days}}'}, with no spaces. The draft can be saved, but not approved.
        </p>
      ) : null}
      <label key={`effective-${fieldsKey}`} className="text-sm font-medium">
        Effective from
        <input name="effectiveFrom" type="date" defaultValue={start.effectiveFrom ?? ''} aria-label="Effective from" className={`${field} mt-1.5`} />
      </label>
      <label key={`note-${fieldsKey}`} className="text-sm font-medium">
        Change note
        <input name="changeNote" maxLength={500} defaultValue={start.changeNote ?? ''} aria-label="Change note" className={`${field} mt-1.5`} />
      </label>
      {state?.error ? <p role="alert" className="text-sm text-destructive md:col-span-2">{state.error}</p> : null}
      {state?.success ? <p role="status" className="text-sm text-success md:col-span-2">{state.success}</p> : null}
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <button type="submit" name="intent" value="save" disabled={pending} className="border border-border px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-60">{pending ? 'Working…' : 'Save draft'}</button>
        <button type="submit" name="intent" value="approve" disabled={pending || problems.length > 0} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Save and approve</button>
      </div>
    </form>
  )
}
