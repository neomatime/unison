import { inflateSync } from 'node:zlib'

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFObject } from 'pdf-lib'

// The text drawn on each page of a PDF, for tests. A standard font (Helvetica) writes its text as plain bytes; an
// embedded font (Carlito) writes glyph numbers, which only mean letters through the font's ToUnicode table. This reads
// both, so a test can still ask "does the page say X".

function streamText(doc: PDFDocument, object: PDFObject | undefined): string {
  if (!object) return ''
  const stream = doc.context.lookup(object) as PDFRawStream
  const raw = Buffer.from(stream.contents)
  return (stream.dict.get(PDFName.of('Filter')) ? inflateSync(raw) : raw).toString('latin1')
}

/** Reads the bfchar and bfrange entries of a ToUnicode table into a map from glyph number to text. */
function readToUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>()
  const text = (hex: string) => (hex.replace(/\s+/g, '').match(/.{1,4}/g) ?? []).map((unit) => String.fromCharCode(parseInt(unit, 16))).join('')
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const entry of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F\s]+)>/g)) map.set(parseInt(entry[1], 16), text(entry[2]))
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const entry of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F\s]+>|\[[^\]]*\])/g)) {
      const low = parseInt(entry[1], 16)
      const high = parseInt(entry[2], 16)
      if (entry[3].startsWith('[')) {
        // A ligature (the "ti" in Consulting) is one glyph with two letters inside its brackets, so spaces are allowed.
        const targets = [...entry[3].matchAll(/<([0-9a-fA-F\s]+)>/g)].map((match) => match[1])
        for (let code = low; code <= high; code += 1) map.set(code, text(targets[code - low] ?? ''))
      } else {
        const start = parseInt(entry[3].slice(1, -1).replace(/\s+/g, ''), 16)
        for (let code = low; code <= high; code += 1) map.set(code, String.fromCodePoint(start + (code - low)))
      }
    }
  }
  return map
}

export async function pdfPageTexts(pdf: Buffer): Promise<string[]> {
  const doc = await PDFDocument.load(pdf)
  return doc.getPages().map((page) => {
    const resources = page.node.Resources()
    const fonts = resources?.lookup(PDFName.of('Font'), PDFDict)
    const tables = new Map<string, Map<number, string>>()
    if (fonts) {
      for (const [name, ref] of fonts.entries()) {
        const font = doc.context.lookup(ref, PDFDict)
        const toUnicode = font.get(PDFName.of('ToUnicode'))
        if (toUnicode) tables.set(name.decodeText(), readToUnicode(streamText(doc, toUnicode)))
      }
    }
    const contents = page.node.get(PDFName.of('Contents')) as PDFObject
    const parts = contents instanceof PDFArray ? contents.asArray() : [contents]
    const data = parts.map((part) => streamText(doc, part)).join('\n')
    let current: Map<number, string> | undefined
    let out = ''
    for (const token of data.matchAll(/\/([^\s/[\]()<>]+)\s+[-\d.]+\s+Tf|<([0-9a-fA-F]*)>/g)) {
      if (token[1] !== undefined) {
        current = tables.get(token[1])
      } else if (current) {
        const hex = token[2]
        for (let at = 0; at + 4 <= hex.length; at += 4) out += current.get(parseInt(hex.slice(at, at + 4), 16)) ?? ''
      } else {
        out += Buffer.from(token[2], 'hex').toString('latin1')
      }
    }
    return out
  })
}
