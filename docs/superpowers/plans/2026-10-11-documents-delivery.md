# Quotes and Invoices Delivery (PDF, Email, Quote to Invoice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A salesperson can download a real PDF of a sent quote or issued invoice, email it to the client from the shared company mailbox with a permanent record of each send, and turn an Accepted quote into a draft invoice in one step.

**Architecture:** The PDF is drawn from the same `DocumentView` the on-screen sheet uses (`buildDocumentView`), by `@react-pdf/renderer` written with `createElement` so node's test runner can load it; images are read from `public/brand` on disk. Emails go through the existing Microsoft Graph raw-MIME path, extended with a PDF attachment and a Reply-To; a send is recorded in a new table that only a security-definer function can write, and only after Graph accepts the message. Quote to invoice is one security-definer database function that copies the quote's header and every line. The database stays the authority; the UI mirrors it.

**Tech Stack:** Next.js 16 App Router (server actions, route handlers), React 19, Supabase Postgres (RLS, security definer functions), `@react-pdf/renderer` 4.9.0 (new), Microsoft Graph `sendMail`, `node --test --experimental-strip-types`, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-11-documents-delivery-design.md` (the binding authority; where this plan departs from it the departure is listed under "Decisions made while planning" and is written into the spec in Task 5).

## Global Constraints

Every task's requirements include these. Values are copied from the spec.

- `unison-uat` (Supabase project `nwdzpjzllhhqwawmsxjd`) is **production**. Every test row is deleted, including its audit events; **nothing real is emailed by a test**. Rolled-back probes before applying any migration. Only the controller applies migrations or touches production.
- Migrations are append-only. Decisions are made in the database and tested there; the UI mirrors them.
- A control in the UI is a claim the product supports it. No role-based behaviour is invented: every active member can download, email and create invoices.
- No real address, bank, VAT or phone value in code or tests. Secrets live in `.env.local` only.
- Never `git add -A`, `git checkout .`, `git restore .`, `git stash` or `git clean`; stage explicit paths. **Do not touch `public/`** and do not touch `features/commercial-finance/components/record-collection-workspace.tsx`. Commit only when the task says to; never push.
- Emailing: one recipient, the document's PDF attached, a cap of **50 document emails per organisation per hour** (counted from `document_emails`), the member's address as Reply-To. A record is written **only after Graph accepts** the message.
- Only a frozen document has a PDF: a draft never gets one (the route answers 404). A malformed id or another organisation's document is also 404.
- Quote to invoice: **only from an Accepted quote, copying every line**; the quote is not changed; internal notes are not copied; more than one invoice may be made from one quote.
- Unit-tested modules use relative imports with the `.ts` extension, carry no `'use server'`/`'use client'` directive and import neither `server-only` nor `@/...`. They use `createElement`, not JSX.
- This Next.js has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing route, config or caching code (AGENTS.md).
- End every commit message with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Decisions made while planning

Small departures from the spec, each with its reason. Task 5 writes them into the spec as an "Amendments" section.

1. **Standard font (Helvetica), not an embedded font.** The standard fonts cover every South African name and address in Latin-1/WinAnsi, add no font files or licences, and keep the PDF small. Text the font cannot draw is replaced with `?` and never crashes the render (`pdfText`).
2. **The table header is not repeated on further pages, and rows and the totals never split across pages** (react-pdf `wrap={false}`).
3. **The PDF budget for email is 2,000,000 bytes, not 3 MB.** Graph takes the raw MIME as one request of about 4 MB; the code base64-encodes the whole message and the attachment is base64 inside it, so a PDF of *X* bytes costs about 1.78 *X* on the wire. A PDF over the budget can still be downloaded; emailing refuses it with a message telling the user to use a lighter header image in Company details. The header image path is whatever the company details say, so a lighter image is a settings change, not a code change.
4. **The header image is drawn once** (the top band). react-pdf/pdfkit embeds a Buffer image again every time it is drawn, so the sheet's second use (the strip beside the closing text) would double the size; that strip is a plain light-blue block in the PDF.
5. **`serverExternalPackages: ['@react-pdf/renderer']`** is set from the start (it makes react-pdf load the ordinary build of React instead of the server-components build bundled into route handlers), and `outputFileTracingIncludes` ships `public/brand` into the functions that draw a PDF: the two download routes **and the two page routes** (a server action runs in its page's function).
6. **A regenerated PDF has identical content but not identical bytes** (the PDF info carries a creation time). The email record's SHA-256 fingerprints the exact bytes that were attached.
7. **Email addresses are ASCII only** (no internationalised domains or local parts). The same pattern is in the database and in the code, which also makes header injection through the address impossible.
8. **The hourly cap is checked by the action** by counting `document_emails` rows, as the spec says; it is a guard against accidents and runaway loops, not a security boundary.

## Review Focus

Failure modes the spec implies that are most likely to hurt someone. Each has a test in the task named.

1. **Text no standard font can draw** (a client called "Ñandú 北京 🙂", RTL text, control characters) must come out as `?` and a valid PDF, never a crash or a blank download. *(Task 1)*
2. **A very long document, or a line with one unbroken 5,000-character word,** must produce several pages, rows not cut in half, and no crash. *(Task 1)*
3. **A recipient typed as a list, as `Name <a@b.com>`, with a trailing newline, or with an injected header** must be refused with "Enter one valid email address" and never reach the mail server or the database. *(Tasks 2 and 3)*
4. **Mail refused / mail accepted but not recorded / double click.** A refused send records nothing; an accepted send is recorded after and only after; the Send button is disabled while a send is pending. *(Tasks 3 and 4)*
5. **A PDF too large to email** must be refused with a clear remedy *before* anything is sent. An Accepted quote whose client has since been deleted must still make a (client-less) draft invoice rather than fail. *(Tasks 2 and 3)*

---

## File structure

**Create**

- `features/documents/pdf/pdf-text.ts`: text a standard font can draw; long-word wrapping; PDF file names.
- `features/documents/pdf/render-document-pdf.ts`: `renderDocumentPdf(view, images)`; the layout.
- `features/documents/pdf/load-pdf-images.ts`: reads `public/brand/...` images from disk.
- `features/documents/pdf/make-document-pdf.ts` (`server-only`): view + images + render for a stored document.
- `features/documents/pdf/pdf-response.ts` (`server-only`): the download route's body.
- `app/(unison)/commercial/quotes/[quoteId]/document/pdf/route.ts`, `app/(unison)/finance/invoices/[invoiceId]/document/pdf/route.ts`.
- `supabase/migrations/20261011130000_documents_delivery.sql`.
- `features/documents/email.ts`: address check, limits, field reader, default subject/message, HTML body.
- `features/documents/action-failure.ts`: token to `ActionState`.
- `features/documents/actions/email.ts`, `features/documents/actions/invoice-from-quote.ts`.
- `features/documents/queries/list-document-emails.ts`, `get-email-defaults.ts`, `list-invoices-from-quote.ts`.
- `features/documents/components/email-document-form.tsx`, `email-section.tsx`, `quote-invoices.tsx`.
- Tests: `tests/unit/documents-pdf.test.ts`, `tests/unit/documents-email.test.ts`, `tests/integration/rls/documents-delivery.test.ts`.

**Modify**

- `package.json`, `pnpm-lock.yaml` (the dependency), `next.config.mjs`.
- `lib/email/mime.ts`, `lib/email/send-email.ts`, `tests/unit/mime.test.ts`.
- `features/crm-workspace/vocabulary.ts`, `tests/unit/crm-workspace-vocabulary.test.ts`.
- `features/documents/errors.ts`, `tests/unit/documents-vocabulary.test.ts`.
- `features/documents/queries/get-document.ts` (add `billing_email` to the client select).
- `features/documents/components/document-actions.tsx`.
- `app/(unison)/commercial/quotes/[quoteId]/page.tsx`, `app/(unison)/finance/invoices/[invoiceId]/page.tsx`.
- `tests/unit/documents-actions-source.test.ts`, `tests/unit/documents-ui.test.ts`, `tests/integration/rls/anon-privileges.test.ts`.

---

### Task 1: The PDF (spike, module, download routes)

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `next.config.mjs`
- Create: `features/documents/pdf/pdf-text.ts`, `render-document-pdf.ts`, `load-pdf-images.ts`, `make-document-pdf.ts`, `pdf-response.ts`
- Create: `app/(unison)/commercial/quotes/[quoteId]/document/pdf/route.ts`, `app/(unison)/finance/invoices/[invoiceId]/document/pdf/route.ts`
- Test: `tests/unit/documents-pdf.test.ts`

**Interfaces:**
- Consumes: `buildDocumentView`, `DocumentView` (`features/documents/document-view.ts`); `getDocument`, `DocumentBundle` (`features/documents/queries/get-document.ts`); `isDraftStatus`, `DocumentKind` (`vocabulary.ts`); `getSessionContext`, `NotAuthenticatedError` (`@/lib/auth/errors`); `isUuid` (`@/lib/utils`).
- Produces (Tasks 3 and 4 rely on these exact names):
  - `pdfText(raw: string | null | undefined): string`, `allowLongRunsToWrap(text: string): string`, `pdfFileName(number: string): string` in `pdf-text.ts`.
  - `type PdfImage = { data: Buffer; format: 'png' | 'jpg' }`, `type PdfImages = { header: PdfImage | null; logo: PdfImage | null }`, `renderDocumentPdf(view: DocumentView, images: PdfImages): Promise<Buffer>` in `render-document-pdf.ts`.
  - `loadPdfImages(view: Pick<DocumentView, 'headerImage' | 'logo'>, root?: string): Promise<PdfImages>` in `load-pdf-images.ts`.
  - `class DocumentPdfError extends Error`, `makeDocumentPdf(kind: DocumentKind, bundle: DocumentBundle): Promise<{ bytes: Buffer; filename: string; view: DocumentView }>` in `make-document-pdf.ts` (throws `DocumentPdfError` with a message that is safe to show for a draft, a missing image or any render failure).
  - `documentPdfResponse(kind: DocumentKind, id: string): Promise<Response>` in `pdf-response.ts`.
- This task has a **decision point**: if `@react-pdf/renderer` cannot be made to build and render here (Step 7 or Step 9 fails and cannot be fixed with `serverExternalPackages` or a different import form), stop with status BLOCKED and report exactly what failed; the controller then switches the implementation to `pdf-lib` (already installed, 1.17.1) with the same interfaces.

- [ ] **Step 1: Install the library and read the Next docs**

```bash
pnpm add --save-exact @react-pdf/renderer@4.9.0
git diff --stat -- package.json pnpm-lock.yaml
```

Expected: only the dependency line and lockfile change. Then read `node_modules/next/dist/docs/` for `serverExternalPackages`, `outputFileTracingIncludes` (the key format for routes in route groups) and route handlers (`params` is a Promise). Note what you find in your report.

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/documents-pdf.test.ts`:

```ts
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
  assert.equal(pdfText('a\u0000b\u0007c\u202ed'), 'abc?d')
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
  const hostile = 'Ñandú 北京 🙂 שלום <script>alert(1)</script> \u0000\u202e'
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
    assert.doesNotMatch(source, /<[A-Z][A-Za-z]*[\s>]/, `${name} must use createElement, not JSX`)
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test --experimental-strip-types tests/unit/documents-pdf.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Write `pdf-text.ts`**

Create `features/documents/pdf/pdf-text.ts`:

```ts
// Text for a PDF set in a standard font (Helvetica). The standard fonts draw Latin-1 and the WinAnsi extras
// (curly quotes, dashes, the euro sign); a character outside that set has no glyph, so it is replaced with "?"
// rather than letting the renderer fail or draw garbage. No directive and no imports: unit tests load it.

const WIN_ANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])

