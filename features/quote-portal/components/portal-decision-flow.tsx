'use client'

import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import type { DecisionKind } from '@/lib/quote-portal/types'
import { cn } from '@/lib/utils'
import { decideAction } from '../actions/decide'
import { requestCodeAction } from '../actions/request-code'
import { REFUSAL_FALLBACK } from '../copy'
import {
  decisionPayload,
  flowReducer,
  initialFlowState,
  type CodeRequestAnswer,
  type DecisionAnswer,
  type FlowAction,
  type FlowErrors,
  type FlowField,
  type FlowState,
} from '../decision-flow'
import type { ConfirmationModel } from '../portal-view-model'
import { CodeStep, ConfirmStep, IdleStep, fieldId } from './portal-decision-steps'

const FIELD_ORDER: FlowField[] = ['name', 'position', 'organisation', 'reason', 'comments', 'consent', 'code']

/** A server action that cannot be reached (the network, a deploy) is a failure like any other, never a stuck button. */
async function settle<T>(call: () => Promise<T>, failed: T): Promise<T> {
  try {
    return await call()
  } catch {
    return failed
  }
}

/**
 * Accept or Decline on the portal page: the confirm step, the emailed code, the decision. The steps are decision-flow.ts;
 * this component runs every press through flowReducer first, and calls a server action only when the reducer moves on,
 * so a second press while a request is pending sends nothing.
 *
 * Each state change is flushed to the page before focus moves (flushSync), so focus lands on what is now there: the
 * heading of each new step, the first field that was refused, or the button pressed when a request fails. When a
 * decision is recorded or the quote has moved on, router.refresh() renders the page the server now has for the link.
 *
 * It is given the token (already in the address), the hash of the quote as shown, the masked address the code goes to,
 * and the confirmation summary. It never has the full address, and the server never gives back what was typed.
 */
export function PortalDecisionFlow({
  token,
  snapshotHash,
  verifiedEmail,
  confirmation,
}: {
  token: string
  snapshotHash: string
  verifiedEmail: string
  confirmation: ConfirmationModel
}) {
  const router = useRouter()
  const idBase = useId()
  const [state, setState] = useState<FlowState>(() => initialFlowState(confirmation.prefill))
  const latest = useRef(state)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const acceptRef = useRef<HTMLButtonElement>(null)
  const declineRef = useRef<HTMLButtonElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)

  /** Runs an action through the reducer and onto the page; the new state, or null when the reducer ignored it. */
  function apply(action: FlowAction): FlowState | null {
    const next = flowReducer(latest.current, action)
    if (next === latest.current) return null
    latest.current = next
    flushSync(() => setState(next))
    return next
  }

  const focusDecisionButton = (next: FlowState) => (next.decision === 'declined' ? declineRef : acceptRef).current?.focus()
  const focusFirstError = (errors: FlowErrors) => {
    const field = FIELD_ORDER.find((name) => errors[name])
    if (field) document.getElementById(fieldId(idBase, field))?.focus()
  }
  /** A button disabled while its request was pending loses focus; give it back once the request has failed. */
  const restoreFocus = (trigger: HTMLElement) => {
    if (!document.activeElement || document.activeElement === document.body) trigger.focus()
  }

  function open(decision: DecisionKind) {
    if (apply({ type: 'open', decision })) headingRef.current?.focus()
  }

  function back() {
    const next = apply({ type: 'back' })
    if (!next) return
    if (next.step === 'idle') focusDecisionButton(next)
    else headingRef.current?.focus()
  }

  async function requestCode(trigger: HTMLElement) {
    const next = apply({ type: 'request_code' })
    if (!next) return
    if (next.pending !== 'code') return focusFirstError(next.errors)
    const answer = await settle<CodeRequestAnswer>(() => requestCodeAction(token), { ok: false, message: REFUSAL_FALLBACK })
    const after = apply({ type: 'code_answer', answer })
    if (!after) return
    if (after.step !== next.step) headingRef.current?.focus()
    else restoreFocus(trigger)
  }

  async function confirm(trigger: HTMLElement) {
    const next = apply({ type: 'submit' })
    if (!next) return
    if (next.pending !== 'decision') return focusFirstError(next.errors)
    const answer = await settle<DecisionAnswer>(() => decideAction(decisionPayload(next, token, snapshotHash)), { ok: false, message: REFUSAL_FALLBACK })
    const after = apply({ type: 'decision_answer', answer })
    if (!after) return
    if (after.step === 'done' || after.step === 'refresh') {
      if (after.step === 'done') statusRef.current?.focus()
      else focusDecisionButton(after)
      router.refresh()
    } else if (after.step === 'confirm') {
      focusFirstError(after.errors)
    } else {
      restoreFocus(trigger)
    }
  }

  const formOpen = state.step === 'confirm' || state.step === 'code'
  return (
    <div className="mt-5" data-decision-form={formOpen ? '' : undefined}>
      {state.step === 'idle' || state.step === 'refresh' ? <IdleStep acceptRef={acceptRef} declineRef={declineRef} onOpen={open} /> : null}
      {state.step === 'confirm' ? (
        <ConfirmStep
          state={state}
          confirmation={confirmation}
          verifiedEmail={verifiedEmail}
          idBase={idBase}
          headingRef={headingRef}
          onEdit={(field, value) => apply({ type: 'edit', field, value })}
          onConsent={(checked) => apply({ type: 'consent', checked })}
          onRequestCode={requestCode}
          onBack={back}
        />
      ) : null}
      {state.step === 'code' ? (
        <CodeStep
          state={state}
          idBase={idBase}
          headingRef={headingRef}
          onEdit={(field, value) => apply({ type: 'edit', field, value })}
          onConfirm={confirm}
          onRequestCode={requestCode}
          onBack={back}
        />
      ) : null}
      {/* Always in the page, so a screen reader hears each new message: a code sent, a refusal, the decision recorded. */}
      <div
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={cn('text-sm leading-relaxed outline-none [overflow-wrap:anywhere]', state.message && 'mt-4 border border-border bg-accent/60 p-3')}
      >
        {state.message}
      </div>
    </div>
  )
}
