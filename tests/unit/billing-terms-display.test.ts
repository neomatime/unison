import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { PDFArray, PDFDocument, PDFName, type PDFObject, type PDFRawStream } from 'pdf-lib'
import { inflateSync } from 'node:zlib'

import { agreementSentence } from '../../features/documents/billing-terms.ts'
import { buildDocumentView } from '../../features/documents/document-view.ts'
import { renderDocumentPdf, type PdfImages } from '../../features/documents/pdf/render-document-pdf.ts'
import { buildQuoteEmailData } from '../../features/quote-portal/email-data.ts'
import { buildPortalQuoteModel } from '../../features/quote-portal/portal-view-model.ts'
import { quoteEmailTemplate, type QuoteEmailData } from '../../lib/email/templates/quote.ts'
import type { PortalLine, PortalQuoteFull, PortalRecord } from '../../lib/quote-portal/types.ts'

// Accept to invoice, stage 1, task 7: the agreement sentence reaches the client. One sentence, from agreementSentence, on the portal
// page, in the portal's confirmation step, in the quote sheet and PDF, and in the quotation email. A quote without a start date and
// term gets none of it: no new row, no label, no empty line.

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const NO_IMAGES: PdfImages = { header: null, logo: null }

const SENTENCE = 'ZAR 1,725.00 per month for 12 months from 15 December 2026'
const TERMS = { start_date: '2026-12-15', term_months: 12 }

// ---------------------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------------------

const ISSUER = {
  legal_name: 'HIMARK Strategic Growth Consulting', tagline: 'People | Strategy | Progress', address_line1: '1 Example Street', city: 'Johannesburg',
  country: 'South Africa', email: 'info@himark.example', phone: '+27 11 555 0100', website: 'www.himark.example', vat_number: '4123456789',
}

