import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { DOCUMENT_ERROR_TOKENS, documentErrorMessage } from '../../features/documents/errors.ts'
import {
  CHARGE_KINDS, CHARGE_KIND_LABELS, DOCUMENTS, INVOICE_DRAFT_STATUSES, INVOICE_ISSUED_STATUSES, QUOTE_DRAFT_STATUSES, QUOTE_SENT_STATUSES, VAT_CODES,
  isDocumentKind, isDraftReference, isDraftStatus,
} from '../../features/documents/vocabulary.ts'

const migration = (name: string) => readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
const quoted = (values: readonly string[], separator: string) => values.map((value) => `'${value}'`).join(separator)

/** The quote status list of the newest `quotes_status_check` definition: migrations sorted by file name, the last match wins. */
function newestQuoteStatuses(): string[] {
  const directory = join(process.cwd(), 'supabase', 'migrations')
  const sql = readdirSync(directory).filter((name) => name.endsWith('.sql')).sort().map((name) => readFileSync(join(directory, name), 'utf8')).join('\n')
  const definitions = [...sql.matchAll(/add constraint quotes_status_check check \(status in \(([^)]*)\)\)/g)]
  assert.ok(definitions.length > 0, 'a migration defines quotes_status_check')
  return definitions[definitions.length - 1][1].split(',').map((value) => value.trim().replace(/^'|'$/g, ''))
}

test('the vocabulary equals the database checks it mirrors', () => {
  const phaseSix = migration('20260910175724_phase_six_commercial_finance.sql')
  assert.deepEqual(newestQuoteStatuses(), [...QUOTE_DRAFT_STATUSES, ...QUOTE_SENT_STATUSES], 'quote statuses')
  assert.ok(phaseSix.includes(`status in (${quoted([...INVOICE_DRAFT_STATUSES, ...INVOICE_ISSUED_STATUSES], ',')})`), 'invoice statuses')
  const documents = migration('20261011100000_documents_tables.sql')
  assert.ok(documents.includes(`vat_code in (${quoted(VAT_CODES, ', ')})`), 'VAT codes')
})

test('the charge kinds equal the quote_lines check and each has a label', () => {
  const portal = migration('20261018100000_quote_portal_schema.sql')
  assert.ok(portal.includes(`charge_kind text check (charge_kind in (${quoted(CHARGE_KINDS, ', ')}))`), 'charge kinds')
  assert.deepEqual(CHARGE_KIND_LABELS, { once_off: 'Once-off', monthly: 'Monthly' })
})

test('draft statuses and draft references', () => {
  assert.equal(isDraftStatus('quote', 'Draft'), true)
  assert.equal(isDraftStatus('quote', 'Internal Review'), true)
  assert.equal(isDraftStatus('quote', 'Sent'), false)
  assert.equal(isDraftStatus('invoice', 'Draft'), true)
  assert.equal(isDraftStatus('invoice', 'Internal Review'), false)
  assert.equal(isDraftStatus('invoice', 'Issued'), false)
  assert.equal(isDraftStatus('quote', undefined), false)
  assert.equal(isDraftReference('DRAFT-1a2b3c4d'), true)
  assert.equal(isDraftReference('TST-Q-2026-00001'), false)
  assert.equal(isDraftReference(null), false)
})

test('a document kind is only quote or invoice, never an inherited key', () => {
  assert.equal(isDocumentKind('quote'), true)
  assert.equal(isDocumentKind('invoice'), true)
  for (const bad of ['expense', 'constructor', 'toString', '', null, undefined, 1]) assert.equal(isDocumentKind(bad), false)
  assert.equal(DOCUMENTS.quote.lines, 'quote_lines')
  assert.equal(DOCUMENTS.invoice.parentColumn, 'invoice_id')
})

