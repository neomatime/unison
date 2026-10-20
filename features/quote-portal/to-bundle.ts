// The bridge from what the portal reads to what the shared document code takes. Pure: relative imports only (the
// bundle type is erased at run time), no directive, so unit tests can load it.
import type { DocumentBundle } from '../documents/queries/get-document.ts'
import { isViewableQuote, type PortalQuote } from '../../lib/quote-portal/types.ts'

/**
 * `{ record, lines, client: null, settings: null }`: the portal's frozen quote as the bundle buildDocumentView and
 * makeDocumentPdf take. That is complete for a quote that has gone out, because such a document is built only from the
 * copies frozen onto it (its record, with its issuer and bill-to, and its lines); the live client and company settings
 * are read for a draft alone. The page and the PDF are therefore the same document, by construction.
 *
 * Only a quote the client can read (open, accepted, declined) has anything to build from.
 */
export function toDocumentBundle(quote: PortalQuote): DocumentBundle {
  if (!isViewableQuote(quote)) throw new Error('Only a viewable quote has a document')
  return { record: quote.record, lines: quote.lines, client: null, settings: null }
}
