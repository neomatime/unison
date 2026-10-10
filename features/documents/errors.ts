// Plain messages for the tokens the database raises (see 20261011110000_documents_send_issue.sql).
// No directive and no imports: unit tests and server actions both use it.

const MESSAGES: ReadonlyArray<readonly [token: string, message: string]> = [
  ['QUOTE_NOT_FOUND', 'That quote was not found.'],
  ['INVOICE_NOT_FOUND', 'That invoice was not found.'],
  ['QUOTE_NOT_DRAFT', 'This quote has already been sent.'],
  ['INVOICE_NOT_DRAFT', 'This invoice has already been issued.'],
  ['QUOTE_NEEDS_LINES', 'Add at least one line first.'],
  ['INVOICE_NEEDS_LINES', 'Add at least one line first.'],
  ['QUOTE_NEEDS_CLIENT', 'Choose a client from your client list first. If this is a prospect, convert the lead to a client first.'],
  ['INVOICE_NEEDS_CLIENT', 'Choose a client from your client list first. If this is a prospect, convert the lead to a client first.'],
  ['COMPANY_DETAILS_MISSING', 'Fill in the company name and document prefix under Settings, Company details, first.'],
  ['QUOTE_VALID_BEFORE_ISSUE', 'The valid-until date has already passed. Choose a later date.'],
  ['INVOICE_DUE_BEFORE_ISSUE', 'The due date cannot be before the issue date.'],
  ['QUOTE_USE_SEND', 'Use Send quote to send a quote.'],
  ['INVOICE_USE_ISSUE', 'Use Issue invoice to issue an invoice.'],
  ['QUOTE_CANNOT_REOPEN', 'A sent quote cannot go back to a draft. Duplicate it as a new draft to revise it.'],
  ['INVOICE_CANNOT_REOPEN', 'An issued invoice cannot go back to a draft. Cancel it and raise a new one.'],
  ['INVOICE_CANCELLED', 'A cancelled invoice cannot be changed. Raise a new invoice instead.'],
  ['DOCUMENT_NUMBER_EXHAUSTED', 'This year\'s numbers for this kind of document have run out. Contact support.'],
  ['QUOTE_FROZEN', 'This quote has already been sent and can no longer be edited. To revise it, duplicate it as a new draft.'],
  ['INVOICE_FROZEN', 'This invoice has already been issued and can no longer be edited. To correct it, cancel it and raise a new one.'],
  ['DOCUMENT_NUMBER_GENERATED', 'Numbers are generated automatically when a document is sent or issued.'],
  ['DOCUMENT_SNAPSHOT_GENERATED', 'The client and company details on a document are copied automatically when it is sent or issued.'],
]

export const DOCUMENT_ERROR_TOKENS: readonly string[] = MESSAGES.map(([token]) => token)

/** The plain message for a database error, or null when it is not one of ours. */
export function documentErrorMessage(raw: string | null | undefined): string | null {
  const text = String(raw ?? '')
  for (const [token, message] of MESSAGES) {
    if (text.includes(token)) return message
  }
  return null
}