const drawable = (code: number) => (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.has(code)

/** Text the standard font can draw. Line breaks are kept, tabs become spaces, control characters are dropped. */
export function pdfText(raw: string | null | undefined): string {
  if (!raw) return ''
  let out = ''
  for (const character of String(raw).normalize('NFC')) {
    const code = character.codePointAt(0) as number
    if (character === '\n') out += '\n'
    else if (character === '\t') out += ' '
    else if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue
    else out += drawable(code) ? character : '?'
  }
  return out
}

/** A run of 30 or more characters without a space cannot wrap, so a space is added every 24 characters. */
export function allowLongRunsToWrap(text: string): string {
  return text.replace(/\S{30,}/g, (run) => run.replace(/(.{24})(?=.)/g, '$1 '))
}

/** A document number as a file name: letters, digits, dot, dash and underscore only. */
export function pdfFileName(number: string): string {
  const cleaned = number.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'document'
}
```

- [ ] **Step 5: Write `load-pdf-images.ts`**

Create `features/documents/pdf/load-pdf-images.ts`:

```ts
// Reads the logo and header images a PDF draws from the app's own /brand folder. The company details store
// only a path, and the document view lets only "/brand/<file>" through; it is checked again here because this
// reads the disk. A missing or unusable file is an error: a PDF is never silently drawn without its header.
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

import type { PdfImage, PdfImages } from './render-document-pdf.ts'
import type { DocumentView } from '../document-view.ts'

const BRAND_PATH = /^\/brand\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/

async function readBrandImage(path: string | null, root: string): Promise<PdfImage | null> {
  if (!path) return null
  if (!BRAND_PATH.test(path)) throw new Error(`Not a brand image path: ${path}`)
  const extension = extname(path).toLowerCase()
  const format = extension === '.png' ? 'png' : extension === '.jpg' || extension === '.jpeg' ? 'jpg' : null
  if (!format) throw new Error(`Only PNG and JPEG images can be put on a PDF: ${path}`)
  return { data: await readFile(join(root, 'public', path)), format }
}

export async function loadPdfImages(view: Pick<DocumentView, 'headerImage' | 'logo'>, root: string = process.cwd()): Promise<PdfImages> {
  const [header, logo] = await Promise.all([readBrandImage(view.headerImage, root), readBrandImage(view.logo, root)])
  return { header, logo }
}
```

- [ ] **Step 6: Write `render-document-pdf.ts`**

Create `features/documents/pdf/render-document-pdf.ts`. This is the layout: the same content and order as `components/document-sheet.tsx` (read it side by side). Sizes are in points; `mm()` converts. If the installed react-pdf rejects a style value below, adjust the value, not the structure, and note it in your report.

```ts
// Turns a DocumentView into a PDF: A4, the same content and order as the on-screen sheet. Written with
// createElement (no JSX) so node's test runner can load and render it. Text goes through pdfText so a character
// the standard font cannot draw becomes "?" instead of breaking the render.
import { createElement as h } from 'react'
import { Document, Font, Image, Page, Text, View, renderToBuffer, type Style } from '@react-pdf/renderer'

import type { DocumentView } from '../document-view.ts'
import { allowLongRunsToWrap, pdfText } from './pdf-text.ts'

export type PdfImage = { data: Buffer; format: 'png' | 'jpg' }
export type PdfImages = { header: PdfImage | null; logo: PdfImage | null }

// A name or a number split across two lines reads as two different things, so words are never hyphenated.
Font.registerHyphenationCallback((word) => [word])

const INK = '#0c2a4d'
const MUTED = '#4a6585'
const BAND = '#bcd9f5'
const RULE = '#c9d4e3'
const PARTY_RULE = '#d8e0ec'
const ZEBRA = '#f2f5f9'
const TOTAL_BG = '#e8eef6'
const BANK_BG = '#e3ebf5'
const WHITE = '#ffffff'

const mm = (value: number) => (value * 72) / 25.4
const s = (style: Style): Style => style
const t = (raw: string | null | undefined) => allowLongRunsToWrap(pdfText(raw))
const upper = (raw: string | null | undefined) => t(raw).toUpperCase()

const label = (text: string, extra: Style = {}) => h(Text, { style: s({ fontSize: 7.5, letterSpacing: 1.9, color: MUTED, ...extra }) }, upper(text))

function band(view: DocumentView, images: PdfImages) {
  return h(
    View,
    { style: s({ height: mm(34), marginTop: -mm(10), backgroundColor: BAND }) },
    images.header
      ? h(Image, { src: images.header, style: s({ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', objectPositionX: '100%', objectPositionY: '100%' }) })
      : null,
    h(
      View,
      { style: s({ height: '100%', justifyContent: 'center', paddingHorizontal: mm(12) }) },
      images.logo
        ? h(Image, { src: images.logo, style: s({ height: mm(18), objectFit: 'contain', objectPositionX: 0, alignSelf: 'flex-start' }) })
        : view.from.name
          ? h(Text, { style: s({ fontSize: 20, letterSpacing: 4 }) }, t(view.from.name))
          : null,
    ),
  )
}

function titleBlock(view: DocumentView) {
  return h(
    View,
    { style: s({ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: mm(12), marginTop: mm(6) }) },
    h(
      View,
      { style: s({ flexGrow: 1, flexShrink: 1, paddingRight: mm(8) }) },
      h(Text, { style: s({ fontSize: 34, letterSpacing: 7.5 }) }, view.title),
      view.tagline ? h(Text, { style: s({ marginTop: 6, fontSize: 8, letterSpacing: 2.8, color: MUTED }) }, upper(view.tagline)) : null,
      h(View, { style: s({ marginTop: 14, width: mm(14), height: mm(0.6), backgroundColor: INK }) }),
    ),
    h(
      View,
      { style: s({ width: mm(70), borderLeftWidth: 0.75, borderLeftColor: RULE, paddingLeft: mm(8) }) },
      ...view.details.map((row) =>
        h(
          View,
          { style: s({ flexDirection: 'row', marginBottom: 6 }) },
          h(Text, { style: s({ width: mm(26), fontSize: 8, letterSpacing: 1.6, color: MUTED }) }, upper(row.label)),
          h(Text, { style: s({ flexGrow: 1, flexShrink: 1, fontSize: 8, letterSpacing: 0.8, fontFamily: 'Helvetica-Bold' }) }, upper(row.value)),
        ),
      ),
    ),
  )
}

function parties(view: DocumentView) {
  const hasProject = Boolean(view.project)
  const hasFrom = Boolean(view.from.name) || view.from.lines.length > 0 || Boolean(view.from.vatNumber)
  const heading = (text: string) => label(text)
  const name = (text: string) => h(Text, { style: s({ marginTop: 6, fontSize: 12, fontFamily: 'Helvetica-Bold' }) }, t(text))
  const row = (text: string) => h(Text, { style: s({ fontSize: 9.5 }) }, t(text))
  const column = (ruleAfter: boolean, ...children: unknown[]) =>
    h(
      View,
      { style: s({ flex: 1, ...(ruleAfter ? { borderRightWidth: 0.75, borderRightColor: PARTY_RULE, paddingRight: mm(5) } : {}), marginRight: mm(6) }) },
      ...(children as never[]),
    )
  return h(
    View,
    { style: s({ flexDirection: 'row', paddingLeft: mm(12), paddingRight: mm(6), marginTop: mm(7) }) },
    column(hasProject || hasFrom, heading(view.billToHeading), ...view.billTo.map((text, index) => (index === 0 ? name(text) : row(text)))),
    column(
      hasProject && hasFrom,
      ...(view.project
        ? [heading('Project'), view.project.title ? name(view.project.title) : null, ...view.project.lines.map(row)]
        : []),
    ),
    column(
      false,
      ...(hasFrom
        ? [
            heading(view.fromHeading),
            view.from.name ? name(view.from.name) : null,
            ...view.from.lines.map(row),
            view.from.vatNumber ? h(Text, { style: s({ marginTop: 6, fontSize: 9.5 }) }, `VAT No: ${t(view.from.vatNumber)}`) : null,
          ]
        : []),
    ),
  )
}

const COLUMN = { qty: mm(18), unit: mm(34), amount: mm(34) }

function table(view: DocumentView) {
  const head = (text: string, style: Style) => h(Text, { style: s({ fontSize: 7.5, letterSpacing: 1.9, color: WHITE, ...style }) }, upper(text))
  const header = h(
    View,
    { style: s({ flexDirection: 'row', backgroundColor: INK, paddingVertical: mm(2), paddingHorizontal: mm(4) }) },
    head('Description', { flexGrow: 1, flexShrink: 1 }),
    head('Qty', { width: COLUMN.qty, textAlign: 'center' }),
    head(`Unit price (${view.currency})`, { width: COLUMN.unit, textAlign: 'right' }),
    head(`Amount (${view.currency})`, { width: COLUMN.amount, textAlign: 'right' }),
  )
  const rows = view.lines.map((line, index) =>
    h(
      View,
      { wrap: false, style: s({ flexDirection: 'row', paddingVertical: mm(2), paddingHorizontal: mm(4), backgroundColor: index % 2 === 0 ? ZEBRA : WHITE }) },
      h(
        View,
        { style: s({ flexGrow: 1, flexShrink: 1, paddingRight: mm(2) }) },
        h(Text, { style: s({ fontFamily: 'Helvetica-Bold' }) }, t(line.title)),
        line.description ? h(Text, { style: s({ marginTop: 2, fontSize: 9, color: MUTED }) }, t(line.description)) : null,
      ),
      h(Text, { style: s({ width: COLUMN.qty, textAlign: 'center' }) }, line.quantity),
      h(Text, { style: s({ width: COLUMN.unit, textAlign: 'right' }) }, line.unitPrice),
      h(Text, { style: s({ width: COLUMN.amount, textAlign: 'right' }) }, line.amount),
    ),
  )
  const empty = view.lines.length === 0
    ? [h(View, { style: s({ paddingVertical: mm(6) }) }, h(Text, { style: s({ textAlign: 'center', color: MUTED }) }, 'No lines yet.'))]
    : []
  return h(View, { style: s({ marginTop: mm(6), marginHorizontal: mm(12) }) }, header, ...rows, ...empty)
}

function termsAndTotals(view: DocumentView) {
  const terms = view.terms.length
    ? h(
        View,
        { style: s({ flexGrow: 1, flexShrink: 1, paddingRight: mm(8) }) },
        h(View, { style: s({ width: mm(14), height: mm(0.6), backgroundColor: INK }) }),
        h(Text, { style: s({ marginTop: 8, fontSize: 8, letterSpacing: 2 }) }, upper(view.termsHeading)),
        ...view.terms.map((term, index) =>
          view.termsNumbered
            ? h(
                View,
                { style: s({ flexDirection: 'row', marginTop: 4 }) },
                h(Text, { style: s({ width: 16, fontSize: 8.5 }) }, `${index + 1}.`),
                h(Text, { style: s({ flexGrow: 1, flexShrink: 1, fontSize: 8.5 }) }, t(term)),
              )
            : h(Text, { style: s({ marginTop: 4, fontSize: 9 }) }, t(term)),
        ),
      )
    : h(View, { style: s({ flexGrow: 1 }) })
  const totalRow = (key: string, value: string, background: string, color: string, size: number, vertical: number) =>
    h(
      View,
      { style: s({ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: background, paddingHorizontal: mm(4), paddingVertical: mm(vertical) }) },
      h(Text, { style: s({ fontSize: 9, letterSpacing: 1.6, color }) }, upper(key)),
      h(Text, { style: s({ fontSize: size, fontFamily: 'Helvetica-Bold', color }) }, value),
    )
  return h(
    View,
    { wrap: false, style: s({ flexDirection: 'row', marginTop: mm(5), paddingHorizontal: mm(12) }) },
    terms,
    h(
      View,
      { style: s({ width: mm(78) }) },
      totalRow('Subtotal', view.totals.subtotal, TOTAL_BG, INK, 9, 2.5),
      totalRow(view.totals.vatLabel, view.totals.vat, TOTAL_BG, INK, 9, 2.5),
      totalRow(`Total (${view.currency})`, view.totals.total, INK, WHITE, 13, 3.5),
    ),
  )
}

function bankAndClosing(view: DocumentView) {
  return h(
    View,
    { wrap: false, style: s({ flexDirection: 'row', marginTop: mm(5), minHeight: mm(28) }) },
    h(
      View,
      { style: s({ width: '38%', ...(view.bank.length ? { backgroundColor: BANK_BG, paddingLeft: mm(12), paddingRight: mm(4), paddingVertical: mm(3) } : {}) }) },
      ...(view.bank.length
        ? [
            h(Text, { style: s({ fontSize: 8, letterSpacing: 2 }) }, upper('Bank details')),
            ...view.bank.map((row) =>
              h(
                View,
                { style: s({ flexDirection: 'row', marginTop: 3 }) },
                h(Text, { style: s({ width: mm(26), fontSize: 8.5, color: MUTED }) }, t(row.label)),
                h(Text, { style: s({ flexGrow: 1, flexShrink: 1, fontSize: 8.5 }) }, t(row.value)),
              ),
            ),
          ]
        : []),
    ),
    h(
      View,
      { style: s({ width: '34%', paddingHorizontal: mm(6), paddingVertical: mm(3) }) },
      ...(view.closing
        ? [
            h(Text, { style: s({ fontSize: 8, letterSpacing: 2 }) }, upper(view.closing.heading)),
            ...view.closing.paragraphs.map((paragraph) => h(Text, { style: s({ marginTop: 6, fontSize: 9, color: MUTED }) }, t(paragraph))),
            h(View, { style: s({ marginTop: 10, width: mm(14), height: mm(0.6), backgroundColor: INK }) }),
            view.from.name ? h(Text, { style: s({ marginTop: 8, fontSize: 10, letterSpacing: 1.2 }) }, t(view.from.name)) : null,
          ]
        : []),
    ),
    // The sheet draws the header photo here too; a Buffer image is embedded again every time it is drawn, so the
    // PDF keeps a plain band to stay small (see the plan, decision 4).
    h(View, { style: s({ width: '28%', backgroundColor: BAND }) }),
  )
}

function footer(view: DocumentView) {
  const contact = [view.footer.email, view.footer.phone, view.footer.website].filter((item): item is string => Boolean(item))
  return h(
    View,
    { wrap: false, style: s({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: mm(12), marginTop: mm(4), paddingVertical: mm(3), borderTopWidth: 0.75, borderTopColor: RULE }) },
    h(Text, { style: s({ flexShrink: 1, fontSize: 8.5 }) }, t(contact.join('      '))),
    view.tagline ? h(Text, { style: s({ fontSize: 8.5, letterSpacing: 2.5, color: MUTED }) }, upper(view.tagline)) : null,
  )
}

export function buildDocumentPdfElement(view: DocumentView, images: PdfImages) {
  return h(
    Document,
    { title: t(`${view.title} ${view.number ?? ''}`.trim()), author: t(view.from.name), creator: 'UNISON', producer: 'UNISON' },
    h(
      Page,
      { size: 'A4', style: s({ fontFamily: 'Helvetica', fontSize: 10, color: INK, paddingTop: mm(10), paddingBottom: mm(12) }) },
      band(view, images),
      titleBlock(view),
      parties(view),
      table(view),
      termsAndTotals(view),
      bankAndClosing(view),
      footer(view),
    ),
  )
}

export async function renderDocumentPdf(view: DocumentView, images: PdfImages): Promise<Buffer> {
  return renderToBuffer(buildDocumentPdfElement(view, images))
}
```

- [ ] **Step 7: Run the unit tests**

Run: `node --test --experimental-strip-types tests/unit/documents-pdf.test.ts`
Expected: the `pdf-text`, rendering and loader tests PASS. (The three source-guard tests still fail until Step 10.) If the import of `@react-pdf/renderer` or `react` fails under node (named-export interop), switch the import form (for example `import React from 'react'` and `const h = React.createElement`) and keep going; if react-pdf cannot be loaded under node at all, that is the BLOCKED condition above.

- [ ] **Step 8: Look at the output against the design**

```bash
PDF_SAMPLE_DIR="$(pwd)/.superpowers/sdd-pdf-samples" node --test --experimental-strip-types tests/unit/documents-pdf.test.ts
```

Then open `.superpowers/sdd-pdf-samples/quote.pdf`, `invoice.pdf` and `images.pdf` with the Read tool (`pages: "1"`) and compare with the on-screen sheet (`features/documents/components/document-sheet.tsx`) and with the layout described in that file: header band with logo, big title and details block, three party columns, table with dark header and shaded rows, terms left and totals right, bank panel, closing text, footer. Fix layout problems that are visible (overlaps, a missing section, text cut off, the logo squashed or stretched: if the logo's width is wrong with only a height set, compute the width from the PNG header dimensions at bytes 16 to 23 and set `width` explicitly). `images.pdf` uses synthetic flat-colour images, so only their placement matters. Delete `.superpowers/sdd-pdf-samples` when done (it is git-ignored scratch).

- [ ] **Step 9: Prove it inside Next.js (temporary files, never committed)**

react-pdf behaves differently under Next's bundling than under node, so prove the real thing:

1. Configure `next.config.mjs` (this part is kept):

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // react-pdf has to load the ordinary build of React, not the server-components build that route handlers bundle.
  serverExternalPackages: ['@react-pdf/renderer'],
  // The PDF code reads the brand images from disk, which the file tracer cannot see, so the functions that draw a
  // PDF are told to ship them. A server action runs in its page's function, so the pages are listed as well as
  // the download routes. Check the route keys against the Next docs and against the .nft.json files (Step 10).
  outputFileTracingIncludes: {
    '/commercial/quotes/[quoteId]': ['./public/brand/**/*'],
    '/commercial/quotes/[quoteId]/document/pdf': ['./public/brand/**/*'],
    '/finance/invoices/[invoiceId]': ['./public/brand/**/*'],
    '/finance/invoices/[invoiceId]/document/pdf': ['./public/brand/**/*'],
  },
  async redirects() {
    return [
      {
        source: '/sign-up',
        destination: '/sign-in',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
```

2. Create the temporary file `app/pdf-spike/route.ts` that builds a sample view (copy the fixtures from the test, inline) and returns `new Response(new Uint8Array(await renderDocumentPdf(view, await loadPdfImages(view))), { headers: { 'content-type': 'application/pdf' } })`, using `@/features/documents/pdf/...` imports. Temporarily add `'/pdf-spike'` to `AUTH_EXEMPT` in `proxy.ts` so no sign-in is needed.
3. Run `pnpm dev --port 3057` in the background, then `curl -s -o /tmp/spike.pdf -w "%{http_code} %{size_download}\n" http://localhost:3057/pdf-spike` (use the scratchpad directory rather than `/tmp` if one is given). Expected `200` and a file starting `%PDF-`. Repeat once with the sample view's `headerImage` set to `/brand/banner.png` and `logo` to `/brand/himark-wordmark.png` (these real brand files are in `public/brand` locally; read-only use) and **report the byte size of the result**; open it with the Read tool to see it. If it renders but the size is over 1,900,000 bytes, still finish the task and report the number (decision 3: the controller will handle it).
4. Stop the dev server. **Delete `app/pdf-spike/` and revert the `proxy.ts` edit** (use the Edit tool to remove the line you added), then run `git status --short` and confirm neither appears.

- [ ] **Step 10: Write the shared server modules and the two routes**

Create `features/documents/pdf/make-document-pdf.ts`:

```ts
import 'server-only'

import { buildDocumentView, type DocumentView } from '../document-view'
import type { DocumentBundle } from '../queries/get-document'
import type { DocumentKind } from '../vocabulary'
import { loadPdfImages } from './load-pdf-images'
import { pdfFileName } from './pdf-text'
import { renderDocumentPdf } from './render-document-pdf'

/** A failure whose message is safe to show to the person who asked for the PDF. */
export class DocumentPdfError extends Error {}

export async function makeDocumentPdf(kind: DocumentKind, bundle: DocumentBundle): Promise<{ bytes: Buffer; filename: string; view: DocumentView }> {
  const view = buildDocumentView({ kind, ...bundle })
  if (view.draft || !view.number) throw new DocumentPdfError('Send or issue this document before making its PDF.')
  try {
    const images = await loadPdfImages(view)
    const bytes = await renderDocumentPdf(view, images)
    return { bytes, filename: `${pdfFileName(view.number)}.pdf`, view }
  } catch (error) {
    console.error('[documents:pdf]', error)
    throw new DocumentPdfError('The PDF could not be made. Check that the logo and header image files named in the company details exist and are PNG or JPEG.')
  }
}
```

Create `features/documents/pdf/pdf-response.ts`:

```ts
import 'server-only'

import { NextResponse } from 'next/server'

import { NotAuthenticatedError } from '@/lib/auth/errors'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { isUuid } from '@/lib/utils'
import { getDocument } from '../queries/get-document'
import { isDraftStatus, type DocumentKind } from '../vocabulary'
import { DocumentPdfError, makeDocumentPdf } from './make-document-pdf'

const NOT_FOUND = { message: 'That document was not found.' }

/** The body of a download route: the PDF of a sent quote or an issued invoice, for a signed-in member of its organisation. */
export async function documentPdfResponse(kind: DocumentKind, id: string): Promise<Response> {
  if (!isUuid(id)) return NextResponse.json(NOT_FOUND, { status: 404 })
  try {
    await getSessionContext()
  } catch (error) {
    if (error instanceof NotAuthenticatedError) return NextResponse.json({ message: 'Sign in to download this document.' }, { status: 401 })
    throw error
  }
  const bundle = await getDocument(kind, id)
  if (!bundle) return NextResponse.json(NOT_FOUND, { status: 404 })
  // A draft has no PDF: it keeps the on-screen preview and print. Answered as not found, like another organisation's document.
  if (isDraftStatus(kind, bundle.record.status)) return NextResponse.json(NOT_FOUND, { status: 404 })
  try {
    const { bytes, filename } = await makeDocumentPdf(kind, bundle)
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof DocumentPdfError) return NextResponse.json({ message: error.message }, { status: 500 })
    throw error
  }
}
```

Create `app/(unison)/commercial/quotes/[quoteId]/document/pdf/route.ts`:

```ts
import { documentPdfResponse } from '@/features/documents/pdf/pdf-response'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params
  return documentPdfResponse('quote', quoteId)
}
```

Create `app/(unison)/finance/invoices/[invoiceId]/document/pdf/route.ts`:

```ts
import { documentPdfResponse } from '@/features/documents/pdf/pdf-response'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  return documentPdfResponse('invoice', invoiceId)
}
```

- [ ] **Step 11: Build, check the file tracing, run every gate**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all green. Then confirm the brand images are traced into the functions: find the `.nft.json` files for the four routes under `.next/server/app/` (for example with `Glob` on `.next/server/app/**/pdf/route.js.nft.json` and the page ones) and check that each lists `public/brand/...` entries (`Grep` for `public/brand`). If a route's file does not list them, correct the key in `outputFileTracingIncludes` (the docs from Step 1 and the actual route names under `.next/server/app` tell you the right form) and rebuild. Report which keys worked. (`public/brand/banner.png` and `himark-wordmark.png` may be untracked on this machine; the trace still sees them on disk.)

- [ ] **Step 12: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.mjs features/documents/pdf "app/(unison)/commercial/quotes/[quoteId]/document/pdf/route.ts" "app/(unison)/finance/invoices/[invoiceId]/document/pdf/route.ts" tests/unit/documents-pdf.test.ts
git status --short
git commit -m "$(cat <<'EOF'
feat(documents): PDF of a sent quote or issued invoice, drawn with react-pdf, and its download routes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

`git status --short` before committing must show nothing staged beyond the paths above and no `app/pdf-spike` or `proxy.ts` change.

---

### Task 2: The database (sent emails, quote to invoice, new timeline kinds)

**Files:**
- Create: `supabase/migrations/20261011130000_documents_delivery.sql`
- Modify: `features/crm-workspace/vocabulary.ts`, `tests/unit/crm-workspace-vocabulary.test.ts`, `features/documents/errors.ts`, `tests/unit/documents-vocabulary.test.ts`, `tests/integration/rls/anon-privileges.test.ts`
- Test: `tests/integration/rls/documents-delivery.test.ts`

**Interfaces:**
- Consumes: slice A tables and functions (`quotes`, `invoices`, `quote_lines`, `invoice_lines`, `activities`, `activity_actor(uuid)`, `is_member_of(uuid)`, the line and document triggers), `tests/integration/rls/helpers.ts`.
- Produces:
  - Table `public.document_emails(id, organization_id, quote_id, invoice_id, to_address, subject, body, pdf_sha256, pdf_bytes, sent_by, sent_at)`; `authenticated` has `select` only.
  - `public.record_document_email(p_kind text, p_id uuid, p_to text, p_subject text, p_body text, p_sha256 text, p_bytes integer) returns uuid`.
  - `public.create_invoice_from_quote(p_quote_id uuid) returns uuid`.
  - Activity kinds `quote.emailed`, `invoice.emailed`, `quote.invoiced`.
  - Error tokens `DOCUMENT_IS_DRAFT`, `EMAIL_ADDRESS_INVALID`, `EMAIL_SUBJECT_INVALID`, `EMAIL_BODY_TOO_LONG`, `EMAIL_RECORD_INVALID`, `QUOTE_NOT_ACCEPTED`, `QUOTE_ARCHIVED` mapped in `errors.ts` (plus the existing `QUOTE_NOT_FOUND`, `INVOICE_NOT_FOUND`, `DOCUMENT_KIND_UNKNOWN`).
- **You write and commit the files; you do not apply the migration and you do not run the RLS suite** (it writes to production). The controller probes the migration in a rolled-back transaction, applies it, and runs the RLS file; if that finds a defect the controller sends it back to you as a fix round. Run only the unit tests.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261011130000_documents_delivery.sql`:

```sql
-- Stage 2, slice B: delivering quotes and invoices. Three timeline kinds, the table that records each
-- email handed to the mail server, the function that writes that record, and quote to invoice.
-- Append-only: earlier migrations are applied and are not edited.

-- ---------------------------------------------------------------------------
-- 1. New timeline kinds. The list is the one from 20261010100000 plus the three new kinds; the code's
--    SYSTEM_ACTIVITY_KINDS is tested against the newest definition of this constraint.
-- ---------------------------------------------------------------------------
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in ('call','meeting','email','note','lead.converted','client.created_from_lead','opportunity.created_from_lead','opportunity.stage_changed','quote.sent','quote.accepted','quote.emailed','invoice.emailed','quote.invoiced'));

-- ---------------------------------------------------------------------------
-- 2. document_emails: one row per email handed to the mail server. Members read; nobody writes except
--    record_document_email, so a "sent" record cannot be forged and cannot be edited afterwards.
-- ---------------------------------------------------------------------------
create table public.document_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid,
  invoice_id uuid,
  to_address text not null check (char_length(to_address) between 3 and 254),
  subject text not null check (char_length(subject) between 1 and 300),
  body text not null default '' check (char_length(body) <= 10000),
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_bytes integer not null check (pdf_bytes between 1 and 20000000),
  sent_by uuid,
  sent_at timestamptz not null default now(),
  constraint document_emails_one_document check (num_nonnulls(quote_id, invoice_id) = 1),
  constraint document_emails_quote_fkey foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id) on delete cascade,
  constraint document_emails_invoice_fkey foreign key (invoice_id, organization_id)
    references public.invoices(id, organization_id) on delete cascade,
  constraint document_emails_sent_by_fkey foreign key (organization_id, sent_by)
    references public.memberships(organization_id, user_id) on delete set null (sent_by)
);

create index document_emails_quote_idx on public.document_emails(quote_id, sent_at desc) where quote_id is not null;
create index document_emails_invoice_idx on public.document_emails(invoice_id, sent_at desc) where invoice_id is not null;
create index document_emails_org_sent_idx on public.document_emails(organization_id, sent_at desc);

alter table public.document_emails enable row level security;

create policy document_emails_select on public.document_emails for select to authenticated
  using (public.is_member_of(organization_id));

-- The schema's convention: revoke everything, then grant only what is meant. There is no insert, update or
-- delete grant, so the only writer is the definer function below.
revoke all on public.document_emails from public, anon, authenticated;
grant select on public.document_emails to authenticated;

-- ---------------------------------------------------------------------------
-- 3. record_document_email: called by the server action only after the mail server has accepted the message.
--    It checks the caller belongs to the document's organisation and that the document has gone out, validates
--    every field, writes the row, and writes the timeline entry (on the quote, or on an invoice's client: an
--    invoice has no timeline of its own).
-- ---------------------------------------------------------------------------
create or replace function public.record_document_email(
  p_kind text, p_id uuid, p_to text, p_subject text, p_body text, p_sha256 text, p_bytes integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_number text;
  v_draft boolean;
  v_client uuid;
  v_to text := btrim(coalesce(p_to, ''));
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := coalesce(p_body, '');
  v_id uuid;
begin
  if p_kind = 'quote' then
    select q.organization_id, q.quote_number, q.status in ('Draft', 'Internal Review')
      into v_org, v_number, v_draft
      from public.quotes q where q.id = p_id;
    if not found or not public.is_member_of(v_org) then
      raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
    end if;
  elsif p_kind = 'invoice' then
    select i.organization_id, i.invoice_number, i.status = 'Draft', i.client_id
      into v_org, v_number, v_draft, v_client
      from public.invoices i where i.id = p_id;
    if not found or not public.is_member_of(v_org) then
      raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
    end if;
  else
    raise exception 'DOCUMENT_KIND_UNKNOWN' using errcode = '22023';
  end if;

  if v_draft then
    raise exception 'DOCUMENT_IS_DRAFT' using errcode = '23514';
  end if;
  -- One plain ASCII address: no display name, no list, no whitespace, no control characters.
  if char_length(v_to) > 254
     or v_to !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?[.])+[A-Za-z]{2,}$'
     or v_to ~ '(^[.]|[.]@|[.][.])' then
    raise exception 'EMAIL_ADDRESS_INVALID' using errcode = '23514';
  end if;
  if char_length(v_subject) not between 1 and 300
     or position(chr(10) in v_subject) > 0 or position(chr(13) in v_subject) > 0 then
    raise exception 'EMAIL_SUBJECT_INVALID' using errcode = '23514';
  end if;
  if char_length(v_body) > 10000 then
    raise exception 'EMAIL_BODY_TOO_LONG' using errcode = '23514';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_bytes is null or p_bytes < 1 or p_bytes > 20000000 then
    raise exception 'EMAIL_RECORD_INVALID' using errcode = '23514';
  end if;

  insert into public.document_emails (organization_id, quote_id, invoice_id, to_address, subject, body, pdf_sha256, pdf_bytes, sent_by)
  values (
    v_org,
    case when p_kind = 'quote' then p_id end,
    case when p_kind = 'invoice' then p_id end,
    v_to, v_subject, v_body, p_sha256, p_bytes, public.activity_actor(v_org))
  returning id into v_id;

  if p_kind = 'quote' then
    insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
    values (v_org, 'quote.emailed', 'Quote ' || v_number || ' emailed to ' || v_to,
            jsonb_build_object('document_id', p_id, 'number', v_number, 'to', v_to),
            public.activity_actor(v_org), p_id);
  elsif v_client is not null then
    insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
    values (v_org, 'invoice.emailed', 'Invoice ' || v_number || ' emailed to ' || v_to,
            jsonb_build_object('document_id', p_id, 'number', v_number, 'to', v_to),
            public.activity_actor(v_org), v_client);
  end if;

  return v_id;
end $$;

revoke all on function public.record_document_email(text, uuid, text, text, text, text, integer) from public, anon;
grant execute on function public.record_document_email(text, uuid, text, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_invoice_from_quote: a draft invoice from an Accepted quote, copying the header and every line.
--    The quote is not changed. The VAT rate, the totals and the draft reference come from the existing
--    triggers, exactly as for any new draft invoice. Payment terms, the issue date and the due date stay
--    empty: they are filled when the invoice is issued.
-- ---------------------------------------------------------------------------
create or replace function public.create_invoice_from_quote(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_quote public.quotes%rowtype;
  v_new uuid;
begin
  select q.organization_id into v_org from public.quotes q where q.id = p_quote_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  -- The row lock serialises two simultaneous calls on the same quote and stops a status change in between.
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_quote.archived_at is not null then
    raise exception 'QUOTE_ARCHIVED' using errcode = '23514';
  end if;
  if v_quote.status <> 'Accepted' then
    raise exception 'QUOTE_NOT_ACCEPTED' using errcode = '23514';
  end if;

  insert into public.invoices (
    organization_id, client_id, client_name, owner_id, opportunity_id, quote_id, currency, status,
    project_name, project_description, project_ref, client_ref)
  values (
    v_org, v_quote.client_id, v_quote.client_name, v_quote.owner_id, v_quote.opportunity_id, v_quote.id, v_quote.currency, 'Draft',
    v_quote.project_name, v_quote.project_description, v_quote.project_ref, v_quote.client_ref)
  returning id into v_new;

  insert into public.invoice_lines (organization_id, invoice_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code, l.price_list_item_id
  from public.quote_lines l
  where l.quote_id = p_quote_id and l.organization_id = v_org;

  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_org, 'quote.invoiced', 'Draft invoice created from quote ' || v_quote.quote_number,
          jsonb_build_object('invoice_id', v_new, 'quote_id', p_quote_id, 'quote_number', v_quote.quote_number),
          public.activity_actor(v_org), p_quote_id);

  return v_new;
end $$;

revoke all on function public.create_invoice_from_quote(uuid) from public, anon;
grant execute on function public.create_invoice_from_quote(uuid) to authenticated;
```

- [ ] **Step 2: Update the code's lists and messages, and the drift tests**

In `features/crm-workspace/vocabulary.ts`, add the three kinds to the end of `SYSTEM_ACTIVITY_KINDS` (order matters: it must equal the constraint's order):

```ts
export const SYSTEM_ACTIVITY_KINDS = [
  'lead.converted',
  'client.created_from_lead',
  'opportunity.created_from_lead',
  'opportunity.stage_changed',
  'quote.sent',
  'quote.accepted',
  'quote.emailed',
  'invoice.emailed',
  'quote.invoiced',
] as const
```

and add to `ACTIVITY_LABELS`:

```ts
  'quote.emailed': 'Quote emailed',
  'invoice.emailed': 'Invoice emailed',
  'quote.invoiced': 'Invoice created',
```

In `tests/unit/crm-workspace-vocabulary.test.ts`, the first test reads the original migration only. Replace it with a test that reads the **newest** definition of the constraint across all migrations (add `readdirSync` to the `node:fs` import):

```ts
/** The kinds in the newest definition of activities_kind_check, in the order the database lists them. */
function currentKindList(): string[] {
  const directory = join(process.cwd(), 'supabase', 'migrations')
  let found: string[] | null = null
  for (const name of readdirSync(directory).filter((file) => file.endsWith('.sql')).sort()) {
    const match = readFileSync(join(directory, name), 'utf8').match(/activities_kind_check\s+check \(kind in \(([^)]*)\)\)/)
    if (match) found = list(match[1])
  }
  assert.ok(found, 'the activities kind check must be found')
  return found!
}

test('the activity kinds in the code are exactly the ones the database allows', () => {
  assert.deepEqual([...LOGGED_ACTIVITY_KINDS, ...SYSTEM_ACTIVITY_KINDS], currentKindList())
})
```

(The second test, about the insert policy, keeps reading the original migration: the policy did not change.)

In `features/documents/errors.ts` add these to `MESSAGES` (after `DOCUMENT_SNAPSHOT_GENERATED`):

```ts
  ['DOCUMENT_IS_DRAFT', 'Send or issue this document before emailing it.'],
  ['EMAIL_ADDRESS_INVALID', 'Enter one valid email address.'],
  ['EMAIL_SUBJECT_INVALID', 'Enter a subject of up to 300 characters, on one line.'],
  ['EMAIL_BODY_TOO_LONG', 'The message is too long (10,000 characters at most).'],
  ['EMAIL_RECORD_INVALID', 'The email record was incomplete, so it was not saved.'],
  ['QUOTE_NOT_ACCEPTED', 'Only an accepted quote can be invoiced.'],
  ['QUOTE_ARCHIVED', 'An archived quote cannot be invoiced.'],
```

In `tests/unit/documents-vocabulary.test.ts`, the two token tests read `sendIssue = migration('20261011110000_documents_send_issue.sql') + migration('20261011120000_documents_hardening.sql')`. Add `+ migration('20261011130000_documents_delivery.sql')` to **both** (the new tokens are raised there), and add one assertion to the messages test: `assert.match(documentErrorMessage('QUOTE_NOT_ACCEPTED')!, /accepted quote/i)` and `assert.match(documentErrorMessage('EMAIL_ADDRESS_INVALID')!, /valid email/i)`.

In `tests/integration/rls/anon-privileges.test.ts`, add `'document_emails'` to the `TABLES` list (read how the other entries are used and keep its shape).

- [ ] **Step 3: Write the database test**

Create `tests/integration/rls/documents-delivery.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string // has company settings
let orgB: string
let member: U
let other: U // owner of B
let memberClient: SupabaseClient
let otherClient: SupabaseClient
let clientA: string
let priceItem: string
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NIL = '00000000-0000-0000-0000-000000000000'
const SHA = 'a'.repeat(64)

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const refused = (error: { message: string } | null, token: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
}
const row = async (table: string, id: string) => must(await admin.from(table).select('*').eq('id', id).single()) as Record<string, any>

/** A draft quote with two lines (one zero-rated, one tied to a price list item) and every header field filled. */
async function draftQuote(clientId: string | null = clientA, clientName = 'Doc Client A') {
  const quote = must(await memberClient.from('quotes').insert({
    organization_id: orgA, client_id: clientId, client_name: clientName,
    project_name: 'Project X', project_description: 'Scope text', project_ref: 'PX-1', client_ref: 'PO-77', notes: 'Internal only',
  }).select('id').single())
  assert.equal((await memberClient.from('quote_lines').insert([
    { organization_id: orgA, quote_id: quote.id, position: 1, title: 'Advisory', description: 'A day', quantity: 2, unit_price: 100, price_list_item_id: priceItem },
    { organization_id: orgA, quote_id: quote.id, position: 2, title: 'Licence', quantity: 1, unit_price: 50.5, vat_code: 'zero' },
  ])).error, null)
  return quote.id as string
}
async function sentQuote(clientId: string | null = clientA, clientName = 'Doc Client A') {
  const id = await draftQuote(clientId, clientName)
  const sent = await memberClient.rpc('send_quote', { p_id: id })
  assert.equal(sent.error, null)
  return id
}
async function acceptedQuote(clientId: string | null = clientA, clientName = 'Doc Client A') {
  const id = await sentQuote(clientId, clientName)
  assert.equal((await memberClient.from('quotes').update({ status: 'Accepted' }).eq('id', id)).error, null)
  return id
}
async function issuedInvoice() {
  const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Doc Client A' }).select('id').single())
  assert.equal((await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 1, title: 'Advisory', quantity: 1, unit_price: 100 })).error, null)
  assert.equal((await memberClient.rpc('issue_invoice', { p_id: invoice.id })).error, null)
  return invoice.id as string
}
const record = (kind: 'quote' | 'invoice', id: string, over: Record<string, unknown> = {}, client: SupabaseClient = memberClient) =>
  client.rpc('record_document_email', { p_kind: kind, p_id: id, p_to: 'client@example.com', p_subject: 'Your document', p_body: 'Hello', p_sha256: SHA, p_bytes: 1234, ...over })

before(async () => {
  orgA = await createFixtureOrg('docs-delivery-a')
  orgB = await createFixtureOrg('docs-delivery-b')
  member = await createFixtureUser(orgA, 'member')
  other = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  otherClient = await signedInClient(other.email, other.password)
  clientA = must(await admin.from('clients').insert({
    organization_id: orgA, name: 'Doc Client A', status: 'Active', address_line1: '1 Test Road', city: 'Testville', postal_code: '1234', country: 'Testland', vat_number: 'VAT-A',
  }).select('id').single()).id
  must(await admin.from('organization_settings').insert({
    organization_id: orgA, legal_name: 'Test Co (Pty) Ltd', document_prefix: 'TST', vat_rate: 15, default_quote_terms: 'Term one', default_payment_terms: 'Pay within 30 days',
  }).select('id').single())
  priceItem = must(await admin.from('price_list_items').insert({ organization_id: orgA, title: 'Advisory day', unit_price: 100 }).select('id').single()).id
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [member?.id, other?.id].filter(Boolean))
})

