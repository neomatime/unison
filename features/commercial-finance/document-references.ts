// Names and references offered on a NEW quote or invoice: the rate card names for the Project name list, and suggested
// "GP-2026-001" style references for the project and the client. Pure, so the form and the unit tests share it.
// The suggestions only fill empty, untouched fields; the form never overwrites what a person has typed.
import { PROJECTS, TIERS, packageName } from '../billing/rate-card.ts'

/** Two letters per rate card package: the four retainers, then the five projects. */
const PACKAGE_CODES: Record<string, string> = {
  signature: 'SP',
  growth: 'GP',
  private: 'PP',
  reserve: 'HR',
  operating_model: 'OM',
  intelligence_ai: 'AI',
  digital_experience: 'DX',
  digital_presence: 'DP',
  visual_communication: 'VC',
}

export type PackageName = { key: string; name: string }

/** Every retainer and project name, in rate card order: the choices in the Project name list. */
export const PACKAGE_NAMES: PackageName[] = [...TIERS, ...PROJECTS].map((entry) => ({ key: entry.key, name: packageName(entry.key) }))

/** The package a typed or picked project name stands for (case and spacing ignored), or null for a custom name. */
export function packageKeyForName(name: string): string | null {
  const wanted = name.trim().toLowerCase()
  if (!wanted) return null
  return PACKAGE_NAMES.find((entry) => entry.name.toLowerCase() === wanted)?.key ?? null
}

const LEGAL_WORDS = new Set(['pty', 'ltd', 'limited', 'inc', 'incorporated', 'cc', 'llc', 'plc', 'npc', 'soc', 'rf', 'the', 'and', 'of'])

/** "Acme" becomes ACME, "Acme Holdings (Pty) Ltd" becomes AH: the initials of the name without its legal words, or the first four letters of a single word. */
export function clientCode(name: string): string {
  const words = name
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word && !LEGAL_WORDS.has(word.toLowerCase()))
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase()
  return words.slice(0, 4).map((word) => word[0]).join('').toUpperCase()
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The next free "PREFIX-YEAR-001": one above the highest number already used for that prefix and year. */
export function nextReference(prefix: string, year: number, existing: ReadonlyArray<string | null | undefined>): string {
  const pattern = new RegExp(`^${escapeRegex(prefix)}-${year}-(\\d+)$`)
  let highest = 0
  for (const reference of existing) {
    const match = pattern.exec((reference ?? '').trim())
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return `${prefix}-${year}-${String(highest + 1).padStart(3, '0')}`
}

/** The suggested project reference for a package, or '' when the package is unknown. */
export function suggestProjectRef(packageKey: string | null, year: number, existing: ReadonlyArray<string | null | undefined>): string {
  const code = packageKey ? PACKAGE_CODES[packageKey] : undefined
  return code ? nextReference(code, year, existing) : ''
}

/** The suggested client reference for a client name, or '' when the name gives no letters. */
export function suggestClientRef(clientName: string, year: number, existing: ReadonlyArray<string | null | undefined>): string {
  const code = clientCode(clientName)
  return code ? nextReference(code, year, existing) : ''
}

/** The year in South Africa, which is the year the reference carries. */
export function referenceYear(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric' }).format(now))
}
