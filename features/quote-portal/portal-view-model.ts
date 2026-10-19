// What the portal page prints, worked out as plain data, so that every figure and every link on the page can be tested
// without rendering it. Pure: relative imports only, no directive, so unit tests can load it. The components only lay
// this out; they do no arithmetic, no formatting of money and no link building of their own.
//
// MONEY. The VAT and total rows are the stored figures of the quote (record.subtotal, tax_amount and total_amount,
// formatted by buildDocumentView), never a sum of the summary's groups. The database rounds the VAT of the whole quote
// once, and a sum of per-group roundings can differ from it by a cent. The summary supplies only what is shown inside
// its own groups: the once-off subtotal and the monthly subtotal, VAT and total including VAT.
//
// TEXT. Every string here is passed through as it is stored (trimmed at its ends, nothing else). It reaches the page as
// a React text node, which escapes it; nothing here produces markup.
import type { PortalLine, PortalOwner, PortalQuoteFull, PortalQuoteInvalid, PortalQuoteShort } from '../../lib/quote-portal/types.ts'
import { buildDocumentView, formatAmount, formatDocumentDate, formatQuantity } from '../documents/document-view.ts'
import { isDraftReference } from '../documents/vocabulary.ts'
import {
  acceptedBanner,
  DECLINED_BANNER,
  ERROR_HEADING,
  ERROR_SENTENCE,
  EXPIRED_HEADING,
  EXPIRED_SENTENCE,
  INVALID_HEADING,
  INVALID_SENTENCE,
  RECURRING_NOTE,
  SUPERSEDED_HEADING,
  SUPERSEDED_SENTENCE,
} from './copy.ts'
import { buildCommercialSummary, clientStatusLabel, versionLabel } from './summary.ts'
import { toDocumentBundle } from './to-bundle.ts'

type Row = Record<string, unknown>

/** A string trimmed at both ends; null for anything that is not a string or is blank. */
const text = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

const isRow = (raw: unknown): raw is Row => typeof raw === 'object' && raw !== null && !Array.isArray(raw)

/** One non-blank item per line. */
const paragraphs = (raw: unknown): string[] =>
  (text(raw) ?? '')
    .split(/\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

// ---------------------------------------------------------------------------------------------------------------
// Links: a value from the frozen company details becomes a link only when it is certain to be what it says
// ---------------------------------------------------------------------------------------------------------------

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/
const PHONE = /^\+?\d{6,15}$/

/** An http or https address for a website as typed ("https://x.co.za" or "x.co.za"); null for anything else (a script, a data address, credentials, text). */
export function safeWebsiteHref(raw: unknown): string | null {
  const value = text(raw)
  if (!value || value.length > 2000) return null
  const candidate = /^https?:\/\//i.test(value) ? value : DOMAIN.test(value) ? `https://${value}` : null
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username !== '' || url.password !== '' || !url.hostname.includes('.')) return null
    return url.href
  } catch {
    return null
  }
}

/** A mailto: link for exactly one plain address; null for anything that could carry a second recipient, a header or a query. */
export function safeMailtoHref(raw: unknown): string | null {
  const value = text(raw)
  return value && value.length <= 254 && EMAIL.test(value) ? `mailto:${value}` : null
}

/** A tel: link for a number of 6 to 15 digits, with an optional leading plus; spaces, brackets, dots and hyphens are dropped. */
export function safeTelHref(raw: unknown): string | null {
  const value = text(raw)
  if (!value) return null
  const compact = value.replace(/[\s().-]/g, '')
  return PHONE.test(compact) ? `tel:${compact}` : null
}

/** The text as stored, and the link it earns (null when it is not safe to link). */
export type PortalLink = { text: string; href: string | null }
const link = (raw: unknown, href: (value: unknown) => string | null): PortalLink | null => {
  const value = text(raw)
  return value ? { text: value, href: href(value) } : null
}

// ---------------------------------------------------------------------------------------------------------------
// Dates and times
// ---------------------------------------------------------------------------------------------------------------

// A moment is shown as the client's own calendar day: South African time, whatever the server's clock says.
const INSTANT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' })
function formatInstantDate(raw: unknown): string | null {
  const value = text(raw)
  if (!value) return null
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? null : INSTANT_DATE.format(moment)
}

// ---------------------------------------------------------------------------------------------------------------
// The quote page
// ---------------------------------------------------------------------------------------------------------------

export type PortalFactTone = 'awaiting' | 'accepted' | 'declined' | 'neutral'
/** One cell of the information strip. Only the status cell has a tone. */
export type PortalFact = { label: string; value: string; tone?: PortalFactTone }