// ---------------------------------------------------------------------------
// document_emails: nobody but the record function writes
// ---------------------------------------------------------------------------
test('a member can read sent emails but cannot insert, update or delete one, and anon cannot touch the table', async () => {
  const quote = await sentQuote()
  const id = must(await record('quote', quote)).valueOf() as string
  const read = await memberClient.from('document_emails').select('id, to_address').eq('id', id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  const insert = await memberClient.from('document_emails').insert({
    organization_id: orgA, quote_id: quote, to_address: 'forged@example.com', subject: 'Forged', body: '', pdf_sha256: SHA, pdf_bytes: 1,
  })
  assert.ok(insert.error, 'a member cannot write a "sent" record by hand')
  assert.equal(insert.error!.code, '42501')
  const update = await memberClient.from('document_emails').update({ subject: 'Changed' }).eq('id', id)
  assert.ok(update.error, 'a record cannot be edited')
  assert.equal(update.error!.code, '42501')
  const remove = await memberClient.from('document_emails').delete().eq('id', id)
  assert.ok(remove.error, 'a record cannot be deleted')
  assert.equal(remove.error!.code, '42501')
  assert.equal((await row('document_emails', id)).subject, 'Your document')

  const anon = await anonymous.from('document_emails').select('id').limit(1)
  assert.ok(anon.error)
  assert.match(anon.error!.message, /permission denied for table document_emails/)
})

test('another organisation sees none of it', async () => {
  const quote = await sentQuote()
  await record('quote', quote)
  const seen = await otherClient.from('document_emails').select('id').eq('quote_id', quote)
  assert.equal(seen.error, null)
  assert.deepEqual(seen.data, [])
})

// ---------------------------------------------------------------------------
// record_document_email
// ---------------------------------------------------------------------------
test('recording a quote email writes the row and the quote timeline entry', async () => {
  const quote = await sentQuote()
  const number = (await row('quotes', quote)).quote_number
  const { data, error } = await record('quote', quote, { p_to: '  client@example.com ', p_subject: ' Quote for you ', p_body: 'Line one\n\nLine two', p_bytes: 4321 })
  assert.equal(error, null)
  const email = await row('document_emails', data as string)
  assert.equal(email.quote_id, quote)
  assert.equal(email.invoice_id, null)
  assert.equal(email.to_address, 'client@example.com', 'the address is trimmed')
  assert.equal(email.subject, 'Quote for you')
  assert.equal(email.body, 'Line one\n\nLine two')
  assert.equal(email.pdf_sha256, SHA)
  assert.equal(email.pdf_bytes, 4321)
  assert.equal(email.sent_by, member.id)
  assert.ok(email.sent_at)
  const entries = (await admin.from('activities').select('kind, subject, details, created_by').eq('quote_id', quote).eq('kind', 'quote.emailed')).data!
  assert.equal(entries.length, 1)
  assert.match(entries[0].subject, new RegExp(number))
  assert.equal(entries[0].details.document_id, quote)
  assert.equal(entries[0].details.to, 'client@example.com')
  assert.equal(entries[0].created_by, member.id)
})

test('the same document can be emailed more than once, and each send is recorded', async () => {
  const quote = await sentQuote()
  assert.equal((await record('quote', quote)).error, null)
  assert.equal((await record('quote', quote, { p_to: 'second@example.com' })).error, null)
  const rows = (await admin.from('document_emails').select('id').eq('quote_id', quote)).data!
  assert.equal(rows.length, 2)
})

test('recording an invoice email writes the entry on the invoice\'s client', async () => {
  const invoice = await issuedInvoice()
  const number = (await row('invoices', invoice)).invoice_number
  const { data, error } = await record('invoice', invoice)
  assert.equal(error, null)
  const email = await row('document_emails', data as string)
  assert.equal(email.invoice_id, invoice)
  assert.equal(email.quote_id, null)
  const entries = (await admin.from('activities').select('kind, subject, details').eq('client_id', clientA).eq('kind', 'invoice.emailed')).data!
  const mine = entries.filter((entry) => entry.details.document_id === invoice)
  assert.equal(mine.length, 1)
  assert.match(mine[0].subject, new RegExp(number))
})

test('a draft cannot be recorded as emailed, and neither can an unknown kind, an unknown id or another organisation\'s document', async () => {
  refused((await record('quote', await draftQuote())).error, 'DOCUMENT_IS_DRAFT')
  const draftInvoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Doc Client A' }).select('id').single()).id
  refused((await record('invoice', draftInvoice)).error, 'DOCUMENT_IS_DRAFT')
  refused((await record('quote', await sentQuote(), {}, otherClient)).error, 'QUOTE_NOT_FOUND')
  refused((await record('invoice', await issuedInvoice(), {}, otherClient)).error, 'INVOICE_NOT_FOUND')
  refused((await record('quote', NIL)).error, 'QUOTE_NOT_FOUND')
  refused((await record('invoice', NIL)).error, 'INVOICE_NOT_FOUND')
  refused((await memberClient.rpc('record_document_email', { p_kind: 'expense', p_id: NIL, p_to: 'a@example.com', p_subject: 's', p_body: '', p_sha256: SHA, p_bytes: 1 })).error, 'DOCUMENT_KIND_UNKNOWN')
  const anon = await record('quote', await sentQuote(), {}, anonymous)
  assert.ok(anon.error, 'anon cannot call it')
  assert.equal((await admin.from('document_emails').select('id').eq('organization_id', orgB)).data!.length, 0)
})

test('only one plain address is accepted', async () => {
  const quote = await sentQuote()
  const bad = [
    '', '   ', 'not-an-address', 'a@b', 'a@b.c', '@example.com', 'a@.example.com', 'a@example..com', 'a..b@example.com', '.a@example.com', 'a.@example.com',
    'a@b.com, c@d.com', 'a@b.com;c@d.com', 'Name <a@b.com>', '"Name" a@b.com', 'a b@example.com', 'a@exam ple.com',
    'a@b.com\r\nBcc: x@y.com', 'a@b.com\nBcc: x@y.com', 'a@b.com\t', 'ä@example.com', 'a@exämple.com', `${'a'.repeat(250)}@example.com`,
  ]
  for (const address of bad) refused((await record('quote', quote, { p_to: address })).error, 'EMAIL_ADDRESS_INVALID')
  for (const good of ['a@example.com', 'first.last+tag@sub.example.co.za', "o'neil@example.com", 'A_B-c@Example.COM']) {
    assert.equal((await record('quote', quote, { p_to: good })).error, null, good)
  }
})

test('the subject, the message and the record details are checked', async () => {
  const quote = await sentQuote()
  refused((await record('quote', quote, { p_subject: '' })).error, 'EMAIL_SUBJECT_INVALID')
  refused((await record('quote', quote, { p_subject: '   ' })).error, 'EMAIL_SUBJECT_INVALID')
  refused((await record('quote', quote, { p_subject: 'x'.repeat(301) })).error, 'EMAIL_SUBJECT_INVALID')
  refused((await record('quote', quote, { p_subject: 'two\nlines' })).error, 'EMAIL_SUBJECT_INVALID')
  assert.equal((await record('quote', quote, { p_subject: 'x'.repeat(300) })).error, null)
  refused((await record('quote', quote, { p_body: 'x'.repeat(10001) })).error, 'EMAIL_BODY_TOO_LONG')
  assert.equal((await record('quote', quote, { p_body: 'x'.repeat(10000) })).error, null)
  for (const sha of ['', 'xyz', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) refused((await record('quote', quote, { p_sha256: sha })).error, 'EMAIL_RECORD_INVALID')
  for (const bytes of [0, -1, 20000001]) refused((await record('quote', quote, { p_bytes: bytes })).error, 'EMAIL_RECORD_INVALID')
})

// ---------------------------------------------------------------------------
// create_invoice_from_quote
// ---------------------------------------------------------------------------
test('an accepted quote becomes a draft invoice with the same header and every line, and the quote is untouched', async () => {
  const quote = await acceptedQuote()
  const before = await row('quotes', quote)
  const { data, error } = await memberClient.rpc('create_invoice_from_quote', { p_quote_id: quote })
  assert.equal(error, null)
  const invoice = await row('invoices', data as string)
  assert.equal(invoice.status, 'Draft')
  assert.match(invoice.invoice_number, /^DRAFT-[0-9a-f]{8}$/)
  assert.equal(invoice.quote_id, quote)
  assert.equal(invoice.client_id, clientA)
  assert.equal(invoice.client_name, before.client_name)
  assert.equal(invoice.currency, before.currency)
  assert.equal(invoice.project_name, 'Project X')
  assert.equal(invoice.project_description, 'Scope text')
  assert.equal(invoice.project_ref, 'PX-1')
  assert.equal(invoice.client_ref, 'PO-77')
  assert.equal(invoice.notes, null, 'internal notes are not copied')
  assert.equal(invoice.payment_terms, null)
  assert.equal(invoice.issue_date, null)
  assert.equal(invoice.due_date, null)
  assert.equal(invoice.bill_to, null)
  assert.equal(invoice.issuer, null)

  const quoteLines = (await admin.from('quote_lines').select('position,title,description,quantity,unit_price,vat_code,price_list_item_id').eq('quote_id', quote).order('position')).data!
  const invoiceLines = (await admin.from('invoice_lines').select('position,title,description,quantity,unit_price,vat_code,price_list_item_id').eq('invoice_id', invoice.id).order('position')).data!
  assert.equal(invoiceLines.length, 2)
  assert.deepEqual(invoiceLines, quoteLines)
  assert.equal(invoiceLines[0].price_list_item_id, priceItem)
  assert.equal(invoiceLines[1].vat_code, 'zero')
  assert.equal(Number(invoice.subtotal), Number(before.subtotal))
  assert.equal(Number(invoice.tax_amount), Number(before.tax_amount))
  assert.equal(Number(invoice.total_amount), Number(before.total_amount))
  assert.equal(Number(invoice.total_amount), 280.5)

  const after = await row('quotes', quote)
  for (const column of ['status', 'quote_number', 'subtotal', 'tax_amount', 'total_amount', 'notes', 'accepted_at', 'sent_at', 'client_id', 'archived_at']) {
    assert.deepEqual(after[column], before[column], `${column} on the quote is unchanged`)
  }
  assert.equal((await admin.from('quote_lines').select('id').eq('quote_id', quote)).data!.length, 2)

  const entries = (await admin.from('activities').select('subject, details, created_by').eq('quote_id', quote).eq('kind', 'quote.invoiced')).data!
  assert.equal(entries.length, 1)
  assert.equal(entries[0].details.invoice_id, invoice.id)
  assert.equal(entries[0].created_by, member.id)
})

test('the draft can be issued like any other, and two calls make two invoices', async () => {
  const quote = await acceptedQuote()
  const first = must(await memberClient.rpc('create_invoice_from_quote', { p_quote_id: quote }))
  const second = must(await memberClient.rpc('create_invoice_from_quote', { p_quote_id: quote }))
  assert.notEqual(first, second)
  assert.equal((await admin.from('invoices').select('id').eq('quote_id', quote)).data!.length, 2)
  const issued = await memberClient.rpc('issue_invoice', { p_id: first })
  assert.equal(issued.error, null)
  assert.match(issued.data.number, /^TST-I-\d{4}-\d{5}$/)
})

test('only an accepted, unarchived quote of your own organisation can be invoiced', async () => {
  refused((await memberClient.rpc('create_invoice_from_quote', { p_quote_id: await draftQuote() })).error, 'QUOTE_NOT_ACCEPTED')
  refused((await memberClient.rpc('create_invoice_from_quote', { p_quote_id: await sentQuote() })).error, 'QUOTE_NOT_ACCEPTED')
  const declined = await sentQuote()
  assert.equal((await memberClient.from('quotes').update({ status: 'Declined' }).eq('id', declined)).error, null)
  refused((await memberClient.rpc('create_invoice_from_quote', { p_quote_id: declined })).error, 'QUOTE_NOT_ACCEPTED')

  const archived = await acceptedQuote()
  assert.equal((await memberClient.from('quotes').update({ archived_at: new Date().toISOString() }).eq('id', archived)).error, null)
  refused((await memberClient.rpc('create_invoice_from_quote', { p_quote_id: archived })).error, 'QUOTE_ARCHIVED')

  refused((await memberClient.rpc('create_invoice_from_quote', { p_quote_id: NIL })).error, 'QUOTE_NOT_FOUND')
  refused((await otherClient.rpc('create_invoice_from_quote', { p_quote_id: await acceptedQuote() })).error, 'QUOTE_NOT_FOUND')
  const anon = await anonymous.rpc('create_invoice_from_quote', { p_quote_id: await acceptedQuote() })
  assert.ok(anon.error, 'anon cannot call it')
  assert.equal((await admin.from('invoices').select('id').eq('organization_id', orgB)).data!.length, 0)
})

test('an accepted quote whose client has since been removed still makes a draft invoice, without a client', async () => {
  const gone = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Gone Client', status: 'Active', address_line1: '3 Test Lane' }).select('id').single()).id
  const quote = await acceptedQuote(gone, 'Gone Client')
  must(await admin.from('clients').delete().eq('id', gone).select('id'))
  const { data, error } = await memberClient.rpc('create_invoice_from_quote', { p_quote_id: quote })
  assert.equal(error, null)
  const invoice = await row('invoices', data as string)
  assert.equal(invoice.client_id, null)
  assert.equal(invoice.client_name, 'Gone Client')
  refused((await memberClient.rpc('issue_invoice', { p_id: invoice.id })).error, 'INVOICE_NEEDS_CLIENT')
})
```

- [ ] **Step 4: Run the unit tests and the typecheck**

Run: `node --test --experimental-strip-types tests/unit/crm-workspace-vocabulary.test.ts tests/unit/documents-vocabulary.test.ts` then `pnpm typecheck` and `pnpm test`.
Expected: green. (The RLS file is not run by you; check it by reading it against the migration and run `pnpm typecheck` so its types resolve.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261011130000_documents_delivery.sql features/crm-workspace/vocabulary.ts tests/unit/crm-workspace-vocabulary.test.ts features/documents/errors.ts tests/unit/documents-vocabulary.test.ts tests/integration/rls/anon-privileges.test.ts tests/integration/rls/documents-delivery.test.ts
git commit -m "$(cat <<'EOF'
feat(documents): sent-email records, quote to invoice, and the new timeline kinds (migration not yet applied)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

**Controller gate (not for the implementer):** probe the migration in a rolled-back transaction against production, apply it with `apply_migration` as `documents_delivery`, confirm with `list_migrations`, run `node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/documents-delivery.test.ts tests/integration/rls/anon-privileges.test.ts`, run the other documents RLS files to catch regressions, then check no fixture rows are left (`document_emails`, `activities`, `invoices`, `quotes`, `clients`, `audit_events`).

---

### Task 3: Mail with an attachment, and the email action

**Files:**
- Modify: `lib/email/mime.ts`, `lib/email/send-email.ts`, `next.config.mjs` (only if Task 1's keys need the page routes; they already list them), `features/documents/queries/get-document.ts`
- Create: `features/documents/email.ts`, `features/documents/action-failure.ts`, `features/documents/actions/email.ts`
- Test: `tests/unit/mime.test.ts` (add), `tests/unit/documents-email.test.ts` (new), `tests/unit/documents-actions-source.test.ts` (add)

**Interfaces:**
- Consumes: Task 1's `makeDocumentPdf`, `DocumentPdfError`; Task 2's `record_document_email` and tokens; `sendEmail`; `getDocument`, `documentContext`, `revalidateDocumentPages`, `documentErrorMessage`; `resolveDisplayName` (`@/lib/auth/display-name`); `MissingEnvError` (`@/lib/env`).
- Produces:
  - `buildMimeMessage` accepts `replyTo?: string` and `attachments?: MimeAttachment[]` (`type MimeAttachment = { filename: string; contentType: string; content: Uint8Array }`); output with neither is byte-for-byte what it was.
  - `sendEmail(input: { to: string; template: EmailTemplate; replyTo?: string; attachments?: MimeAttachment[] }): Promise<void>`.
  - In `features/documents/email.ts`: `MAX_EMAIL_PDF_BYTES = 2_000_000`, `HOURLY_EMAIL_CAP = 50`, `isValidEmailAddress(raw: unknown): boolean`, `type EmailFields = { to: string; subject: string; body: string }`, `readEmailFields(form: FormData): EmailFields | { error: string }`, `defaultEmailSubject(view: DocumentView): string`, `defaultEmailMessage(view: DocumentView, senderName: string): string`, `emailHtml(body: string): string`.
  - `failureState(error: { message?: string } | null, fallback?: string): ActionState` in `action-failure.ts`.
  - `emailDocumentAction(kind: string, id: string, previous: ActionState, form: FormData): Promise<ActionState>`.
  - The client row returned by `getDocument` now also carries `billing_email`.

- [ ] **Step 1: Write the failing mail tests**

Append to `tests/unit/mime.test.ts` (keep the existing imports and add `type MimeAttachment` is not needed; the test builds plain objects):

```ts
// ---- attachments and Reply-To ----
const pdfBytes = Buffer.from('%PDF-1.4\n% fake pdf bytes \u00e9\u0000\u0001\n', 'latin1')
const withPdf = { ...base, replyTo: 'sender@example.com', attachments: [{ filename: 'TST-Q-2026-00001.pdf', contentType: 'application/pdf', content: pdfBytes }] }

function attachmentPart(message: string) {
  const section = message.split('--FIXED-BOUNDARY-mixed').find((part) => part.includes('application/pdf'))
  assert.ok(section, 'no pdf part')
  return section!
}

test('without attachments or a reply-to the message is exactly the old multipart/alternative', () => {
  const message = buildMimeMessage(base)
  assert.match(message, /Content-Type: multipart\/alternative; boundary="FIXED-BOUNDARY"/)
  assert.ok(!/multipart\/mixed/.test(message))
  assert.ok(!/^Reply-To:/m.test(message))
})

test('an attachment makes the message multipart/mixed around the same alternatives', () => {
  const message = buildMimeMessage(withPdf)
  assert.match(message, /Content-Type: multipart\/mixed; boundary="FIXED-BOUNDARY-mixed"/)
  assert.match(message, /Reply-To: sender@example\.com\r\n/)
  assert.equal(decodePart(message, 'text/plain'), 'Plain text body')
  assert.equal(decodePart(message, 'text/html'), '<p>HTML body</p>')
  assert.ok(message.indexOf('multipart/alternative') < message.indexOf('application/pdf'), 'the text comes before the attachment')
  assert.match(message, /--FIXED-BOUNDARY-mixed--\r\n$/)
})

test('the attachment carries its exact bytes, base64 wrapped at 76 characters, with a file name', () => {
  const message = buildMimeMessage(withPdf)
  const part = attachmentPart(message)
  assert.match(part, /Content-Type: application\/pdf; name="TST-Q-2026-00001\.pdf"/)
  assert.match(part, /Content-Disposition: attachment; filename="TST-Q-2026-00001\.pdf"/)
  assert.match(part, /Content-Transfer-Encoding: base64/)
  const body = part.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim()
  assert.ok(body.split('\r\n').every((encodedLine) => encodedLine.length <= 76))
  assert.deepEqual(Buffer.from(body.replace(/\r\n/g, ''), 'base64'), pdfBytes)
})

test('a large attachment survives the round trip', () => {
  const big = Buffer.alloc(300_000, 7)
  const message = buildMimeMessage({ ...withPdf, attachments: [{ filename: 'big.pdf', contentType: 'application/pdf', content: big }] })
  const body = attachmentPart(message).split('\r\n\r\n').slice(1).join('\r\n\r\n').trim().replace(/\r\n/g, '')
  assert.equal(Buffer.from(body, 'base64').length, big.length)
})

test('an injected header through the reply-to, the file name or the content type cannot become a header', () => {
  const message = buildMimeMessage({
    ...withPdf,
    replyTo: 'a@b.com\r\nBcc: attacker@evil.example',
    attachments: [{ filename: 'x"\r\nBcc: attacker@evil.example;.pdf', contentType: 'application/pdf\r\nBcc: attacker@evil.example', content: pdfBytes }],
  })
  assert.ok(!/^Bcc:/m.test(message), 'Bcc was injected as a real header')
  assert.ok(!/filename="[^"]*"[^\r\n]*"/.test(message), 'the file name cannot close its own quotes')
})

test('every line of a message with an attachment ends with CRLF', () => {
  const bare = buildMimeMessage(withPdf).split('\n').filter((line, index, all) => index < all.length - 1 && !line.endsWith('\r'))
  assert.deepEqual(bare, [])
})
```

Create `tests/unit/documents-email.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDocumentView } from '../../features/documents/document-view.ts'
import {
  BODY_MAX, HOURLY_EMAIL_CAP, MAX_EMAIL_PDF_BYTES, SUBJECT_MAX,
  defaultEmailMessage, defaultEmailSubject, emailHtml, isValidEmailAddress, readEmailFields,
} from '../../features/documents/email.ts'

