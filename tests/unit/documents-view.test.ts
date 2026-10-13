import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDocumentView, formatAmount, formatDocumentDate, formatQuantity } from '../../features/documents/document-view.ts'

const settings = {
  legal_name: 'Test Co (Pty) Ltd', tagline: 'Do good', address_line1: '1 Test Road', address_line2: null, city: 'Testville', postal_code: '1234', country: 'Testland',
  vat_number: 'V1', email: 'hello@test.example', phone: '011 000 0000', website: 'test.example',
  bank_name: 'Test Bank', bank_account_name: 'Test Co', bank_account_number: '000', bank_branch_code: '111', bank_account_type: 'Current',
  default_quote_terms: '1. First\n2) Second\n\nThird', default_payment_terms: 'Pay in 30 days\nQuote the number', quote_closing_text: 'Sign and return.',
  invoice_closing_text: 'Thank you.', logo_path: '/brand/logo.png', header_image_path: '/brand/header.png',
}
const client = { name: 'Client Co', address_line1: '2 Client Street', address_line2: null, city: 'Clientville', postal_code: '5678', country: 'Clientland', vat_number: 'CV1' }
const draftQuote = {
  status: 'Draft', quote_number: 'DRAFT-abcd1234', client_name: 'Client Co', currency: 'ZAR', vat_rate: '15.00',
  subtotal: '250.80', tax_amount: '30.05', total_amount: '280.85', issue_date: null, valid_until: null, terms: null,
  project_name: 'Phase 1', project_description: 'Discovery', project_ref: 'P-1', client_ref: 'PO-1', bill_to: null, issuer: null,
}
const lines = [
  { position: 2, title: 'Second', description: null, quantity: '1.000', unit_price: '50.50', line_amount: '50.50' },
  { position: 1, title: 'First', description: 'A day', quantity: '2.000', unit_price: '100.00', line_amount: '200.00' },
]

test('a draft quote is built from the live client and company details, with no number', () => {
  const view = buildDocumentView({ kind: 'quote', record: draftQuote, lines, client, settings })
  assert.equal(view.title, 'QUOTE')
  assert.equal(view.draft, true)
  assert.equal(view.number, null)
  assert.deepEqual(view.billTo, ['Client Co', '2 Client Street', 'Clientville, 5678', 'Clientland', 'VAT No: CV1'])
  assert.equal(view.billToHeading, 'Prepared for')
  assert.equal(view.from.name, 'Test Co (Pty) Ltd')
  assert.deepEqual(view.from.lines, ['1 Test Road', 'Testville, 1234', 'Testland'])
  assert.equal(view.from.vatNumber, 'V1')
  assert.equal(view.fromHeading, 'Prepared by')
  assert.deepEqual(view.lines.map((item) => [item.title, item.quantity, item.unitPrice, item.amount]), [
    ['First', '2', '100.00', '200.00'],
    ['Second', '1', '50.50', '50.50'],
  ])
  assert.deepEqual(view.totals, { subtotal: '250.80', vatLabel: 'VAT (15%)', vat: '30.05', total: '280.85' })
  assert.deepEqual(view.terms, ['First', 'Second', 'Third'], 'numbering typed into the terms is stripped, blank lines dropped')
  assert.equal(view.termsHeading, 'Terms & conditions')
  assert.equal(view.termsNumbered, true)
  assert.deepEqual(view.details.map((row) => row.label), ['Quote no.', 'Issue date', 'Valid until', 'Currency', 'Client ref'])
  assert.deepEqual(view.details[0], { label: 'Quote no.', value: 'Draft' })
  assert.deepEqual(buildDocumentView({ kind: 'quote', record: { ...draftQuote, issue_date: '2020-01-01' }, lines, client, settings }).details[1], { label: 'Issue date', value: '—' }, 'a date typed on a draft is not printed: it is set when the quote is sent')
  assert.deepEqual(view.project, { title: 'Phase 1', lines: ['Discovery', 'Project Ref: P-1'] })
  assert.equal(view.closing?.heading, 'Next steps')
  assert.equal(view.headerImage, '/brand/header.png')
  assert.equal(view.logo, '/brand/logo.png')
  assert.equal(view.issuerMissing, false)
})

