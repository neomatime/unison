// The two approved documents that go out with the HIMARK Welcome Email, and what is attached to it.
//
// Reads public/brand/documents from the app's own folder, the way features/documents/pdf/load-pdf-images.ts reads the brand
// images (next.config.mjs ships ./public/brand/**/* with the quote and invoice pages, and a server action runs in its page's
// function, so these files are shipped too). Relative imports and node built-ins only, no directive and no 'server-only', so
// `node --test` can load it: the reads take a root folder, and the tests point them at a temporary one.
//
// The files are never opened for their content, edited or regenerated here: they are read as bytes and attached as they are.
// A unit test pins their SHA-256, so replacing one is a deliberate act; nothing checks the hash at runtime, so a changed but
// valid PDF still goes out. A missing, empty, unreadable or non-PDF file is a typed error in plain words that names the
// document, and whoever asked for the email is told, and nothing is sent.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { MAX_EMAIL_TOTAL_ATTACHMENT_BYTES } from './email.ts'

export type WelcomeDocumentSpec = {
  key: 'welcome-letter' | 'next-steps'
  /** The file inside public/brand/documents. */
  file: string
  /** What the document is called in a sentence to staff: "The HIMARK Welcome Letter could not be found." */
  name: string
  /** The file name the client sees on the attachment. */
  filename: string
}

/** In attachment order: the invoice comes first (it is not one of these), then these two. */
export const WELCOME_DOCUMENTS: readonly WelcomeDocumentSpec[] = [
  { key: 'welcome-letter', file: 'Welcome Letter.pdf', name: 'HIMARK Welcome Letter', filename: 'HIMARK Welcome Letter.pdf' },
  { key: 'next-steps', file: 'Your Next Steps.pdf', name: 'HIMARK Next Steps guide', filename: 'HIMARK Your Next Steps.pdf' },
]

const FOLDER = ['public', 'brand', 'documents'] as const
const PDF_SIGNATURE = Buffer.from('%PDF-', 'latin1')

export type WelcomeDocument = { name: string; filename: string; bytes: Buffer; sha256: string }

/** One thing an email attachment is made of (the shape the mail transport takes). */
export type EmailAttachment = { filename: string; contentType: string; content: Uint8Array }

type Problem = 'could not be found' | 'is empty' | 'is not a PDF file' | 'could not be read'

/** A welcome document that cannot be used. The message is plain words that name the document and the file to restore. */
export class WelcomeDocumentError extends Error {
  document: string
  constructor(spec: WelcomeDocumentSpec, problem: Problem) {
    super(`The ${spec.name} ${problem}. Ask support to restore ${FOLDER.join('/')}/${spec.file}.`)
    this.name = 'WelcomeDocumentError'
    this.document = spec.key
  }
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function readWelcomeDocument(spec: WelcomeDocumentSpec, root: string): Promise<WelcomeDocument> {
  let bytes: Buffer
  try {
    bytes = await readFile(join(root, ...FOLDER, spec.file))
  } catch (error) {
    throw new WelcomeDocumentError(spec, (error as { code?: unknown } | null)?.code === 'ENOENT' ? 'could not be found' : 'could not be read')
  }
  if (bytes.length === 0) throw new WelcomeDocumentError(spec, 'is empty')
  if (!bytes.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) throw new WelcomeDocumentError(spec, 'is not a PDF file')
  return { name: spec.name, filename: spec.filename, bytes, sha256: sha256(bytes) }
}

/** Both documents, in attachment order. The first one that cannot be used is the error; a second is not looked at after it. */
export async function loadWelcomeDocuments(root: string = process.cwd()): Promise<WelcomeDocument[]> {
  const documents: WelcomeDocument[] = []
  for (const spec of WELCOME_DOCUMENTS) documents.push(await readWelcomeDocument(spec, root))
  return documents
}

const UNREADABLE = 'The HIMARK welcome documents could not be read. Please try again or ask support.'

/** The sentence for a failed load: the typed error's own words, or a safe sentence for anything else (a raw system message names paths). */
export function welcomeDocumentsFailure(error: unknown): string {
  return error instanceof WelcomeDocumentError ? error.message : UNREADABLE
}

/** Whether both documents can be used: null when they can, otherwise the plain words saying why not. Reads, sends nothing. */
export async function welcomeDocumentsProblem(root: string = process.cwd()): Promise<string | null> {
  try {
    await loadWelcomeDocuments(root)
    return null
  } catch (error) {
    if (!(error instanceof WelcomeDocumentError)) console.error('[documents:welcome]', error)
    return welcomeDocumentsFailure(error)
  }
}

/** The three attachments, in the order the client sees them: the invoice (under the name it has today), then the two documents. */
export function welcomeAttachments(invoice: { filename: string; bytes: Uint8Array }, documents: readonly WelcomeDocument[]): EmailAttachment[] {
  return [
    { filename: invoice.filename, contentType: 'application/pdf', content: invoice.bytes },
    ...documents.map((document) => ({ filename: document.filename, contentType: 'application/pdf', content: document.bytes })),
  ]
}

export const attachmentsTotalBytes = (attachments: ReadonlyArray<{ content: Uint8Array }>): number =>
  attachments.reduce((total, attachment) => total + attachment.content.length, 0)

/** Over the cap, not at it: exactly 3,000,000 bytes in all still goes out. */
export const attachmentsTooLarge = (attachments: ReadonlyArray<{ content: Uint8Array }>): boolean =>
  attachmentsTotalBytes(attachments) > MAX_EMAIL_TOTAL_ATTACHMENT_BYTES

export function tooLargeMessage(totalBytes: number): string {
  const megabytes = (totalBytes / 1_000_000).toFixed(1)
  return `The invoice and the two HIMARK welcome documents come to ${megabytes} MB together, which is too large to email in one message. Nothing was sent. For future documents, a lighter header image under Settings, Company details keeps the PDF small enough to email.`
}

/**
 * What the "Emails sent" record keeps of a welcome email: the message as it went, a blank line, "Attachments:" and one line per
 * file with its name, its size and its SHA-256, so the record shows which versions of the documents went out.
 */
export function welcomeRecordBody(text: string, attachments: ReadonlyArray<{ filename: string; content: Uint8Array }>): string {
  const lines = attachments.map((attachment) => `${attachment.filename.replace(/\s+/g, ' ').trim()} | ${attachment.content.length} bytes | sha256 ${sha256(attachment.content)}`)
  return [text, '', 'Attachments:', ...lines].join('\n')
}
