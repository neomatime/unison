const FALLBACK = 'HIMARK User'

/** Separators an address uses between name parts. Hyphens are left alone: they
 * belong inside a name (anne-marie) rather than between two of them. */
const NAME_SEPARATORS = /[._]+/

function cleaned(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function capitalise(word: string): string {
  // Applied per hyphen-joined part so anne-marie becomes Anne-Marie.
  return word.split('-').map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part)).join('-')
}

/**
 * A person-shaped local part is one that separates name parts, like
 * neo.matime. A shared or functional address — info, admin, no-reply — has
 * nothing to split, and guessing a name from it would invent one ("Info"), so
 * those keep the address instead.
 */
function nameFromEmail(email: string): string | null {
  const localPart = email.split('@')[0] ?? ''
  if (!NAME_SEPARATORS.test(localPart)) return null

  const words = localPart.split(NAME_SEPARATORS).filter(Boolean)
  if (words.length < 2) return null

  return words.map(capitalise).join(' ')
}

/**
 * What to call the signed-in person in the shell.
 *
 * The provider is the authority when it tells us anything: Azure returns the
 * directory display name as `full_name`, and `name` is checked too because the
 * key depends on which claims the provider sent. Falling back to the raw
 * address puts "neo.matime@hima…" — truncated, and not a name — where a name
 * belongs, so a person-shaped address is turned into one first.
 */
export function resolveDisplayName(user: {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}): string {
  const metadata = user.user_metadata ?? {}
  const fromProvider = cleaned(metadata.full_name) ?? cleaned(metadata.name)
  if (fromProvider) return fromProvider

  const email = cleaned(user.email)
  if (!email) return FALLBACK

  return nameFromEmail(email) ?? email
}
