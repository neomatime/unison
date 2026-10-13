// How a quote or invoice gets its terms from the templates. Pure: no imports from the framework.
// Which offerings a document is for is chosen on the document itself (the picker); nothing is derived from titles or lines.
import type { ResolvedTerms, TermsSource } from './resolve-terms.ts'
import { termsTargetsFor, type TermsTarget } from './selection.ts'

export type OfferingKind = 'retainer' | 'project' | 'support'
export type Offering = { kind: OfferingKind; key: string }

const KEY = /^[a-z0-9_]{1,60}$/
const OFFERING_KINDS: readonly string[] = ['retainer', 'project', 'support']

/** The offerings as stored on a document (`kind.key` text). Anything malformed is dropped. */
export const offeringToken = (offering: Offering) => `${offering.kind}.${offering.key}`
export function offeringFromToken(token: string): Offering | null {
  const [kind, key, ...rest] = String(token).split('.')
  if (rest.length > 0 || !OFFERING_KINDS.includes(kind) || !key || !KEY.test(key)) return null
  return { kind: kind as OfferingKind, key }
}

/** The templates whose current version feeds the document, in layer order, without repeats. */
export function targetsForDocument(offerings: Offering[]): TermsTarget[] {
  const targets = termsTargetsFor(null)
  for (const offering of offerings) {
    for (const target of termsTargetsFor(offering).slice(1)) {
      if (!targets.some((item) => item.targetKind === target.targetKind && item.targetKey === target.targetKey)) targets.push(target)
    }
  }
  return targets
}


/** What is stored on a document: the same shape the database writes back after checking each version. */
export type FilledSource = { layer: string; templateId: string; versionId: string; version: number }
export const sourcesForStorage = (sources: TermsSource[]): FilledSource[] =>
  sources.map((source) => ({ layer: source.layer, templateId: source.templateId, versionId: source.versionId, version: source.version }))

export type FillPlan =
  | { ok: false; missing: string[] }
  | { ok: true; terms: string; inclusions: string; sources: FilledSource[]; needsConfirm: boolean }

/** Turns a resolved result into what is written on the document, or says which placeholders have no value. */
export function planFill(input: { resolved: ResolvedTerms; existingTerms: string | null | undefined }): FillPlan {
  const { resolved } = input
  if (resolved.missing.length > 0) return { ok: false, missing: [...resolved.missing] }
  const terms = resolved.lines.join('\n')
  const existing = (input.existingTerms ?? '').replace(/\r\n?/g, '\n').trim()
  return {
    ok: true,
    terms,
    inclusions: resolved.inclusions.join('\n'),
    sources: sourcesForStorage(resolved.sources),
    needsConfirm: existing !== '' && existing !== terms.trim(),
  }
}

/** "Company terms v1, HIMARK Growth v1" from the stored sources and a title lookup by template id. */
export function sourceSummary(sources: Array<{ templateId: string; version: number }> | null | undefined, titles: Record<string, string>): string | null {
  const parts = (sources ?? []).map((source) => `${titles[source.templateId] ?? 'Terms'} v${source.version}`)
  return parts.length ? parts.join(', ') : null
}