const form = (values: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
const sentQuote = (issuer: Record<string, unknown> | null = { legal_name: 'Test Co (Pty) Ltd', quote_closing_text: 'Thanks for considering us.\nReply to accept.' }) =>
  buildDocumentView({
    kind: 'quote',
    record: { quote_number: 'TST-Q-2026-00001', status: 'Sent', currency: 'ZAR', total_amount: 1234.5, subtotal: 1073.48, tax_amount: 161.02, client_name: 'Test Client', bill_to: { name: 'Test Client' }, issuer },
    lines: [], client: null, settings: null,
  })

test('the limits are the ones the spec names', () => {
  assert.equal(HOURLY_EMAIL_CAP, 50)
  assert.equal(SUBJECT_MAX, 300)
  assert.equal(BODY_MAX, 10000)
  assert.equal(MAX_EMAIL_PDF_BYTES, 2_000_000)
})

test('one plain ASCII address is valid and nothing else is', () => {
  for (const good of ['a@example.com', 'first.last+tag@sub.example.co.za', "o'neil@example.com", 'A_B-c@Example.COM', '  padded@example.com  ']) assert.equal(isValidEmailAddress(good), true, good)
  for (const bad of [
    '', '   ', 'not-an-address', 'a@b', 'a@b.c', '@example.com', 'a@.example.com', 'a@example..com', 'a..b@example.com', '.a@example.com', 'a.@example.com',
    'a@b.com, c@d.com', 'a@b.com;c@d.com', 'Name <a@b.com>', '"Name" a@b.com', 'a b@example.com', 'a@b.com\r\nBcc: x@y.com', 'a@b.com\nBcc: x@y.com',
    'ä@example.com', 'a@exämple.com', `${'a'.repeat(250)}@example.com`,
  ]) assert.equal(isValidEmailAddress(bad), false, JSON.stringify(bad))
  assert.equal(isValidEmailAddress(undefined), false)
  assert.equal(isValidEmailAddress(42), false)
})

test('readEmailFields reads, trims and flattens the subject to one line', () => {
  assert.deepEqual(readEmailFields(form({ to: ' a@example.com ', subject: ' Quote\r\nBcc: x@y.com ', body: 'Hi\r\nthere ' })), { to: 'a@example.com', subject: 'Quote Bcc: x@y.com', body: 'Hi\nthere' })
})

test('readEmailFields refuses a bad address, an empty or long subject and a long message with a plain message', () => {
  assert.deepEqual(readEmailFields(form({ to: 'a@b.com, c@d.com', subject: 's', body: '' })), { error: 'Enter one valid email address.' })
  assert.deepEqual(readEmailFields(form({ to: 'Name <a@b.com>', subject: 's', body: '' })), { error: 'Enter one valid email address.' })
  assert.deepEqual(readEmailFields(form({ to: 'a@example.com', subject: '  ', body: '' })), { error: 'Enter a subject.' })
  assert.match((readEmailFields(form({ to: 'a@example.com', subject: 'x'.repeat(301), body: '' })) as { error: string }).error, /too long/)
  assert.match((readEmailFields(form({ to: 'a@example.com', subject: 's', body: 'x'.repeat(10001) })) as { error: string }).error, /too long/)
  assert.ok(!('error' in readEmailFields(form({ to: 'a@example.com', subject: 'x'.repeat(300), body: 'x'.repeat(10000) }))))
  assert.deepEqual(readEmailFields(new FormData()), { error: 'Enter one valid email address.' })
})

test('the default subject names the document and the company', () => {
  assert.equal(defaultEmailSubject(sentQuote()), 'Quote TST-Q-2026-00001 from Test Co (Pty) Ltd')
  assert.equal(defaultEmailSubject(sentQuote(null)), 'Quote TST-Q-2026-00001')
})

test('the default message has the total, the closing text and the sender', () => {
  const message = defaultEmailMessage(sentQuote(), 'Sam Sender')
  assert.match(message, /^Hello,\n\nPlease find attached quote TST-Q-2026-00001 for ZAR 1,234\.50\./)
  assert.match(message, /Thanks for considering us\.\nReply to accept\./)
  assert.match(message, /Kind regards,\nSam Sender\nTest Co \(Pty\) Ltd$/)
  assert.doesNotMatch(defaultEmailMessage(sentQuote(null), 'Sam Sender'), /undefined|null/)
})

test('the html body is the same text, escaped, in paragraphs', () => {
  const html = emailHtml('Hello <b>there</b> & "friends"\nsecond line\n\nNew paragraph <script>alert(1)</script>')
  assert.ok(!html.includes('<script>') && !html.includes('<b>'))
  assert.match(html, /Hello &lt;b&gt;there&lt;\/b&gt; &amp; &quot;friends&quot;<br>second line/)
  assert.equal(html.match(/<p /g)!.length, 2)
  assert.doesNotThrow(() => emailHtml(''))
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test --experimental-strip-types tests/unit/mime.test.ts tests/unit/documents-email.test.ts`
Expected: FAIL (new mime behaviour and `email.ts` missing).

- [ ] **Step 3: Extend the MIME builder**

In `lib/email/mime.ts`, replace the header comment's first line with `// Builds an RFC 5322 multipart/alternative message, optionally with attachments (multipart/mixed) and a Reply-To.`, then add below `extractAddress` and replace `base64Body`/`buildMimeMessage` as follows (keep `CRLF`, `sanitizeHeaderValue`, `encodeHeaderValue`, `extractAddress` unchanged):

```ts
export type MimeAttachment = { filename: string; contentType: string; content: Uint8Array }

/** A file name that is safe inside quotes in a header: printable ASCII, no quotes, backslashes, semicolons or line breaks. */
function attachmentName(value: string): string {
  // eslint-disable-next-line no-control-regex
  return sanitizeHeaderValue(value).replace(/[^\x20-\x7E]/g, '_').replace(/["\\;]/g, '_') || 'attachment'
}

function attachmentType(value: string): string {
  const cleaned = sanitizeHeaderValue(value)
  return /^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/.test(cleaned) ? cleaned : 'application/octet-stream'
}

// Wrapped at 76 characters: RFC 2045 caps encoded lines, and some servers reject or mangle longer ones.
const wrap76 = (encoded: string) => (encoded.match(/.{1,76}/g) ?? []).join(CRLF)

function base64Body(value: string): string {
  return wrap76(Buffer.from(value, 'utf8').toString('base64'))
}

export function buildMimeMessage(input: {
  from: string
  to: string
  subject: string
  text: string
  html: string
  boundary?: string
  replyTo?: string
  attachments?: MimeAttachment[]
}): string {
  const boundary = input.boundary ?? `unison-${crypto.randomUUID()}`
  const attachments = input.attachments ?? []

  const headers = [
    `From: ${sanitizeHeaderValue(input.from)}`,
    `To: ${sanitizeHeaderValue(input.to)}`,
    ...(input.replyTo ? [`Reply-To: ${sanitizeHeaderValue(input.replyTo)}`] : []),
    `Subject: ${encodeHeaderValue(input.subject)}`,
    'MIME-Version: 1.0',
  ]
  const alternatives = [
    // Least-preferred alternative first, most-preferred last: clients render
    // the last part they understand.
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(input.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(input.html),
    `--${boundary}--`,
  ]

  if (attachments.length === 0) {
    return [...headers, `Content-Type: multipart/alternative; boundary="${boundary}"`, '', ...alternatives, ''].join(CRLF)
  }

  const outer = `${boundary}-mixed`
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${outer}"`,
    '',
    `--${outer}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    ...alternatives,
    ...attachments.flatMap((attachment) => {
      const name = attachmentName(attachment.filename)
      return [
        `--${outer}`,
        `Content-Type: ${attachmentType(attachment.contentType)}; name="${name}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${name}"`,
        '',
        wrap76(Buffer.from(attachment.content).toString('base64')),
      ]
    }),
    `--${outer}--`,
    '',
  ].join(CRLF)
}
```

In `lib/email/send-email.ts`:

```ts
import 'server-only'
import { readGraphEnv } from '@/lib/env'
import { sendMimeViaGraph } from './graph'
import { buildMimeMessage, type MimeAttachment } from './mime'
import type { EmailTemplate } from './templates/invitation'

/**
 * The only mail entry point. Server actions call this and never touch transport
 * details, so the provider stays swappable — which is not theoretical: this
 * moved from SMTP to Graph without any caller changing.
 */
export async function sendEmail(input: {
  to: string
  template: EmailTemplate
  replyTo?: string
  attachments?: MimeAttachment[]
}): Promise<void> {
  // Local work and tests run without credentials: render the message and log it
  // rather than sending. Checked before readGraphEnv so the log path needs no
  // Azure configuration at all.
  if (process.env.EMAIL_TRANSPORT === 'log') {
    console.log('[email:log]', JSON.stringify({
      to: input.to,
      replyTo: input.replyTo,
      subject: input.template.subject,
      text: input.template.text,
      attachments: (input.attachments ?? []).map((attachment) => ({ filename: attachment.filename, contentType: attachment.contentType, bytes: attachment.content.byteLength })),
    }, null, 2))
    return
  }

  const env = readGraphEnv(process.env)
  const mime = buildMimeMessage({
    from: env.MAIL_FROM,
    to: input.to,
    subject: input.template.subject,
    text: input.template.text,
    html: input.template.html,
    replyTo: input.replyTo,
    attachments: input.attachments,
  })

  await sendMimeViaGraph(mime)
}
```

- [ ] **Step 4: Write `features/documents/email.ts` and `action-failure.ts`**

Create `features/documents/email.ts`:

```ts
// Shared by the email form, the email action and unit tests: no directive, no server-only import, relative imports only.
import type { DocumentView } from './document-view.ts'

/** The most a PDF may weigh to be emailed: the whole message is base64 twice over, and the mail server takes about 4 MB. */
export const MAX_EMAIL_PDF_BYTES = 2_000_000
/** Document emails one organisation may send in an hour: a guard against accidents and a runaway loop. */
export const HOURLY_EMAIL_CAP = 50
export const SUBJECT_MAX = 300
export const BODY_MAX = 10_000

// One plain ASCII address. The same pattern, with the same extra rules, is checked in record_document_email.
const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/

export function isValidEmailAddress(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  const address = raw.trim()
  return address.length <= 254 && ADDRESS.test(address) && !/(^\.|\.@|\.\.)/.test(address)
}

export type EmailFields = { to: string; subject: string; body: string }

export function readEmailFields(form: FormData): EmailFields | { error: string } {
  const to = String(form.get('to') ?? '').trim()
  if (!isValidEmailAddress(to)) return { error: 'Enter one valid email address.' }
  const subject = String(form.get('subject') ?? '').replace(/[\r\n]+/g, ' ').trim()
  if (!subject) return { error: 'Enter a subject.' }
  if (subject.length > SUBJECT_MAX) return { error: `The subject is too long (${SUBJECT_MAX} characters at most).` }
  const body = String(form.get('body') ?? '').replace(/\r\n/g, '\n').trim()
  if (body.length > BODY_MAX) return { error: `The message is too long (${BODY_MAX.toLocaleString('en-GB')} characters at most).` }
  return { to, subject, body }
}

export function defaultEmailSubject(view: DocumentView): string {
  const noun = view.kind === 'quote' ? 'Quote' : 'Invoice'
  return view.from.name ? `${noun} ${view.number} from ${view.from.name}` : `${noun} ${view.number}`
}

export function defaultEmailMessage(view: DocumentView, senderName: string): string {
  const noun = view.kind === 'quote' ? 'quote' : 'invoice'
  const lines = ['Hello,', '', `Please find attached ${noun} ${view.number} for ${view.currency} ${view.totals.total}.`]
  if (view.closing) lines.push('', view.closing.paragraphs.join('\n'))
  lines.push('', 'Kind regards,', senderName)
  if (view.from.name) lines.push(view.from.name)
  return lines.join('\n')
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

/** The message as HTML: the same text, escaped, one paragraph per blank line and a break per line. */
export function emailHtml(body: string): string {
  const paragraphs = body.split(/\n{2,}/).map((paragraph) => `<p style="margin:0 0 12px">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#0c2a4d">${paragraphs.join('')}</div>`
}
```

Create `features/documents/action-failure.ts`:

```ts
// Turns a database error into the state a form shows. No directive and no imports of server code.
import { documentErrorMessage } from './errors.ts'
import type { ActionState } from './types.ts'

export function failureState(error: { message?: string } | null, fallback = 'The document could not be completed. Please try again.'): ActionState {
  return { error: documentErrorMessage(error?.message) ?? fallback }
}
```

(`errors.ts` and `types.ts` already use no imports; the `.ts` extensions keep this loadable by tests.)

In `features/documents/queries/get-document.ts` change the client select so the email default can use the billing address:

```ts
      ? db.from('clients').select('name,address_line1,address_line2,city,postal_code,country,vat_number,billing_email').eq('id', record.client_id).eq('organization_id', organization.id).maybeSingle()
```

- [ ] **Step 5: Write the action**

Create `features/documents/actions/email.ts`:

```ts
'use server'

import { createHash } from 'node:crypto'

import { sendEmail } from '@/lib/email/send-email'
import { MissingEnvError } from '@/lib/env'
import { isUuid } from '@/lib/utils'
import { failureState } from '../action-failure'
import { HOURLY_EMAIL_CAP, MAX_EMAIL_PDF_BYTES, emailHtml, readEmailFields } from '../email'
import { DocumentPdfError, makeDocumentPdf } from '../pdf/make-document-pdf'
import { getDocument } from '../queries/get-document'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'
import { DOCUMENTS, isDocumentKind, isDraftStatus } from '../vocabulary'

export async function emailDocumentAction(kind: string, id: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isDocumentKind(kind) || !isUuid(id)) return { error: 'That document was not found.' }
  const fields = readEmailFields(form)
  if ('error' in fields) return { error: fields.error }

  const { organization, user, db } = await documentContext()
  const bundle = await getDocument(kind, id)
  if (!bundle) return { error: `That ${DOCUMENTS[kind].label} was not found.` }
  if (isDraftStatus(kind, bundle.record.status)) return { error: 'Send or issue this document before emailing it.' }

  // The cap counts what has been handed to the mail server in the last hour. A failed count stops the send:
  // nothing falls back to "no limit".
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recent = await db.from('document_emails').select('id', { count: 'exact', head: true }).eq('organization_id', organization.id).gte('sent_at', since)
  if (recent.error) return { error: 'The email limit could not be checked. Please try again.' }
  if ((recent.count ?? 0) >= HOURLY_EMAIL_CAP) {
    return { error: `This organisation has sent ${HOURLY_EMAIL_CAP} document emails in the last hour; try again later.` }
  }

  let made
  try {
    made = await makeDocumentPdf(kind, bundle)
  } catch (error) {
    return { error: error instanceof DocumentPdfError ? error.message : 'The PDF could not be made. Please try again.' }
  }
  if (made.bytes.length > MAX_EMAIL_PDF_BYTES) {
    const megabytes = (made.bytes.length / 1_000_000).toFixed(1)
    return { error: `This PDF is ${megabytes} MB, which is too large to email. Download it and send it yourself, or use a lighter header image under Settings, Company details.` }
  }

  try {
    await sendEmail({
      to: fields.to,
      template: { subject: fields.subject, text: fields.body, html: emailHtml(fields.body) },
      replyTo: user.email ?? undefined,
      attachments: [{ filename: made.filename, contentType: 'application/pdf', content: made.bytes }],
    })
  } catch (error) {
    console.error('[documents:email]', error)
    if (error instanceof MissingEnvError) return { error: 'Email sending is not set up on this server yet.' }
    return { error: 'The mail server refused the message. Nothing was sent; please try again.' }
  }

  // Only now, with the message accepted, is the send recorded.
  const recorded = await db.rpc('record_document_email', {
    p_kind: kind,
    p_id: id,
    p_to: fields.to,
    p_subject: fields.subject,
    p_body: fields.body,
    p_sha256: createHash('sha256').update(made.bytes).digest('hex'),
    p_bytes: made.bytes.length,
  })
  revalidateDocumentPages()
  if (recorded.error) {
    console.error('[documents:email:record]', recorded.error)
    return failureState(recorded.error, "Sent, but we couldn't record it.")
  }
  return { success: `Sent to ${fields.to}.` }
}
```

Notes for the implementer: `user.email` comes from the session context (a Supabase user); if the `user` shape in `documentContext()` differs, read `lib/auth/get-session-context.ts` and adapt the one line. `failureState(recorded.error, ...)` maps a database token if one comes back (it should not once Graph accepted a valid message) and otherwise says "Sent, but we couldn't record it."

- [ ] **Step 6: Add the source guards**

Append to `tests/unit/documents-actions-source.test.ts` (it already defines `read`, `isClient`):

```ts
test('the email action checks everything cheap first, sends once, and records only after the mail server accepts', () => {
  const source = read('actions', 'email.ts')
  assert.match(source, /^'use server'/)
  const order = [
    'isDocumentKind(kind)',
    'readEmailFields(',
    'getDocument(',
    'isDraftStatus(',
    'HOURLY_EMAIL_CAP',
    'makeDocumentPdf(',
    'MAX_EMAIL_PDF_BYTES',
    'await sendEmail(',
    "rpc('record_document_email'",
  ].map((marker) => {
    const at = source.indexOf(marker)
    assert.ok(at > -1, `${marker} must appear in the email action`)
    return at
  })
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'the steps must run in this order')
  assert.equal(source.split('await sendEmail(').length - 1, 1, 'exactly one send')
  assert.equal(source.split("rpc('record_document_email'").length - 1, 1, 'exactly one record')
  assert.match(source, /catch \(error\)[\s\S]*?refused the message/, 'a refusal by the mail server is reported, not recorded')
  assert.doesNotMatch(source, /process\.env|GRAPH_|MAIL_FROM|createClient\(|SUPABASE_SECRET/, 'no secrets and no service client in the action')
  assert.match(source, /Sent, but we couldn't record it/)
})

test('the shared email module is loadable by tests', () => {
  for (const name of ['email.ts', 'action-failure.ts']) {
    const source = read(name)
    assert.ok(!isClient(source), name)
    assert.doesNotMatch(source, /server-only/, name)
    assert.doesNotMatch(source, /from\s+['"]@\//, name)
  }
})
```

Also add `'email.ts'` and `'action-failure.ts'` to nothing else; the existing shared-modules test lists specific names and stays as is.

- [ ] **Step 7: Run everything**

Run: `pnpm typecheck`, `pnpm lint`, `pnpm test`.
Expected: green. Then run a log-transport smoke test of the mail path without any credentials: `EMAIL_TRANSPORT=log node --experimental-strip-types -e "..."` is not possible for `server-only` modules, so skip it; the mime unit tests cover the message and the controller covers the rest in Task 5.

- [ ] **Step 8: Commit**

```bash
git add lib/email/mime.ts lib/email/send-email.ts features/documents/email.ts features/documents/action-failure.ts features/documents/actions/email.ts features/documents/queries/get-document.ts tests/unit/mime.test.ts tests/unit/documents-email.test.ts tests/unit/documents-actions-source.test.ts
git commit -m "$(cat <<'EOF'
feat(documents): email a sent document as a PDF attachment and record each send

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Screens (download, email form and history, create invoice and its list)

**Files:**
- Create: `features/documents/actions/invoice-from-quote.ts`, `features/documents/queries/list-document-emails.ts`, `get-email-defaults.ts`, `list-invoices-from-quote.ts`, `features/documents/components/email-document-form.tsx`, `email-section.tsx`, `quote-invoices.tsx`
- Modify: `features/documents/components/document-actions.tsx`, `app/(unison)/commercial/quotes/[quoteId]/page.tsx`, `app/(unison)/finance/invoices/[invoiceId]/page.tsx`, `tests/unit/documents-ui.test.ts`, `tests/unit/documents-actions-source.test.ts`

**Interfaces:**
- Consumes: Task 3's `emailDocumentAction`, `failureState`, email helpers; Task 2's tables/functions; `getDocument`; `documentContext`; `listOrganizationMembers` (`@/features/memberships/queries/list-organization-members`, returns members with `userId` and `displayName`); `resolveDisplayName` (`@/lib/auth/display-name`); `ActionButton`; `TextField`, `TextAreaField` (`@/components/ui/form-fields`); `FormError` (`@/components/ui/form-layout`); the section wrapper the timeline uses (see its import in `features/crm-workspace/components/timeline-section.tsx`).
- Produces: `createInvoiceFromQuoteAction(quoteId: string, previous: ActionState, form: FormData): Promise<ActionState>` (redirects to the new invoice); `listDocumentEmails(kind, id)`, `getEmailDefaults(kind, bundle)`, `listInvoicesFromQuote(quoteId)`; `<EmailSection kind id />` and `<QuoteInvoices quoteId />` server components; the page wiring.

- [ ] **Step 1: Write the failing guards**

Append to `tests/unit/documents-ui.test.ts` (it has `read`, `between` helpers; add any missing import):

```ts
test('a sent or issued document offers the PDF and email; a draft offers neither; only an accepted quote offers Create invoice', () => {
  const source = read('features', 'documents', 'components', 'document-actions.tsx')
  assert.match(source, /Download PDF/)
  assert.match(source, /document\/pdf/, 'the download link points at the PDF route')
  assert.match(source, /#email-client/, 'Email to client jumps to the email section')
  assert.match(source, /createInvoiceFromQuoteAction/)
  assert.match(source, /status === 'Accepted'/, 'Create invoice only for an accepted quote')
  const pdf = source.indexOf('Download PDF')
  assert.ok(source.lastIndexOf('!draft', pdf) > -1, 'the PDF link sits behind the not-a-draft check')
})

test('the email form keeps what was typed, cannot be double-submitted, and sends nothing but the three fields', () => {
  const source = read('features', 'documents', 'components', 'email-document-form.tsx')
  assert.match(source, /^'use client'/)
  assert.match(source, /disabled=\{pending\}/, 'the Send button is disabled while a send is pending')
  assert.match(source, /name="to"/)
  assert.match(source, /name="subject"/)
  assert.match(source, /name="body"/)
  assert.match(source, /event\.preventDefault\(\)/, 'the action is called by hand so a failed send does not reset the form')
  assert.match(source, /startTransition\(/)
  assert.doesNotMatch(source, /server-only|pdf\/|lib\/email/, 'a client component imports no server code')
})

test('the email section explains that a draft must be sent first, and shows the history', () => {
  const source = read('features', 'documents', 'components', 'email-section.tsx')
  assert.match(source, /Send or issue this document before emailing it/)
  assert.match(source, /id="email-client"/)
  assert.match(source, /listDocumentEmails\(/)
  assert.match(source, /getEmailDefaults\(/)
  assert.match(source, /Emails sent/)
})

test('the quote and invoice pages show the email section, and the quote page lists the invoices made from it', () => {
  const quote = read('app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'page.tsx')
  assert.match(quote, /EmailSection kind="quote"/)
  assert.match(quote, /QuoteInvoices quoteId=/)
  const invoice = read('app', '(unison)', 'finance', 'invoices', '[invoiceId]', 'page.tsx')
  assert.match(invoice, /EmailSection kind="invoice"/)
})
```

Append to `tests/unit/documents-actions-source.test.ts`:

```ts
test('create-invoice-from-quote checks the id, lets the database decide, and opens the new draft', () => {
  const source = read('actions', 'invoice-from-quote.ts')
  assert.match(source, /^'use server'/)
  assert.match(source, /isUuid\(/)
  assert.match(source, /rpc\('create_invoice_from_quote'/)
  assert.match(source, /failureState\(/)
  assert.match(source, /redirect\(`\$\{DOCUMENTS\.invoice\.base\}\//)
  assert.doesNotMatch(source, /from\('invoices'\)\s*\.insert|from\('invoice_lines'\)\s*\.insert/, 'the copy is made by the database function, not by the action')
})
```

Run: `node --test --experimental-strip-types tests/unit/documents-ui.test.ts tests/unit/documents-actions-source.test.ts` — expected FAIL.

- [ ] **Step 2: The create-invoice action**

Create `features/documents/actions/invoice-from-quote.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'

import { isUuid } from '@/lib/utils'
import { failureState } from '../action-failure'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'
import { DOCUMENTS } from '../vocabulary'

export async function createInvoiceFromQuoteAction(quoteId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(quoteId)) return { error: 'That quote was not found.' }
  const { db } = await documentContext()
  const result = await db.rpc('create_invoice_from_quote', { p_quote_id: quoteId })
  if (result.error) return failureState(result.error)
  if (typeof result.data !== 'string' || !isUuid(result.data)) return { error: 'The invoice was created but could not be opened. Find it in the Invoices list.' }
  revalidateDocumentPages()
  redirect(`${DOCUMENTS.invoice.base}/${result.data}`)
}
```

- [ ] **Step 3: The queries**

Create `features/documents/queries/list-document-emails.ts`:

```ts
import 'server-only'

import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { documentContext } from '../server-context'
import type { DocumentKind } from '../vocabulary'

export type DocumentEmailRow = { id: string; to: string; subject: string; sentAt: string; sentBy: string }

/** The emails handed to the mail server for one document, newest first (at most 50). */
export async function listDocumentEmails(kind: DocumentKind, id: string): Promise<DocumentEmailRow[]> {
  const { organization, db } = await documentContext()
  const column = kind === 'quote' ? 'quote_id' : 'invoice_id'
  const [rows, members] = await Promise.all([
    db
      .from('document_emails')
      .select('id,to_address,subject,sent_at,sent_by')
      .eq(column, id)
      .eq('organization_id', organization.id)
      .order('sent_at', { ascending: false })
      .limit(50),
    listOrganizationMembers(),
  ])
  if (rows.error) throw rows.error
  const names = new Map<string, string>(members.map((member) => [member.userId, member.displayName]))
  return ((rows.data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    to: row.to_address,
    subject: row.subject,
    sentAt: row.sent_at,
    sentBy: (row.sent_by && names.get(row.sent_by)) || 'Former member',
  }))
}
```

Create `features/documents/queries/get-email-defaults.ts`:

```ts
import 'server-only'

