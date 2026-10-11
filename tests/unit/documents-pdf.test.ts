import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import { buildDocumentView } from '../../features/documents/document-view.ts'
import { loadPdfImages } from '../../features/documents/pdf/load-pdf-images.ts'
import { allowLongRunsToWrap, pdfFileName, pdfText } from '../../features/documents/pdf/pdf-text.ts'
import { renderDocumentPdf, type PdfImages } from '../../features/documents/pdf/render-document-pdf.ts'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const NO_IMAGES: PdfImages = { header: null, logo: null }

// ---- fixtures: obviously fake details only ----
const issuer = {
  legal_name: 'Test Co (Pty) Ltd', tagline: 'Test tagline', address_line1: '1 Test Road', city: 'Testville', postal_code: '1234', country: 'Testland',
  vat_number: 'VAT-TEST', email: 'accounts@test.example', phone: '000 000 0000', website: 'test.example',
  bank_name: 'Test Bank', bank_account_name: 'Test Co', bank_account_number: '000111', bank_branch_code: '000', bank_account_type: 'Cheque',
  quote_closing_text: 'Thank you for considering us.\nReply to this email to accept.', invoice_closing_text: 'Thank you for your business.',
  default_quote_terms: null, default_payment_terms: null, header_image_path: null, logo_path: null,
}
const billTo = { name: 'Test Client', address_line1: '2 Test Street', city: 'Testville', postal_code: '1234', country: 'Testland', vat_number: 'VAT-CLIENT' }
const line = (n: number, over: Record<string, unknown> = {}) => ({
  position: n, title: `Advisory day ${n}`, description: `Work item ${n}`, quantity: 2, unit_price: 100, line_amount: 200, ...over,
})

function view(kind: 'quote' | 'invoice', over: Record<string, unknown> = {}, lines: Record<string, unknown>[] = [line(1), line(2)], issuerOver: Record<string, unknown> | null = {}) {
  const base = kind === 'quote'
    ? { quote_number: 'TST-Q-2026-00001', status: 'Sent', valid_until: '2026-11-10', terms: 'First term\nSecond term' }
    : { invoice_number: 'TST-I-2026-00001', status: 'Issued', due_date: '2026-11-10', payment_terms: 'Pay within 30 days' }
  return buildDocumentView({
    kind,
    record: {
      ...base, currency: 'ZAR', issue_date: '2026-10-11', vat_rate: 15, subtotal: 400, tax_amount: 60, total_amount: 460,
      client_name: 'Test Client', client_ref: 'PO-9', project_name: 'Test project', project_description: 'A description', project_ref: 'P-1',
      bill_to: billTo, issuer: issuerOver === null ? null : { ...issuer, ...issuerOver }, ...over,
    },
    lines, client: null, settings: null,
  })
}
const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}
/** A small valid RGB PNG, so the image path is exercised without any real artwork. */
function makePng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x9c)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** Set PDF_SAMPLE_DIR to write the sample PDFs out so a person can look at them. */
function keep(name: string, pdf: Buffer) {
  const dir = process.env.PDF_SAMPLE_DIR
  if (dir) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, name), pdf) }
}

// ---- pdf-text ----
test('pdfText keeps what a standard font can draw and replaces the rest with one ? per character', () => {
  assert.equal(pdfText('Ñandú Zoë – “quoted” € 1 200 … ™'), 'Ñandú Zoë – “quoted” € 1 200 … ™')
  assert.equal(pdfText('北京'), '??')
  assert.equal(pdfText('ok 🙂 ok'), 'ok ? ok')
  assert.equal(pdfText('שלום'), '????')
})

test('pdfText removes control characters, keeps line breaks and turns tabs into spaces', () => {
  assert.equal(pdfText('a\u0000b\u0007c‮d'), 'abc?d')
  assert.equal(pdfText('one\r\ntwo\nthree\tfour'), 'one\ntwo\nthree four')
  assert.equal(pdfText(null), '')
  assert.equal(pdfText(undefined), '')
})

test('allowLongRunsToWrap breaks only runs of 30 or more characters without a space', () => {
  assert.equal(allowLongRunsToWrap('a normal sentence of words'), 'a normal sentence of words')
  const run = 'x'.repeat(60)
  const wrapped = allowLongRunsToWrap(run)
  assert.ok(wrapped.includes(' '))
  assert.equal(wrapped.replace(/ /g, ''), run, 'only spaces are added')
  assert.ok(wrapped.split(' ').every((part) => part.length <= 24))
  assert.equal(allowLongRunsToWrap('y'.repeat(48)).endsWith(' '), false, 'no trailing space after an exact multiple')
})

test('pdfFileName keeps a document number usable as a file name', () => {
  assert.equal(pdfFileName('TST-Q-2026-00001'), 'TST-Q-2026-00001')
  assert.equal(pdfFileName('A/B "C"\r\nD'), 'A_B_C_D')
  assert.equal(pdfFileName('///'), 'document')
})

// ---- rendering ----
test('a quote and an invoice render to a small, valid PDF on one page', async () => {
  for (const kind of ['quote', 'invoice'] as const) {
    const pdf = await renderDocumentPdf(view(kind), NO_IMAGES)
    keep(`${kind}.pdf`, pdf)
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-')
    assert.ok(pdf.length > 1000 && pdf.length < 2_000_000, `${kind} is ${pdf.length} bytes`)
    assert.equal(pageCount(pdf), 1, `${kind} fits one page`)
  }
})

