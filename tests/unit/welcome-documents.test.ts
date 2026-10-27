import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { BODY_MAX, MAX_EMAIL_PDF_BYTES, MAX_EMAIL_TOTAL_ATTACHMENT_BYTES } from '../../features/documents/email.ts'
import {
  WELCOME_DOCUMENTS,
  WelcomeDocumentError,
  attachmentsTooLarge,
  attachmentsTotalBytes,
  loadWelcomeDocuments,
  tooLargeMessage,
  welcomeAttachments,
  welcomeRecordBody,
} from '../../features/documents/welcome-documents.ts'

// The two approved PDFs are sent to clients exactly as they were supplied. Their SHA-256 values are pinned here, so changing a PDF is
// a deliberate act: whoever replaces a file must replace its hash in this test in the same commit. Nothing checks them at runtime.
const LETTER = { file: 'Welcome Letter.pdf', bytes: 121_686, sha256: '0c00abf67aebffafc2db974badccd75329e5a74936fc51ad3fd831bb8febc3ae' }
const STEPS = { file: 'Your Next Steps.pdf', bytes: 112_155, sha256: '5c4e390d1f9621beb813b2caed0080eda4d8bdf4ac337460fc6028ab658fdffd' }
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const committed = (file: string) => readFileSync(join(process.cwd(), 'public', 'brand', 'documents', file))
const PDF = Buffer.from('%PDF-1.7\n% a stand-in for a test\n%%EOF\n', 'latin1')

/** A throwaway project root with public/brand/documents inside it. */
function root(files: Record<string, Buffer | 'directory'>): string {
  const base = mkdtempSync(join(tmpdir(), 'welcome-documents-'))
  const folder = join(base, 'public', 'brand', 'documents')
  mkdirSync(folder, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    if (content === 'directory') mkdirSync(join(folder, name))
    else writeFileSync(join(folder, name), content)
  }
  return base
}
async function withRoot<T>(files: Record<string, Buffer | 'directory'>, run: (base: string) => Promise<T>): Promise<T> {
  const base = root(files)
  try {
    return await run(base)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
}
async function failure(base: string): Promise<WelcomeDocumentError> {
  try {
    await loadWelcomeDocuments(base)
  } catch (error) {
    assert.ok(error instanceof WelcomeDocumentError, `a WelcomeDocumentError, not ${String(error)}`)
    return error
  }
  assert.fail('the loader should have refused')
}

// ---- the committed files ---------------------------------------------------------------------------------------

test('the two committed PDFs are byte for byte the approved ones: size, SHA-256 and the PDF signature', () => {
  for (const pinned of [LETTER, STEPS]) {
    const bytes = committed(pinned.file)
    assert.equal(bytes.length, pinned.bytes, `${pinned.file}: byte count`)
    assert.equal(sha(bytes), pinned.sha256, `${pinned.file}: SHA-256`)
    assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-', `${pinned.file}: starts like a PDF`)
  }
})

test('the loader returns both documents in order, with the client-facing file names, the exact bytes and their SHA-256', async () => {
  const documents = await loadWelcomeDocuments()
  assert.deepEqual(documents.map((document) => document.filename), ['HIMARK Welcome Letter.pdf', 'HIMARK Your Next Steps.pdf'])
  assert.deepEqual(documents.map((document) => document.name), ['HIMARK Welcome Letter', 'HIMARK Your Next Steps'])
  for (const [index, pinned] of [LETTER, STEPS].entries()) {
    const document = documents[index]
    assert.deepEqual(Object.keys(document).sort(), ['bytes', 'filename', 'name', 'sha256'])
    assert.equal(document.bytes.length, pinned.bytes)
    assert.equal(document.sha256, pinned.sha256)
    assert.ok(Buffer.from(document.bytes).equals(committed(pinned.file)), 'the very bytes of the file')
  }
})

test('the documents are described once, as data: the file on disk, the plain-words name and the file name the client sees', () => {
  assert.deepEqual(
    WELCOME_DOCUMENTS.map(({ file, name, filename }) => ({ file, name, filename })),
    [
      { file: 'Welcome Letter.pdf', name: 'HIMARK Welcome Letter', filename: 'HIMARK Welcome Letter.pdf' },
      { file: 'Your Next Steps.pdf', name: 'HIMARK Your Next Steps', filename: 'HIMARK Your Next Steps.pdf' },
    ],
  )
})

// ---- a file that cannot be used --------------------------------------------------------------------------------

test('a missing file raises a typed error that names that document and the file to restore', async () => {
  await withRoot({ [STEPS.file]: PDF }, async (base) => {
    const error = await failure(base)
    assert.equal(error.message, 'The HIMARK Welcome Letter could not be found. Ask support to restore public/brand/documents/Welcome Letter.pdf.')
    assert.equal(error.name, 'WelcomeDocumentError')
  })
  await withRoot({ [LETTER.file]: PDF }, async (base) => {
    const error = await failure(base)
    assert.equal(error.message, 'The HIMARK Your Next Steps could not be found. Ask support to restore public/brand/documents/Your Next Steps.pdf.')
  })
})

test('an empty file raises the typed error, naming the document', async () => {
  await withRoot({ [LETTER.file]: PDF, [STEPS.file]: Buffer.alloc(0) }, async (base) => {
    const error = await failure(base)
    assert.equal(error.message, 'The HIMARK Your Next Steps is empty. Ask support to restore public/brand/documents/Your Next Steps.pdf.')
  })
})

test('a file that is not a PDF (it does not start with %PDF-) raises the typed error', async () => {
  const notPdf = [Buffer.from('<html>not a pdf</html>'), Buffer.from(' %PDF-1.7 a leading space'), Buffer.from('%PD'), Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d].reverse())]
  for (const content of notPdf) {
    await withRoot({ [LETTER.file]: content, [STEPS.file]: PDF }, async (base) => {
      const error = await failure(base)
      assert.equal(error.message, 'The HIMARK Welcome Letter is not a PDF file. Ask support to restore public/brand/documents/Welcome Letter.pdf.', JSON.stringify(content.toString('latin1')))
    })
  }
})