export type PortalLineRow = { title: string; quantity: string; unitPrice: string; amount: string; zeroRated: boolean }

export type PortalCommercial = {
  currency: string
  grouped: boolean
  /** The flat list; empty when the summary is grouped. */
  rows: PortalLineRow[]
  onceOff: { rows: PortalLineRow[]; subtotal: string } | null
  /** `vat` and `includingVat` are null when the monthly lines carry no VAT. */
  monthly: { rows: PortalLineRow[]; subtotal: string; vat: string | null; includingVat: string | null } | null
  /** The stored figures of the quote, formatted: what the VAT and total rows print. */
  totals: { subtotal: string; vatLabel: string; vat: string; total: string }
  totalLabel: string
  /** The note that monthly charges recur; present only with a grouped summary. */
  recurringNote: string | null
}

export type PortalContact = {
  name: string | null
  jobTitle: string | null
  company: string | null
  website: PortalLink | null
  email: PortalLink | null
  phone: PortalLink | null
}

export type PortalQuoteModel = {
  /** True only while the quote is open: a decided quote must not be offered a response (the panel then has no "Ready to respond?" heading and no note on how to respond). */
  respondable: boolean
  facts: PortalFact[]
  banner: { tone: 'accepted' | 'declined'; text: string } | null
  scope: { description: string[]; inclusions: string[]; services: Array<{ title: string; description: string }> } | null
  commercial: PortalCommercial
  terms: { items: string[]; sources: string[] } | null
  contact: PortalContact
}

const STATUS_TONES: Record<string, PortalFactTone> = { Sent: 'awaiting', Accepted: 'accepted', Declined: 'declined' }

function lineRow(line: PortalLine): PortalLineRow {
  return {
    title: text(line.title) ?? '',
    quantity: formatQuantity(line.quantity),
    unitPrice: formatAmount(line.unit_price),
    amount: formatAmount(line.line_amount),
    zeroRated: line.vat_code === 'zero',
  }
}

export function buildPortalQuoteModel(quote: PortalQuoteFull): PortalQuoteModel {
  const { record } = quote
  const view = buildDocumentView({ kind: 'quote', ...toDocumentBundle(quote) })
  const currency = view.currency

  // --- the information strip: the quote's own facts, in the order of the reference; one it does not have is left out
  const facts: PortalFact[] = []
  const addFact = (label: string, value: string | null, tone?: PortalFactTone) => {
    if (value) facts.push(tone ? { label, value, tone } : { label, value })
  }
  const tax = Number(record.tax_amount)
  addFact('Quote number', view.number)
  addFact('Version', versionLabel(quote.version, quote.replaces_number))
  addFact('Client', text(record.client_name))
  addFact('Project / Service', text(record.project_name))
  addFact('Issue date', formatDocumentDate(record.issue_date))
  addFact('Valid until', formatDocumentDate(record.valid_until))
  const status = String(record.status)
  addFact('Status', clientStatusLabel(status), Object.hasOwn(STATUS_TONES, status) ? STATUS_TONES[status] : 'neutral')
  addFact('Amount', `${currency} ${view.totals.total}`)
  // Read off the stored tax: a quote that charges tax includes it in the amount; one that does not says so.
  addFact('VAT', Number.isFinite(tax) ? (tax > 0 ? `Includes ${view.totals.vatLabel}` : 'No VAT charged') : null)

  // --- the banner on a decided quote
  const banner: PortalQuoteModel['banner'] =
    quote.state === 'accepted'
      ? { tone: 'accepted', text: acceptedBanner(formatInstantDate(record.accepted_at)) }
      : quote.state === 'declined'
        ? { tone: 'declined', text: DECLINED_BANNER }
        : null

  // --- scope: the project description, the inclusions, and each line's description as stored
  const description = paragraphs(record.project_description)
  const services = view.lines.flatMap((line) => (line.description ? [{ title: line.title, description: line.description }] : []))
  const scope = description.length || view.inclusions.length || services.length ? { description, inclusions: view.inclusions, services } : null

  // --- the commercial summary
  const summary = buildCommercialSummary(quote.lines, Number(record.vat_rate ?? 15))
  const totals = { ...view.totals }
  let commercial: PortalCommercial
  if (summary.grouped) {
    const monthlyHasVat = summary.monthlyVat > 0
    commercial = {
      currency,
      grouped: true,
      rows: [],
      onceOff: summary.onceOff.length ? { rows: summary.onceOff.map(lineRow), subtotal: formatAmount(summary.onceOffSubtotal) } : null,
      monthly: {
        rows: summary.monthly.map(lineRow),
        subtotal: formatAmount(summary.monthlySubtotal),
        vat: monthlyHasVat ? formatAmount(summary.monthlyVat) : null,
        includingVat: monthlyHasVat ? formatAmount(summary.monthlyIncludingVat) : null,
      },
      totals,
      totalLabel: 'Total initial amount',
      recurringNote: RECURRING_NOTE,
    }
  } else {
    commercial = { currency, grouped: false, rows: summary.lines.map(lineRow), onceOff: null, monthly: null, totals, totalLabel: 'Total quoted amount', recurringNote: null }
  }

  // --- the frozen terms, with the template versions they were filled from
  const sources = (Array.isArray(record.terms_sources) ? record.terms_sources : []).flatMap((source) => {
    const layer = isRow(source) ? text(source.layer) : null
    const version = isRow(source) ? Number(source.version) : Number.NaN
    return layer && Number.isFinite(version) ? [`${layer} v${version}`] : []
  })
  const terms = view.terms.length ? { items: view.terms, sources } : null

  return { respondable: quote.state === 'open', facts, banner, scope, commercial, terms, contact: buildContact(quote.owner, record.issuer) }
}

