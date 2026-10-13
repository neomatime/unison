import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { crc32, deflateSync, inflateSync } from 'node:zlib'

import { PDFArray, PDFDocument, PDFName, type PDFObject, type PDFRawStream } from 'pdf-lib'

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

/**
 * The text drawn on each page, with all white space removed. The standard fonts write each string as hex
 * character codes inside the page's (deflated) content stream, so decoding those hex strings is enough to tell
 * which page a piece of text landed on.
 */
async function pageTexts(pdf: Buffer): Promise<string[]> {
  const doc = await PDFDocument.load(pdf)
  return doc.getPages().map((page) => {
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
      .replace(/\s+/g, '')
  })
}
const pageOf = (pages: string[], text: string) => pages.findIndex((page) => page.includes(text.replace(/\s+/g, '')))

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

test('the footer ribbon is drawn on every page of a long document, and its page padding keeps the content clear of it', async () => {
  const lines = Array.from({ length: 80 }, (_, i) => line(i + 1, { description: 'A line of description that is long enough to wrap onto a second row in the description column of the table.' }))
  const pdf = await renderDocumentPdf(view('invoice', {}, lines), NO_IMAGES)
  const texts = await pageTexts(pdf)
  assert.ok(texts.length >= 3, `expected several pages, got ${texts.length}`)
  for (const [index, text] of texts.entries()) {
    assert.ok(text.includes('accounts@test.example'), `page ${index + 1} carries the footer ribbon's contact details`)
  }
  assert.ok(!texts[0].includes('PAGE1OF'), 'the first page has the full header and no page number')
  for (let page = 2; page <= texts.length; page += 1) {
    assert.ok(texts[page - 1].includes(`INVOICETST-I-2026-00001PAGE${page}OF${texts.length}`), `page ${page} starts with a short header naming the document and its page`)
    assert.ok(texts[page - 1].includes('TestCo(Pty)Ltd'), `page ${page}'s short header carries the company name`)
  }
  const single = await pageTexts(await renderDocumentPdf(view('quote'), NO_IMAGES))
  assert.equal(single.length, 1)
  assert.ok(single[0].includes('accounts@test.example'), 'a one-page quote still has its ribbon')
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

test('the totals and the bank details are never split across pages, even when long terms and closing text let their sections break', async () => {
  const terms = Array.from({ length: 14 }, (_, i) => `Condition ${i + 1}: the work is billed as agreed and any change to the scope is quoted again before it starts.`).join('\n')
  // Taller than a page in its narrow column, so the closing text has to run on and the section has to break.
  const closing = Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1} of the closing text, long enough that this whole section can no longer be kept on one page.`).join('\n')
  let termsSplit = 0
  let bankSectionSplit = 0
  // Each extra line moves the terms and the bank section down, so the sweep crosses the page boundary at every point of both.
  for (let count = 0; count <= 24; count++) {
    const pdf = await renderDocumentPdf(view('quote', { terms }, Array.from({ length: count }, (_, i) => line(i + 1)), { quote_closing_text: closing }), NO_IMAGES)
    const pages = await pageTexts(pdf)
    const where = `with ${count} lines`
    assert.ok(pageOf(pages, 'SUBTOTAL') > -1, where)
    assert.equal(pageOf(pages, 'SUBTOTAL'), pageOf(pages, 'TOTAL (ZAR)'), `the totals split ${where}`)
    assert.equal(pageOf(pages, 'SUBTOTAL'), pageOf(pages, '460.00'), `the total split ${where}`)
    assert.equal(pageOf(pages, 'BANK DETAILS'), pageOf(pages, 'Cheque'), `the bank details split ${where}`)
    // The terms come right after the totals and before the bank details: never later than the bank details.
    assert.ok(pageOf(pages, 'Condition 14:') <= pageOf(pages, 'BANK DETAILS'), `the terms come before the bank details ${where}`)
    assert.ok(pageOf(pages, 'Condition 1:') >= pageOf(pages, 'SUBTOTAL'), `the terms come after the totals ${where}`)
    if (pageOf(pages, 'Condition 1:') !== pageOf(pages, 'Condition 14:')) termsSplit += 1
    if (pageOf(pages, 'Paragraph 1 of') !== pageOf(pages, 'Paragraph 30 of')) bankSectionSplit += 1
  }
  assert.equal(termsSplit, 0, 'terms that fit on a page are never split across two pages: they move whole to the next page')
  assert.ok(bankSectionSplit > 0, 'the sweep includes documents whose closing text runs onto the next page')
})

test('terms longer than a page still flow on rather than being cut off', async () => {
  const long = Array.from({ length: 70 }, (_, i) => `Condition ${i + 1}: the work is billed as agreed and any change to the scope is quoted again before it starts, in writing.`).join('\n')
  const pdf = await renderDocumentPdf(view('quote', { terms: long }, [line(1)], null), NO_IMAGES)
  const pages = await pageTexts(pdf)
  assert.ok(pageOf(pages, 'Condition 1:') > -1 && pageOf(pages, 'Condition 70:') > -1, 'every condition is drawn')
  assert.ok(pageOf(pages, 'Condition 70:') > pageOf(pages, 'Condition 1:'), 'a list longer than a page runs on to the next page')
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

test('loadPdfImages refuses a file whose bytes are not the image its name says, or a cut-off PNG, and accepts a real PNG and JPEG', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pdf-brand-'))
  mkdirSync(join(root, 'public', 'brand'), { recursive: true })
  const png = makePng(40, 20)
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1), Buffer.from([0xff, 0xd9])])
  const files: Record<string, Buffer> = {
    'text.png': Buffer.from('this is not an image at all, just some text'),
    'jpeg-bytes.png': jpeg,
    'png-bytes.jpg': png,
    'cut-off.png': png.subarray(0, png.length - 12),
    'empty.png': Buffer.alloc(0),
    'good.png': png,
    'good.jpeg': jpeg,
  }
  for (const [name, data] of Object.entries(files)) writeFileSync(join(root, 'public', 'brand', name), data)
  for (const name of ['text.png', 'jpeg-bytes.png', 'png-bytes.jpg', 'empty.png']) {
    await assert.rejects(loadPdfImages({ headerImage: `/brand/${name}`, logo: null }, root), /not a (PNG|JPEG) image/, name)
  }
  await assert.rejects(loadPdfImages({ headerImage: null, logo: '/brand/cut-off.png' }, root), /incomplete/)
  const loaded = await loadPdfImages({ headerImage: '/brand/good.png', logo: '/brand/good.jpeg' }, root)
  assert.equal(loaded.header?.format, 'png')
  assert.equal(loaded.logo?.format, 'jpg')
  assert.ok(loaded.header?.data.equals(png))
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