test('a sent quote prints only its frozen snapshot, whatever the live data now says', () => {
  const sent = {
    ...draftQuote, status: 'Sent', quote_number: 'TST-Q-2026-00001', issue_date: '2026-10-07', valid_until: '2026-11-06', terms: 'Only this term',
    bill_to: { name: 'Snapshot Client', address_line1: '9 Old Street', city: 'Oldtown', postal_code: '9', country: 'Oldland', vat_number: 'SV1' },
    issuer: { ...settings, legal_name: 'Snapshot Co', bank_name: 'Snapshot Bank', vat_number: 'SV9' },
  }
  const view = buildDocumentView({ kind: 'quote', record: sent, lines, client: { ...client, name: 'Renamed' }, settings: { ...settings, legal_name: 'Renamed Co' } })
  assert.equal(view.draft, false)
  assert.equal(view.number, 'TST-Q-2026-00001')
  assert.equal(view.billTo[0], 'Snapshot Client')
  assert.equal(view.from.name, 'Snapshot Co')
  assert.equal(view.from.vatNumber, 'SV9')
  assert.deepEqual(view.bank[0], { label: 'Bank', value: 'Snapshot Bank' })
  assert.deepEqual(view.terms, ['Only this term'], 'a sent quote does not fall back to the live default terms')
  assert.deepEqual(view.details.slice(0, 3), [
    { label: 'Quote no.', value: 'TST-Q-2026-00001' },
    { label: 'Issue date', value: '7 October 2026' },
    { label: 'Valid until', value: '6 November 2026' },
  ])
})

// A snapshot and a "live" copy that differ in every printed field, so any read from live data shows up.
const liveSettings = {
  legal_name: 'LIVE Co', tagline: 'LIVE tagline', address_line1: 'LIVE 1 Road', address_line2: 'LIVE Suite', city: 'LIVE City', postal_code: 'LIVE-PC', country: 'LIVE Land',
  vat_number: 'LIVE-VAT', email: 'live@live.example', phone: 'LIVE phone', website: 'live.example',
  bank_name: 'LIVE Bank', bank_account_name: 'LIVE Account', bank_account_number: 'LIVE-123', bank_branch_code: 'LIVE-BR', bank_account_type: 'LIVE Type',
  default_quote_terms: 'LIVE quote term', default_payment_terms: 'LIVE payment term', quote_closing_text: 'LIVE quote closing',
  invoice_closing_text: 'LIVE invoice closing', logo_path: '/brand/live-logo.png', header_image_path: '/brand/live-header.png',
}
const liveClient = { name: 'LIVE Client', address_line1: 'LIVE Client St', address_line2: 'LIVE Client Suite', city: 'LIVE Clientville', postal_code: 'LIVE-CPC', country: 'LIVE Clientland', vat_number: 'LIVE-CVAT' }
const snapshotIssuer = {
  legal_name: 'Snap Co', tagline: 'Snap tagline', address_line1: 'Snap 1 Road', address_line2: 'Snap Suite', city: 'Snap City', postal_code: 'SN-1', country: 'Snapland',
  vat_number: 'SNAP-VAT', email: 'snap@snap.example', phone: 'Snap phone', website: 'snap.example',
  bank_name: 'Snap Bank', bank_account_name: 'Snap Account', bank_account_number: 'SNAP-123', bank_branch_code: 'SNAP-BR', bank_account_type: 'Snap Type',
  quote_closing_text: 'Snap quote closing', invoice_closing_text: 'Snap invoice closing', logo_path: '/brand/snap-logo.png', header_image_path: '/brand/snap-header.png',
}
const snapshotBillTo = { name: 'Snap Client', address_line1: 'Snap Client St', address_line2: 'Snap Client Suite', city: 'Snap Clientville', postal_code: 'SN-C1', country: 'Snap Clientland', vat_number: 'SNAP-CVAT' }

