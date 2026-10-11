import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { DOCUMENT_ERROR_TOKENS, documentErrorMessage } from '../../features/documents/errors.ts'
import {
  DOCUMENTS, INVOICE_DRAFT_STATUSES, INVOICE_ISSUED_STATUSES, QUOTE_DRAFT_STATUSES, QUOTE_SENT_STATUSES, VAT_CODES,
  isDocumentKind, isDraftReference, isDraftStatus,
} from '../../features/documents/vocabulary.ts'

const migration = (name: string) => readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
const quoted = (values: readonly string[], separator: string) => values.map((value) => `'${value}'`).join(separator)

test('the vocabulary equals the database checks it mirrors', () => {
  const phaseSix = migration('20260910175724_phase_six_commercial_finance.sql')
  assert.ok(phaseSix.includes(`status in (${quoted([...QUOTE_DRAFT_STATUSES, ...QUOTE_SENT_STATUSES], ',')})`), 'quote statuses')
  assert.ok(phaseSix.includes(`status in (${quoted([...INVOICE_DRAFT_STATUSES, ...INVOICE_ISSUED_STATUSES], ',')})`), 'invoice statuses')
  const documents = migration('20261011100000_documents_tables.sql')
  assert.ok(documents.includes(`vat_code in (${quoted(VAT_CODES, ', ')})`), 'VAT codes')
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
    + migration('20261012120000_billing_documents.sql') + migration('20261012121000_billing_documents_hardening.sql')
  for (const token of DOCUMENT_ERROR_TOKENS) assert.ok(sendIssue.includes(`'${token}'`), `${token} must be raised by the migration`)
})

test('every token the send and issue migrations raise is either mapped or knowingly left unmapped', () => {
  const unmapped = ['DOCUMENT_KIND_UNKNOWN'] // a programming error, never shown to a person
  const sendIssue = migration('20261011110000_documents_send_issue.sql') + migration('20261011120000_documents_hardening.sql') + migration('20261011130000_documents_delivery.sql') + migration('20261011140000_payments_overdue.sql') + migration('20261011160000_register_summary.sql')
    + migration('20261012100000_rate_card.sql') + migration('20261012101000_rate_card_hardening.sql') + migration('20261012110000_client_engagements.sql') + migration('20261012111000_client_engagements_hardening.sql')
    + migration('20261012120000_billing_documents.sql') + migration('20261012121000_billing_documents_hardening.sql')
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
  assert.equal(documentErrorMessage('permission denied for table quotes'), null)
  assert.equal(documentErrorMessage(null), null)
  assert.equal(documentErrorMessage(undefined), null)
})
