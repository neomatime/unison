// What public.portal_get_quote returns, as the portal page reads it. Pure types and two small guards: no directive,
// no imports, so unit tests can load it.
//
// The shapes mirror the function as the read-fixes migration (20261018102500_quote_portal_read_fixes.sql) leaves it,
// key for key. Numbers that come from numeric columns can arrive as JSON numbers or as strings, so every amount is
// typed number | string and read with Number(). Dates are 'YYYY-MM-DD', timestamps are ISO text in UTC.

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

/** True for open, accepted and declined, and for nothing else, whatever it is given. */
export function isViewableState(state: unknown): state is ViewableState {
  return typeof state === 'string' && (VIEWABLE_STATES as readonly string[]).includes(state)
}

/** Narrows a portal result to the full shape. A check on quote.state alone would not narrow quote itself. */
export function isViewableQuote(quote: PortalQuote): quote is PortalQuoteFull {
  return isViewableState(quote.state)
}
