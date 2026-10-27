// The email a client receives with the first invoice of their billing plan, in place of the plain invoice email.
//
// Pure: relative imports only, no '@/', no 'server-only', no directive, so `node --test` can load it.
//
// The words are the owner's approved text and live in features/documents/welcome-email-copy.ts; this file only lays them out.
// The layout is the quotation email's (lib/email/templates/quote.ts) and follows it on purpose: nested tables with
// role="presentation", inline styles, a bgcolor attribute next to every CSS background (Outlook's Word engine ignores some CSS
// backgrounds), a 600 px ghost table for Outlook, no scripts, no web fonts, no external CSS, no flex, grid, float or
// positioning. The only <style> block is an optional phone media query; a client that drops it still gets a complete, readable
// email. It has no link and no button: the documents are attachments, so there is nothing to click and nothing to forge.
//
// The contact name is the only value that is not fixed text. It is collapsed to one line and capped first, and escaped in the
// HTML. The address the two pictures load from is validated as an absolute http(s) URL and throws otherwise: a broken picture
// address inside a HIMARK email is a bug to surface at send time, not to ship.

import {
  WELCOME_ATTACHED,
  WELCOME_DEFAULT_NAME,
  WELCOME_DOCUMENT_LIST,
  WELCOME_EMAIL_SUBJECT,
  WELCOME_LINE,
  WELCOME_NEXT_HEADING,
  WELCOME_NEXT_PARAGRAPHS,
  WELCOME_PARAGRAPHS,
  WELCOME_SIGN_OFF,
  WELCOME_STRAPLINE,
  WELCOME_WORDMARK_ALT,
  welcomeGreeting,
} from '../../../features/documents/welcome-email-copy.ts'
import type { EmailTemplate } from './invitation.ts'
import { assertSafeUrl, escapeHtml, sanitizeLine } from './safe.ts'

export type WelcomeEmailData = {
  /** The invoice's contact name; null, blank or missing gives the approved default greeting. */
  recipientName: string | null | undefined
  /** Where the two pictures load from (the app's public address). */
  assetBaseUrl: string
}

// The colours of the quotation email, and no others. PAGE is the pale page behind the card, CARD the tint of the document list.
const NAVY = '#0d2340'
const ACCENT = '#1769aa'
const BORDER = '#dce2e8'
const MUTED = '#6e7d8c'
const PAGE = '#f1f4f7'
const CARD = '#f7f9fb'
const BODY = '#2b3a4b'
const STRAP = '#a9bdd3'
const WHITE = '#ffffff'
const BANNER_BACKDROP = '#dbe8f4'

const SANS = 'Arial,Helvetica,sans-serif'
const SERIF = "Georgia,'Times New Roman',serif"

const WORDMARK_PATH = '/brand/email-wordmark.png'
const BANNER_PATH = '/brand/email-banner.jpg'
// Display sizes. The files are 480 and 1200 px wide, so they stay sharp on high-density screens.
const WORDMARK_SIZE = { width: 170, height: 24 }
const BANNER_SIZE = { width: 600, height: 223 }

// eslint-disable-next-line no-control-regex
const URL_FORBIDDEN = /[\s\u0000-\u001f\u007f]/

/**
 * A URL a browser will load. The WHATWG parse and scheme check are assertSafeUrl's; on top of that, whitespace and control
 * characters are refused, and the error never repeats the value.
 */
function safeUrl(value: string, label: string): string {
  if (URL_FORBIDDEN.test(value)) throw new Error(`welcomeEmailTemplate: ${label} contains whitespace or control characters`)
  try {
    return assertSafeUrl(value, `welcomeEmailTemplate: ${label}`)
  } catch {
    throw new Error(`welcomeEmailTemplate: ${label} is not an absolute http(s) URL`)
  }
}

