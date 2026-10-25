// The three emails of a client's decision on a quotation: the confirmation code, the client's acknowledgement and the
// notice to the quote's owner.
//
// Pure: relative imports only, no '@/', no 'server-only', no directive, so `node --test` can load it.
//
// The same family as quoteEmailTemplate (lib/email/templates/quote.ts), in the same palette, but plainer: a single
// column, nested tables with role="presentation", inline styles and a bgcolor next to every CSS background (Outlook),
// and NO images, so there is nothing for a mail client to block. Everything the client reads (the sentences, the
// acknowledgement's subject and greeting, the code email's reference lines) is copy.ts's, never retyped here. What is
// written in this file is layout, the brand bar (the name and strapline, as in quoteEmailTemplate) and the labels of the
// owner's notice, which is staff mail.
//
// Every value that came from the client, or from a person on the quote, is cleaned and escaped. A single-line value
// loses its bidi and control characters, is collapsed to one line and is capped (sanitizeLine); it is escaped with
// escapeHtml in the body and left plain in the subject and the text part. The client's comments keep their line breaks:
// they are escaped first and their newlines turned into <br> afterwards, and in the text part every line is quoted with
// "> " so a comment can never pass for a line of the email itself.

import {
  CODE_EMAIL_LATEST_NOTE,
  CODE_EMAIL_SUBJECT,
  acknowledgementAccepted,
  acknowledgementDeclined,
  acknowledgementGreeting,
  acknowledgementSubject,
  codeEmailClientLine,
  codeEmailQuoteLine,
  codeEmailSentence,
  ownerNoticeTitle,
} from '../../../features/quote-portal/copy.ts'
import { COMMENTS_MAX } from '../../../features/quote-portal/decision.ts'
import type { DecisionKind } from '../../quote-portal/types.ts'
import type { EmailTemplate } from './invitation.ts'
import { assertSafeUrl, escapeHtml, sanitizeLine } from './safe.ts'

export type QuoteCodeEmailData = {
  /** Exactly six digits; anything else throws. The code is never repeated in an error. */
  code: string
  quoteNumber: string
  clientName: string | null
}

export type QuoteAcknowledgementEmailData = {
  decision: DecisionKind
  quoteNumber: string
  /** Already written for reading, in South African time ("20 October 2026"). */
  decidedOn: string
  ownerName: string | null
  signatoryName: string
}

export type QuoteOwnerNoticeEmailData = {
  decision: DecisionKind
  clientName: string
  quoteNumber: string
  signatoryName: string
  signatoryPosition: string
  /** Shown for a decline only. */
  declineReason: string | null
  /** Shown for a decline only; capped at COMMENTS_MAX characters, and the cap is stated in the email. */
  declineComments: string | null
  /** Where the owner opens the quotation: an absolute http(s) address, no whitespace. */
  quoteUrl: string
}

// Same palette as quoteEmailTemplate.
const NAVY = '#0d2340'
const ACCENT = '#1769aa'
const SOFT = '#edf3f8'
const BORDER = '#dce2e8'
const MUTED = '#6e7d8c'
const PAGE = '#f1f4f7'
const BODY = '#2b3a4b'
const STRAP = '#a9bdd3'
const WHITE = '#ffffff'

const SANS = 'Arial,Helvetica,sans-serif'
const SERIF = "Georgia,'Times New Roman',serif"
const MONO = "'Courier New',Courier,monospace"

const STRAPLINE = 'PEOPLE | STRATEGY | PROGRESS'

// The client's comments are cut to COMMENTS_MAX characters (features/quote-portal/decision.ts): the number the portal's
// own validator and the database allow.

// Owner-facing wording (the owner's notice is staff mail, not the client's). Nothing here is spliced with client text.
const OPEN_LABEL = 'OPEN QUOTATION'
const COMMENTS_SHORTENED = `[Comments shortened to the first ${COMMENTS_MAX} characters.]`

