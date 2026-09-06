import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether a route param looks like a Postgres `uuid`, before it ever reaches
 * a query.
 *
 * Postgres rejects a non-uuid literal (error 22P02) before RLS is consulted,
 * so a malformed id thrown straight at `.eq('id', value)` surfaces as a 500
 * rather than the 404 a missing row would produce. A malformed id is a miss,
 * not a fault — checking it here, inside the id-keyed queries themselves,
 * means every caller inherits the guard instead of each route copying its
 * own regex.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value)
}

/**
 * Formats a timestamp for display in a record. Shared so every connected module
 * renders dates identically rather than each picking its own locale and options.
 * en-ZA gives day-first, which is what the people using this expect.
 */
export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Derives a one- or two-letter monogram from a name-like string (a person's name,
 * an email local-part, or an organization name). Two or more words use the first
 * letter of each of the first two words; a single word uses its first two characters.
 */
export function getInitials(value: string): string {
  const words = value.trim().split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
