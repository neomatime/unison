// The client's decision, checked and tidied before it goes anywhere near the database, and the words for a refusal.
// Pure: relative imports only, no directive, so the server action, the client form and the unit tests can all load it.
//
// portal_decide (20261020103000_quote_portal_decide.sql) applies the same field rules and refuses what breaks them as
// "incomplete". This layer applies them first, so a form that passes here never meets that refusal, and it also applies
// what the database does not: the bidi control characters (they can make a name read backwards in an email or a page),
// lone surrogates (they cannot be stored as text) and the exact consent wording.
//
// Lengths are counted in characters, as the database's char_length counts them, not in UTF-16 units. A refused field
// gets the drafted message for it from copy.ts; no message repeats what was typed.
import { isPortalToken } from '../../lib/quote-portal/token.ts'
import { DECLINE_REASONS } from '../../lib/quote-portal/types.ts'
import type { DecideInput, DecideRefusal, DeclineReason, DecisionKind, IssueCodeRefusal } from '../../lib/quote-portal/types.ts'
import { CONSENT_ACCEPT, CONSENT_DECLINE, FIELD_ERRORS, REFUSAL_FALLBACK, REFUSAL_MESSAGES, codeWrongMessage } from './copy.ts'

/** The fields that can be refused: the short names the form uses, one per input (plus the token, decision and page hash). */
export type DecisionField = keyof typeof FIELD_ERRORS

export type DecisionInputErrors = Partial<Record<DecisionField, string>>

export type NormalisedDecisionInput = { ok: true; value: DecideInput } | { ok: false; errors: DecisionInputErrors }

// Any control character (U+0000 to U+001F and U+007F to U+009F): a line break, a tab and a null byte are all in it.
const CONTROL = /\p{Cc}/u
// The marks that reorder text: the Arabic letter mark, left-to-right and right-to-left marks, embeddings, overrides and isolates.
const BIDI_CONTROL = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/
// With the u flag a surrogate matches only when it is unpaired, so a real emoji does not.
const LONE_SURROGATE = /[\uD800-\uDFFF]/u
const SIX_DIGITS = /^[0-9]{6}$/
const SNAPSHOT_HASH = /^[0-9a-f]{64}$/

const NAME_BOUNDS = { min: 2, max: 120 }
const POSITION_BOUNDS = { min: 2, max: 120 }
const ORGANISATION_BOUNDS = { min: 2, max: 160 }
/** The most characters a decline's comments may have: the form's rule, the database's and the owner's email's (which cuts at this and says so). */
export const COMMENTS_MAX = 2000

const countCharacters = (text: string) => Array.from(text).length
const isUnsafeText = (text: string) => BIDI_CONTROL.test(text) || LONE_SURROGATE.test(text)

/**
 * A one-line field: any control character (a tab and a line break too), bidi control or lone surrogate refuses it, then
 * the ends are trimmed, runs of whitespace become one space and the length in characters must be within the bounds.
 * The check comes before the trim, so a line break at either end is refused, not quietly dropped.
 */
function singleLine(value: unknown, bounds: { min: number; max: number }): string | null {
  if (typeof value !== 'string' || CONTROL.test(value) || isUnsafeText(value)) return null
  const text = value.trim().replace(/\s+/g, ' ')
  const length = countCharacters(text)
  return length >= bounds.min && length <= bounds.max ? text : null
}

/**
 * The comments of a decline: "\r\n" becomes "\n", and so do the Unicode line and paragraph separators (U+2028, U+2029),
 * a newline and a tab are allowed and every other control character is not, the ends are trimmed, and nothing (or only
 * whitespace) is null. Not-ok means the text is refused.
 *
 * The two separators are folded rather than refused because they are line breaks the client meant (they arrive with
 * pasted text) and they are invisible, so a refusal would give the client nothing to find. They must not reach the
 * database as they are: a C library that classes them as control characters (glibc does) makes portal_decide refuse the
 * comments as "incomplete". As "\n" they are valid under any locale.
 */
function comments(value: unknown): { ok: true; text: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, text: null }
  if (typeof value !== 'string') return { ok: false }
  const joined = value.replace(/\r\n/g, '\n').replace(/[\u2028\u2029]/g, '\n')
  if (CONTROL.test(joined.replace(/[\n\t]/g, '')) || isUnsafeText(joined)) return { ok: false }
  const text = joined.trim()
  if (text === '') return { ok: true, text: null }
  return countCharacters(text) <= COMMENTS_MAX ? { ok: true, text } : { ok: false }
}

const isDeclineReason = (value: string): value is DeclineReason => (DECLINE_REASONS as readonly string[]).includes(value)

