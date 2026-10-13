// Turns database rows into the document the sheet prints. Pure: the sheet component only lays it out.
// A draft is built from the live client and company details; a document that has gone out is built only
// from the copies frozen onto it, so what the client received can never change.
import { DOCUMENTS, isDraftReference, isDraftStatus, type DocumentKind } from './vocabulary.ts'

type Row = Record<string, unknown>

const text = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) return null
  const trimmed = String(raw).trim()
  return trimmed === '' ? null : trimmed
}

const BRAND_PATH = /^\/brand\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/
const brandPath = (raw: unknown): string | null => {
  const path = text(raw)
  return path && BRAND_PATH.test(path) ? path : null
}

const AMOUNT = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const QUANTITY = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 })
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export function formatAmount(raw: unknown): string {
  const number = Number(raw)
  return AMOUNT.format(Number.isFinite(number) ? number : 0)
}

export function formatQuantity(raw: unknown): string {
  const number = Number(raw)
  return QUANTITY.format(Number.isFinite(number) ? number : 0)
}

/** "2026-10-07" -> "7 October 2026"; null for blank; the raw text for something that is not a date. */
export function formatDocumentDate(raw: unknown): string | null {
  const value = text(raw)
  if (!value) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? value : DATE.format(date)
}

function addressLines(source: Row): string[] {
  const cityLine = [text(source.city), text(source.postal_code)].filter(Boolean).join(', ')
  return [text(source.address_line1), text(source.address_line2), cityLine || null, text(source.country)].filter((line): line is string => Boolean(line))
}

/** One item per non-blank line, with any "1." or "2)" typed at the start removed, so the sheet numbers them itself. */
function termItems(raw: unknown): string[] {
  const source = text(raw)
  if (!source) return []
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
}

export type DocumentView = {
  kind: DocumentKind
  title: 'QUOTE' | 'INVOICE'
  draft: boolean
  number: string | null
  issuerMissing: boolean
  headerImage: string | null
  logo: string | null
  tagline: string | null
  details: Array<{ label: string; value: string }>
  billToHeading: string
  billTo: string[]
  project: { title: string | null; lines: string[] } | null
  fromHeading: string
  from: { name: string | null; lines: string[]; vatNumber: string | null }
  currency: string
  lines: Array<{ title: string; description: string | null; quantity: string; unitPrice: string; amount: string }>
  totals: { subtotal: string; vatLabel: string; vat: string; total: string }
  termsHeading: string
  inclusions: string[]
  terms: string[]
  termsNumbered: boolean
  bank: Array<{ label: string; value: string }>
  closing: { heading: string; paragraphs: string[] } | null
  footer: { email: string | null; phone: string | null; website: string | null }
}

export function buildDocumentView(input: { kind: DocumentKind; record: Row; lines: Row[]; client: Row | null; settings: Row | null }): DocumentView {
  const { kind, record } = input
  const draft = isDraftStatus(kind, record.status)
  const quote = kind === 'quote'
  const info = DOCUMENTS[kind]

  const issuer: Row = draft ? (input.settings ?? {}) : ((record.issuer as Row | null) ?? {})
  const billSource: Row = draft
    ? (input.client ?? { name: record.client_name })
    : ((record.bill_to as Row | null) ?? { name: record.client_name })

  const rawNumber = text(record[info.numberColumn])
  const number = rawNumber && !isDraftReference(rawNumber) ? rawNumber : null
  const currency = text(record.currency) ?? 'ZAR'
  const clientRef = text(record.client_ref)
  // A draft has no issue date yet: it is set the day the document goes out, whatever was typed on the draft.
  const issueDate = (draft ? null : formatDocumentDate(record.issue_date)) ?? '—'
  const secondDate = formatDocumentDate(quote ? record.valid_until : record.due_date) ?? '—'

  const details = [
    { label: quote ? 'Quote no.' : 'Invoice no.', value: number ?? 'Draft' },
    { label: 'Issue date', value: issueDate },
    { label: quote ? 'Valid until' : 'Due date', value: secondDate },
    { label: 'Currency', value: currency },
    ...(clientRef ? [{ label: 'Client ref', value: clientRef }] : []),
  ]

  const projectTitle = text(record.project_name)
  const projectLines = [text(record.project_description), text(record.project_ref) ? `Project Ref: ${text(record.project_ref)}` : null].filter((line): line is string => Boolean(line))
  const project = projectTitle || projectLines.length ? { title: projectTitle, lines: projectLines } : null

  const rate = Number(record.vat_rate ?? 15)
  const vatLabel = `VAT (${Number((Number.isFinite(rate) ? rate : 15).toFixed(2))}%)`

  const termsSource = quote ? (text(record.terms) ?? (draft ? text(issuer.default_quote_terms) : null)) : (text(record.payment_terms) ?? (draft ? text(issuer.default_payment_terms) : null))
  const closingText = text(quote ? issuer.quote_closing_text : issuer.invoice_closing_text)

  const bankFields: Array<[string, string]> = [
    ['Bank', 'bank_name'], ['Account Name', 'bank_account_name'], ['Account Number', 'bank_account_number'],
    ['Branch Code', 'bank_branch_code'], ['Account Type', 'bank_account_type'],
  ]

  return {
    kind,
    title: info.title,
    draft,
    number,
    issuerMissing: draft && input.settings === null,
    headerImage: brandPath(issuer.header_image_path),
    logo: brandPath(issuer.logo_path),
    tagline: text(issuer.tagline),
    details,
    billToHeading: quote ? 'Prepared for' : 'Billed to',
    billTo: [text(billSource.name), text(record.contact_name) ? `Attention: ${text(record.contact_name)}` : null, ...addressLines(billSource), text(billSource.vat_number) ? `VAT No: ${text(billSource.vat_number)}` : null].filter((line): line is string => Boolean(line)),
    project,
    fromHeading: quote ? 'Prepared by' : 'From',
    from: { name: text(issuer.legal_name), lines: addressLines(issuer), vatNumber: text(issuer.vat_number) },
    currency,
    lines: [...input.lines]
      .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
      .map((line) => ({
        title: text(line.title) ?? '',
        description: text(line.description),
        quantity: formatQuantity(line.quantity),
        unitPrice: formatAmount(line.unit_price),
        amount: formatAmount(line.line_amount),
      })),
    totals: { subtotal: formatAmount(record.subtotal), vatLabel, vat: formatAmount(record.tax_amount), total: formatAmount(record.total_amount) },
    termsHeading: quote ? 'Terms & conditions' : 'Payment terms',
    // Service inclusions are part of what a client accepts, so only a quote prints them (an invoice carries them for reference).
    inclusions: quote ? termItems(record.terms_inclusions) : [],
    terms: termItems(termsSource),
    termsNumbered: quote,
    bank: bankFields.flatMap(([label, key]) => (text(issuer[key]) ? [{ label, value: text(issuer[key]) as string }] : [])),
    closing: closingText ? { heading: quote ? 'Next steps' : 'Thank you', paragraphs: closingText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) } : null,
    footer: { email: text(issuer.email), phone: text(issuer.phone), website: text(issuer.website) },
  }
}
