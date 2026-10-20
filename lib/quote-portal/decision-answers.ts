// What portal_issue_code and portal_decide answer (20261020102000_quote_portal_code_functions.sql and
// 20261020103000_quote_portal_decide.sql), checked key by key and turned into camel case for the portal client.
// Pure: relative imports only, no directive, so unit tests can load it.
//
// An answer of any other shape means the database contract is broken, which is a fault, not something to act on. It
// fails with one fixed sentence, as portal_get_quote's does: a code answer holds the code and the address, a decision
// answer the signatory and two addresses, so nothing of an answer is ever put into an error.
import type { DecideRefusal, DecideResult, DecisionKind, IssueCodeRefusal, IssueCodeResult } from './types.ts'

// Records rather than lists, so the compiler insists on every reason of the type and on nothing else.
const ISSUE_CODE_REFUSALS: Record<IssueCodeRefusal, true> = { invalid: true, not_open: true, already_decided: true, throttled: true }
const DECIDE_REFUSALS: Record<DecideRefusal, true> = {
  invalid: true,
  not_open: true,
  incomplete: true,
  stale: true,
  code_missing: true,
  code_wrong: true,
  code_expired: true,
  code_locked: true,
  throttled: true,
}

const SIX_DIGITS = /^[0-9]{6}$/

type Answer = Record<string, unknown>

const isAnswer = (value: unknown): value is Answer => typeof value === 'object' && value !== null && !Array.isArray(value)
const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isTextOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string'
const isDecision = (value: unknown): value is DecisionKind => value === 'accepted' || value === 'declined'
const isIssueCodeRefusal = (value: unknown): value is IssueCodeRefusal => typeof value === 'string' && Object.hasOwn(ISSUE_CODE_REFUSALS, value)
const isDecideRefusal = (value: unknown): value is DecideRefusal => typeof value === 'string' && Object.hasOwn(DECIDE_REFUSALS, value)

const codeAnswerError = () => new Error('portal_issue_code returned an unexpected answer')
const decideAnswerError = () => new Error('portal_decide returned an unexpected answer')

/**
 * portal_issue_code's answer: `{ ok: true, code, expires_at, recipient_email, quote_number, client_name }` or
 * `{ ok: false, reason }` with one of the four reasons. The code must be six digits and the address and the number
 * present; client_name is null when the quote's record has none.
 */
export function readIssueCodeAnswer(data: unknown): IssueCodeResult {
  if (!isAnswer(data)) throw codeAnswerError()
  if (data.ok === false) {
    if (!isIssueCodeRefusal(data.reason)) throw codeAnswerError()
    return { ok: false, reason: data.reason }
  }
  const { ok, code, expires_at: expiresAt, recipient_email: recipientEmail, quote_number: quoteNumber, client_name: clientName } = data
  if (
    ok !== true || typeof code !== 'string' || !SIX_DIGITS.test(code) || !isFilled(expiresAt) || !isFilled(recipientEmail) ||
    !isFilled(quoteNumber) || !isTextOrNull(clientName)
  ) {
    throw codeAnswerError()
  }
  return { ok: true, code, expiresAt, recipientEmail, quoteNumber, clientName }
}

/**
 * portal_decide's answer: the recorded outcome with `replay` (true when this link had decided before and nothing was
 * written), or `{ ok: false, reason }` with one of the nine reasons; code_wrong also carries the attempts left, a whole
 * number of zero or more. Every key of the outcome must be there: the owner's name, the address to tell and the decline
 * reason and comments as text or null, the rest as text.
 */
export function readDecideAnswer(data: unknown): DecideResult {
  if (!isAnswer(data)) throw decideAnswerError()
  if (data.ok === false) {
    const { reason, attempts_left: attemptsLeft } = data
    if (!isDecideRefusal(reason)) throw decideAnswerError()
    if (reason !== 'code_wrong') return { ok: false, reason }
    if (typeof attemptsLeft !== 'number' || !Number.isInteger(attemptsLeft) || attemptsLeft < 0) throw decideAnswerError()
    return { ok: false, reason, attemptsLeft }
  }
  const {
    ok,
    replay,
    decision,
    decided_at: decidedAt,
    quote_id: quoteId,
    quote_number: quoteNumber,
    client_name: clientName,
    recipient_email: recipientEmail,
    signatory_name: signatoryName,
    signatory_position: signatoryPosition,
    decline_reason: declineReason,
    decline_comments: declineComments,
    owner_name: ownerName,
    notify_email: notifyEmail,
  } = data
  if (
    ok !== true || typeof replay !== 'boolean' || !isDecision(decision) || !isFilled(decidedAt) || !isFilled(quoteId) ||
    !isFilled(quoteNumber) || !isFilled(clientName) || !isFilled(recipientEmail) || !isFilled(signatoryName) ||
    !isFilled(signatoryPosition) || !isTextOrNull(declineReason) || !isTextOrNull(declineComments) ||
    !isTextOrNull(ownerName) || !isTextOrNull(notifyEmail)
  ) {
    throw decideAnswerError()
  }
  return {
    ok: true,
    replay,
    outcome: {
      decision,
      decidedAt,
      quoteId,
      quoteNumber,
      clientName,
      recipientEmail,
      signatoryName,
      signatoryPosition,
      declineReason,
      declineComments,
      ownerName,
      notifyEmail,
    },
  }
}