let counter = 0
const line = (overrides: Partial<PortalLine> & Pick<PortalLine, 'line_amount'>): PortalLine => {
  counter += 1
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`, position: counter, title: `Line ${counter}`, description: null, quantity: 1,
    unit_price: overrides.line_amount, vat_code: 'standard', charge_kind: null, ...overrides,
  }
}
/** A once-off 10 000 and a monthly 1 500: the monthly total including 15% VAT is 1 725.00. */
const GROUPED = (): PortalLine[] => [
  line({ title: 'Setup', line_amount: '10000.00', charge_kind: 'once_off' }),
  line({ title: 'Retainer', line_amount: '1500.00', charge_kind: 'monthly' }),
]
/** A quote with a monthly line next to a line with no charge kind: the summary cannot group it, so it is one flat list. */
const FLAT_WITH_MONTHLY = (): PortalLine[] => [
  line({ title: 'Audit', line_amount: '10000.00', charge_kind: null }),
  line({ title: 'Retainer', line_amount: '1500.00', charge_kind: 'monthly' }),
]
/** Nothing monthly at all. */
const ONCE_OFF_ONLY = (): PortalLine[] => [
  line({ title: 'Setup', line_amount: '10000.00', charge_kind: 'once_off' }),
  line({ title: 'Review', line_amount: '2000.00', charge_kind: 'once_off' }),
]

const record = (overrides: Partial<PortalRecord> = {}): PortalRecord => ({
  quote_number: 'HMK-Q-2026-00001', status: 'Sent', issue_date: '2026-10-18', valid_until: '2026-11-25', currency: 'ZAR', client_name: 'TEST Company',
  contact_name: 'Thandi Nkosi', client_ref: null, project_name: 'Signature Partner', project_description: 'Strategic consulting.', project_ref: null,
  vat_rate: '15.00', subtotal: '11500.00', tax_amount: '1725.00', total_amount: '13225.00', terms: '1. Payment is due within 30 days.',
  service_inclusions: null, terms_sources: null, bill_to: { name: 'TEST Company' }, issuer: ISSUER, sent_at: '2026-10-18T09:00:00+00:00', accepted_at: null,
  ...overrides,
})

const portalQuote = (lines: PortalLine[], recordOverrides: Partial<PortalRecord> = {}): PortalQuoteFull => ({
  state: 'open', expires_at: '2026-11-25T22:00:00+00:00', recipient_email: 'client@example.test', recipient_name: 'A. Client', record: record(recordOverrides), lines,
  version: 1, replaces_number: null, owner: { name: 'Neo Matime', email: 'neo@himark.example', job_title: 'Founder' }, snapshot_hash: 'ab12'.repeat(16), response: null,
})

const quoteView = (lines: PortalLine[], recordOverrides: Record<string, unknown> = {}) =>
  buildDocumentView({ kind: 'quote', record: { ...record(), ...recordOverrides }, lines: lines as unknown as Array<Record<string, unknown>>, client: null, settings: null })

// ---------------------------------------------------------------------------------------------------------------
// The portal model
// ---------------------------------------------------------------------------------------------------------------

test('the portal model gives a grouped quote with terms the sentence with its monthly figure, and the confirmation step carries the same words', () => {
  const model = buildPortalQuoteModel(portalQuote(GROUPED(), TERMS))
  assert.equal(model.commercial.agreement, SENTENCE)
  assert.equal(model.commercial.monthly?.includingVat, '1,725.00', 'the figure in the sentence is the one the monthly block shows')
  assert.equal(model.confirmation.recurring, SENTENCE, 'the recurring commitment says the term and the start date as well')
  assert.ok(model.confirmation.recurring?.startsWith('ZAR 1,725.00 per month'), 'it still begins with the figure the step showed before')
  assert.equal(model.commercial.recurringNote !== null, true, 'the recurring note is unchanged')
})

test('without a start date and term the portal model is as it was: no agreement, the recurring figure alone', () => {
  const plain = buildPortalQuoteModel(portalQuote(GROUPED()))
  assert.equal(plain.commercial.agreement, null)
  assert.equal(plain.confirmation.recurring, 'ZAR 1,725.00 per month')

  // Explicit nulls (a record that carries the keys) are the same as no keys at all.
  const nulls = buildPortalQuoteModel(portalQuote(GROUPED(), { start_date: null, term_months: null }))
  assert.equal(nulls.commercial.agreement, null)
  assert.equal(nulls.confirmation.recurring, 'ZAR 1,725.00 per month')
  assert.deepEqual({ ...nulls, commercial: { ...nulls.commercial, rows: nulls.commercial.rows } }, { ...plain, commercial: { ...plain.commercial } }, 'nothing else about the page moves')

  // Half a pair cannot make a sentence.
  assert.equal(buildPortalQuoteModel(portalQuote(GROUPED(), { start_date: '2026-12-15' })).commercial.agreement, null)
  assert.equal(buildPortalQuoteModel(portalQuote(GROUPED(), { term_months: 12 })).commercial.agreement, null)
})

test('a flat quote with a monthly line and terms counts the payments; the confirmation step has no recurring figure to extend', () => {
  const model = buildPortalQuoteModel(portalQuote(FLAT_WITH_MONTHLY(), TERMS))
  assert.equal(model.commercial.grouped, false)
  assert.equal(model.commercial.agreement, '12 monthly payments from 15 December 2026')
  assert.equal(model.confirmation.recurring, null, 'recurring stays null unless the summary is grouped')
  assert.equal(model.commercial.recurringNote, null)
  // Without terms: nothing.
  assert.equal(buildPortalQuoteModel(portalQuote(FLAT_WITH_MONTHLY())).commercial.agreement, null)
})

test('terms on a quote with no monthly line say nothing about monthly payments', () => {
  const model = buildPortalQuoteModel(portalQuote(ONCE_OFF_ONLY(), TERMS))
  assert.equal(model.commercial.agreement, null, 'nothing is billed monthly, so no monthly sentence')
  assert.equal(model.confirmation.recurring, null)
  const view = quoteView(ONCE_OFF_ONLY(), TERMS)
  assert.equal(view.agreement, null)
})

test('the sentence follows the figure the page shows: one month, and a monthly block without VAT', () => {
  assert.equal(buildPortalQuoteModel(portalQuote(GROUPED(), { start_date: '2027-01-01', term_months: 1 })).commercial.agreement, 'ZAR 1,725.00 per month for 1 month from 1 January 2027')
  // Zero-rated monthly lines: the monthly block has no VAT row, and the figure is the subtotal.
  const zeroRated = [line({ title: 'Setup', line_amount: '10000.00', charge_kind: 'once_off' }), line({ title: 'Retainer', line_amount: '1500.00', charge_kind: 'monthly', vat_code: 'zero' })]
  const model = buildPortalQuoteModel(portalQuote(zeroRated, TERMS))
  assert.equal(model.commercial.monthly?.includingVat, null)
  assert.equal(model.commercial.agreement, 'ZAR 1,500.00 per month for 12 months from 15 December 2026')
  assert.equal(model.confirmation.recurring, 'ZAR 1,500.00 per month for 12 months from 15 December 2026')
})

test('a term that arrives as text is read as the number it is, and one that cannot be read gives no sentence', () => {
  assert.equal(buildPortalQuoteModel(portalQuote(GROUPED(), { start_date: '2026-12-15', term_months: '12' as unknown as number })).commercial.agreement, SENTENCE)
  for (const bad of ['', 'abc', '0', -3, 2.5] as unknown as number[]) {
    assert.equal(buildPortalQuoteModel(portalQuote(GROUPED(), { start_date: '2026-12-15', term_months: bad })).commercial.agreement, null, String(bad))
  }
})

// ---------------------------------------------------------------------------------------------------------------
// The document view (sheet and PDF)
// ---------------------------------------------------------------------------------------------------------------

test('buildDocumentView gives a quote with terms the sentence, and the portal shows the very same one', () => {
  const view = quoteView(GROUPED(), TERMS)
  assert.equal(view.agreement, SENTENCE)
  assert.equal(view.agreement, buildPortalQuoteModel(portalQuote(GROUPED(), TERMS)).commercial.agreement, 'the page and the PDF are one document')
  assert.equal(quoteView(FLAT_WITH_MONTHLY(), TERMS).agreement, '12 monthly payments from 15 December 2026')
})

test('buildDocumentView gives a quote without terms none, and an invoice never one', () => {
  assert.equal(quoteView(GROUPED()).agreement, null)
  assert.equal(quoteView(GROUPED(), { start_date: null, term_months: null }).agreement, null)
  assert.equal(quoteView(GROUPED(), { start_date: '2026-12-15' }).agreement, null)
  const invoice = buildDocumentView({
    kind: 'invoice',
    record: { ...record(), invoice_number: 'HMK-I-2026-00001', status: 'Issued', due_date: '2026-11-30', payment_terms: 'Pay within 30 days', ...TERMS },
    lines: GROUPED() as unknown as Array<Record<string, unknown>>, client: null, settings: null,
  })
  assert.equal(invoice.title, 'INVOICE')
  assert.equal(invoice.agreement, null, 'an invoice carries no agreement line, whatever its record holds')
})

test('a draft quote from the database (text amounts, a numeric term) shows the sentence the client will see', () => {
  const rows = [
    { position: 1, title: 'Setup', quantity: '1.000', unit_price: '10000.00', line_amount: '10000.00', vat_code: 'standard', charge_kind: 'once_off' },
    { position: 2, title: 'Retainer', quantity: '1.000', unit_price: '1500.00', line_amount: '1500.00', vat_code: 'standard', charge_kind: 'monthly' },
  ]
  const draft = buildDocumentView({
    kind: 'quote', record: { status: 'Draft', quote_number: 'DRAFT-1a2b3c4d', currency: 'ZAR', vat_rate: '15.00', subtotal: '11500.00', tax_amount: '1725.00', total_amount: '13225.00', client_name: 'TEST Company', ...TERMS },
    lines: rows, client: null, settings: null,
  })
  assert.equal(draft.draft, true)
  assert.equal(draft.agreement, SENTENCE)
})

test('the sentence is the one agreementSentence makes', () => {
  assert.equal(agreementSentence({ monthly: 'ZAR 1,725.00', termMonths: 12, startDateLabel: '15 December 2026' }), SENTENCE)
  assert.equal(agreementSentence({ monthly: null, termMonths: 12, startDateLabel: '15 December 2026' }), '12 monthly payments from 15 December 2026')
})

// ---------------------------------------------------------------------------------------------------------------
// The PDF prints the line; the sheet is guarded by its source
// ---------------------------------------------------------------------------------------------------------------

async function pdfText(pdf: Buffer): Promise<string> {
  const doc = await PDFDocument.load(pdf)
  return doc
    .getPages()
    .map((page) => {
      const contents = page.node.get(PDFName.of('Contents')) as PDFObject
      const parts = contents instanceof PDFArray ? contents.asArray() : [contents]
      return parts
        .map((part) => {
          const stream = doc.context.lookup(part) as PDFRawStream
          const raw = Buffer.from(stream.contents)
          const data = (stream.dict.get(PDFName.of('Filter')) ? inflateSync(raw) : raw).toString('latin1')
          return [...data.matchAll(/<([0-9a-fA-F]*)>/g)].map((match) => Buffer.from(match[1], 'hex').toString('latin1')).join('')
        })
        .join('')
    })
    .join('')
    .replace(/\s+/g, '')
}
const squash = (text: string) => text.replace(/\s+/g, '')

test('the PDF of a quote with terms prints "Monthly agreement:" and the sentence; without terms, and for an invoice, nothing', async () => {
  const withTerms = await pdfText(await renderDocumentPdf(quoteView(GROUPED(), TERMS), NO_IMAGES))
  assert.ok(withTerms.includes(squash(`Monthly agreement: ${SENTENCE}`)), 'the line is printed')

  const without = await pdfText(await renderDocumentPdf(quoteView(GROUPED()), NO_IMAGES))
  assert.ok(!without.includes('Monthlyagreement'), 'no label without terms')
  assert.ok(!without.includes(squash('15 December 2026')), 'and no date')
  assert.ok(without.includes(squash('TOTAL (ZAR)')), 'the rest of the document is there (the PDF prints the total row upper case)')

  const invoice = buildDocumentView({
    kind: 'invoice',
    record: { ...record(), invoice_number: 'HMK-I-2026-00001', status: 'Issued', due_date: '2026-11-30', payment_terms: 'Pay within 30 days', ...TERMS },
    lines: GROUPED() as unknown as Array<Record<string, unknown>>, client: null, settings: null,
  })
  assert.ok(!(await pdfText(await renderDocumentPdf(invoice, NO_IMAGES))).includes('Monthlyagreement'), 'an invoice never prints the line')
})

test('the sheet and the PDF renderer print view.agreement under the totals, as a line of its own', () => {
  const sheet = read('features', 'documents', 'components', 'document-sheet.tsx')
  assert.match(sheet, /view\.agreement \? \(/, 'the sheet prints only when there is an agreement')
  assert.ok(sheet.includes('Monthly agreement:'), 'with the label')
  assert.match(sheet, /\{view\.agreement\}/, 'and the sentence as it is')
  // After the totals, before the terms.
  assert.ok(sheet.indexOf('view.totals.total') < sheet.indexOf('view.agreement') && sheet.indexOf('view.agreement') < sheet.indexOf('view.termsHeading'), 'under the totals block')

  const pdf = read('features', 'documents', 'pdf', 'render-document-pdf.ts')
  assert.match(pdf, /if \(!view\.agreement\) return null/, 'the PDF draws nothing without an agreement')
  assert.ok(pdf.includes("'Monthly agreement: '"), 'with the same label')
  assert.match(pdf, /t\(view\.agreement\)/, 'and the sentence through the PDF text filter')
  assert.ok(pdf.indexOf('inclusionsAndTotals(view),') < pdf.indexOf('agreementLine(view),') && pdf.indexOf('agreementLine(view),') < pdf.indexOf('termsBlock(view),'), 'drawn between the totals and the terms')
})

test('the document view takes the agreement for a quote only, and the date through formatDocumentDate', () => {
  const source = read('features', 'documents', 'document-view.ts')
  assert.match(source, /agreement: string \| null/)
  assert.match(source, /agreementSentence\(/)
  assert.match(source, /formatDocumentDate\(record\.start_date\)/, 'the date is formatted by the one formatter')
  assert.match(source, /quote \? /, 'only for a quote')
  const terms = read('features', 'documents', 'billing-terms.ts')
  assert.doesNotMatch(terms, /^\s*import\b/m, 'billing-terms.ts imports nothing, so document-view importing it can never be a cycle')
})

test('the portal view prints commercial.agreement from the model, as text, and does no wording of its own', () => {
  const view = read('features', 'quote-portal', 'components', 'portal-quote-view.tsx')
  assert.match(view, /commercial\.agreement \? /)
  assert.match(view, /\{commercial\.agreement\}/)
  assert.doesNotMatch(view, /monthly payments|per month for/, 'the sentence is made in one place')
  const steps = read('features', 'quote-portal', 'components', 'portal-decision-steps.tsx')
  assert.match(steps, /confirmation\.recurring/, 'the confirm step still prints the model\'s recurring string')
  assert.doesNotMatch(steps, /agreementSentence|months from/, 'and adds nothing of its own')
})

test('PortalRecord carries the two fields as optional, so an older answer without them still fits', () => {
  const types = read('lib', 'quote-portal', 'types.ts')
  assert.match(types, /start_date\?: string \| null/)
  assert.match(types, /term_months\?: number \| null/)
})

// ---------------------------------------------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------------------------------------------

const REVIEW_URL = 'https://unison.example/q/A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v'
const emailFor = (lines: PortalLine[], recordOverrides: Record<string, unknown> = {}): QuoteEmailData => {
  const full = { ...record(), ...recordOverrides }
  const view = buildDocumentView({ kind: 'quote', record: full, lines: lines as unknown as Array<Record<string, unknown>>, client: null, settings: null })
  return buildQuoteEmailData({
    view, record: full, personalNote: 'Please review.', reviewUrl: REVIEW_URL, pdfUrl: `${REVIEW_URL}/pdf`, assetBaseUrl: 'https://unison.example',
    sender: { name: 'Neo Matime', role: 'Founder' }, version: { version: 1, replacesNumber: null },
  })
}
const plain = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

test('the email data carries the view\'s sentence, and null for a quote without terms', () => {
  assert.equal(emailFor(GROUPED(), TERMS).agreement, SENTENCE)
  assert.equal(emailFor(GROUPED()).agreement, null)
})

test('the email shows an AGREEMENT cell beside VALID UNTIL and an "Agreement:" line in the text', () => {
  const mail = quoteEmailTemplate(emailFor(GROUPED(), TERMS), 'Quote HMK-Q-2026-00001 from HIMARK')
  assert.ok(mail.html.includes('>AGREEMENT<'), 'the label')
  assert.ok(plain(mail.html).includes(SENTENCE), 'the sentence')
  const labels = [...mail.html.matchAll(/>(QUOTE NUMBER|PROJECT|AMOUNT|VALID UNTIL|AGREEMENT|STATUS)</g)].map((match) => match[1])
  assert.deepEqual(labels, ['QUOTE NUMBER', 'PROJECT', 'AMOUNT', 'VALID UNTIL', 'AGREEMENT', 'STATUS'], 'beside VALID UNTIL, before STATUS')
  const lines = mail.text.split('\n')
  assert.ok(lines.includes(`Agreement: ${SENTENCE}`), 'the text line')
  assert.equal(lines.indexOf(`Agreement: ${SENTENCE}`), lines.findIndex((entry) => entry.startsWith('Valid until:')) + 1, 'right after the valid-until line')
})

test('the email has no label and no line when there is no agreement, and is the same as the email before the field existed', () => {
  const data = emailFor(GROUPED())
  const mail = quoteEmailTemplate(data, 'Quote HMK-Q-2026-00001 from HIMARK')
  assert.ok(!/AGREEMENT/i.test(plain(mail.html)), 'no label in the HTML')
  assert.ok(!/agreement/i.test(mail.text), 'no line in the text')
  const { agreement: _omitted, ...before } = data
  const old = quoteEmailTemplate(before as QuoteEmailData, 'Quote HMK-Q-2026-00001 from HIMARK')
  assert.equal(mail.html, old.html, 'byte-identical HTML')
  assert.equal(mail.text, old.text, 'byte-identical text')
})

test('the sentence is escaped in the HTML and kept to one line in the text', () => {
  const hostile = '<script>alert(1)</script> & "x"\nsecond line'
  const mail = quoteEmailTemplate({ ...emailFor(GROUPED(), TERMS), agreement: hostile }, 'Quote')
  assert.ok(!mail.html.includes('<script>'), 'no markup from the value')
  assert.ok(mail.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot; second line'), 'escaped and on one line')
  assert.ok(mail.text.split('\n').includes('Agreement: <script>alert(1)</script> & "x" second line'), 'one line in the text')
})

test('the email template and the email data take the agreement from the data, not from words of their own', () => {
  const template = read('lib', 'email', 'templates', 'quote.ts')
  assert.match(template, /agreement: string \| null/)
  assert.match(template, /data\.agreement/)
  const code = template.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(code, /monthly payments|per month for/, 'no wording of its own (the comments may give an example)')
  const data = read('features', 'quote-portal', 'email-data.ts')
  assert.match(data, /agreement: view\.agreement/)
})

// ---------------------------------------------------------------------------------------------------------------
// The snapshot migration
// ---------------------------------------------------------------------------------------------------------------

test('the snapshot migration adds the two keys only when the quote has terms, and restates the function\'s security', () => {
  const sql = read('supabase', 'migrations', '20261026106000_quote_billing_terms_snapshot.sql')
  const statements = sql.replace(/--.*$/gm, '')
  assert.deepEqual([...statements.matchAll(/create or replace function ([\w.]+)\(/g)].map((match) => match[1]), ['private.quote_snapshot'], 'one function is replaced, and it is this one')
  assert.match(statements, /language sql stable security invoker set search_path = '' set timezone = 'UTC'/, 'invoker, empty search path, UTC')
  assert.match(statements, /case when q\.start_date is not null then jsonb_build_object\('start_date', q\.start_date, 'term_months', q\.term_months\) else '\{\}'::jsonb end/, 'the keys come only with terms')
  assert.match(statements, /revoke all on function private\.quote_snapshot\(uuid\) from public, anon, authenticated;/)
  assert.match(statements, /grant execute on function private\.quote_snapshot\(uuid\) to service_role;/)
  assert.doesNotMatch(statements, /portal_get_quote|portal_decide|get_clients_for_api_key|quote_snapshot_hash/, 'nothing else is touched')
  assert.doesNotMatch(sql, /[^\x20-\x7e\n]/, 'plain ASCII only')
})