test('a long document wraps onto further pages', async () => {
  const lines = Array.from({ length: 80 }, (_, i) => line(i + 1, { description: 'A line of description that is long enough to wrap onto a second row in the description column of the table.' }))
  const pdf = await renderDocumentPdf(view('invoice', {}, lines), NO_IMAGES)
  keep('long.pdf', pdf)
  assert.ok(pageCount(pdf) >= 3, `expected several pages, got ${pageCount(pdf)}`)
  assert.ok(pdf.length < 2_000_000)
})

test('hostile text renders: characters no font has, an unbroken 5,000-character word, markup and control characters', async () => {
  const hostile = 'Ñandú 北京 🙂 שלום <script>alert(1)</script> \u0000‮'
  const pdf = await renderDocumentPdf(
    view('quote', { client_name: hostile, bill_to: { ...billTo, name: hostile }, project_name: 'p'.repeat(5000), client_ref: 'r'.repeat(300) }, [
      line(1, { title: hostile, description: 'w'.repeat(5000) }),
      line(2, { title: 't'.repeat(2000) }),
    ], { legal_name: hostile, quote_closing_text: 'c'.repeat(3000) }),
    NO_IMAGES,
  )
  keep('hostile.pdf', pdf)
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-')
  assert.ok(pdf.length < 2_000_000)
})

test('a document with no company details and no lines still renders', async () => {
  const pdf = await renderDocumentPdf(view('invoice', { bill_to: null, issuer: null }, [], null), NO_IMAGES)
  keep('empty.pdf', pdf)
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-')
})

test('images from the brand folder are drawn and the PDF stays valid', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pdf-brand-'))
  mkdirSync(join(root, 'public', 'brand'), { recursive: true })
  writeFileSync(join(root, 'public', 'brand', 'header.png'), makePng(600, 200))
  writeFileSync(join(root, 'public', 'brand', 'logo.png'), makePng(300, 100))
  const withImages = view('quote', {}, [line(1)], { header_image_path: '/brand/header.png', logo_path: '/brand/logo.png' })
  const images = await loadPdfImages(withImages, root)
  assert.ok(images.header && images.logo)
  assert.equal(images.header!.format, 'png')
  const pdf = await renderDocumentPdf(withImages, images)
  keep('images.pdf', pdf)
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-')
  assert.ok(pdf.length > (await renderDocumentPdf(withImages, NO_IMAGES)).length, 'the images are in the file')
})

// ---- loading images ----
test('loadPdfImages returns nothing when there are no paths, and refuses anything outside /brand or not PNG/JPEG', async () => {
  assert.deepEqual(await loadPdfImages({ headerImage: null, logo: null }, process.cwd()), { header: null, logo: null })
  for (const path of ['/brand/../../.env.local', '/etc/passwd', '/brand/a/b.png', 'brand/x.png', '/brand/.hidden.png']) {
    await assert.rejects(loadPdfImages({ headerImage: path, logo: null }, process.cwd()), /brand image/i, path)
  }
  await assert.rejects(loadPdfImages({ headerImage: '/brand/x.svg', logo: null }, process.cwd()), /PNG and JPEG/)
})

test('loadPdfImages fails loudly when the file is missing rather than drawing a PDF without it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pdf-brand-'))
  await assert.rejects(loadPdfImages({ headerImage: '/brand/missing.png', logo: null }, root))
})

// ---- source guards ----
test('the PDF layout module is loadable by tests: relative imports, no directive, no server-only', () => {
  for (const name of ['pdf-text.ts', 'render-document-pdf.ts', 'load-pdf-images.ts']) {
    const source = read('features', 'documents', 'pdf', name)
    assert.doesNotMatch(source, /^\s*['"]use (client|server)['"]/, name)
    assert.doesNotMatch(source, /server-only/, name)
    assert.doesNotMatch(source, /from\s+['"]@\//, name)
    assert.doesNotMatch(source, /(?:^|[(=,?:]|return)\s*<[A-Za-z][A-Za-z.]*[\s/>]/m, `${name} must use createElement, not JSX`)
  }
})

test('the server-only PDF modules say so, and no client component imports the PDF modules', () => {
  for (const name of ['make-document-pdf.ts', 'pdf-response.ts']) assert.match(read('features', 'documents', 'pdf', name), /^import 'server-only'/, name)
  for (const name of ['document-actions.tsx', 'document-sheet.tsx', 'line-editor.tsx', 'print-button.tsx']) {
    assert.doesNotMatch(read('features', 'documents', 'components', name), /documents\/pdf|\.\.\/pdf/, name)
  }
})

test('the download routes check the id, refuse a draft before any PDF is made, and say the PDF is never cached', () => {
  const response = read('features', 'documents', 'pdf', 'pdf-response.ts')
  const idCheck = response.indexOf('isUuid(')
  const draft = response.indexOf('isDraftStatus(')
  const make = response.indexOf('makeDocumentPdf(')
  assert.ok(idCheck > -1 && draft > idCheck && make > draft, 'id check, then draft check, then the PDF')
  assert.match(response, /status: 404/)
  assert.match(response, /no-store/)
  assert.match(response, /application\/pdf/)
  assert.match(read('app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'document', 'pdf', 'route.ts'), /documentPdfResponse\('quote'/)
  assert.match(read('app', '(unison)', 'finance', 'invoices', '[invoiceId]', 'document', 'pdf', 'route.ts'), /documentPdfResponse\('invoice'/)
})

test('the build ships the brand images and keeps react-pdf out of the server-components bundle', () => {
  const config = read('next.config.mjs')
  assert.match(config, /serverExternalPackages:\s*\[[^\]]*@react-pdf\/renderer/)
  assert.match(config, /outputFileTracingIncludes/)
  assert.match(config, /public\/brand/)
})