/** Longest quotation number kept anywhere in these emails (real ones are about 16 characters). */
const NUMBER_MAX = 60
/** Longest client name kept in a subject, so the quotation number after it always survives. */
const SUBJECT_NAME_MAX = 80

const SIX_DIGITS = /^\d{6}$/
// The Arabic letter mark, bidi marks, embeddings, overrides and isolates, and every control character except the
// whitespace ones that sanitizeLine already folds into a space (tab, line feed, vertical tab, form feed, carriage return).
// eslint-disable-next-line no-control-regex
const LINE_STRIP = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g
// The same for comments, which also keep their line feed (and tab).
// eslint-disable-next-line no-control-regex
const COMMENT_STRIP = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g
// eslint-disable-next-line no-control-regex
const URL_FORBIDDEN = /[\s\u0000-\u001f\u007f]/

/** The longest single-line value kept when a caller names no cap: sanitizeLine's own default. */
const LINE_MAX = 200

/**
 * A client-supplied single-line value: stripped of bidi and control characters, one line, trimmed and capped at
 * `maxLength` CHARACTERS, with an ellipsis after a cut. sanitizeLine counts UTF-16 units, so a cut by it can land between
 * the two halves of an emoji and leave a lone surrogate (which is not text: a mail library may refuse the subject or
 * print a replacement character). It is asked only to tidy the line, and the cap is applied here by characters.
 */
function line(value: string, maxLength = LINE_MAX): string {
  const tidy = sanitizeLine(value.replace(LINE_STRIP, ''), Number.POSITIVE_INFINITY)
  const characters = Array.from(tidy)
  return characters.length > maxLength ? `${characters.slice(0, maxLength).join('')}\u2026` : tidy
}

function assertDecision(decision: unknown, label: string): DecisionKind {
  // Never echoes the value: whatever it is, it is not one of the two this email knows how to word.
  if (decision !== 'accepted' && decision !== 'declined') throw new Error(`${label}: unexpected decision`)
  return decision
}

/** The owner's link to the quotation. The WHATWG parse and scheme check are assertSafeUrl's; whitespace is refused too (it would split the text part). */
function safeUrl(value: string): string {
  const label = 'quoteOwnerNoticeEmailTemplate: quoteUrl'
  if (typeof value !== 'string' || URL_FORBIDDEN.test(value)) throw new Error(`${label} is missing or contains whitespace or control characters`)
  try {
    return assertSafeUrl(value, label)
  } catch {
    throw new Error(`${label} is not an absolute http(s) URL`)
  }
}

/**
 * The comments as tidy text: line breaks are "\n", the control and bidi characters are gone, runs of blank lines are one
 * blank line, the ends are trimmed, and what is past COMMENTS_MAX characters (counted as characters, so an emoji is never
 * cut in half) is dropped, with `shortened` set so the email can say so. Null for nothing but whitespace.
 */
function tidyComments(value: string | null): { text: string; shortened: boolean } | null {
  if (!value) return null
  const text = value
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(COMMENT_STRIP, '')
    .replace(/[^\S\n]*\n[^\S\n]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!text) return null
  const characters = Array.from(text)
  if (characters.length <= COMMENTS_MAX) return { text, shortened: false }
  return { text: characters.slice(0, COMMENTS_MAX).join('').trimEnd(), shortened: true }
}

// ---------------------------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------------------------

/** A layout table: every one carries role="presentation" and zeroed spacing. */
function table(inner: string, options: { width?: string; cls?: string; bgcolor?: string; style?: string } = {}): string {
  const attrs = [
    'role="presentation"',
    ...(options.cls ? [`class="${options.cls}"`] : []),
    ...(options.width ? [`width="${options.width}"`] : []),
    'cellpadding="0"',
    'cellspacing="0"',
    'border="0"',
    ...(options.bgcolor ? [`bgcolor="${options.bgcolor}"`] : []),
    ...(options.style ? [`style="${options.style}"`] : []),
  ]
  return `<table ${attrs.join(' ')}>${inner}</table>`
}

