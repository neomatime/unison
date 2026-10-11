// Turns a DocumentView into a PDF: A4, the same content and order as the on-screen sheet. Written with
// createElement (no JSX) so node's test runner can load and render it. Text goes through pdfText so a character
// the standard font cannot draw becomes "?" instead of breaking the render.
import { createElement as h } from 'react'
import { Document, Font, Image, Page, Text, View, renderToBuffer, type Styles } from '@react-pdf/renderer'

import type { DocumentView } from '../document-view.ts'
import { allowLongRunsToWrap, pdfText } from './pdf-text.ts'

// The package does not export its Style type by name; Styles is a map of them.
type Style = Styles[string]

export type PdfImage = { data: Buffer; format: 'png' | 'jpg' }
export type PdfImages = { header: PdfImage | null; logo: PdfImage | null }

// A name or a number split across two lines reads as two different things, so words are never hyphenated.
Font.registerHyphenationCallback((word) => [word])
// A short value in a narrow column (a reference, an account number) breaks anywhere when it cannot fit, like the
// sheet's overflow-wrap: anywhere, rather than running off the page. Only words over 12 characters can break, and
// only when the line is too narrow for them.
const breakAnywhere = (word: string) => (word.length > 12 ? Array.from(word) : [word])
// A table row or a block is kept on one page only while it is short. Something taller than a page cannot be kept
// together, and asking for it makes react-pdf draw it over the next section and off the bottom of the page.
const KEEP_TOGETHER_CHARACTERS = 1200
const short = (...texts: Array<string | null | undefined>) => texts.reduce((total, text) => total + (text?.length ?? 0), 0) < KEEP_TOGETHER_CHARACTERS

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
      { style: s({ flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: mm(8) }) },
      h(Text, { style: s({ fontSize: 34, letterSpacing: 7.5 }) }, view.title),
      view.tagline ? h(Text, { style: s({ marginTop: 6, fontSize: 8, letterSpacing: 2.8, color: MUTED }) }, upper(view.tagline)) : null,
      h(View, { style: s({ marginTop: 14, width: mm(14), height: mm(0.6), backgroundColor: INK }) }),
    ),
    h(
      View,
      { style: s({ width: mm(70), flexShrink: 0, borderLeftWidth: 0.75, borderLeftColor: RULE, paddingLeft: mm(8) }) },
      ...view.details.map((row) =>
        h(
          View,
          { style: s({ flexDirection: 'row', marginBottom: 6 }) },
          h(Text, { style: s({ width: mm(26), flexShrink: 0, fontSize: 8, letterSpacing: 1.6, color: MUTED }) }, upper(row.label)),
          h(Text, { hyphenationCallback: breakAnywhere, style: s({ flexGrow: 1, flexShrink: 1, flexBasis: 0, fontSize: 8, letterSpacing: 0.8, fontFamily: 'Helvetica-Bold' }) }, upper(row.value)),
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
    head('Description', { flexGrow: 1, flexShrink: 1, flexBasis: 0 }),
    head('Qty', { width: COLUMN.qty, flexShrink: 0, textAlign: 'center' }),
    head(`Unit price (${view.currency})`, { width: COLUMN.unit, flexShrink: 0, textAlign: 'right' }),
    head(`Amount (${view.currency})`, { width: COLUMN.amount, flexShrink: 0, textAlign: 'right' }),
  )
  const rows = view.lines.map((line, index) =>
    h(
      View,
      { wrap: !short(line.title, line.description), style: s({ flexDirection: 'row', paddingVertical: mm(2), paddingHorizontal: mm(4), backgroundColor: index % 2 === 0 ? ZEBRA : WHITE }) },
      h(
        View,
        { style: s({ flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: mm(2) }) },
        h(Text, { style: s({ fontFamily: 'Helvetica-Bold' }) }, t(line.title)),
        line.description ? h(Text, { style: s({ marginTop: 2, fontSize: 9, color: MUTED }) }, t(line.description)) : null,
      ),
      h(Text, { style: s({ width: COLUMN.qty, flexShrink: 0, textAlign: 'center' }) }, line.quantity),
      h(Text, { style: s({ width: COLUMN.unit, flexShrink: 0, textAlign: 'right' }) }, line.unitPrice),
      h(Text, { style: s({ width: COLUMN.amount, flexShrink: 0, textAlign: 'right' }) }, line.amount),
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
        { style: s({ flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: mm(8) }) },
        h(View, { style: s({ width: mm(14), height: mm(0.6), backgroundColor: INK }) }),
        h(Text, { style: s({ marginTop: 8, fontSize: 8, letterSpacing: 2 }) }, upper(view.termsHeading)),
        ...view.terms.map((term, index) =>
          view.termsNumbered
            ? h(
                View,
                { style: s({ flexDirection: 'row', marginTop: 4 }) },
                h(Text, { style: s({ width: 16, flexShrink: 0, fontSize: 8.5 }) }, `${index + 1}.`),
                h(Text, { style: s({ flexGrow: 1, flexShrink: 1, flexBasis: 0, fontSize: 8.5 }) }, t(term)),
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
    { wrap: !short(...view.terms), style: s({ flexDirection: 'row', marginTop: mm(5), paddingHorizontal: mm(12) }) },
    terms,
    h(
      View,
      { style: s({ width: mm(78), flexShrink: 0 }) },
      totalRow('Subtotal', view.totals.subtotal, TOTAL_BG, INK, 9, 2.5),
      totalRow(view.totals.vatLabel, view.totals.vat, TOTAL_BG, INK, 9, 2.5),
      totalRow(`Total (${view.currency})`, view.totals.total, INK, WHITE, 13, 3.5),
    ),
  )
}

function bankAndClosing(view: DocumentView) {
  return h(
    View,
    { wrap: !short(view.from.name, ...view.bank.map((row) => row.value), ...(view.closing?.paragraphs ?? [])), style: s({ flexDirection: 'row', marginTop: mm(5), minHeight: mm(28) }) },
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
                h(Text, { style: s({ width: mm(26), flexShrink: 0, fontSize: 8.5, color: MUTED }) }, t(row.label)),
                h(Text, { hyphenationCallback: breakAnywhere, style: s({ flexGrow: 1, flexShrink: 1, flexBasis: 0, fontSize: 8.5 }) }, t(row.value)),
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
