// Which version of a template is in force, and which templates apply to an offering. Pure.
import type { TermsLayer } from './resolve-terms.ts'

export type VersionStatus = 'draft' | 'approved' | 'archived'
export type SelectableVersion = { version: number; status: VersionStatus; effectiveFrom: string | null }

/** ISO dates compare correctly as strings. */
const approvedWithDate = <T extends SelectableVersion>(versions: T[]) =>
  versions.filter((item): item is T & { effectiveFrom: string } => item.status === 'approved' && item.effectiveFrom !== null)

/** The approved version with the latest effective date that is not in the future; the higher version wins a tie. */
export function currentVersion<T extends SelectableVersion>(versions: T[], today: string): T | null {
  const ready = approvedWithDate(versions).filter((item) => item.effectiveFrom <= today)
  ready.sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? b.version - a.version : a.effectiveFrom < b.effectiveFrom ? 1 : -1))
  return ready[0] ?? null
}

/** The approved version that starts soonest after today, or null. */
export function upcomingVersion<T extends SelectableVersion>(versions: T[], today: string): T | null {
  const later = approvedWithDate(versions).filter((item) => item.effectiveFrom > today)
  later.sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? a.version - b.version : a.effectiveFrom < b.effectiveFrom ? -1 : 1))
  return later[0] ?? null
}

/** Today's date in South Africa, as YYYY-MM-DD. */
export function saToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export type TermsTarget = { layer: TermsLayer; targetKind: 'company' | 'retainer' | 'project' | 'support'; targetKey: string | null }

/**
 * The templates whose current version feeds a document, in layer order: the company terms, the offering's own terms
 * and, when the caller names one, its project category. Build 2 calls this from the quote form.
 */
export function termsTargetsFor(offering: { kind: 'retainer' | 'project' | 'support'; key: string; categoryKey?: string | null } | null): TermsTarget[] {
  const targets: TermsTarget[] = [{ layer: 'company', targetKind: 'company', targetKey: null }]
  if (!offering) return targets
  targets.push({ layer: 'offering', targetKind: offering.kind, targetKey: offering.key })
  if (offering.categoryKey) targets.push({ layer: 'category', targetKind: 'project', targetKey: offering.categoryKey })
  return targets
}

export function appliesToKind(appliesTo: 'quote' | 'invoice' | 'both', kind: 'quote' | 'invoice'): boolean {
  return appliesTo === 'both' || appliesTo === kind
}