const row = (cell: string) => `<tr>${cell}</tr>`
const fullWidth = { width: '100%', style: 'width:100%' }

function paragraph(html: string, style: string): string {
  return `<p style="margin:0;${style}">${html}</p>`
}

/** One block of the card: a row with its own space above it. */
const block = (html: string, top = 18) => row(`<td style="padding:${top}px 0 0 0">${html}</td>`)

/** The heading and the short accent rule under it. `text` is plain text. */
function heading(text: string): string {
  const rule = table(row(`<td width="40" height="2" bgcolor="${ACCENT}" style="width:40px;height:2px;background-color:${ACCENT};font-size:2px;line-height:2px">&nbsp;</td>`), { width: '40' })
  return (
    row(`<td><h1 style="margin:0;font-family:${SERIF};font-size:24px;line-height:32px;font-weight:bold;color:${NAVY};word-wrap:break-word">${escapeHtml(text)}</h1></td>`) +
    block(rule, 14)
  )
}

/** A body paragraph of the card. `text` is plain text. */
const bodyText = (text: string) => paragraph(escapeHtml(text), `font-family:${SANS};font-size:15px;line-height:24px;color:${BODY};word-wrap:break-word`)

/** A small muted line of reference ("Quote number: ..."). `text` is plain text. */
const reference = (text: string) => paragraph(escapeHtml(text), `font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED};word-wrap:break-word`)

/** A labelled value of the owner's notice. `valueHtml` is already escaped. */
function detail(label: string, valueHtml: string): string {
  return row(
    `<td width="120" valign="top" style="width:120px;padding:5px 12px 5px 0;font-family:${SANS};font-size:9px;line-height:18px;font-weight:bold;letter-spacing:0.16em;color:${MUTED}">${escapeHtml(label.toUpperCase())}</td>` +
      `<td valign="top" style="padding:5px 0;font-family:${SANS};font-size:14px;line-height:18px;font-weight:bold;color:${NAVY};word-wrap:break-word">${valueHtml}</td>`,
  )
}

const phoneCss = [
  '@media only screen and (max-width:620px){',
  '.container{width:100% !important}',
  '.pad{padding-left:20px !important;padding-right:20px !important}',
  '.strap{display:none !important}',
  '.btn-table{width:100% !important}',
  '.btn-cell{display:block !important;width:100% !important;box-sizing:border-box !important;text-align:center !important}',
  '.btn-cell a{display:block !important}',
  '}',
].join('\n')

/** The whole document: a navy bar naming HIMARK as text, then one white card holding `rows`. `subject` and `preheader` are plain text. */
function renderDocument(subject: string, preheader: string, rows: string): string {
  const preheaderHtml =
    `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${PAGE}">` +
    `${escapeHtml(preheader)}${'&zwnj;&nbsp;'.repeat(70)}</div>`

  const brandBar = row(
    `<td bgcolor="${NAVY}" style="background-color:${NAVY};padding:11px 32px" class="pad">` +
      table(
        row(
          `<td align="left" style="font-family:${SANS};font-size:11px;line-height:16px;font-weight:bold;letter-spacing:0.14em;color:${WHITE}">HIMARK</td>` +
            `<td class="strap" align="right" style="font-family:${SANS};font-size:10px;line-height:16px;letter-spacing:0.2em;color:${STRAP}">${STRAPLINE}</td>`,
        ),
        fullWidth,
      ) +
      '</td>',
  )

  const card = row(`<td bgcolor="${WHITE}" class="pad" style="background-color:${WHITE};padding:32px 32px 36px 32px">${table(rows, fullWidth)}</td>`)

  const container = table(brandBar + card, {
    cls: 'container',
    width: '600',
    bgcolor: WHITE,
    style: `width:100%;max-width:600px;margin:0 auto;background-color:${WHITE};border:1px solid ${BORDER}`,
  })

  return [
    '<!doctype html>',
    '<html lang="en" xmlns:o="urn:schemas-microsoft-com:office:office">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
    '<meta name="x-apple-disable-message-reformatting">',
    '<meta name="color-scheme" content="light only">',
    '<meta name="supported-color-schemes" content="light only">',
    `<title>${escapeHtml(subject)}</title>`,
    `<style>\n${phoneCss}\n</style>`,
    '</head>',
    `<body bgcolor="${PAGE}" style="margin:0;padding:0;background-color:${PAGE};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">`,
    preheaderHtml,
    table(
      row(
        `<td align="center" style="padding:24px 12px">` +
          '<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->' +
          container +
          '<!--[if mso]></td></tr></table><![endif]-->' +
          '</td>',
      ),
      { width: '100%', bgcolor: PAGE, style: `width:100%;background-color:${PAGE}` },
    ),
    '</body>',
    '</html>',
  ].join('\n')
}