test('a sent quote prints every field from its snapshot and none from the live client or company details', () => {
  const sent = {
    ...draftQuote, status: 'Sent', quote_number: 'TST-Q-2026-00002', issue_date: '2026-10-07', valid_until: '2026-11-06', terms: '1. Snap term one\n2. Snap term two',
    currency: 'USD', vat_rate: '7.50', bill_to: snapshotBillTo, issuer: snapshotIssuer,
  }
  const view = buildDocumentView({ kind: 'quote', record: sent, lines, client: liveClient, settings: liveSettings })
  assert.deepEqual(view.billTo, ['Snap Client', 'Snap Client St', 'Snap Client Suite', 'Snap Clientville, SN-C1', 'Snap Clientland', 'VAT No: SNAP-CVAT'])
  assert.equal(view.from.name, 'Snap Co')
  assert.deepEqual(view.from.lines, ['Snap 1 Road', 'Snap Suite', 'Snap City, SN-1', 'Snapland'])
  assert.equal(view.from.vatNumber, 'SNAP-VAT')
  assert.equal(view.tagline, 'Snap tagline')
  assert.deepEqual(view.footer, { email: 'snap@snap.example', phone: 'Snap phone', website: 'snap.example' })
  assert.equal(view.logo, '/brand/snap-logo.png')
  assert.equal(view.headerImage, '/brand/snap-header.png')
  assert.deepEqual(view.bank, [
    { label: 'Bank', value: 'Snap Bank' }, { label: 'Account Name', value: 'Snap Account' }, { label: 'Account Number', value: 'SNAP-123' },
    { label: 'Branch Code', value: 'SNAP-BR' }, { label: 'Account Type', value: 'Snap Type' },
  ])
  assert.deepEqual(view.closing, { heading: 'Next steps', paragraphs: ['Snap quote closing'] })
  assert.deepEqual(view.terms, ['Snap term one', 'Snap term two'])
  assert.equal(view.currency, 'USD')
  assert.equal(view.details[3].value, 'USD')
  assert.equal(view.totals.vatLabel, 'VAT (7.5%)')
  assert.doesNotMatch(JSON.stringify(view), /LIVE/, 'nothing live is printed on a sent quote')
})

test('a sent invoice prints every field from its snapshot and none from the live client or company details', () => {
  const issued = {
    status: 'Issued', invoice_number: 'TST-I-2026-00009', client_name: 'Snap Client', currency: 'EUR', vat_rate: '12.00', subtotal: 100, tax_amount: 12, total_amount: 112,
    issue_date: '2026-10-07', due_date: '2026-11-06', payment_terms: 'Snap pay one\nSnap pay two', project_name: null, project_description: null, project_ref: null, client_ref: null,
    bill_to: snapshotBillTo, issuer: snapshotIssuer,
  }
  const view = buildDocumentView({ kind: 'invoice', record: issued, lines, client: liveClient, settings: liveSettings })
  assert.deepEqual(view.billTo, ['Snap Client', 'Snap Client St', 'Snap Client Suite', 'Snap Clientville, SN-C1', 'Snap Clientland', 'VAT No: SNAP-CVAT'])
  assert.equal(view.from.name, 'Snap Co')
  assert.deepEqual(view.bank.map((row) => row.value), ['Snap Bank', 'Snap Account', 'SNAP-123', 'SNAP-BR', 'Snap Type'])
  assert.deepEqual(view.closing, { heading: 'Thank you', paragraphs: ['Snap invoice closing'] })
  assert.deepEqual(view.terms, ['Snap pay one', 'Snap pay two'])
  assert.equal(view.currency, 'EUR')
  assert.equal(view.totals.vatLabel, 'VAT (12%)')
  assert.equal(view.logo, '/brand/snap-logo.png')
  assert.equal(view.headerImage, '/brand/snap-header.png')
  assert.doesNotMatch(JSON.stringify(view), /LIVE/, 'nothing live is printed on an issued invoice')
})

test('a sent document with no terms of its own prints none: it never falls back to the live default terms', () => {
  const sentQuote = { ...draftQuote, status: 'Sent', quote_number: 'TST-Q-2026-00003', terms: null, bill_to: snapshotBillTo, issuer: snapshotIssuer }
  assert.deepEqual(buildDocumentView({ kind: 'quote', record: sentQuote, lines, client: liveClient, settings: liveSettings }).terms, [])
  const issuedInvoice = {
    status: 'Issued', invoice_number: 'TST-I-2026-00010', client_name: 'Snap Client', currency: 'ZAR', vat_rate: 15, subtotal: 100, tax_amount: 15, total_amount: 115,
    issue_date: '2026-10-07', due_date: '2026-11-06', payment_terms: null, bill_to: snapshotBillTo, issuer: snapshotIssuer,
  }
  assert.deepEqual(buildDocumentView({ kind: 'invoice', record: issuedInvoice, lines, client: liveClient, settings: liveSettings }).terms, [])
  const draftWithoutTerms = buildDocumentView({ kind: 'quote', record: { ...draftQuote, terms: null }, lines, client: liveClient, settings: liveSettings })
  assert.deepEqual(draftWithoutTerms.terms, ['LIVE quote term'], 'a draft, in contrast, does show the live default terms')
})

