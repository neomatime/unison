// The email a client receives when a quotation is sent with the secure link switched on.
//
// Pure: relative imports only, no '@/', no 'server-only', no directive, so `node --test` can load it.
//
// Built for mail clients, not browsers: nested tables with role="presentation", inline styles, bgcolor
// attributes next to every CSS background (Outlook's Word engine ignores some CSS backgrounds), a 600 px
// ghost table for Outlook, no scripts, no web fonts, no external CSS, no flex, grid, float or positioning.
// The only <style> block is an optional phone media query; a client that drops it still gets a complete,
// readable email.
//
// Every value that came from the database or from the person who sent the quote is escaped, and single-line
// values are collapsed to one line first. The two links the client is meant to click, and the address the images
// load from, are validated as absolute http(s) URLs and throw otherwise: a dead or hostile button inside a
// HIMARK email is a bug to surface at send time, not to ship.

import { EMAIL_DEFAULT_NOTE, EMAIL_HEADING, EMAIL_NEXT_STEPS } from '../../../features/quote-portal/copy.ts'
import type { EmailTemplate } from './invitation.ts'
import { assertSafeUrl, escapeHtml, sanitizeLine } from './safe.ts'

export type QuoteEmailData = {
  quoteNumber: string
  clientName: string
  projectName: string | null
  totalLabel: string
  vatNote: string
  validUntil: string | null
  statusLabel: string
  recipientName: string | null
  personalNote: string
  reviewUrl: string
  pdfUrl: string
  assetBaseUrl: string
  sender: {
    name: string
    role: string | null
    company: string
    website: string | null
    email: string | null
    phone: string | null
  }
}

// Colours of the reference email. PAGE, CARD, BODY, AMBER and the outline-button border are the only additions:
// the pale page behind the card, the card's own tint, body text, the "awaiting" pill and a grey for the outline.
const NAVY = '#0d2340'
const ACCENT = '#1769aa'
const SOFT = '#edf3f8'
const BORDER = '#dce2e8'
const MUTED = '#6e7d8c'
const PAGE = '#f1f4f7'
const CARD = '#f7f9fb'
const BODY = '#2b3a4b'
const AMBER_BG = '#fdf0d5'
const AMBER_TEXT = '#8a5a0a'
const OUTLINE = '#b7c3cf'
const STRAP = '#a9bdd3'
const WHITE = '#ffffff'

const SANS = 'Arial,Helvetica,sans-serif'
const SERIF = "Georgia,'Times New Roman',serif"

const STRAPLINE = 'PEOPLE | STRATEGY | PROGRESS'
const REVIEW_LABEL = 'REVIEW QUOTATION'
const DOWNLOAD_LABEL = 'DOWNLOAD PDF'
const WORDMARK_PATH = '/brand/email-wordmark.png'
const BANNER_PATH = '/brand/email-banner.jpg'
// Display sizes. The files are 480 and 1200 px wide, so they stay sharp on high-density screens.
const WORDMARK_SIZE = { width: 170, height: 24 }
const BANNER_SIZE = { width: 600, height: 223 }

const EMAIL_ADDRESS = /^[^\s@<>"'()\\,;:]+@[^\s@<>"'()\\,;:]+\.[^\s@<>"'()\\,;:]+$/
// eslint-disable-next-line no-control-regex
const URL_FORBIDDEN = /[\s\u0000-\u001f\u007f]/
// eslint-disable-next-line no-control-regex
const NOTE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

const line = (value: string) => sanitizeLine(value)

/**
 * A URL the client will click or a browser will load. The WHATWG parse and scheme check are assertSafeUrl's;
 * on top of that, whitespace and control characters are refused (a line break would split the text alternative),
 * and the error never repeats the value, because the review link carries the client's secret token.
 */
function safeUrl(value: string, label: string): string {
  if (URL_FORBIDDEN.test(value)) throw new Error(`quoteEmailTemplate: ${label} contains whitespace or control characters`)
  try {
    return assertSafeUrl(value, `quoteEmailTemplate: ${label}`)
  } catch {
    throw new Error(`quoteEmailTemplate: ${label} is not an absolute http(s) URL`)
  }
}

/** The scheme, host and any path of the asset base; never its credentials, query or fragment, and no trailing slash. */
function assetBase(value: string): string {
  const parsed = new URL(safeUrl(value, 'assetBaseUrl'))
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
}

/**
 * The company website from the company details, which is free text ("www.himark.co.za"). It is decoration, so a
 * value that cannot be made into a safe http(s) link is left out rather than failing the whole send.
 */
function website(value: string | null): { text: string; href: string } | null {
  const text = value ? line(value) : ''
  if (!text) return null
  const href = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  if (URL_FORBIDDEN.test(href)) return null
  try {
    assertSafeUrl(href, 'website')
  } catch {
    return null
  }
  return { text, href }
}