import { resolveDisplayName } from '@/lib/auth/display-name'
import { buildDocumentView } from '../document-view'
import { defaultEmailMessage, defaultEmailSubject, isValidEmailAddress } from '../email'
import type { DocumentBundle } from './get-document'
import { documentContext } from '../server-context'
import type { DocumentKind } from '../vocabulary'

/** What the email form starts with: the client's billing address (else the primary contact's), a subject and a short message. */
export async function getEmailDefaults(kind: DocumentKind, bundle: DocumentBundle): Promise<{ to: string; subject: string; body: string }> {
  const { organization, user, db } = await documentContext()
  const view = buildDocumentView({ kind, ...bundle })

  let to = ''
  const billing = String(bundle.client?.billing_email ?? '').trim()
  if (isValidEmailAddress(billing)) {
    to = billing
  } else if (bundle.record.client_id) {
    const primary = await db
      .from('contacts')
      .select('email')
      .eq('client_id', bundle.record.client_id)
      .eq('organization_id', organization.id)
      .eq('is_primary', true)
      .is('archived_at', null)
      .maybeSingle()
    if (primary.error) throw primary.error
    const contact = String(primary.data?.email ?? '').trim()
    if (isValidEmailAddress(contact)) to = contact
  }
  return { to, subject: defaultEmailSubject(view), body: defaultEmailMessage(view, resolveDisplayName(user)) }
}
```

Create `features/documents/queries/list-invoices-from-quote.ts`:

```ts
import 'server-only'

