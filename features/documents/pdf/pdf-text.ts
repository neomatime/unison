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
