import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDocumentView } from '../../features/documents/document-view.ts'
import { buildQuoteEmailData } from '../../features/quote-portal/email-data.ts'
import { quoteEmailTemplate } from '../../lib/email/templates/quote.ts'

// The figures and words of the quotation email: what the summary card and the sign-off say. The view is built with the
// real buildDocumentView from a frozen Sent quote, so the totals are formatted exactly as the PDF prints them.

// The company details as frozen onto the quote when it was sent.
const issuer = {
  legal_name: 'HIMARK Strategic Growth Consulting', tagline: 'People | Strategy | Progress', address_line1: '1 Rivonia Road', address_line2: null,
  city: 'Sandton', postal_code: '2196', country: 'South Africa', vat_number: '4000000000',
  email: 'info@himark.example', phone: '+27 10 000 0000', website: 'www.himark.example',
}
// Live settings that differ in every field the email uses: a read from them instead of the frozen issuer shows up.
const liveSettings = { ...issuer, legal_name: 'LIVE Co', email: 'live@live.example', phone: 'LIVE phone', website: 'live.example' }

// Subtotal, VAT and total all differ, so a mapping that takes the wrong one fails.
const sentQuote = {
  status: 'Sent', quote_number: 'HMK-Q-2026-00045', client_name: 'Acme Holdings', contact_name: 'Thandi Nkosi', currency: 'ZAR', vat_rate: '15.00',
  subtotal: '200000.00', tax_amount: '30000.00', total_amount: '230000.00', issue_date: '2026-10-07', valid_until: '2026-11-06',
  project_name: 'Signature Partner', project_description: 'Monthly retainer', project_ref: null, client_ref: null, terms: 'Payment within 30 days',
  bill_to: { name: 'Acme Holdings (Pty) Ltd', address_line1: '9 Client Street', city: 'Johannesburg', postal_code: '2000', country: 'South Africa' },
  issuer,
}
const lines = [
  { position: 1, title: 'Strategy workshop', description: null, quantity: '1.000', unit_price: '150000.00', line_amount: '150000.00', vat_code: 'standard', charge_kind: 'once_off' },
  { position: 2, title: 'Monthly advisory', description: null, quantity: '1.000', unit_price: '50000.00', line_amount: '50000.00', vat_code: 'standard', charge_kind: 'monthly' },
]

const REVIEW_URL = 'https://unison.example/q/A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v'
const PDF_URL = `${REVIEW_URL}/pdf`
const ASSET_BASE = 'https://unison.example'
const NOTE = 'Thank you for considering us.\n\nPlease review the details below.'

function build(record: Record<string, unknown> = {}, extra: Partial<Parameters<typeof buildQuoteEmailData>[0]> = {}) {
  const full = { ...sentQuote, ...record }
  const view = buildDocumentView({ kind: 'quote', record: full, lines, client: null, settings: liveSettings })
  return buildQuoteEmailData({
    view,
    record: full,
    personalNote: NOTE,
    reviewUrl: REVIEW_URL,
    pdfUrl: PDF_URL,
    assetBaseUrl: ASSET_BASE,
    sender: { name: 'Neo Matime', role: 'Founder' },
    version: { version: 1, replacesNumber: null },
    ...extra,
  })
}

test('a sent quote maps to the whole summary card and sign-off', () => {
  assert.deepEqual(build(), {
    quoteNumber: 'HMK-Q-2026-00045',
    versionLabel: null,
    clientName: 'Acme Holdings',
    projectName: 'Signature Partner',
    totalLabel: 'ZAR 230,000.00',
    vatNote: 'Incl. VAT (15%)',
    validUntil: '6 November 2026',
    statusLabel: 'Awaiting response',
    recipientName: 'Thandi Nkosi',
    personalNote: NOTE,
    reviewUrl: REVIEW_URL,
    pdfUrl: PDF_URL,
    assetBaseUrl: ASSET_BASE,
    sender: {
      name: 'Neo Matime',
      role: 'Founder',
      company: 'HIMARK Strategic Growth Consulting',
      website: 'www.himark.example',
      email: 'info@himark.example',
      phone: '+27 10 000 0000',
    },
  })
})

// Ruling 31: the email says which version it is, as the spec's "Version 2, replacing HMK-Q-2026-00045".
test('version 1 shows no version line; a revision shows its version and the number it replaces', () => {
  assert.equal(build().versionLabel, null, 'version 1: nothing')
  const revision = (version: number, replacesNumber: string | null) => build({ quote_number: 'HMK-Q-2026-00046' }, { version: { version, replacesNumber } }).versionLabel
  assert.equal(revision(2, 'HMK-Q-2026-00045'), 'Version 2, replacing HMK-Q-2026-00045')
  assert.equal(revision(2, null), 'Version 2', 'without a replaced number (another client, or not numbered) the version alone')
  assert.equal(revision(2, '   '), 'Version 2', 'a blank number is no number')
  assert.equal(revision(3, 'HMK-Q-2026-00046'), 'Version 3, replacing HMK-Q-2026-00046')
})