test('every database error token the app maps is raised by the send and issue migration', () => {
  const sendIssue = migration('20261011110000_documents_send_issue.sql') + migration('20261011120000_documents_hardening.sql') + migration('20261011130000_documents_delivery.sql') + migration('20261011140000_payments_overdue.sql') + migration('20261011160000_register_summary.sql')
    + migration('20261012100000_rate_card.sql') + migration('20261012101000_rate_card_hardening.sql') + migration('20261012110000_client_engagements.sql') + migration('20261012111000_client_engagements_hardening.sql')
    + migration('20261012120000_billing_documents.sql') + migration('20261012121000_billing_documents_hardening.sql') + migration('20261012130000_final_review_fixes.sql') + migration('20261012140000_document_rate_card_lines.sql') + migration('20261012141000_document_rate_card_lines_hardening.sql') + migration('20261012160000_commercial_terms.sql') + migration('20261012161000_commercial_terms_seed.sql') + migration('20261012221817_offerings_on_documents.sql') + migration('20261013100000_document_terms.sql')
    + migration('20261018101000_quote_portal_links.sql') + migration('20261018101500_quote_portal_links_fixes.sql') + migration('20261026101000_billing_plan_invoices.sql')
  for (const token of DOCUMENT_ERROR_TOKENS) assert.ok(sendIssue.includes(`'${token}'`), `${token} must be raised by the migration`)
})

test('every token the send and issue migrations raise is either mapped or knowingly left unmapped', () => {
  const unmapped = ['DOCUMENT_KIND_UNKNOWN'] // a programming error, never shown to a person
  const sendIssue = migration('20261011110000_documents_send_issue.sql') + migration('20261011120000_documents_hardening.sql') + migration('20261011130000_documents_delivery.sql') + migration('20261011140000_payments_overdue.sql') + migration('20261011160000_register_summary.sql')
    + migration('20261012100000_rate_card.sql') + migration('20261012101000_rate_card_hardening.sql') + migration('20261012110000_client_engagements.sql') + migration('20261012111000_client_engagements_hardening.sql')
    + migration('20261012120000_billing_documents.sql') + migration('20261012121000_billing_documents_hardening.sql') + migration('20261012130000_final_review_fixes.sql') + migration('20261012140000_document_rate_card_lines.sql') + migration('20261012141000_document_rate_card_lines_hardening.sql') + migration('20261012160000_commercial_terms.sql') + migration('20261012161000_commercial_terms_seed.sql') + migration('20261012221817_offerings_on_documents.sql') + migration('20261013100000_document_terms.sql')
    + migration('20261018101000_quote_portal_links.sql') + migration('20261018101500_quote_portal_links_fixes.sql') + migration('20261026101000_billing_plan_invoices.sql')
  const raised = new Set([...sendIssue.matchAll(/raise exception '([A-Z_]+)'/g)].map((match) => match[1]))
  assert.ok(raised.size >= 20, `expected to find the raised tokens, found ${raised.size}`)
  for (const token of raised) {
    assert.ok(DOCUMENT_ERROR_TOKENS.includes(token) || unmapped.includes(token), `${token} is raised by a migration but has no message in errors.ts`)
  }
})