// ---------------------------------------------------------------------------------------------------------------
// The confirmation code
// ---------------------------------------------------------------------------------------------------------------

/**
 * The email that carries a client's six-digit confirmation code. It has no link: the client already has the portal open
 * and types the code there. A code that is not exactly six digits throws, and the error never repeats it.
 */
export function quoteCodeEmailTemplate(data: QuoteCodeEmailData): EmailTemplate {
  if (typeof data.code !== 'string' || !SIX_DIGITS.test(data.code)) throw new Error('quoteCodeEmailTemplate: the code must be exactly six digits')
  const code = data.code
  const quoteNumber = line(data.quoteNumber, NUMBER_MAX)
  const clientName = data.clientName ? line(data.clientName) : ''
  const sentence = codeEmailSentence(code)

  const codeBlock = table(
    row(
      `<td align="center" bgcolor="${SOFT}" style="background-color:${SOFT};border:1px solid ${BORDER};border-radius:6px;padding:18px 12px;font-family:${MONO};font-size:36px;line-height:44px;font-weight:bold;letter-spacing:0.3em;color:${NAVY}">${code}</td>`,
    ),
    fullWidth,
  )

  const html = renderDocument(
    CODE_EMAIL_SUBJECT,
    sentence,
    heading(CODE_EMAIL_SUBJECT) +
      block(codeBlock, 22) +
      block(bodyText(sentence), 22) +
      block(bodyText(CODE_EMAIL_LATEST_NOTE), 8) +
      block(reference(codeEmailQuoteLine(quoteNumber)) + (clientName ? reference(codeEmailClientLine(clientName)) : ''), 22),
  )

  const text = [
    CODE_EMAIL_SUBJECT,
    '',
    sentence,
    '',
    CODE_EMAIL_LATEST_NOTE,
    '',
    codeEmailQuoteLine(quoteNumber),
    ...(clientName ? [codeEmailClientLine(clientName)] : []),
  ].join('\n')

  return { subject: CODE_EMAIL_SUBJECT, html, text }
}

// ---------------------------------------------------------------------------------------------------------------
// The client's acknowledgement
// ---------------------------------------------------------------------------------------------------------------

/** What the client receives once their decision is recorded. The greeting is the signatory's name; the sentence is the appendix's. */
export function quoteAcknowledgementEmailTemplate(data: QuoteAcknowledgementEmailData): EmailTemplate {
  const decision = assertDecision(data.decision, 'quoteAcknowledgementEmailTemplate')
  const quoteNumber = line(data.quoteNumber, NUMBER_MAX)
  const signatoryName = line(data.signatoryName)
  const sentence =
    decision === 'accepted'
      ? acknowledgementAccepted(quoteNumber, line(data.decidedOn), data.ownerName ? line(data.ownerName) || null : null)
      : acknowledgementDeclined(quoteNumber)
  const greeting = acknowledgementGreeting(signatoryName || null)
  const subject = acknowledgementSubject(quoteNumber)

  const html = renderDocument(subject, sentence, heading(subject) + block(bodyText(greeting), 22) + block(bodyText(sentence), 10))
  const text = [subject, '', greeting, '', sentence].join('\n')

  return { subject, html, text }
}

