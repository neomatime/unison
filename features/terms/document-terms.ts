// How a quote or invoice gets its terms from the templates. Pure: no imports from the framework.
import type { ResolvedTerms, TermsSource } from './resolve-terms.ts'
import { termsTargetsFor, type TermsTarget } from './selection.ts'

export type OfferingKind = 'retainer' | 'project' | 'support'
export type Offering = { kind: OfferingKind; key: string }

const KEY = /^[a-z0-9_]{1,60}$/
const OFFERING_KINDS: readonly string[] = ['retainer', 'project', 'support']

/** "retainer.growth.monthly" -> retainer/growth; "project.top_up" and unknown shapes -> null. */
export function offeringFromRateKey(rateKey: string | null | undefined): Offering | null {
  const [kind, key] = (rateKey ?? '').split('.')
  if (!OFFERING_KINDS.includes(kind) || !key || !KEY.test(key) || key === 'top_up') return null
  return { kind: kind as OfferingKind, key }
}

const sameOffering = (a: Offering, b: Offering) => a.kind === b.kind && a.key === b.key

/**
 * The offerings a document is for: the engagement's package when it has one, otherwise the ones its locked rate card
 * lines were added from. Order is kept and repeats are dropped. Never derived from a title.
 */
export function offeringsForDocument(input: {
  engagement: { kind: 'retainer' | 'project'; packageKey: string } | null
  lines: Array<{ rateKey: string | null }>
}): Offering[] {
  const found: Offering[] = []
  const add = (offering: Offering | null) => {
    if (offering && !found.some((item) => sameOffering(item, offering))) found.push(offering)
  }
  if (input.engagement && KEY.test(input.engagement.packageKey)) {
    add({ kind: input.engagement.kind, key: input.engagement.packageKey })
    return found
  }
  for (const line of input.lines) add(offeringFromRateKey(line.rateKey))
  return found
}

/** The offerings as stored on a document (`kind.key` text). Anything malformed is dropped. */
export const offeringToken = (offering: Offering) => `${offering.kind}.${offering.key}`
export function offeringFromToken(token: string): Offering | null {
  return offeringFromRateKey(token)
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


export type FilledSource = { template_id: string; version_id: string; version: number; layer: string }
export const sourcesForStorage = (sources: TermsSource[]): FilledSource[] =>
  sources.map((source) => ({ template_id: source.templateId, version_id: source.versionId, version: source.version, layer: source.layer }))

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
export function sourceSummary(sources: Array<{ template_id: string; version: number }>, titles: Record<string, string>): string | null {
  const parts = sources.map((source) => `${titles[source.template_id] ?? 'Terms'} v${source.version}`)
  return parts.length ? parts.join(', ') : null
}