import { isUuid } from '@/lib/utils'
import { documentContext } from '../server-context'

export type QuoteInvoiceRow = { id: string; number: string; status: string; total: number; currency: string; createdAt: string }

/** The invoices made from a quote (drafts included), newest first. Row level security limits them to the caller's organisation. */
export async function listInvoicesFromQuote(quoteId: string): Promise<QuoteInvoiceRow[]> {
  if (!isUuid(quoteId)) return []
  const { organization, db } = await documentContext()
  const result = await db
    .from('invoices')
    .select('id,invoice_number,status,total_amount,currency,created_at')
    .eq('quote_id', quoteId)
    .eq('organization_id', organization.id)
    .order('created_at', { ascending: false })
  if (result.error) throw result.error
  return ((result.data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    number: row.invoice_number,
    status: row.status,
    total: Number(row.total_amount),
    currency: row.currency,
    createdAt: row.created_at,
  }))
}
```

- [ ] **Step 4: The components**

Read `components/ui/form-layout.tsx` (`FormError`, and the submit button style in `FormFooter`) and the wrapper `features/crm-workspace/components/timeline-section.tsx` uses for its section (`WorkspaceSection`), and follow them. Create `features/documents/components/email-document-form.tsx`:

```tsx
'use client'

import { useActionState, useTransition } from 'react'

