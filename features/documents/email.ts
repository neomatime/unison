// Shared by the email form, the email action and unit tests: no directive, no server-side imports, relative imports only.
import type { DocumentView } from './document-view.ts'

/** The most a PDF may weigh to be emailed: the whole message is base64 twice over, and the mail server takes about 4 MB. */
export const MAX_EMAIL_PDF_BYTES = 2_000_000
/** The most all the attachments of one message may weigh together (the HIMARK Welcome Email carries three PDFs): well under the mail server's 4 MB. */
export const MAX_EMAIL_TOTAL_ATTACHMENT_BYTES = 3_000_000
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

// C0 control characters other than tab and newline. A NUL in particular can make a send succeed and its record fail.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f]/g

/** Well-formed text without control characters: lone surrogates become U+FFFD, so the database accepts what the mail server did. */
const clean = (value: string) => value.replace(CONTROL, '').toWellFormed()

export function readEmailFields(form: FormData): EmailFields | { error: string } {
  const to = String(form.get('to') ?? '').trim()
  if (!isValidEmailAddress(to)) return { error: 'Enter one valid email address.' }
  const subject = clean(String(form.get('subject') ?? '').replace(/[\r\n]+/g, ' ')).trim()
  if (!subject) return { error: 'Enter a subject.' }
  if (subject.length > SUBJECT_MAX) return { error: `The subject is too long (${SUBJECT_MAX} characters at most).` }
  const body = clean(String(form.get('body') ?? '').replace(/\r\n/g, '\n')).trim()
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