/** The owner's name and job title, with the company's website, email and phone; the company's name stands in for a missing owner. */
function buildContact(owner: PortalOwner | null, issuerRaw: unknown): PortalContact {
  const issuer: Row = isRow(issuerRaw) ? issuerRaw : {}
  const ownerName = text(owner?.name)
  const issuerName = text(issuer.legal_name)
  return {
    name: ownerName ?? issuerName,
    jobTitle: ownerName ? text(owner?.job_title) : null,
    company: ownerName && issuerName && issuerName !== ownerName ? issuerName : null,
    website: link(issuer.website, safeWebsiteHref),
    email: link(issuer.email, safeMailtoHref),
    phone: link(issuer.phone, safeTelHref),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The state cards: expired, replaced, not valid, and a temporary error
// ---------------------------------------------------------------------------------------------------------------

export type StateCardKind = 'expired' | 'superseded' | 'invalid' | 'error'

export type StateCardModel = {
  kind: StateCardKind
  heading: string
  sentence: string
  /** What the short answer carries of the quote: its number, its client and its valid-until date. Empty for a link that is not valid. */
  facts: Array<{ label: string; value: string }>
  /** The owner to contact, when the quote has one. */
  contact: { name: string | null; jobTitle: string | null; email: PortalLink | null } | null
}

const CARDS = {
  expired: { heading: EXPIRED_HEADING, sentence: EXPIRED_SENTENCE },
  superseded: { heading: SUPERSEDED_HEADING, sentence: SUPERSEDED_SENTENCE },
  invalid: { heading: INVALID_HEADING, sentence: INVALID_SENTENCE },
  error: { heading: ERROR_HEADING, sentence: ERROR_SENTENCE },
} as const

/**
 * The card for a link whose quote cannot be read. An answer that is not exactly expired or superseded is the not-valid
 * card with nothing on it: an unknown, revoked or malformed link must never show a trace of a quote.
 */
export function buildStateCardModel(input: PortalQuoteShort | PortalQuoteInvalid | { state: 'error' }): StateCardModel {
  if (input.state === 'error') return { kind: 'error', ...CARDS.error, facts: [], contact: null }
  if (input.state !== 'expired' && input.state !== 'superseded') return { kind: 'invalid', ...CARDS.invalid, facts: [], contact: null }

  const { record, owner } = input
  const number = text(record.quote_number)
  const client = text(record.client_name)
  const validUntil = formatDocumentDate(record.valid_until)
  const facts = [
    // An internal draft reference is not a quote number a client was ever given.
    ...(number && !isDraftReference(number) ? [{ label: 'Quotation', value: number }] : []),
    ...(client ? [{ label: 'Prepared for', value: client }] : []),
    ...(validUntil ? [{ label: 'Valid until', value: validUntil }] : []),
  ]
  const ownerName = text(owner?.name)
  const ownerEmail = link(owner?.email, safeMailtoHref)
  return {
    kind: input.state,
    ...CARDS[input.state],
    facts,
    contact: ownerName || ownerEmail ? { name: ownerName, jobTitle: ownerName ? text(owner?.job_title) : null, email: ownerEmail } : null,
  }
}
