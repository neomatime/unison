// Combines the layers of terms for one document into the lines a client would read. Pure: no imports from the framework.
import { TERMS_PLACEHOLDERS, fillPlaceholders, type PlaceholderValues, type TermsPlaceholder } from './placeholders.ts'

export type TermsLayer = 'company' | 'offering' | 'category'

export type ResolvedLayer = {
  layer: TermsLayer
  templateId: string
  versionId: string
  version: number
  body: string
  inclusions: string
}

export type TermsSource = { layer: TermsLayer; templateId: string; versionId: string; version: number }

export type ResolvedTerms = {
  lines: string[]
  inclusions: string[]
  sources: TermsSource[]
  /** Placeholders that had no value, in the order of the allowed list. */
  missing: TermsPlaceholder[]
  /** Lines left out because a placeholder in them had no value (shown as written, with the braces, so an admin can see what was dropped). */
  skipped: string[]
}

/** Non-empty trimmed lines, whatever line endings the text was pasted with. */
export function splitTermsLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter((line) => line !== '')
}

const clauseKey = (line: string) => line.replace(/\s+/g, ' ').trim().toLowerCase()

export function resolveTerms(input: { layers: ResolvedLayer[]; values: PlaceholderValues }): ResolvedTerms {
  const lines: string[] = []
  const inclusions: string[] = []
  const sources: TermsSource[] = []
  const skipped: string[] = []
  const missing = new Set<TermsPlaceholder>()
  const seenLines = new Set<string>()
  const seenInclusions = new Set<string>()

  const take = (text: string, out: string[], seen: Set<string>) => {
    for (const raw of splitTermsLines(text)) {
      const filled = fillPlaceholders(raw, input.values)
      if (filled.missing.length > 0) {
        filled.missing.forEach((name) => missing.add(name))
        if (!skipped.includes(raw)) skipped.push(raw)
        continue
      }
      const key = clauseKey(filled.text)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(filled.text)
    }
  }

  for (const layer of input.layers) {
    sources.push({ layer: layer.layer, templateId: layer.templateId, versionId: layer.versionId, version: layer.version })
    take(layer.body, lines, seenLines)
    take(layer.inclusions, inclusions, seenInclusions)
  }

  return { lines, inclusions, sources, missing: TERMS_PLACEHOLDERS.filter((name) => missing.has(name)), skipped }
}