test('database tokens become plain messages, and anything else is left to the caller', () => {
  assert.match(documentErrorMessage('QUOTE_NEEDS_LINES')!, /at least one line/i)
  assert.match(documentErrorMessage('INVOICE_NEEDS_CLIENT')!, /client/i)
  assert.match(documentErrorMessage('COMPANY_DETAILS_MISSING')!, /company details/i)
  assert.match(documentErrorMessage('new row violates QUOTE_FROZEN (23514)')!, /already been sent/i)
  // Ruling 33: a sent quote is changed with Revise this quote; only an accepted one (which cannot be revised) is duplicated.
  const revise = 'Use Revise this quote if it is Sent, Declined or Expired (the revision replaces it once sent); an accepted quote cannot be revised, so use Duplicate as new draft.'
  assert.equal(documentErrorMessage('QUOTE_FROZEN'), `This quote has already been sent and can no longer be edited. ${revise}`)
  assert.equal(documentErrorMessage('QUOTE_CANNOT_REOPEN'), `A sent quote cannot go back to a draft. ${revise}`)
  assert.match(documentErrorMessage('INVOICE_FROZEN')!, /cancel it/i)
  assert.match(documentErrorMessage('QUOTE_NOT_FOUND')!, /not found/i)
  assert.match(documentErrorMessage('QUOTE_NOT_ACCEPTED')!, /accepted quote/i)
  assert.match(documentErrorMessage('EMAIL_ADDRESS_INVALID')!, /valid email/i)
  assert.match(documentErrorMessage('PAYMENT_EXCEEDS_BALANCE')!, /more than the balance/i)
  assert.match(documentErrorMessage('INVOICE_HAS_PAYMENTS')!, /void the payments/i)
  assert.match(documentErrorMessage('REGISTER_KIND_UNKNOWN')!, /register/i)
  assert.match(documentErrorMessage('INITIATIVE_LIMIT_REACHED')!, /higher tier/i)
  assert.match(documentErrorMessage('new row violates RATE_LINE_LOCKED')!, /rate card/i)
  assert.match(documentErrorMessage('FIRST_INVOICE_EXISTS')!, /first invoice/i)
  assert.match(documentErrorMessage('PACKAGE_OVERLAP')!, /earlier retainer/i)
  assert.match(documentErrorMessage('SUPPORT_ALREADY_ENDED')!, /already ended/i)
  assert.equal(documentErrorMessage('RATE_CARD_NOT_ARCHIVABLE'), 'A rate card item cannot be archived. Edit its price instead.')
  assert.equal(documentErrorMessage('BILLING_DRAFT_ONLY'), 'Only a draft built from a client package can be discarded.')
  assert.match(documentErrorMessage('FIRST_INVOICE_EXISTS')!, /Discard the draft, or cancel the issued invoice, first\./)
  assert.match(documentErrorMessage('MONTH_ALREADY_BILLED')!, /Discard the draft, or cancel the issued invoice, first\./)
  assert.equal(documentErrorMessage('FIRST_INVOICE_MISSING'), "Build the retainer's first invoice before the monthly ones.")
  assert.equal(documentErrorMessage('QUOTE_ARCHIVED_LINK'), 'An archived quote cannot be sent with a secure link.', 'not the shorter QUOTE_ARCHIVED it contains')
  assert.equal(documentErrorMessage('QUOTE_ARCHIVED'), 'An archived quote cannot be invoiced.')
  assert.equal(documentErrorMessage('permission denied for table quotes'), null)
  assert.equal(documentErrorMessage(null), null)
  assert.equal(documentErrorMessage(undefined), null)
})

test('the billing plan tokens have their plain messages, and no token swallows another', () => {
  const messages: Array<[string, string]> = [
    ['BILLING_QUOTE_NOT_ELIGIBLE', 'Only an accepted quote with a client can have a billing plan.'],
    ['BILLING_ITEM_NOT_FOUND', 'That billing item was not found.'],
    ['BILLING_ITEM_CANCELLED', 'That billing item was cancelled.'],
    ['BILLING_PLAN_NOT_ACTIVE', 'This billing plan is paused or ended.'],
    ['BILLING_ITEM_ALREADY_INVOICED', 'That month already has an invoice. Discard the draft, or cancel the issued invoice, first.'],
    ['BILLING_ITEM_NOT_DUE', 'That month is not due yet.'],
    ['BILLING_NOT_ENABLED', 'Billing plans are switched off. An owner or admin can turn them on under Settings, Company details.'],
    ['QUOTE_HAS_BILLING_PLAN', 'This quote is billed through its billing plan. Use the plan on this page.'],
    ['QUOTE_ALREADY_INVOICED', 'This quote already has an invoice. Open it from the list below, or discard or cancel it first.'],
  ]
  for (const [token, message] of messages) {
    assert.equal(documentErrorMessage(token), message, token)
    assert.equal(documentErrorMessage(`new row violates ${token} (23514)`), message, `${token} inside a database message`)
  }
})
