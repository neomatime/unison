// Shared by server and client code and by unit tests: no directive, no imports.

export const VAT_CODES = ['standard', 'zero'] as const
export type VatCode = (typeof VAT_CODES)[number]
export const VAT_LABELS: Record<VatCode, string> = { standard: 'Standard rate', zero: 'Zero-rated' }

export type DocumentKind = 'quote' | 'invoice'

export const DOCUMENTS = {
  quote: { table: 'quotes', lines: 'quote_lines', parentColumn: 'quote_id', numberColumn: 'quote_number', base: '/commercial/quotes', label: 'quote', title: 'QUOTE' },
  invoice: { table: 'invoices', lines: 'invoice_lines', parentColumn: 'invoice_id', numberColumn: 'invoice_number', base: '/finance/invoices', label: 'invoice', title: 'INVOICE' },
} as const

export function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === 'string' && Object.hasOwn(DOCUMENTS, value)
}

/** A quote can be edited freely in these statuses; once it is sent it is in one of the next. */
export const QUOTE_DRAFT_STATUSES = ['Draft', 'Internal Review'] as const
export const QUOTE_SENT_STATUSES = ['Sent', 'Accepted', 'Declined', 'Expired'] as const
export const INVOICE_DRAFT_STATUSES = ['Draft'] as const
export const INVOICE_ISSUED_STATUSES = ['Issued', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'] as const

export function isDraftStatus(kind: DocumentKind, status: unknown): boolean {
  const drafts: readonly string[] = kind === 'quote' ? QUOTE_DRAFT_STATUSES : INVOICE_DRAFT_STATUSES
  return typeof status === 'string' && drafts.includes(status)
}

/** A draft carries "DRAFT-" and eight hex characters in its number column until it goes out. */
export const isDraftReference = (number: unknown): boolean => typeof number === 'string' && number.startsWith('DRAFT-')
