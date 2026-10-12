// The fixed set of placeholders a terms template may use. No imports: unit tests, server code and the editor all use it.
// private.terms_text_valid in supabase/migrations/20261012160000_commercial_terms.sql holds the same list;
// tests/unit/terms-seed.test.ts keeps the two equal.

export const TERMS_PLACEHOLDERS = ['monthly_fee', 'monthly_credits', 'initiative_limit', 'valid_days', 'payment_days'] as const
export type TermsPlaceholder = (typeof TERMS_PLACEHOLDERS)[number]
export type PlaceholderValues = Partial<Record<TermsPlaceholder, string | null>>

const VALID = new RegExp(`\\{\\{(${TERMS_PLACEHOLDERS.join('|')})\\}\\}`, 'g')

/** The placeholders used in a text, each once, in order of first use. */
export function placeholdersIn(text: string): TermsPlaceholder[] {
  const found: TermsPlaceholder[] = []
  for (const match of text.matchAll(VALID)) {
    const name = match[1] as TermsPlaceholder
    if (!found.includes(name)) found.push(name)
  }
  return found
}

/**
 * Anything in braces that is not exactly a known placeholder: an unknown name, spaces inside the braces, capitals,
 * or a lone "{{" or "}}". Empty when the text is valid.
 */
export function placeholderProblems(text: string): string[] {
  const rest = text.replace(VALID, '')
  const found = rest.match(/\{\{[^{}]*\}\}|\{\{|\}\}/g) ?? []
  return [...new Set(found)]
}

const hasValue = (value: string | null | undefined): value is string => typeof value === 'string' && value !== ''

/** The text with every placeholder replaced, or the text unchanged and the names that have no value. */
export function fillPlaceholders(text: string, values: PlaceholderValues): { text: string; missing: TermsPlaceholder[] } {
  const missing = placeholdersIn(text).filter((name) => !hasValue(values[name]))
  if (missing.length > 0) return { text, missing }
  return { text: text.replace(VALID, (_token, name: TermsPlaceholder) => values[name] as string), missing: [] }
}
