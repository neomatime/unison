'use client'

import { useActionState, useState } from 'react'

import { changeOpportunityStageAction } from '../actions/opportunity-stage'
import { OPPORTUNITY_STAGES } from '../vocabulary'
import { Feedback, input } from './form-parts'

/**
 * The opportunity's stage, changed in place. Choosing Lost first asks why.
 * React resets the form after the action finishes (and when it fails), so both the stage and the
 * reason are controlled state: a failed save keeps what was typed.
 */
export function StageControl({ opportunityId, stage, lostReason }: { opportunityId: string; stage: string; lostReason: string | null }) {
  const [state, action, pending] = useActionState(changeOpportunityStageAction.bind(null, opportunityId), undefined)
  const [chosen, setChosen] = useState(stage)
  const [reason, setReason] = useState(lostReason ?? '')
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="quick-stage">Stage</label>
      <div className="w-40">
        <select id="quick-stage" name="stage" value={chosen} onChange={(event) => setChosen(event.target.value)} className={input}>
          {OPPORTUNITY_STAGES.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
      {chosen === 'Lost' ? (
        <div className="w-56">
          <input name="lostReason" required aria-label="Why was it lost?" placeholder="Why was it lost?" value={reason} onChange={(event) => setReason(event.target.value)} className={input} />
        </div>
      ) : null}
      <button disabled={pending || (chosen === stage && chosen !== 'Lost')} className="border border-brand px-3 py-2 text-sm font-semibold text-brand disabled:opacity-50">
        {pending ? 'Saving…' : 'Change stage'}
      </button>
      <Feedback state={state} />
    </form>
  )
}