/**
 * Checks the decision form (`raw`, whose keys are the DecideInput field names) and returns the typed input, or one
 * message per refused field, all at once. Nothing here throws, whatever `raw` holds.
 *
 * - token: exactly a portal link token. Not trimmed: it is a machine value, not typed.
 * - code: trimmed, then six digits. '12 34 56' is refused.
 * - decision: 'accepted' or 'declined', exactly.
 * - name, position, organisation: see singleLine; 2 to 120, 2 to 120 and 2 to 160 characters.
 * - consent: `true`, and consentText equal to CONSENT_ACCEPT (accept) or CONSENT_DECLINE (decline), exactly.
 * - snapshotHash: 64 lower-case hex characters, exactly.
 * - declineReason: one of the six, trimmed; empty is null; on an accept any reason is refused.
 * - declineComments: see comments (line and paragraph separators become newlines); empty is null; on an accept any comment is refused (the database refuses them too).
 */
export function normaliseDecisionInput(raw: Record<string, unknown>): NormalisedDecisionInput {
  const input: Record<string, unknown> = typeof raw === 'object' && raw !== null ? raw : {}
  const errors: DecisionInputErrors = {}

  const token = isPortalToken(input.token) ? input.token : null
  if (token === null) errors.token = FIELD_ERRORS.token

  const decision: DecisionKind | null = input.decision === 'accepted' || input.decision === 'declined' ? input.decision : null
  if (decision === null) errors.decision = FIELD_ERRORS.decision

  const signatoryName = singleLine(input.signatoryName, NAME_BOUNDS)
  if (signatoryName === null) errors.name = FIELD_ERRORS.name

  const signatoryPosition = singleLine(input.signatoryPosition, POSITION_BOUNDS)
  if (signatoryPosition === null) errors.position = FIELD_ERRORS.position

  const signatoryOrganisation = singleLine(input.signatoryOrganisation, ORGANISATION_BOUNDS)
  if (signatoryOrganisation === null) errors.organisation = FIELD_ERRORS.organisation

  // Without a valid decision there is no wording to hold the text against, and the decision error already stops the form.
  const expectedConsent = decision === 'accepted' ? CONSENT_ACCEPT : decision === 'declined' ? CONSENT_DECLINE : null
  if (input.consent !== true || (expectedConsent !== null && input.consentText !== expectedConsent)) {
    errors.consent = FIELD_ERRORS.consent
  }

  const code = typeof input.code === 'string' && SIX_DIGITS.test(input.code.trim()) ? input.code.trim() : null
  if (code === null) errors.code = FIELD_ERRORS.code

  const snapshotHash = typeof input.snapshotHash === 'string' && SNAPSHOT_HASH.test(input.snapshotHash) ? input.snapshotHash : null
  if (snapshotHash === null) errors.snapshot = FIELD_ERRORS.snapshot

  let declineReason: DeclineReason | null = null
  const givenReason = typeof input.declineReason === 'string' ? input.declineReason.trim() : input.declineReason
  if (givenReason !== null && givenReason !== undefined && givenReason !== '') {
    if (typeof givenReason === 'string' && isDeclineReason(givenReason) && decision !== 'accepted') declineReason = givenReason
    else errors.reason = FIELD_ERRORS.reason
  }

  const declineComments = comments(input.declineComments)
  if (!declineComments.ok || (declineComments.text !== null && decision === 'accepted')) errors.comments = FIELD_ERRORS.comments

  if (
    Object.keys(errors).length > 0 ||
    token === null || decision === null || signatoryName === null || signatoryPosition === null ||
    signatoryOrganisation === null || expectedConsent === null || code === null || snapshotHash === null || !declineComments.ok
  ) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    value: {
      token,
      code,
      decision,
      signatoryName,
      signatoryPosition,
      signatoryOrganisation,
      consentText: expectedConsent,
      consent: true,
      snapshotHash,
      declineReason,
      declineComments: declineComments.text,
    },
  }
}

/**
 * An address with all of its local part but the first character hidden, for telling the client where the code went:
 * 'jane@acme.co.za' is 'j***@acme.co.za'. An address with no '@' is '***'. The domain is kept whole.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@')
  if (at < 0) return '***'
  const [first = ''] = address.slice(0, at)
  return `${first}***${address.slice(at)}`
}

/**
 * What to tell the client when a code request or a decision is refused. `attemptsLeft` matters to code_wrong only.
 * A reason this build does not know gets a message that is true of any failure. Never names how a check works.
 */
export function refusalMessage(reason: DecideRefusal | IssueCodeRefusal | 'send_failed', attemptsLeft?: number): string {
  if (reason === 'code_wrong') return codeWrongMessage(attemptsLeft)
  return Object.hasOwn(REFUSAL_MESSAGES, reason) ? REFUSAL_MESSAGES[reason] : REFUSAL_FALLBACK
}
