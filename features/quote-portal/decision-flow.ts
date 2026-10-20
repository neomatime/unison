// The steps of accepting or declining on the portal page, as a pure reducer, so every transition can be tested without
// a browser. Pure: relative imports only, no directive. The component (components/portal-decision-flow.tsx) runs each
// press through flowReducer before it calls a server action, and calls none when the reducer hands the same state back.
//
//   idle --Accept/Decline--> confirm --"Email me a code"--> code --Confirm--> done
//                              ^  <------------ Back ---------- |
//   a stale page, or a quote no longer open, ends in refresh; from there (the page refreshed) Accept or Decline again.
//
// - One request at a time. While a code request or a decision is pending, every press and every edit is ignored (the
//   same state comes back), so a double press of Confirm sends one decision. An answer arrives only for the request that
//   is pending; any other is a late reply and is ignored.
// - The fields are checked by normaliseDecisionInput, the server's own rules, so a form that passes here is never refused
//   by the server as incomplete. "Email me a code" needs the name, position and organisation valid and the box ticked.
// - The consent box is unticked whenever a decision is opened: a tick given for one decision never carries to the other.
import type { DecideRefusal, DecisionKind } from '../../lib/quote-portal/types.ts'
import { CONSENT_ACCEPT, CONSENT_DECLINE, DECISION_RECORDED, REFUSAL_MESSAGES, codeSentMessage } from './copy.ts'
import { normaliseDecisionInput, type DecisionInputErrors } from './decision.ts'

export type FlowStep = 'idle' | 'confirm' | 'code' | 'done' | 'refresh'

/** The fields that can carry an error beside them: the confirm step's six and the code. */
export type FlowField = 'name' | 'position' | 'organisation' | 'consent' | 'reason' | 'comments' | 'code'
export type FlowErrors = Partial<Record<FlowField, string>>

/** The text the client types, kept as typed (the server tidies it). */
export type FlowText = 'name' | 'position' | 'organisation' | 'declineReason' | 'declineComments' | 'code'

export type FlowState = {
  step: FlowStep
  decision: DecisionKind | null
  name: string
  position: string
  organisation: string
  consent: boolean
  /** One of DECLINE_REASONS, or '' for none. */
  declineReason: string
  declineComments: string
  code: string
  /** The request in flight. No other request starts while one is. */
  pending: 'code' | 'decision' | null
  /** The code can no longer be used (locked, expired, out of attempts): Confirm waits for a new one. */
  needsNewCode: boolean
  errors: FlowErrors
  /** What the polite live region says. */
  message: string | null
}

/** What requestCodeAction answers. */
export type CodeRequestAnswer = { ok: true; maskedEmail: string; expiresInMinutes: number } | { ok: false; message: string }

/** What decideAction answers. */
export type DecisionAnswer =
  | { ok: true; decision: DecisionKind; replay: boolean }
  | { ok: false; message: string; reason?: DecideRefusal; attemptsLeft?: number; errors?: DecisionInputErrors }

export type FlowAction =
  | { type: 'open'; decision: DecisionKind }
  | { type: 'back' }
  | { type: 'edit'; field: FlowText; value: string }
  | { type: 'consent'; checked: boolean }
  /** "Email me a code" on the confirm step, "Send a new code" on the code step. */
  | { type: 'request_code' }
  | { type: 'code_answer'; answer: CodeRequestAnswer }
  /** Confirm on the code step. */
  | { type: 'submit' }
  | { type: 'decision_answer'; answer: DecisionAnswer }

const CONFIRM_FIELDS = ['name', 'position', 'organisation', 'consent', 'reason', 'comments'] as const
const ERROR_OF: Record<FlowText, FlowField> = {
  name: 'name',
  position: 'position',
  organisation: 'organisation',
  declineReason: 'reason',
  declineComments: 'comments',
  code: 'code',
}

/** The wording beside the tick-box for a decision, which the server holds the submitted text against. */
export function consentTextFor(decision: DecisionKind): string {
  return decision === 'accepted' ? CONSENT_ACCEPT : CONSENT_DECLINE
}

/** The idle flow, with the name and organisation filled in from the quote. The position is the client's to type. */
export function initialFlowState(prefill: { name: string; organisation: string }): FlowState {
  return {
    step: 'idle',
    decision: null,
    name: prefill.name,
    position: '',
    organisation: prefill.organisation,
    consent: false,
    declineReason: '',
    declineComments: '',
    code: '',
    pending: null,
    needsNewCode: false,
    errors: {},
    message: null,
  }
}

/**
 * What decideAction is sent: exactly the DecideInput keys. On an accept the decline reason and comments are null
 * whatever was typed for a decline earlier (the server refuses them on an accept); on a decline an empty one is null.
 */
