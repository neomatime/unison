// What the quotation email says: the summary card's figures and words and the sign-off, mapped from the same document
// view the PDF is printed from. Pure: relative .ts imports only, no '@/', no 'server-only', no directive, so
// `node --test` can load it (tests/unit/quote-portal-email-data.test.ts).
import type { QuoteEmailData } from '../../lib/email/templates/quote.ts'
import { formatDocumentDate, type DocumentView } from '../documents/document-view.ts'
import { clientStatusLabel, versionLabel } from './summary.ts'

export function buildQuoteEmailData(input: {
  /** buildDocumentView of the Sent quote: its number, totals and company details are the frozen ones. */
  view: DocumentView
  /** The quote row the view was built from. */
  record: Record<string, any>
  personalNote: string
  reviewUrl: string
  pdfUrl: string
  assetBaseUrl: string
  sender: { name: string; role: string | null }
  /** The quote's place in its revision chain, as the portal reads it for the new link (version, replaces_number). */
  version: { version: number; replacesNumber: string | null }
}): QuoteEmailData {
  const { view, record } = input
  return {
    // A Sent quote always has its number; the caller refuses one without it before minting a link.
    quoteNumber: view.number ?? '',
    // Version 1 says nothing; a revision says "Version 2, replacing HMK-Q-2026-00045", as the portal does.
    versionLabel: input.version.version > 1 ? versionLabel(input.version.version, input.version.replacesNumber) : null,
    clientName: String(record.client_name ?? ''),
    projectName: view.project?.title ?? null,
    // The quote total, which includes VAT when VAT was charged; never the subtotal.
    totalLabel: `${view.currency} ${view.totals.total}`,
    // "Incl. VAT (15%)", with the rate the view prints from record.vat_rate; a quote with no VAT does not claim a rate.
    vatNote: Number(record.tax_amount) > 0 ? `Incl. ${view.totals.vatLabel}` : 'No VAT charged',
    validUntil: formatDocumentDate(record.valid_until),
    // The one sentence the portal and the PDF print, from the same view; null (no row, no line) for a quote without a start date and term.
    agreement: view.agreement,
    statusLabel: clientStatusLabel(String(record.status)),
    recipientName: record.contact_name ?? null,
    personalNote: input.personalNote,
    reviewUrl: input.reviewUrl,
    pdfUrl: input.pdfUrl,
    assetBaseUrl: input.assetBaseUrl,
    sender: {
      name: input.sender.name,
      role: input.sender.role,
      company: view.from.name ?? '',
      website: view.footer.website,
      email: view.footer.email,
      phone: view.footer.phone,
    },
  }
}
