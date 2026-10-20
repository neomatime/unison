import 'server-only'

import { getDocument } from '@/features/documents/queries/get-document'
import { documentContext } from '@/features/documents/server-context'
import { isDraftReference } from '@/features/documents/vocabulary'

/** One link as the staff panel shows it. The secret part of a link is not stored, and no column that holds it is read. */
export type QuoteLinkRow = {
  id: string
  recipient_email: string
  recipient_name: string | null
  created_at: string
  expires_at: string
  first_viewed_at: string | null
  last_viewed_at: string | null
  revoked_at: string | null
  revoked_reason: string | null
}

export type QuoteLinks = {
  /** Newest first. */
  links: QuoteLinkRow[]
  /** The number of the quote this one revises, or null when it revises none, or that one is a draft or not visible. */
  replacesNumber: string | null
  /** The numbers of the sent quotes that revise this one, newest first. Usually none or one. */
  replacedBy: string[]
}

/** A real number worth showing: a draft carries a DRAFT- reference, which says nothing to anyone. */
const shownNumber = (value: unknown): string | null => (typeof value === 'string' && value !== '' && !isDraftReference(value) ? value : null)

/**
 * The links made for one quote, read through the signed-in member's own session (row level security limits the rows to
 * their organisation; the filter on it is for the reader), and the quotes either side of it in a chain of revisions.
 */
export async function listQuoteLinks(quoteId: string): Promise<QuoteLinks> {
  const { organization, db } = await documentContext()
  const [bundle, links, replacedBy] = await Promise.all([
    getDocument('quote', quoteId),
    db
      .from('quote_access_links')
      .select('id,recipient_email,recipient_name,created_at,expires_at,first_viewed_at,last_viewed_at,revoked_at,revoked_reason')
      .eq('quote_id', quoteId)
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('quotes')
      .select('quote_number')
      .eq('supersedes_quote_id', quoteId)
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])
  if (links.error) throw links.error
  if (replacedBy.error) throw replacedBy.error

  const replacesId = bundle?.record.supersedes_quote_id
  let replacesNumber: string | null = null
  if (typeof replacesId === 'string' && replacesId !== '') {
    const replaces = await db.from('quotes').select('quote_number').eq('id', replacesId).eq('organization_id', organization.id).maybeSingle()
    if (replaces.error) throw replaces.error
    replacesNumber = shownNumber(replaces.data?.quote_number)
  }

  return {
    links: (links.data ?? []) as QuoteLinkRow[],
    replacesNumber,
    replacedBy: ((replacedBy.data ?? []) as Array<{ quote_number: unknown }>).map((row) => shownNumber(row.quote_number)).filter((number): number is string => number !== null),
  }
}

/**
 * One recorded client response as the staff panel shows it. The address, the browser and the exact consent wording of a
 * response are stored as evidence only: they are not in this type and the query below does not select them.
 */
export type QuoteResponseRow = {
  id: string
  link_id: string
  decision: 'accepted' | 'declined'
  decided_at: string
  /** Client-supplied text: show it as text, never as markup. */
  signatory_name: string
  signatory_position: string
  signatory_organisation: string
  verified_email: string
  quote_number: string
  quote_version: number
  /** The jsonb the quote carried when it went out: an array of `{ layer, version, ... }`, or null. Not trusted to be either. */
  terms_sources: unknown
  snapshot_hash: string
  decline_reason: string | null
  /** Client-supplied text, line breaks included. */
  decline_comments: string | null
}

/**
 * The responses recorded for one quote, newest first, read through the signed-in member's own session (row level security
 * limits the rows to their organisation; the filter on it is for the reader). A link holds at most one, so at most 100.
 */
export async function listQuoteResponses(quoteId: string): Promise<QuoteResponseRow[]> {
  const { organization, db } = await documentContext()
  const responses = await db
    .from('quote_responses')
    .select('id,link_id,decision,decided_at,signatory_name,signatory_position,signatory_organisation,verified_email,quote_number,quote_version,terms_sources,snapshot_hash,decline_reason,decline_comments')
    .eq('quote_id', quoteId)
    .eq('organization_id', organization.id)
    .order('decided_at', { ascending: false })
    .limit(100)
  if (responses.error) throw responses.error
  return (responses.data ?? []) as QuoteResponseRow[]
}

/** The address and time of each email recorded for this quote, newest first (at most 50): what the panel checks a link against. */
export async function listQuoteSends(quoteId: string): Promise<Array<{ to_address: string; sent_at: string }>> {
  const { organization, db } = await documentContext()
  const sends = await db
    .from('document_emails')
    .select('to_address,sent_at')
    .eq('quote_id', quoteId)
    .eq('organization_id', organization.id)
    .order('sent_at', { ascending: false })
    .limit(50)
  if (sends.error) throw sends.error
  return (sends.data ?? []) as Array<{ to_address: string; sent_at: string }>
}