test('only what exists is shown: no address, no bank, no project, no closing text, no footer', () => {
  const bare = { legal_name: 'Bare Co' }
  const record = { ...draftQuote, project_name: null, project_description: null, project_ref: null, client_ref: null }
  const view = buildDocumentView({ kind: 'quote', record, lines, client: { name: 'Plain Client' }, settings: bare })
  assert.deepEqual(view.billTo, ['Plain Client'])
  assert.deepEqual(view.from.lines, [])
  assert.equal(view.from.vatNumber, null)
  assert.deepEqual(view.bank, [])
  assert.equal(view.project, null)
  assert.equal(view.closing, null)
  assert.deepEqual(view.footer, { email: null, phone: null, website: null })
  assert.deepEqual(view.terms, [])
  assert.deepEqual(view.details.map((row) => row.label), ['Quote no.', 'Issue date', 'Valid until', 'Currency'], 'no client ref row when there is none')
  const visible = [
    ...view.billTo, view.from.name ?? '', ...view.from.lines,
    ...view.details.flatMap((row) => [row.label, row.value]),
    ...view.lines.flatMap((item) => [item.title, item.description ?? '', item.quantity, item.unitPrice, item.amount]),
    ...Object.values(view.totals), view.termsHeading,
  ].join(' | ')
  assert.doesNotMatch(visible, /null|undefined/, 'no null or undefined text leaks into what is printed')
})

test('with no company details at all a draft says so instead of printing blanks', () => {
  const view = buildDocumentView({ kind: 'quote', record: draftQuote, lines, client, settings: null })
  assert.equal(view.issuerMissing, true)
  assert.equal(view.from.name, null)
  assert.equal(view.headerImage, null)
})

test('an invoice has a due date, plain payment terms and a thank-you', () => {
  const invoice = {
    status: 'Issued', invoice_number: 'TST-I-2026-00004', client_name: 'Client Co', currency: 'ZAR', vat_rate: 15, subtotal: 100, tax_amount: 15, total_amount: 115,
    issue_date: '2026-10-07', due_date: '2026-11-06', payment_terms: 'Pay in 30 days\nQuote the number', project_name: null, project_description: null, project_ref: null, client_ref: 'PO-9',
    bill_to: { name: 'Client Co' }, issuer: settings,
  }
  const view = buildDocumentView({ kind: 'invoice', record: invoice, lines, client: null, settings: null })
  assert.equal(view.title, 'INVOICE')
  assert.equal(view.billToHeading, 'Billed to')
  assert.equal(view.fromHeading, 'From')
  assert.deepEqual(view.details.map((row) => row.label), ['Invoice no.', 'Issue date', 'Due date', 'Currency', 'Client ref'])
  assert.equal(view.termsHeading, 'Payment terms')
  assert.equal(view.termsNumbered, false)
  assert.deepEqual(view.terms, ['Pay in 30 days', 'Quote the number'])
  assert.equal(view.closing?.heading, 'Thank you')
  assert.deepEqual(view.closing?.paragraphs, ['Thank you.'])
  assert.deepEqual(view.totals, { subtotal: '100.00', vatLabel: 'VAT (15%)', vat: '15.00', total: '115.00' })
})

test('a zero-rated document still shows a VAT row of 0.00', () => {
  const view = buildDocumentView({ kind: 'quote', record: { ...draftQuote, subtotal: '300', tax_amount: '0', total_amount: '300' }, lines, client, settings })
  assert.deepEqual(view.totals, { subtotal: '300.00', vatLabel: 'VAT (15%)', vat: '0.00', total: '300.00' })
  const fractional = buildDocumentView({ kind: 'quote', record: { ...draftQuote, vat_rate: '15.50' }, lines, client, settings })
  assert.equal(fractional.totals.vatLabel, 'VAT (15.5%)')
})