test('the version line renders under the quote number in the html and in the text', () => {
  const data = build({ quote_number: 'HMK-Q-2026-00046' }, { version: { version: 2, replacesNumber: 'HMK-Q-2026-00045' } })
  const mail = quoteEmailTemplate(data, 'Quote HMK-Q-2026-00046 from HIMARK')
  assert.ok(mail.html.includes('Version 2, replacing HMK-Q-2026-00045'))
  assert.ok(mail.text.includes('Quote number: HMK-Q-2026-00046\nVersion 2, replacing HMK-Q-2026-00045\n'))
  const first = quoteEmailTemplate(build(), 'Quote HMK-Q-2026-00045 from HIMARK')
  assert.ok(!/Version \d/.test(first.html) && !/Version \d/.test(first.text), 'version 1 prints no version line')
})

test('the amount is the quote total with its currency, never the subtotal or the VAT', () => {
  const data = build()
  assert.equal(data.totalLabel, 'ZAR 230,000.00')
  assert.notEqual(data.totalLabel, 'ZAR 200,000.00', 'not the subtotal')
  assert.notEqual(data.totalLabel, 'ZAR 30,000.00', 'not the VAT')
  assert.equal(build({ currency: 'USD', subtotal: '1000.00', tax_amount: '150.00', total_amount: '1150.50' }).totalLabel, 'USD 1,150.50')
})

test('the VAT note names the rate on the quote when VAT was charged, and says so when it was not', () => {
  assert.equal(build().vatNote, 'Incl. VAT (15%)')
  assert.equal(build({ vat_rate: '14.50', tax_amount: '29000.00', total_amount: '229000.00' }).vatNote, 'Incl. VAT (14.5%)')
  assert.equal(build({ vat_rate: 15, tax_amount: 30000 }).vatNote, 'Incl. VAT (15%)', 'numbers as well as numeric strings')
  assert.equal(build({ tax_amount: '0.00', total_amount: '200000.00' }).vatNote, 'No VAT charged', 'zero-rated: the rate is not claimed')
  assert.equal(build({ tax_amount: 0, total_amount: '200000.00' }).vatNote, 'No VAT charged')
  assert.equal(build({ tax_amount: null, total_amount: '200000.00' }).vatNote, 'No VAT charged')
})

test('the client sees "Awaiting response" for a Sent quote; any other status keeps its name', () => {
  assert.equal(build().statusLabel, 'Awaiting response')
  assert.equal(build({ status: 'Accepted' }).statusLabel, 'Accepted')
  assert.equal(build({ status: 'Expired' }).statusLabel, 'Expired')
})

test('the valid-until date is formatted, or null when the quote has none', () => {
  assert.equal(build().validUntil, '6 November 2026')
  assert.equal(build({ valid_until: null }).validUntil, null)
})

test('the project is its title, or null when the quote has none', () => {
  assert.equal(build().projectName, 'Signature Partner')
  assert.equal(build({ project_name: null, project_description: null }).projectName, null, 'no project at all')
  assert.equal(build({ project_name: null }).projectName, null, 'a description without a title is not a project name')
})

test('the greeting is to the quote contact, or to nobody by name', () => {
  assert.equal(build().recipientName, 'Thandi Nkosi')
  assert.equal(build({ contact_name: null }).recipientName, null)
  assert.equal(build({ contact_name: undefined }).recipientName, null)
})

test('the client name is the one on the quote record, not the billing name', () => {
  assert.equal(build().clientName, 'Acme Holdings')
  assert.equal(build({ client_name: null }).clientName, '')
})

test('the note, the two addresses and the asset base pass through untouched', () => {
  const hostile = 'Hi <b>there</b> & "you"\n\nLine two\nLine three'
  const data = build({}, { personalNote: hostile, reviewUrl: 'https://a.example/q/x', pdfUrl: 'https://a.example/q/x/pdf', assetBaseUrl: 'https://cdn.example/base' })
  assert.equal(data.personalNote, hostile, 'escaping is the template’s job, not the mapping’s')
  assert.equal(data.reviewUrl, 'https://a.example/q/x')
  assert.equal(data.pdfUrl, 'https://a.example/q/x/pdf')
  assert.equal(data.assetBaseUrl, 'https://cdn.example/base')
})

test("the sender's name and role pass through; the company and contact details are the frozen issuer's", () => {
  const data = build({}, { sender: { name: 'Sam Sender', role: null } })
  assert.equal(data.sender.name, 'Sam Sender')
  assert.equal(data.sender.role, null)
  assert.equal(data.sender.company, 'HIMARK Strategic Growth Consulting', 'from the view, which reads the frozen issuer, not the live settings')
  assert.equal(data.sender.website, 'www.himark.example')
  assert.equal(data.sender.email, 'info@himark.example')
  assert.equal(data.sender.phone, '+27 10 000 0000')
  const bare = build({ issuer: { legal_name: null, email: null, phone: null, website: null } })
  assert.deepEqual([bare.sender.company, bare.sender.website, bare.sender.email, bare.sender.phone], ['', null, null, null])
})

test('the mapped data renders: the email carries the total, the VAT note and the client status', () => {
  const mail = quoteEmailTemplate(build(), 'Quote HMK-Q-2026-00045 from HIMARK')
  assert.ok(mail.html.includes('ZAR 230,000.00'))
  assert.ok(mail.html.includes('Incl. VAT (15%)'))
  assert.ok(mail.html.includes('Awaiting response'))
  assert.ok(mail.text.includes('Amount: ZAR 230,000.00 (Incl. VAT (15%))'))
  assert.ok(!mail.html.includes('>Sent<'), 'the raw status word is not shown')
})