/** The note as paragraphs: blank lines separate them, single newlines stay inside one. Never empty. */
function noteParagraphs(note: string): string[] {
  const paragraphs = note
    .replace(/\r\n?/g, '\n')
    .replace(NOTE_CONTROL, '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.split('\n').map((row) => row.trim()).join('\n').trim())
    .filter(Boolean)
  return paragraphs.length > 0 ? paragraphs : [EMAIL_DEFAULT_NOTE]
}

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

function paragraph(html: string, style: string): string {
  return `<p style="margin:0;${style}">${html}</p>`
}

type SummaryCell = { label: string; weight: number; render: () => string }

const phoneCss = [
  '@media only screen and (max-width:620px){',
  '.container{width:100% !important}',
  '.pad{padding-left:20px !important;padding-right:20px !important}',
  '.strap{display:none !important}',
  `.sum-cell{display:block !important;width:100% !important;box-sizing:border-box !important;padding-left:14px !important;padding-right:14px !important;border-left:0 !important;border-top:1px solid ${BORDER} !important}`,
  '.sum-first{border-top:0 !important}',
  '.btn-table{width:100% !important}',
  '.btn-cell{display:block !important;width:100% !important;box-sizing:border-box !important;text-align:center !important}',
  '.btn-cell a{display:block !important}',
  '.btn-gap{display:block !important;width:100% !important;height:10px !important;font-size:0 !important;line-height:0 !important}',
  '}',
].join('\n')

export function quoteEmailTemplate(data: QuoteEmailData, subject: string): EmailTemplate {
  const reviewUrl = safeUrl(data.reviewUrl, 'reviewUrl')
  const pdfUrl = safeUrl(data.pdfUrl, 'pdfUrl')
  const base = assetBase(data.assetBaseUrl)
  const cleanSubject = sanitizeLine(subject)

  const quoteNumber = line(data.quoteNumber)
  const clientName = line(data.clientName)
  const projectName = data.projectName ? line(data.projectName) : ''
  const totalLabel = line(data.totalLabel)
  const vatNote = line(data.vatNote)
  const validUntil = data.validUntil ? line(data.validUntil) : ''
  const statusLabel = line(data.statusLabel)
  const recipientName = data.recipientName ? line(data.recipientName) : ''
  const senderName = line(data.sender.name)
  const senderRole = data.sender.role ? line(data.sender.role) : ''
  const company = line(data.sender.company) || 'HIMARK'
  const senderWebsite = website(data.sender.website)
  const senderEmail = data.sender.email ? line(data.sender.email) : ''
  const senderPhone = data.sender.phone ? line(data.sender.phone) : ''

  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,'
  const paragraphs = noteParagraphs(data.personalNote)

  // ---- HTML ---------------------------------------------------------------------------------------------------

  const preheader =
    `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${PAGE}">` +
    `${escapeHtml(EMAIL_HEADING)}. ${escapeHtml(quoteNumber)} for ${escapeHtml(clientName)}.` +
    '&zwnj;&nbsp;'.repeat(70) +
    '</div>'

  // The navy block. It is plain text on a navy cell, so with images blocked the header is still a branded block.
  const brandBar = row(
    `<td id="brand-bar" bgcolor="${NAVY}" style="background-color:${NAVY};padding:11px 32px" class="pad">` +
      table(
        row(
          `<td align="left" style="font-family:${SANS};font-size:11px;line-height:16px;font-weight:bold;letter-spacing:0.14em;color:${WHITE}">${escapeHtml(company)}</td>` +
            `<td class="strap" align="right" style="font-family:${SANS};font-size:10px;line-height:16px;letter-spacing:0.2em;color:${STRAP}">${STRAPLINE}</td>`,
        ),
        { width: '100%', style: 'width:100%' },
      ) +
      '</td>',
  )

  const logoRow = row(
    `<td bgcolor="${WHITE}" class="pad" style="background-color:${WHITE};padding:22px 32px 20px 32px">` +
      `<img src="${escapeHtml(`${base}${WORDMARK_PATH}`)}" alt="HIMARK" width="${WORDMARK_SIZE.width}" height="${WORDMARK_SIZE.height}" ` +
      `style="display:block;border:0;outline:none;text-decoration:none;width:${WORDMARK_SIZE.width}px;height:auto;font-family:${SANS};font-size:18px;line-height:24px;font-weight:bold;letter-spacing:0.2em;color:${NAVY}">` +
      '</td>',
  )

  const bannerRow = row(
    `<td bgcolor="#dbe8f4" style="background-color:#dbe8f4">` +
      `<img src="${escapeHtml(`${base}${BANNER_PATH}`)}" alt="${escapeHtml(company)}" width="${BANNER_SIZE.width}" height="${BANNER_SIZE.height}" ` +
      `style="display:block;border:0;outline:none;text-decoration:none;width:100%;max-width:${BANNER_SIZE.width}px;height:auto;font-family:${SANS};font-size:14px;line-height:20px;color:${NAVY}">` +
      '</td>',
  )

  const label = (text: string) =>
    paragraph(text, `font-family:${SANS};font-size:9px;line-height:12px;font-weight:bold;letter-spacing:0.16em;color:${MUTED};padding-bottom:6px`)
  const value = (html: string) => paragraph(html, `font-family:${SANS};font-size:12px;line-height:17px;font-weight:bold;color:${NAVY};word-wrap:break-word`)

  const summaryCells: SummaryCell[] = [
    { label: 'QUOTE NUMBER', weight: 25, render: () => value(escapeHtml(quoteNumber)) },
    ...(projectName ? [{ label: 'PROJECT', weight: 18, render: () => value(escapeHtml(projectName)) }] : []),
    {
      label: 'AMOUNT',
      weight: 22,
      render: () =>
        value(escapeHtml(totalLabel)) +
        (vatNote ? paragraph(escapeHtml(vatNote), `font-family:${SANS};font-size:11px;line-height:16px;color:${MUTED};padding-top:2px`) : ''),
    },
    ...(validUntil ? [{ label: 'VALID UNTIL', weight: 17, render: () => value(escapeHtml(validUntil)) }] : []),
    ...(statusLabel
      ? [{
          label: 'STATUS',
          weight: 18,
          render: () =>
            table(
              row(
                `<td bgcolor="${AMBER_BG}" style="background-color:${AMBER_BG};border-radius:12px;padding:4px 9px;font-family:${SANS};font-size:11px;line-height:15px;font-weight:bold;color:${AMBER_TEXT}">${escapeHtml(statusLabel)}</td>`,
              ),
            ),
        }]
      : []),
  ]
  const weightTotal = summaryCells.reduce((sum, cell) => sum + cell.weight, 0)
  const summary = table(
    `<tr id="summary-row">${summaryCells
      .map((cell, index) => {
        const first = index === 0
        const last = index === summaryCells.length - 1
        const padding = `14px ${last ? 14 : 8}px 14px ${first ? 14 : 10}px`
        return (
          `<td class="sum-cell${first ? ' sum-first' : ''}" width="${Math.round((cell.weight / weightTotal) * 100)}%" valign="top" ` +
          `style="padding:${padding};${first ? '' : `border-left:1px solid ${BORDER};`}">${label(cell.label)}${cell.render()}</td>`
        )
      })
      .join('')}</tr>`,
    { width: '100%', bgcolor: CARD, style: `width:100%;background-color:${CARD};border:1px solid ${BORDER};border-radius:6px` },
  )

  // Bulletproof buttons: the colour lives on the table cell (bgcolor for Outlook), the padded block-level link
  // inside gives every other client a full-size tap target, and mso-padding-alt gives Outlook the same padding.
  const buttonStyle = (colour: string) =>
    `display:inline-block;padding:14px 26px;font-family:${SANS};font-size:13px;line-height:18px;font-weight:bold;letter-spacing:0.05em;white-space:nowrap;color:${colour};text-decoration:none;border-radius:4px`
  const buttons = table(
    row(
      `<td class="btn-cell" bgcolor="${NAVY}" style="background-color:${NAVY};border-radius:4px;mso-padding-alt:14px 26px"><a href="${escapeHtml(reviewUrl)}" style="${buttonStyle(WHITE)}">${REVIEW_LABEL} →</a></td>` +
        `<td class="btn-gap" width="12" style="width:12px;font-size:0;line-height:0">&nbsp;</td>` +
        `<td class="btn-cell" bgcolor="${WHITE}" style="background-color:${WHITE};border:1px solid ${OUTLINE};border-radius:4px;mso-padding-alt:13px 25px"><a href="${escapeHtml(pdfUrl)}" style="${buttonStyle(NAVY)}">${DOWNLOAD_LABEL}</a></td>`,
    ),
    { cls: 'btn-table' },
  )

  const nextSteps = table(
    row(
      `<td bgcolor="${SOFT}" style="background-color:${SOFT};border-radius:6px;padding:14px 18px;font-family:${SANS};font-size:13px;line-height:20px;color:${NAVY}">${escapeHtml(EMAIL_NEXT_STEPS)}</td>`,
    ),
    { width: '100%', style: 'width:100%' },
  )

  const emailLine = senderEmail
    ? EMAIL_ADDRESS.test(senderEmail)
      ? `<a href="mailto:${escapeHtml(senderEmail)}" style="color:${ACCENT};text-decoration:none">${escapeHtml(senderEmail)}</a>`
      : escapeHtml(senderEmail)
    : ''
  const signOff = [
    paragraph('Kind regards,', `font-family:${SANS};font-size:14px;line-height:20px;color:${BODY};padding-bottom:4px`),
    senderName ? paragraph(escapeHtml(senderName), `font-family:${SANS};font-size:15px;line-height:22px;font-weight:bold;color:${NAVY}`) : '',
    senderRole ? paragraph(escapeHtml(senderRole), `font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED}`) : '',
    paragraph(escapeHtml(company), `font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED}`),
    senderWebsite
      ? paragraph(`<a href="${escapeHtml(senderWebsite.href)}" style="color:${ACCENT};text-decoration:underline">${escapeHtml(senderWebsite.text)}</a>`, `font-family:${SANS};font-size:13px;line-height:20px`)
      : '',
    emailLine ? paragraph(emailLine, `font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED}`) : '',
    senderPhone ? paragraph(escapeHtml(senderPhone), `font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED}`) : '',
  ].join('')

  const accentRule = table(
    row(`<td width="40" height="2" bgcolor="${ACCENT}" style="width:40px;height:2px;background-color:${ACCENT};font-size:2px;line-height:2px">&nbsp;</td>`),
    { width: '40' },
  )

  const noteHtml = paragraphs
    .map((text) => paragraph(escapeHtml(text).replace(/\n/g, '<br>'), `font-family:${SANS};font-size:15px;line-height:24px;color:${BODY};padding-bottom:12px;word-wrap:break-word`))
    .join('')

  const content = row(
    `<td bgcolor="${WHITE}" class="pad" style="background-color:${WHITE};padding:32px 32px 36px 32px">` +
      table(
        row(
          `<td><h1 style="margin:0;font-family:${SERIF};font-size:26px;line-height:34px;font-weight:bold;color:${NAVY}">${escapeHtml(EMAIL_HEADING)}</h1></td>`,
        ) +
          row(`<td style="padding:14px 0 0 0">${accentRule}</td>`) +
          row(
            `<td style="padding:22px 0 0 0">${paragraph(escapeHtml(greeting), `font-family:${SANS};font-size:15px;line-height:24px;color:${BODY};padding-bottom:8px`)}${noteHtml}</td>`,
          ) +
          row(`<td style="padding:10px 0 0 0">${summary}</td>`) +
          row(`<td style="padding:22px 0 0 0">${buttons}</td>`) +
          row(`<td style="padding:22px 0 0 0">${nextSteps}</td>`) +
          row(`<td style="padding:26px 0 0 0">${signOff}</td>`),
        { width: '100%', style: 'width:100%' },
      ) +
      '</td>',
  )

  const container = table(brandBar + logoRow + bannerRow + content, {
    cls: 'container',
    width: '600',
    bgcolor: WHITE,
    style: `width:100%;max-width:600px;margin:0 auto;background-color:${WHITE};border:1px solid ${BORDER}`,
  })

  const html = [
    '<!doctype html>',
    '<html lang="en" xmlns:o="urn:schemas-microsoft-com:office:office">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
    '<meta name="x-apple-disable-message-reformatting">',
    '<meta name="color-scheme" content="light only">',
    '<meta name="supported-color-schemes" content="light only">',
    `<title>${escapeHtml(cleanSubject)}</title>`,
    '<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->',
    `<style>\n${phoneCss}\n</style>`,
    '</head>',
    `<body bgcolor="${PAGE}" style="margin:0;padding:0;background-color:${PAGE};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">`,
    preheader,
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

  // ---- Plain text -----------------------------------------------------------------------------------------------
  // Names are single lines (sanitizeLine), so none of them can start a line of their own and pass for a block of
  // the email. The note is the sender's own message: paragraphs and line breaks are kept, nothing is escaped.

  const text = [
    EMAIL_HEADING,
    '',
    greeting,
    '',
    paragraphs.join('\n\n'),
    '',
    `Quote number: ${quoteNumber}`,
    `Client: ${clientName}`,
    ...(projectName ? [`Project: ${projectName}`] : []),
    `Amount: ${totalLabel}${vatNote ? ` (${vatNote})` : ''}`,
    ...(validUntil ? [`Valid until: ${validUntil}`] : []),
    ...(statusLabel ? [`Status: ${statusLabel}`] : []),
    '',
    'Review quotation:',
    reviewUrl,
    '',
    'Download PDF:',
    pdfUrl,
    '',
    EMAIL_NEXT_STEPS,
    '',
    'Kind regards,',
    ...(senderName ? [senderName] : []),
    ...(senderRole ? [senderRole] : []),
    company,
    ...(senderWebsite ? [senderWebsite.text] : []),
    ...(senderEmail ? [senderEmail] : []),
    ...(senderPhone ? [senderPhone] : []),
  ].join('\n')

  return { subject: cleanSubject, html, text }
}