test('hostile and very long text is passed through as plain text: markup is not interpreted and nothing is truncated', () => {
  const hostile = '<img src=x onerror=alert(1)> & "quotes"'
  const long = 'word '.repeat(700).trim()
  const view = buildDocumentView({
    kind: 'quote', record: { ...draftQuote, project_name: hostile }, client: { ...client, name: hostile },
    lines: [{ position: 1, title: hostile, description: long, quantity: 1, unit_price: 1, line_amount: 1 }], settings: { ...settings, legal_name: hostile },
  })
  assert.equal(view.billTo[0], hostile)
  assert.equal(view.from.name, hostile)
  assert.equal(view.project?.title, hostile)
  assert.equal(view.lines[0].title, hostile)
  assert.equal(view.lines[0].description, long)
})

test('an image path outside /brand is dropped, even from a stored snapshot', () => {
  const view = buildDocumentView({
    kind: 'quote', record: { ...draftQuote, status: 'Sent', quote_number: 'X-Q-1', issuer: { ...settings, header_image_path: 'https://evil.test/x.png', logo_path: '/brand/../x.png' }, bill_to: { name: 'C' } },
    lines, client: null, settings: null,
  })
  assert.equal(view.headerImage, null)
  assert.equal(view.logo, null)
})

test('amounts, quantities and dates are formatted for the page', () => {
  assert.equal(formatAmount('35000'), '35,000.00')
  assert.equal(formatAmount(133750), '133,750.00')
  assert.equal(formatAmount(0.5), '0.50')
  assert.equal(formatAmount(null), '0.00')
  assert.equal(formatAmount('not a number'), '0.00')
  assert.equal(formatQuantity('1.000'), '1')
  assert.equal(formatQuantity('2.500'), '2.5')
  assert.equal(formatQuantity(1234.567), '1,234.567')
  assert.equal(formatDocumentDate('2026-10-07'), '7 October 2026')
  assert.equal(formatDocumentDate('2026-11-06'), '6 November 2026')
  assert.equal(formatDocumentDate(null), null)
  assert.equal(formatDocumentDate(''), null)
  assert.equal(formatDocumentDate('garbage'), 'garbage')
})

test('the client contact is printed as an Attention line under the client name, on a quote and on an invoice, and left out when empty', () => {
  const quote = buildDocumentView({ kind: 'quote', record: { ...draftQuote, contact_name: 'Thandi Dlamini' }, lines, client, settings })
  assert.deepEqual(quote.billTo, ['Client Co', 'Attention: Thandi Dlamini', '2 Client Street', 'Clientville, 5678', 'Clientland', 'VAT No: CV1'])
  const invoice = buildDocumentView({ kind: 'invoice', record: { ...draftQuote, quote_number: undefined, invoice_number: 'DRAFT-abcd1234', due_date: null, contact_name: '  Sipho Nkosi ' }, lines, client, settings })
  assert.equal(invoice.billTo[1], 'Attention: Sipho Nkosi')
  const none = buildDocumentView({ kind: 'quote', record: { ...draftQuote, contact_name: '   ' }, lines, client, settings })
  assert.deepEqual(none.billTo, ['Client Co', '2 Client Street', 'Clientville, 5678', 'Clientland', 'VAT No: CV1'])
})

test('a document that has gone out prints its own contact, with the client name from the frozen copy', () => {
  const sent = buildDocumentView({
    kind: 'quote',
    record: { ...draftQuote, status: 'Sent', quote_number: 'Q-1', contact_name: 'Thandi Dlamini', bill_to: { name: 'Snapshot Client' }, issuer: {} },
    lines, client, settings,
  })
  assert.deepEqual(sent.billTo, ['Snapshot Client', 'Attention: Thandi Dlamini'])
})

test('a quote prints its service inclusions; an invoice does not, and blank lines and bullets are dropped', () => {
  const withInclusions = { ...draftQuote, terms_inclusions: '1. Engagement lead\n\nRoadmap' }
  const quote = buildDocumentView({ kind: 'quote', record: withInclusions, lines: [], client: null, settings: null })
  assert.deepEqual(quote.inclusions, ['Engagement lead', 'Roadmap'])
  const none = buildDocumentView({ kind: 'quote', record: draftQuote, lines: [], client: null, settings: null })
  assert.deepEqual(none.inclusions, [])
})