import { TextAreaField, TextField } from '@/components/ui/form-fields'
import { FormError } from '@/components/ui/form-layout'
import { emailDocumentAction } from '../actions/email'
import type { DocumentKind } from '../vocabulary'

/**
 * One recipient, a subject and a message; the PDF is attached by the server. The action is called by hand so a
 * failed send keeps what was typed (React resets a form after its action), and a second send is possible after a
 * success: each one is recorded.
 */
export function EmailDocumentForm({ kind, id, defaults }: { kind: DocumentKind; id: string; defaults: { to: string; subject: string; body: string } }) {
  const [state, run, pending] = useActionState(emailDocumentAction.bind(null, kind, id), undefined)
  const [, startTransition] = useTransition()
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(() => run(data))
      }}
      className="space-y-4 px-5 py-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextField name="to" label="To" type="email" required defaultValue={defaults.to} placeholder="client@example.com" />
        <TextField name="subject" label="Subject" required defaultValue={defaults.subject} />
      </div>
      <TextAreaField name="body" label="Message" rows={10} defaultValue={defaults.body} />
      <p className="text-xs text-muted-foreground">The PDF is attached. Replies go to your own email address.</p>
      <FormError message={state?.error} />
      {state?.success && !pending ? (
        <p role="status" className="border border-success/25 bg-success-soft/45 px-4 py-3 text-sm text-success">{state.success}</p>
      ) : null}
      <button type="submit" disabled={pending} className="border border-border bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? 'Sending…' : 'Send email'}
      </button>
    </form>
  )
}
```

(Use the same class names the existing primary buttons use; if `bg-brand`/`text-white` are not the project's tokens for a primary button, copy the classes from `FormFooter`'s submit button.)

Create `features/documents/components/email-section.tsx`:

```tsx
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { getDocument } from '../queries/get-document'
import { getEmailDefaults } from '../queries/get-email-defaults'
import { listDocumentEmails } from '../queries/list-document-emails'
import { isDraftStatus, type DocumentKind } from '../vocabulary'
import { EmailDocumentForm } from './email-document-form'

