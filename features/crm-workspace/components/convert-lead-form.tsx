'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { convertLeadAction } from '../actions/convert-lead'
import { Feedback } from './form-parts'

export function ConvertLeadForm({
  leadId,
  companyName,
  matches,
}: {
  leadId: string
  companyName: string
  matches: Array<{ id: string; name: string }>
}) {
  const [state, action, pending] = useActionState(convertLeadAction.bind(null, leadId), undefined)
  return (
    <form action={action} className="space-y-5">
      <div className="border border-border bg-card p-5">
        <h2 className="unison-section-title text-xs text-foreground">What will be created</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--briefing-muted)]">
          <li>A client for {companyName}, starting as Onboarding (or the existing client you choose below).</li>
          <li>A primary contact from the lead&apos;s contact details.</li>
          <li>An opportunity at Discovery, with the lead&apos;s owner and estimated value.</li>
          <li>The lead is marked Converted and keeps a link to all three.</li>
        </ul>
      </div>

      {matches.length ? (
        <fieldset className="border border-border bg-card p-5">
          <legend className="px-1 text-sm font-semibold text-foreground">
            {matches.length === 1 ? 'A client with this name already exists' : 'Clients with this name already exist'}
          </legend>
          <div className="mt-2 space-y-2 text-sm">
            {matches.map((match, index) => (
              <label key={match.id} className="flex items-center gap-2">
                <input type="radio" name="clientId" value={match.id} defaultChecked={index === 0} />
                Add to <strong>{match.name}</strong>
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input type="radio" name="clientId" value="new" />
              Create a separate new client
            </label>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="clientId" value="new" />
      )}

      <div className="flex items-center justify-between gap-3">
        <Feedback state={state} />
        <div className="ml-auto flex gap-2">
          <Link href={`/commercial/leads/${leadId}`} className="border border-border px-4 py-2 text-sm font-semibold">Cancel</Link>
          <button disabled={pending} className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? 'Converting…' : 'Convert lead'}
          </button>
        </div>
      </div>
    </form>
  )
}