test('a file that cannot be read (a folder where the file should be) raises the typed error too, and never a raw system message', async () => {
  await withRoot({ [LETTER.file]: PDF, [STEPS.file]: 'directory' }, async (base) => {
    const error = await failure(base)
    assert.equal(error.message, 'The HIMARK Your Next Steps could not be read. Ask support to restore public/brand/documents/Your Next Steps.pdf.')
    assert.doesNotMatch(error.message, /EISDIR|ENOENT|errno|C:\\|\/tmp\//i)
  })
})

test('with both files missing the first one is named; with a good pair the documents come back', async () => {
  await withRoot({}, async (base) => {
    assert.match((await failure(base)).message, /^The HIMARK Welcome Letter could not be found\./)
  })
  await withRoot({ [LETTER.file]: PDF, [STEPS.file]: PDF }, async (base) => {
    const documents = await loadWelcomeDocuments(base)
    assert.equal(documents.length, 2)
    assert.equal(documents[0].sha256, sha(PDF))
    assert.equal(documents[0].bytes.length, PDF.length)
  })
})

test('there is no runtime hash check: a changed but valid PDF is sent, and the pinned hashes are only in this test', async () => {
  const changed = Buffer.from('%PDF-1.7\n% a different, valid-looking file\n')
  await withRoot({ [LETTER.file]: changed, [STEPS.file]: PDF }, async (base) => {
    const documents = await loadWelcomeDocuments(base)
    assert.equal(documents[0].sha256, sha(changed))
  })
  const source = readFileSync(join(process.cwd(), 'features', 'documents', 'welcome-documents.ts'), 'utf8')
  assert.ok(!source.includes(LETTER.sha256) && !source.includes(STEPS.sha256), 'the pinned hashes are not in the module')
})

// ---- the attachments -------------------------------------------------------------------------------------------

test('the attachments are the invoice, then the Welcome Letter, then Your Next Steps, each an application/pdf with the name it keeps', async () => {
  const invoice = { filename: 'HMK-INV-2026-00007.pdf', bytes: Buffer.from('%PDF-1.7 invoice') }
  const documents = await loadWelcomeDocuments()
  const attachments = welcomeAttachments(invoice, documents)
  assert.deepEqual(attachments.map((attachment) => attachment.filename), ['HMK-INV-2026-00007.pdf', 'HIMARK Welcome Letter.pdf', 'HIMARK Your Next Steps.pdf'])
  assert.deepEqual(attachments.map((attachment) => attachment.contentType), ['application/pdf', 'application/pdf', 'application/pdf'])
  assert.equal(attachments[0].content, invoice.bytes, 'the invoice bytes are the ones it was given')
  assert.equal(attachments[1].content.length, LETTER.bytes)
  assert.equal(attachments[2].content.length, STEPS.bytes)
  assert.deepEqual(Object.keys(attachments[0]).sort(), ['content', 'contentType', 'filename'], 'the shape the mail transport takes')
})

test('the total cap is 2,150,000 raw bytes (the message is base64 twice over): exactly that fits, one byte more does not', () => {
  assert.equal(MAX_EMAIL_TOTAL_ATTACHMENT_BYTES, 2_150_000)
  const of = (...sizes: number[]) => sizes.map((size) => ({ content: { length: size } as Uint8Array }))
  assert.equal(attachmentsTotalBytes(of(2_000_000, 100_000, 50_000)), 2_150_000)
  assert.equal(attachmentsTooLarge(of(2_000_000, 100_000, 50_000)), false, 'at the cap')
  assert.equal(attachmentsTooLarge(of(2_000_000, 100_000, 50_001)), true, 'one byte over')
  assert.equal(attachmentsTooLarge(of(0)), false)
  assert.equal(attachmentsTooLarge(of()), false)
})

test('the largest invoice that fits beside the two approved documents is 1,916,159 bytes, which is under the per-PDF cap: an invoice between the two is refused with the too-large sentence', () => {
  assert.equal(MAX_EMAIL_PDF_BYTES, 2_000_000, 'the per-PDF cap is unchanged')
  const room = MAX_EMAIL_TOTAL_ATTACHMENT_BYTES - LETTER.bytes - STEPS.bytes
  assert.equal(room, 1_916_159)
  assert.ok(room < MAX_EMAIL_PDF_BYTES, 'so the total cap, not the per-PDF cap, is what a large first invoice meets')
  const fits = (invoiceBytes: number) => !attachmentsTooLarge([{ content: { length: invoiceBytes } as Uint8Array }, { content: { length: LETTER.bytes } as Uint8Array }, { content: { length: STEPS.bytes } as Uint8Array }])
  assert.equal(fits(room), true)
  assert.equal(fits(room + 1), false)
})

test('the too-large sentence is plain words, says nothing was sent, gives the size in MB and keeps a way forward', () => {
  const message = tooLargeMessage(2_300_000)
  assert.match(message, /2\.3 MB/)
  assert.match(message, /too large to email in one message\. Nothing was sent\./)
  assert.doesNotMatch(message, /undefined|NaN|bytes/)
  // The way forward of the plain email ("Download it and send it yourself") adapted to the three files.
  assert.ok(message.endsWith('Nothing was sent. Download the invoice PDF from the invoice page and send it yourself, together with the HIMARK Welcome Letter and HIMARK Your Next Steps. For future documents, a lighter header image under Settings, Company details keeps the PDF small enough to email.'))
  assert.ok(!message.includes('Send it from the invoice page'), 'it never tells anyone to use the form that just refused')
})

// ---- the record ------------------------------------------------------------------------------------------------

test('the record body is the message, a blank line, "Attachments:" and one line per file with its name, size and SHA-256', () => {
  const invoice = Buffer.from('%PDF-1.7 invoice bytes')
  const letter = Buffer.from('%PDF-1.7 letter')
  const steps = Buffer.from('%PDF-1.7 steps and more')
  const body = welcomeRecordBody('Dear Thandi,\n\nWelcome.', [
    { filename: 'HMK-INV-2026-00007.pdf', content: invoice },
    { filename: 'HIMARK Welcome Letter.pdf', content: letter },
    { filename: 'HIMARK Your Next Steps.pdf', content: steps },
  ])
  assert.equal(
    body,
    [
      'Dear Thandi,',
      '',
      'Welcome.',
      '',
      'Attachments:',
      `HMK-INV-2026-00007.pdf | ${invoice.length} bytes | sha256 ${sha(invoice)}`,
      `HIMARK Welcome Letter.pdf | ${letter.length} bytes | sha256 ${sha(letter)}`,
      `HIMARK Your Next Steps.pdf | ${steps.length} bytes | sha256 ${sha(steps)}`,
    ].join('\n'),
  )
})

test('the record body of a worst-case message stays well inside the database limit of 10,000 characters', async () => {
  const documents = await loadWelcomeDocuments()
  const invoice = { filename: `${'N'.repeat(200)}.pdf`, bytes: Buffer.from('%PDF-1.7 invoice') }
  const message = `Dear ${'N'.repeat(200)},\n\n${'A sentence of the email. '.repeat(60)}`
  const body = welcomeRecordBody(message, welcomeAttachments(invoice, documents))
  assert.ok(body.length < BODY_MAX, `${body.length} characters`)
  assert.ok(body.length < 4000, 'and nowhere near it for the real email')
})