/** The scheme, host and any path of the asset base; never its credentials, query or fragment, and no trailing slash. */
function assetBase(value: string): string {
  const parsed = new URL(safeUrl(value, 'assetBaseUrl'))
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
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

const phoneCss = [
  '@media only screen and (max-width:620px){',
  '.container{width:100% !important}',
  '.pad{padding-left:20px !important;padding-right:20px !important}',
  '.strap{display:none !important}',
  '.title{font-size:22px !important;line-height:30px !important}',
  '}',
].join('\n')

/** The first sentence of a paragraph, with its full stop: the hidden preview line uses approved words only. */
const firstSentence = (text: string) => (text.indexOf('. ') > -1 ? text.slice(0, text.indexOf('. ') + 1) : text)

export function welcomeEmailTemplate(data: WelcomeEmailData): EmailTemplate {
  const base = assetBase(data.assetBaseUrl)
  const subject = sanitizeLine(WELCOME_EMAIL_SUBJECT)
  const name = sanitizeLine(typeof data.recipientName === 'string' ? data.recipientName : '') || WELCOME_DEFAULT_NAME
  const greeting = welcomeGreeting(name)
  const { closing, name: team, company, tagline } = WELCOME_SIGN_OFF

  // ---- HTML -------------------------------------------------------------------------------------------------------

  const preheader =
    `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${PAGE}">` +
    `${escapeHtml(WELCOME_LINE)} ${escapeHtml(firstSentence(WELCOME_PARAGRAPHS[0]))}` +
    '&zwnj;&nbsp;'.repeat(70) +
    '</div>'

  // The navy bar is plain text on a navy cell, so with images blocked the header is still a branded block.
  const brandBar = row(
    `<td id="brand-bar" bgcolor="${NAVY}" style="background-color:${NAVY};padding:11px 32px" class="pad">` +
      table(
        row(
          `<td align="left" style="font-family:${SANS};font-size:11px;line-height:16px;font-weight:bold;letter-spacing:0.14em;color:${WHITE}">${escapeHtml(company)}</td>` +
            `<td class="strap" align="right" style="font-family:${SANS};font-size:10px;line-height:16px;letter-spacing:0.2em;color:${STRAP}">${escapeHtml(WELCOME_STRAPLINE)}</td>`,
        ),
        { width: '100%', style: 'width:100%' },
      ) +
      '</td>',
  )

  const logoRow = row(
    `<td bgcolor="${WHITE}" class="pad" style="background-color:${WHITE};padding:22px 32px 20px 32px">` +
      `<img src="${escapeHtml(`${base}${WORDMARK_PATH}`)}" alt="${escapeHtml(WELCOME_WORDMARK_ALT)}" width="${WORDMARK_SIZE.width}" height="${WORDMARK_SIZE.height}" ` +
      `style="display:block;border:0;outline:none;text-decoration:none;width:${WORDMARK_SIZE.width}px;height:auto;font-family:${SANS};font-size:18px;line-height:24px;font-weight:bold;letter-spacing:0.2em;color:${NAVY}">` +
      '</td>',
  )

  const bannerRow = row(
    `<td bgcolor="${BANNER_BACKDROP}" style="background-color:${BANNER_BACKDROP}">` +
      `<img src="${escapeHtml(`${base}${BANNER_PATH}`)}" alt="${escapeHtml(company)}" width="${BANNER_SIZE.width}" height="${BANNER_SIZE.height}" ` +
      `style="display:block;border:0;outline:none;text-decoration:none;width:100%;max-width:${BANNER_SIZE.width}px;height:auto;font-family:${SANS};font-size:14px;line-height:20px;color:${NAVY}">` +
      '</td>',
  )

  const body = (html: string, extra = '') => paragraph(html, `font-family:${SANS};font-size:15px;line-height:26px;color:${BODY};word-wrap:break-word;${extra}`)

  const accentRule = table(
    row(`<td width="40" height="2" bgcolor="${ACCENT}" style="width:40px;height:2px;background-color:${ACCENT};font-size:2px;line-height:2px">&nbsp;</td>`),
    { width: '40' },
  )

  // The numbered list: the number in its own cell, the bold title and its one sentence beside it, a hairline between items.
  const listRows = WELCOME_DOCUMENT_LIST.map((item, index) => {
    const edge = index === 0 ? '' : `border-top:1px solid ${BORDER};`
    return row(
      `<td width="34" valign="top" style="width:34px;${edge}padding:16px 0 16px 18px;font-family:${SERIF};font-size:17px;line-height:24px;font-weight:bold;color:${ACCENT}">${index + 1}.</td>` +
        `<td valign="top" style="${edge}padding:16px 18px 16px 6px">` +
        paragraph(`<strong style="font-weight:bold">${escapeHtml(item.title)}</strong>`, `font-family:${SANS};font-size:15px;line-height:24px;color:${NAVY}`) +
        paragraph(escapeHtml(item.sentence), `font-family:${SANS};font-size:14px;line-height:22px;color:${BODY};padding-top:2px`) +
        '</td>',
    )
  }).join('')
  const list = table(listRows, { width: '100%', bgcolor: CARD, style: `width:100%;background-color:${CARD};border:1px solid ${BORDER};border-radius:6px` })

  const nextHtml = WELCOME_NEXT_PARAGRAPHS.map((text) => body(escapeHtml(text), 'padding-bottom:14px')).join('')

  const signOff = [
    paragraph(escapeHtml(closing), `font-family:${SANS};font-size:15px;line-height:24px;color:${BODY};padding-bottom:4px`),
    paragraph(`<strong style="font-weight:bold">${escapeHtml(team)}</strong>`, `font-family:${SANS};font-size:15px;line-height:24px;color:${NAVY}`),
    paragraph(escapeHtml(company), `font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED}`),
    paragraph(`<em style="font-style:italic">${escapeHtml(tagline)}</em>`, `font-family:${SANS};font-size:13px;line-height:20px;font-style:italic;color:${ACCENT}`),
  ].join('')

  const content = row(
    `<td bgcolor="${WHITE}" class="pad" style="background-color:${WHITE};padding:40px 32px 44px 32px">` +
      table(
        row(`<td>${body(escapeHtml(greeting))}</td>`) +
          row(
            `<td style="padding:18px 0 0 0"><h1 class="title" style="margin:0;font-family:${SERIF};font-size:24px;line-height:32px;font-weight:bold;color:${NAVY}">${escapeHtml(WELCOME_LINE)}</h1></td>`,
          ) +
          row(`<td style="padding:14px 0 0 0">${accentRule}</td>`) +
          row(`<td style="padding:20px 0 0 0">${WELCOME_PARAGRAPHS.map((text) => body(escapeHtml(text), 'padding-bottom:14px')).join('')}</td>`) +
          row(`<td style="padding:6px 0 0 0">${body(escapeHtml(WELCOME_ATTACHED))}</td>`) +
          row(`<td style="padding:14px 0 0 0">${list}</td>`) +
          row(
            `<td style="padding:34px 0 0 0"><h2 style="margin:0;font-family:${SERIF};font-size:19px;line-height:28px;font-weight:bold;color:${NAVY}">${escapeHtml(WELCOME_NEXT_HEADING)}</h2></td>`,
          ) +
          row(`<td style="padding:12px 0 0 0">${nextHtml}</td>`) +
          row(`<td style="padding:18px 0 0 0">${signOff}</td>`),
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
    `<title>${escapeHtml(subject)}</title>`,
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

  // ---- Plain text -------------------------------------------------------------------------------------------------
  // The same words in a readable layout. The name is one line (sanitizeLine), so it cannot start a line of its own and pass
  // for a block of the email; nothing in the text is escaped.

  const text = [
    greeting,
    '',
    WELCOME_LINE,
    '',
    ...WELCOME_PARAGRAPHS.flatMap((paragraphText) => [paragraphText, '']),
    WELCOME_ATTACHED,
    '',
    ...WELCOME_DOCUMENT_LIST.flatMap((item, index) => [`${index + 1}. ${item.title}`, `   ${item.sentence}`, '']),
    WELCOME_NEXT_HEADING,
    '',
    ...WELCOME_NEXT_PARAGRAPHS.flatMap((paragraphText) => [paragraphText, '']),
    closing,
    team,
    company,
    tagline,
  ].join('\n')

  return { subject, html, text }
}
