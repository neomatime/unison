'use server'

import { headers } from 'next/headers'

import { DECIDE_OK_UNREADABLE } from '@/lib/quote-portal/decision-answers'
import { submitPortalDecision } from '@/lib/quote-portal/portal-client'
import type { DecideRefusal, DecideResult, DecisionKind } from '@/lib/quote-portal/types'
import { REFUSAL_FALLBACK } from '../copy'
import { normaliseDecisionInput, refusalMessage, type DecisionInputErrors } from '../decision'
import { readEvidence } from '../evidence'
import { sendDecisionEmails } from '../send-decision-emails'

/**
 * Called from the portal page when the client confirms an accept or a decline with their code. A public endpoint, so
 * everything it is given is checked here first: normaliseDecisionInput refuses a bad field with a message per field,
 * before the database is reached at all.
 *
 * - The IP address and user agent are read from the request (readEvidence), never from the form.
 * - The browser hears the decision and whether it was a replay, or a message with the reason, the attempts left for a
 *   wrong code, or the field errors. Never the outcome: a replay gives back the signatory and the addresses without a
 *   code, and they are for the emails only.
 * - The emails follow a new decision only (a replay was told the first time) and are awaited, but sendDecisionEmails
 *   never rejects, so nothing they do changes the answer.
 */
export async function decideAction(raw: Record<string, unknown>): Promise<
  | { ok: true; decision: DecisionKind; replay: boolean }
  | { ok: false; message: string; reason?: DecideRefusal; attemptsLeft?: number; errors?: DecisionInputErrors }
> {
  const input = normaliseDecisionInput(raw)
  if (!input.ok) return { ok: false, message: refusalMessage('incomplete'), errors: input.errors }

  const requestHeaders = await headers()
  const evidence = readEvidence((name) => requestHeaders.get(name))

  let result: DecideResult
  try {
    result = await submitPortalDecision(input.value, evidence)
  } catch (error) {
    // An ok answer that cannot be read is a decision that HAS committed (and so has no emails, and a retry replays into
    // the same answer); any other failure happened before the commit. The browser hears the same fallback for both, but
    // the log tells them apart. The error's message is fixed and holds nothing of the answer.
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error(message === DECIDE_OK_UNREADABLE ? '[quote-portal:decide:unreadable]' : '[quote-portal:decide]', message)
    return { ok: false, message: REFUSAL_FALLBACK }
  }
  if (!result.ok) return { ok: false, message: refusalMessage(result.reason, result.attemptsLeft), reason: result.reason, attemptsLeft: result.attemptsLeft }

  if (!result.replay) await sendDecisionEmails(result.outcome)
  return { ok: true, decision: result.outcome.decision, replay: result.replay }
}
