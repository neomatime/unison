// What public.portal_get_quote returns, as the portal page reads it, and (further down) what the client's decision sends
// and gets back. Pure types, the decline reasons and two small guards: no directive, no imports, so unit tests can load it.
//
// The shapes mirror the function as the latest migration that redefines it leaves it (the snapshot hash and the link's
// response arrive with 20261020102000_quote_portal_code_functions.sql), key for key. Numbers that come from numeric
// columns can arrive as JSON numbers or as strings, so every amount is typed number | string and read with Number().
// Dates are 'YYYY-MM-DD', timestamps are ISO text in UTC.

/** The six answers the database can give. The first three carry the whole quote; expired and superseded a short card. */
export const PORTAL_STATES = ['open', 'accepted', 'declined', 'expired', 'superseded', 'invalid'] as const
export type PortalState = (typeof PORTAL_STATES)[number]

/** The states whose quote the client can read in full, and whose PDF can be downloaded. */
export const VIEWABLE_STATES = ['open', 'accepted', 'declined'] as const
export type ViewableState = (typeof VIEWABLE_STATES)[number]

/** The states answered with the short card: the number, the client, the valid-until date. */
export type ShortState = 'expired' | 'superseded'

export type PortalAmount = number | string

/** The quote_lines columns the portal gets: nothing else (no quote id, no organisation, no price list item). */
export type PortalLine = {
  id: string
  position: number
  title: string
  description: string | null
  quantity: PortalAmount
  unit_price: PortalAmount
  vat_code: 'standard' | 'zero'
  line_amount: PortalAmount
  /** Null on a quote from before charge kinds existed. */
  charge_kind: 'once_off' | 'monthly' | null
}

/** One entry of the frozen terms provenance: the template layer and its version, never the database ids. */
export type PortalTermsSource = { layer: string; version: number }

/** The frozen quote record: exactly the keys private.quote_snapshot builds, and none of the internal ones. */
export type PortalRecord = {
  quote_number: string
  status: string
  issue_date: string | null
  valid_until: string | null
  currency: string
  client_name: string
  contact_name: string | null
  client_ref: string | null
  project_name: string | null
  project_description: string | null
  project_ref: string | null
  vat_rate: PortalAmount
  subtotal: PortalAmount
  tax_amount: PortalAmount
  total_amount: PortalAmount
  terms: string | null
  service_inclusions: string | null
  terms_sources: PortalTermsSource[] | null
  /** The client details frozen when the quote went out (jsonb). */
  bill_to: Record<string, unknown> | null
  /** The company details frozen when the quote went out (jsonb). */
  issuer: Record<string, unknown> | null
  sent_at: string | null
  accepted_at: string | null
  /**
   * The day the monthly charge starts ('YYYY-MM-DD') and the term in months. private.quote_snapshot adds both keys ONLY for a quote
   * that has them (20261026106000_quote_billing_terms_snapshot.sql), so a quote without terms, and an answer from before they
   * existed, lack the keys altogether.
   */
  start_date?: string | null
  term_months?: number | null
}

/** What an expired or superseded link carries of the quote. */
export type PortalShortRecord = {
  quote_number: string
  client_name: string
  valid_until: string | null
}

/** The quote's owner, from the team member row; null when the quote has none. */
export type PortalOwner = { name: string; email: string; job_title: string | null }

/** Unknown, revoked, archived, malformed: all the same answer, with nothing else in it. */
export type PortalQuoteInvalid = { state: 'invalid' }

/** Open, accepted and declined: the full quote, the recipient and when the link stops working. */
export type PortalQuoteFull = {
  state: ViewableState
  expires_at: string
  recipient_email: string
  recipient_name: string | null
  record: PortalRecord
  lines: PortalLine[]
  /** 1 plus the quotes this one replaced, along the chain. */
  version: number
  /** The number of the quote this one replaced, when it is the same client's and numbered. */
  replaces_number: string | null
  owner: PortalOwner | null
  /** The hash of the quote as this page shows it (64 lower-case hex characters). A decision sends it back as proof of what was seen. */
  snapshot_hash: string
  /** What this link decided, or null when it has decided nothing. */
  response: { decision: DecisionKind; decided_at: string } | null
}

/** Expired and superseded: no lines, no recipient and no link expiry. */
export type PortalQuoteShort = {
  state: ShortState
  record: PortalShortRecord
  version: number
  replaces_number: string | null
  owner: PortalOwner | null
}

export type PortalQuote = PortalQuoteInvalid | PortalQuoteFull | PortalQuoteShort

// ---------------------------------------------------------------------------------------------------------------
// Slice 2: the client's decision. What the two service-role functions (portal_issue_code, portal_decide) take and give.
// ---------------------------------------------------------------------------------------------------------------

/**
 * The six reasons a client can give for declining, in the order the quote_responses decline_reason check lists them
 * (20261020100000_quote_portal_decisions_schema.sql). A unit test reads the SQL to keep the two the same.
 */
export const DECLINE_REASONS = [
  'Budget considerations',
  'Timing is not right',
  'Scope does not meet our requirements',
  'Internal approval pending',
  'Chose another provider',
  'Other',
] as const
export type DeclineReason = (typeof DECLINE_REASONS)[number]

export type DecisionKind = 'accepted' | 'declined'

/** What portal_decide is given, after features/quote-portal/decision.ts has checked and tidied it. */
export type DecideInput = {
  token: string
  code: string
  decision: DecisionKind
  signatoryName: string
  signatoryPosition: string
  signatoryOrganisation: string
  /** The wording the client saw next to the tick-box, word for word. */
  consentText: string
  consent: true
  snapshotHash: string
  declineReason: DeclineReason | null
  declineComments: string | null
}

/**
 * The success answer of portal_decide in camel case, without `ok` and `replay`. For a repeated request it is the outcome
 * recorded the first time. The owner's name and the address to tell are null when the quote has no owner or sender.
 */
export type DecisionOutcome = {
  decision: DecisionKind
  decidedAt: string
  quoteId: string
  quoteNumber: string
  clientName: string
  recipientEmail: string
  signatoryName: string
  signatoryPosition: string
  declineReason: string | null
  declineComments: string | null
  ownerName: string | null
  notifyEmail: string | null
}

/** Why portal_issue_code gave no code. */
export type IssueCodeRefusal = 'invalid' | 'not_open' | 'already_decided' | 'throttled'

export type IssueCodeResult =
  | { ok: true; code: string; expiresAt: string; recipientEmail: string; quoteNumber: string; clientName: string | null }
  | { ok: false; reason: IssueCodeRefusal }

/** Why portal_decide wrote nothing. `attemptsLeft` comes with code_wrong only. */
export type DecideRefusal =
  | 'invalid'
  | 'not_open'
  | 'incomplete'
  | 'stale'
  | 'code_missing'
  | 'code_wrong'
  | 'code_expired'
  | 'code_locked'
  | 'throttled'

export type DecideResult =
  | { ok: true; replay: boolean; outcome: DecisionOutcome }
  | { ok: false; reason: DecideRefusal; attemptsLeft?: number }

/** True for open, accepted and declined, and for nothing else, whatever it is given. */
export function isViewableState(state: unknown): state is ViewableState {
  return typeof state === 'string' && (VIEWABLE_STATES as readonly string[]).includes(state)
}

/** Narrows a portal result to the full shape. A check on quote.state alone would not narrow quote itself. */
export function isViewableQuote(quote: PortalQuote): quote is PortalQuoteFull {
  return isViewableState(quote.state)
}