export function decisionPayload(state: FlowState, token: string, snapshotHash: string): Record<string, unknown> {
  const declining = state.decision === 'declined'
  return {
    token,
    code: state.code,
    decision: state.decision,
    signatoryName: state.name,
    signatoryPosition: state.position,
    signatoryOrganisation: state.organisation,
    consentText: state.decision ? consentTextFor(state.decision) : '',
    consent: state.consent,
    snapshotHash,
    declineReason: declining && state.declineReason !== '' ? state.declineReason : null,
    declineComments: declining && state.declineComments.trim() !== '' ? state.declineComments : null,
  }
}

function confirmErrors(errors: DecisionInputErrors | undefined): FlowErrors {
  const picked: FlowErrors = {}
  for (const field of CONFIRM_FIELDS) if (errors?.[field]) picked[field] = errors[field]
  return picked
}

/** The confirm step's errors, by the server's rules. The token and hash are not the client's to fix, so they are not checked here. */
function checkConfirm(state: FlowState): FlowErrors {
  const checked = normaliseDecisionInput(decisionPayload(state, '', ''))
  return checked.ok ? {} : confirmErrors(checked.errors)
}

function checkCode(code: string): string | undefined {
  const checked = normaliseDecisionInput({ code })
  return checked.ok ? undefined : checked.errors.code
}

const isEmpty = (errors: FlowErrors) => Object.keys(errors).length === 0

/** True when the code answered can never be right: a new one has to be sent. */
function codeSpent(answer: Extract<DecisionAnswer, { ok: false }>): boolean {
  return (
    answer.reason === 'code_locked' ||
    answer.reason === 'code_expired' ||
    answer.reason === 'code_missing' ||
    (answer.reason === 'code_wrong' && answer.attemptsLeft === 0)
  )
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'open':
      if (state.pending || (state.step !== 'idle' && state.step !== 'refresh')) return state
      return { ...state, step: 'confirm', decision: action.decision, consent: false, code: '', needsNewCode: false, errors: {}, message: null }

    case 'back':
      if (state.pending) return state
      if (state.step === 'confirm') return { ...state, step: 'idle', errors: {}, message: null }
      if (state.step === 'code') return { ...state, step: 'confirm', code: '', errors: {}, message: null }
      return state

    case 'edit': {
      if (state.pending || state.step !== (action.field === 'code' ? 'code' : 'confirm')) return state
      const errors = { ...state.errors }
      delete errors[ERROR_OF[action.field]]
      return { ...state, [action.field]: action.value, errors }
    }

    case 'consent': {
      if (state.pending || state.step !== 'confirm') return state
      const errors = { ...state.errors }
      delete errors.consent
      return { ...state, consent: action.checked, errors }
    }

    case 'request_code': {
      if (state.pending) return state
      if (state.step === 'code') return { ...state, pending: 'code', errors: {}, message: null }
      if (state.step !== 'confirm') return state
      const errors = checkConfirm(state)
      if (!isEmpty(errors)) return { ...state, errors, message: REFUSAL_MESSAGES.incomplete }
      return { ...state, pending: 'code', errors: {}, message: null }
    }

    case 'code_answer': {
      if (state.pending !== 'code') return state
      const { answer } = action
      if (!answer.ok) return { ...state, pending: null, message: answer.message }
      return { ...state, step: 'code', pending: null, code: '', needsNewCode: false, errors: {}, message: codeSentMessage(answer.maskedEmail, answer.expiresInMinutes) }
    }

    case 'submit': {
      if (state.pending || state.step !== 'code' || state.needsNewCode) return state
      const error = checkCode(state.code)
      if (error) return { ...state, errors: { code: error }, message: null }
      return { ...state, pending: 'decision', errors: {}, message: null }
    }

    case 'decision_answer': {
      if (state.pending !== 'decision') return state
      const { answer } = action
      if (answer.ok) return { ...state, step: 'done', pending: null, errors: {}, message: DECISION_RECORDED }
      if (answer.reason === 'stale' || answer.reason === 'not_open') return { ...state, step: 'refresh', pending: null, errors: {}, message: answer.message }
      const fieldErrors = confirmErrors(answer.errors)
      if (!isEmpty(fieldErrors)) return { ...state, step: 'confirm', pending: null, errors: fieldErrors, message: answer.message }
      const spent = codeSpent(answer)
      return {
        ...state,
        pending: null,
        needsNewCode: spent,
        code: spent ? '' : state.code,
        errors: answer.errors?.code ? { code: answer.errors.code } : {},
        message: answer.message,
      }
    }

    default:
      return state
  }
}
