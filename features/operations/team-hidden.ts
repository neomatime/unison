// The Team page's hide list. Pure, no imports, so unit tests load it.

/** One address, trimmed and lower-cased; null when it is not a plausible email address. */
export function normalizeHiddenEmail(value: unknown): string | null {
  const email = String(value ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

/** Removes the people whose address is on the hide list. */
export function withoutHidden<T extends object>(people: T[], hidden: Iterable<string>): T[] {
  const set = new Set(Array.from(hidden, (email) => email.toLowerCase()))
  return people.filter((person) => !set.has(String((person as Record<string, unknown>).email ?? '').trim().toLowerCase()))
}

export const HIDE_DENIED_MESSAGE = 'Only an Owner or Admin can change who is hidden from the Team page.'