// ---------------------------------------------------------------------------------------------------------------
// The owner's notice
// ---------------------------------------------------------------------------------------------------------------

/**
 * What the quote's owner receives when a client decides: who decided, in what position and, for a decline, why. The
 * button opens the quotation in the app. The comments are the client's own words, so they sit in a quoted block.
 */
export function quoteOwnerNoticeEmailTemplate(data: QuoteOwnerNoticeEmailData): EmailTemplate {
  const decision = assertDecision(data.decision, 'quoteOwnerNoticeEmailTemplate')
  const quoteUrl = safeUrl(data.quoteUrl)
  const quoteNumber = line(data.quoteNumber, NUMBER_MAX)
  const clientName = line(data.clientName)
  const signatoryName = line(data.signatoryName)
  const signatoryPosition = line(data.signatoryPosition)
  const reason = decision === 'declined' && data.declineReason ? line(data.declineReason) : ''
  const comments = decision === 'declined' ? tidyComments(data.declineComments) : null

  // The subject keeps the client's name short so the number after it is never cut off; the body has the longer name. The
  // whole subject is capped by characters too, so a cut can never land in the middle of an emoji.
  const subject = line(ownerNoticeTitle(line(data.clientName, SUBJECT_NAME_MAX), decision, quoteNumber))
  const title = ownerNoticeTitle(clientName, decision, quoteNumber)

  const details = table(
    detail('Client', escapeHtml(clientName)) +
      detail('Quotation', escapeHtml(quoteNumber)) +
      detail('Signed by', escapeHtml(signatoryName)) +
      detail('Position', escapeHtml(signatoryPosition)) +
      (reason ? detail('Reason', escapeHtml(reason)) : ''),
    fullWidth,
  )

  const commentsHtml = comments
    ? table(
        row(
          `<td style="padding:5px 0 0 0;font-family:${SANS};font-size:9px;line-height:12px;font-weight:bold;letter-spacing:0.16em;color:${MUTED}">COMMENTS</td>`,
        ) +
          row(
            `<td bgcolor="${SOFT}" style="background-color:${SOFT};border-left:3px solid ${ACCENT};padding:12px 16px;font-family:${SANS};font-size:14px;line-height:22px;color:${BODY};word-wrap:break-word">` +
              `${escapeHtml(comments.text).replace(/\n/g, '<br>')}` +
              (comments.shortened ? `<br><br><span style="color:${MUTED}">${escapeHtml(COMMENTS_SHORTENED)}</span>` : '') +
              '</td>',
          ),
        fullWidth,
      )
    : ''

  const button = table(
    row(
      `<td class="btn-cell" bgcolor="${NAVY}" style="background-color:${NAVY};border-radius:4px;mso-padding-alt:14px 26px"><a href="${escapeHtml(quoteUrl)}" style="display:inline-block;padding:14px 26px;font-family:${SANS};font-size:13px;line-height:18px;font-weight:bold;letter-spacing:0.05em;white-space:nowrap;color:${WHITE};text-decoration:none;border-radius:4px">${OPEN_LABEL} &rarr;</a></td>`,
    ),
    { cls: 'btn-table' },
  )

  const html = renderDocument(
    subject,
    title,
    heading(title) + block(details, 20) + (commentsHtml ? block(commentsHtml, 12) : '') + block(button, 24),
  )

  const text = [
    title,
    '',
    `Client: ${clientName}`,
    `Quotation: ${quoteNumber}`,
    `Signed by: ${signatoryName}`,
    `Position: ${signatoryPosition}`,
    ...(reason ? [`Reason: ${reason}`] : []),
    ...(comments
      ? ['', 'Comments:', ...comments.text.split('\n').map((commentLine) => `> ${commentLine}`), ...(comments.shortened ? ['', COMMENTS_SHORTENED] : [])]
      : []),
    '',
    'Open the quotation:',
    quoteUrl,
  ].join('\n')

  return { subject, html, text }
}
