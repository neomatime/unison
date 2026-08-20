import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