const WHEN = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' })

/** Email the document to the client, and the list of what has been sent. A draft has neither: it must go out first. */
export async function EmailSection({ kind, id }: { kind: DocumentKind; id: string }) {
  const bundle = await getDocument(kind, id)
  if (!bundle) return null
  const draft = isDraftStatus(kind, bundle.record.status)
  const [defaults, sent] = draft ? [null, []] : await Promise.all([getEmailDefaults(kind, bundle), listDocumentEmails(kind, id)])
  return (
    <div id="email-client" className="scroll-mt-24">
      <WorkspaceSection title="Email to client" description="Sends the PDF from the company mailbox. Every email sent is recorded below.">
        {draft || !defaults ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Send or issue this document before emailing it.</p>
        ) : (
          <>
            <EmailDocumentForm kind={kind} id={id} defaults={defaults} />
            <div className="border-t border-border">
              <h3 className="px-5 pt-4 text-sm font-semibold text-foreground">Emails sent</h3>
              {sent.length ? (
                <ul className="divide-y divide-border">
                  {sent.map((email) => (
                    <li key={email.id} className="px-5 py-3 text-sm">
                      <p className="text-foreground">{email.subject}</p>
                      <p className="mt-1 text-xs text-muted-foreground">To {email.to} · {email.sentBy} · {WHEN.format(new Date(email.sentAt))}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-muted-foreground">Nothing has been emailed yet.</p>
              )}
            </div>
          </>
        )}
      </WorkspaceSection>
    </div>
  )
}
```

(Replace the `WorkspaceSection` import path with the real one used by `timeline-section.tsx`.)

Create `features/documents/components/quote-invoices.tsx`:

```tsx
import Link from 'next/link'

import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { formatAmount } from '../document-view'
import { listInvoicesFromQuote } from '../queries/list-invoices-from-quote'
import { DOCUMENTS, isDraftReference } from '../vocabulary'

/** The invoices made from an accepted quote. Shown only once there is at least one, so other quotes stay uncluttered. */
export async function QuoteInvoices({ quoteId }: { quoteId: string }) {
  const invoices = await listInvoicesFromQuote(quoteId)
  if (invoices.length === 0) return null
  return (
    <WorkspaceSection title="Invoices made from this quote" description="Each one is its own invoice; the quote itself does not change.">
      <ul className="divide-y divide-border">
        {invoices.map((invoice) => (
          <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <Link href={`${DOCUMENTS.invoice.base}/${invoice.id}`} className="font-semibold text-brand hover:underline">
              {isDraftReference(invoice.number) ? 'Draft invoice' : invoice.number}
            </Link>
            <span className="text-muted-foreground">{invoice.status} · {invoice.currency} {formatAmount(invoice.total)}</span>
          </li>
        ))}
      </ul>
    </WorkspaceSection>
  )
}
```

- [ ] **Step 5: Wire the header actions and the pages**

Replace `features/documents/components/document-actions.tsx`:

```tsx
import Link from 'next/link'

import { ActionButton } from '@/features/crm-workspace/components/action-button'
import { createInvoiceFromQuoteAction } from '../actions/invoice-from-quote'
import { duplicateQuoteAction, issueInvoiceAction, sendQuoteAction } from '../actions/send'
import { DOCUMENTS, isDraftStatus, type DocumentKind } from '../vocabulary'

const LINK = 'border border-border px-4 py-2 text-sm font-medium text-foreground'

/** The buttons in a quote or invoice page header: view the document, and send, issue, download, email, invoice or duplicate it. */
export function DocumentActions({ kind, id, status }: { kind: DocumentKind; id: string; status: string }) {
  const draft = isDraftStatus(kind, status)
  return (
    <>
      <Link href={`${DOCUMENTS[kind].base}/${id}/document`} className={LINK}>
        View document
      </Link>
      {!draft ? (
        <>
          {/* A file, not a page: a plain anchor so the router does not try to render it. */}
          <a href={`${DOCUMENTS[kind].base}/${id}/document/pdf`} className={LINK}>
            Download PDF
          </a>
          <a href="#email-client" className={LINK}>
            Email to client
          </a>
        </>
      ) : null}
      {kind === 'quote' && draft ? (
        <ActionButton action={sendQuoteAction.bind(null, id)} label="Send quote" confirmText="Send this quote? It gets its number now and can no longer be edited." />
      ) : null}
      {kind === 'quote' && status === 'Accepted' ? (
        <ActionButton action={createInvoiceFromQuoteAction.bind(null, id)} label="Create invoice" confirmText="Create a draft invoice with the lines of this quote?" />
      ) : null}
      {kind === 'quote' && !draft ? (
        <ActionButton action={duplicateQuoteAction.bind(null, id)} label="Duplicate as new draft" />
      ) : null}
      {kind === 'invoice' && draft ? (
        <ActionButton action={issueInvoiceAction.bind(null, id)} label="Issue invoice" confirmText="Issue this invoice? It gets its number now and can no longer be edited." />
      ) : null}
    </>
  )
}
```

In `app/(unison)/commercial/quotes/[quoteId]/page.tsx`: import `EmailSection` and `QuoteInvoices`, and change `QuoteWorkspace` to render the lines, then the email section, then the invoices list, then the timeline:

```tsx
import { EmailSection } from '@/features/documents/components/email-section'
import { QuoteInvoices } from '@/features/documents/components/quote-invoices'
// ...
async function QuoteWorkspace({ quoteId }: { quoteId: string }) {
  const workspace = await getRecordWorkspace('quote', quoteId)
  return (
    <>
      <QuoteLines quoteId={quoteId} />
      <EmailSection kind="quote" id={quoteId} />
      <QuoteInvoices quoteId={quoteId} />
      <RecordWorkspaceSections workspace={workspace} sections={['timeline']} />
    </>
  )
}
```

In `app/(unison)/finance/invoices/[invoiceId]/page.tsx`: import `EmailSection` and pass `after={<><InvoiceLines invoiceId={invoiceId} /><EmailSection kind="invoice" id={invoiceId} /></>}`.

- [ ] **Step 6: Run everything**

Run: `pnpm typecheck`, `pnpm lint`, `pnpm test`. Expected green (the new guards from Step 1 now pass).

Then, because the migration is applied by the controller before this task runs, do a quick check in the browser pane only if the controller says a signed-in session is available; otherwise rely on the guards. Do not create records in production.

- [ ] **Step 7: Commit**

```bash
git add features/documents/actions/invoice-from-quote.ts features/documents/queries/list-document-emails.ts features/documents/queries/get-email-defaults.ts features/documents/queries/list-invoices-from-quote.ts features/documents/components/email-document-form.tsx features/documents/components/email-section.tsx features/documents/components/quote-invoices.tsx features/documents/components/document-actions.tsx "app/(unison)/commercial/quotes/[quoteId]/page.tsx" "app/(unison)/finance/invoices/[invoiceId]/page.tsx" tests/unit/documents-ui.test.ts tests/unit/documents-actions-source.test.ts
git commit -m "$(cat <<'EOF'
feat(documents): download, email form and history, and create an invoice from an accepted quote

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Controller: proof, documents and hand-over (not dispatched to an implementer)

Production steps and anything needing judgement or the user. Nothing here is delegated.

- [ ] **Step 1: Migration gate (after Task 2's commit).** Probe in a rolled-back transaction, apply `documents_delivery`, confirm with `list_migrations`, run `documents-delivery` and `anon-privileges` RLS files and the earlier documents RLS files, confirm no fixture rows remain (including `audit_events`).
- [ ] **Step 2: Size decision (after Task 1).** Read the implementer's measured PDF size with the real banner and wordmark. If over 1,900,000 bytes, make a lighter header image (for example by drawing the banner at about 1000 px wide into a canvas in the browser pane and exporting a JPEG), save it in the scratchpad, and tell the user to add it to `public/brand` and point **Settings, Company details, Header image** at it. Do not write to `public/`.
- [ ] **Step 3: Preview check.** With a temporary unauthenticated fixture route (deleted afterwards, as for slice A), render the quote and invoice PDFs with fixture data through the real stack in the browser pane, and compare with the supplied designs (`public/HIMARK Strategic Advisory Quote.png`, `public/HIMARK Architectural Invoice Template.png`, read-only). Check the email section and history and the Create invoice button at desktop and phone width with fixture data. Remove every temporary file; confirm `git status`.
- [ ] **Step 4: Gates on the branch:** `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:rls`, `pnpm build`.
- [ ] **Step 5: Documents.** Append an "Amendments made while planning" section (the eight decisions above) to `docs/superpowers/specs/2026-10-11-documents-delivery-design.md`; add a "From slice B" section to `docs/follow-ups.md` (no delivery receipts; no stored PDF copies; PDF bytes differ per regeneration; ASCII-only addresses; the banner image weight and the second header strip replaced by a plain band; the table header not repeated across pages; the mailbox is shared, not the member's; the hourly cap is checked by the action, not the database; the 2 MB email budget; not exercised signed in; no dark H mark); tick the roadmap's Stage 2 items for PDF, email and quote to invoice with "built, waiting for the signed-in walk-through" (read `docs/crm-roadmap.md` first and tick only what this slice delivers); update the memory file `stage-2-quotes-invoices-in-progress.md`.
- [ ] **Step 6: Hand-over.** Tell the user: the signed-in checklist (download a PDF of a sent quote and an issued invoice and open them; email one to themselves; see it in Emails sent and on the timeline; accept a quote, Create invoice, issue it), that `public/brand/banner.png` and `himark-wordmark.png` must be committed before deploying, and that the PDF needs those files on the server. Ask before sending one real test email to the user's own address (needs `GRAPH_*` and `MAIL_FROM` in `.env.local`); do not send without their say-so, and delete nothing real. Then finish the branch (`superpowers:finishing-a-development-branch`): merge and push only when the user says so.

---

## Self-review

**Spec coverage.**
- PDF module and download routes (spec: Behaviour/PDF, Screens): Task 1.
- `document_emails`, `record_document_email`, `create_invoice_from_quote`, new kinds, RLS tests, drift tests: Task 2.
- Attachments and Reply-To, email action, form reader, defaults, cap, "record only after Graph accepts", `EMAIL_TRANSPORT=log`: Task 3 (the log mode is kept and extended to print attachment names and sizes).
- Download PDF / Email to client / Emails sent / Create invoice / Invoices made from this quote / draft note: Task 4.
- Preview check, follow-ups, roadmap ticks, signed-in checklist, one real email with the user's say-so, spec amendments: Task 5.
- Errors list in the spec: "Enter one valid email address", "Send or issue this document before emailing it", the cap message, "The mail server refused the message", "Sent, but we couldn't record it", "Only an accepted quote can be invoiced", "That quote was not found" are all present (Task 2 `errors.ts`, Task 3 action).
- Spec items intentionally changed are listed under "Decisions made while planning" (font, repeated table header, 2 MB, header image once, externals/tracing, byte identity, ASCII addresses, cap by action).

**Placeholder scan.** No TBD/TODO; every code step has code. The two places that depend on installed library behaviour (Step 6 of Task 1 style values; Step 9/11 tracing keys) say exactly what to check and what to do when it differs. `WorkspaceSection` import path is named as "the one the timeline uses" because it is looked up from an existing file in one grep.

**Type consistency.** `PdfImages`/`PdfImage` (Task 1) are used by `load-pdf-images.ts` and the tests. `makeDocumentPdf` returns `{ bytes, filename, view }`; the action uses `bytes` and `filename`. `DocumentBundle` comes from `get-document.ts` (Tasks 1, 3, 4). `readEmailFields` returns `EmailFields | { error }`, handled with `'error' in fields`. `failureState` (Task 3) is used by Task 4's action. `emailDocumentAction(kind, id, previous, form)` is bound in the form as `.bind(null, kind, id)`. Migration token names equal the `errors.ts` entries and the RLS test regexes. The activity kinds in the migration equal `SYSTEM_ACTIVITY_KINDS` in order.
