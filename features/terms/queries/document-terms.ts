import 'server-only'

import { documentContext } from '@/features/documents/server-context'
import type { DocumentKind } from '@/features/documents/vocabulary'
import { fetchHiveOfferings } from '@/lib/integrations/hive-offerings'
import { formatCurrency } from '@/lib/utils/format-money'
import { offeringFromToken, offeringToken, targetsForDocument, type Offering } from '../document-terms'
import { resolveTerms, type ResolvedLayer, type ResolvedTerms } from '../resolve-terms'
import { appliesToKind, currentVersion, saToday } from '../selection'
import { buildPlaceholderValues } from '../values'

export type OfferingOption = { token: string; title: string; hasTerms: boolean }

export type DocumentTermsState = {
  offerings: string[]
  options: OfferingOption[]
  titles: Record<string, string>
}

/** The offerings chosen on a document, in the order they were chosen. */
async function offeringsOf(kind: DocumentKind, record: Record<string, any>): Promise<Offering[]> {
  const { organization, db } = await documentContext()
  const table = kind === 'quote' ? 'quote_offerings' : 'invoice_offerings'
  const column = kind === 'quote' ? 'quote_id' : 'invoice_id'
  const stored = await db.from(table).select('offering_kind,offering_key').eq(column, record.id).eq('organization_id', organization.id).order('position')
  if (stored.error) throw stored.error
  return (stored.data ?? []).map((row: any) => offeringFromToken(`${row.offering_kind}.${row.offering_key}`)).filter((item: Offering | null): item is Offering => item !== null)
}

export async function getDocumentTermsState(kind: DocumentKind, record: Record<string, any>): Promise<DocumentTermsState> {
  const { organization, db } = await documentContext()
  const [offerings, templates] = await Promise.all([
    offeringsOf(kind, record),
    db.from('terms_templates').select('id,target_kind,target_key,applies_to,title').eq('organization_id', organization.id),
  ])
  if (templates.error) throw templates.error
  const usable = (templates.data ?? []).filter((row: any) => appliesToKind(row.applies_to, kind))
  const ids = usable.map((row: any) => row.id as string)
  const versions = ids.length
    ? await db.from('terms_template_versions').select('template_id,version,status,effective_from').eq('organization_id', organization.id).in('template_id', ids).eq('status', 'approved')
    : { data: [], error: null }
  if (versions.error) throw versions.error
  const today = saToday()
  const hasTerms = (templateId: string) =>
    currentVersion((versions.data ?? []).filter((row: any) => row.template_id === templateId).map((row: any) => ({ version: row.version, status: row.status, effectiveFrom: row.effective_from })), today) !== null
  const titles: Record<string, string> = {}
  const options: OfferingOption[] = []
  for (const row of usable as any[]) {
    titles[row.id] = row.title
    if (row.target_kind !== 'company' && row.target_key) options.push({ token: `${row.target_kind}.${row.target_key}`, title: row.title, hasTerms: hasTerms(row.id) })
  }
  options.sort((a, b) => a.title.localeCompare(b.title))
  return { offerings: offerings.map(offeringToken), options, titles }
}

/** Resolves the terms for the given offerings from the approved templates in force today. */
export async function resolveDocumentTerms(kind: DocumentKind, offeringTokens: string[]): Promise<{ resolved: ResolvedTerms; offerings: string[] }> {
  const { organization, db } = await documentContext()
  const offerings = offeringTokens.map(offeringFromToken).filter((item): item is Offering => item !== null)
  const targets = targetsForDocument(offerings)

  const templates = await db.from('terms_templates').select('id,target_kind,target_key,applies_to').eq('organization_id', organization.id)
  if (templates.error) throw templates.error
  const usable = (templates.data ?? []).filter((row: any) => appliesToKind(row.applies_to, kind))
  const ids = usable.map((row: any) => row.id as string)
  const versions = ids.length
    ? await db.from('terms_template_versions').select('id,template_id,version,status,effective_from,body,inclusions').eq('organization_id', organization.id).in('template_id', ids).eq('status', 'approved')
    : { data: [], error: null }
  if (versions.error) throw versions.error

  const today = saToday()
  const layers: ResolvedLayer[] = []
  for (const target of targets) {
    for (const template of usable.filter((row: any) => row.target_kind === target.targetKind && (row.target_key ?? null) === target.targetKey)) {
      const own = (versions.data ?? []).filter((row: any) => row.template_id === template.id).map((row: any) => ({ ...row, effectiveFrom: row.effective_from }))
      const current = currentVersion(own, today) as any
      if (current) layers.push({ layer: target.layer, templateId: template.id, versionId: current.id, version: current.version, body: current.body, inclusions: current.inclusions })
    }
  }

  const retainer = offerings.find((item) => item.kind === 'retainer')
  // The retainer's fee, credits and project limit come from the HIVE offerings feed. If HIVE cannot be reached they stay
  // unfilled, which blocks the fill with the placeholder named; a number is never guessed.
  const retainerFromHive = async () => {
    if (!retainer) return null
    try {
      const offering = (await fetchHiveOfferings()).offerings.find((candidate) => candidate.key === `retainer:${retainer.key}`)
      const amount = offering?.price.amount
      if (!offering || typeof amount !== 'number') return null
      const credits = (offering.credits as { amount?: unknown } | null | undefined)?.amount
      return {
        monthlyFee: amount,
        credits: typeof credits === 'number' ? credits : null,
        initiativeLimit: typeof offering.projectLimit === 'number' ? offering.projectLimit : null,
      }
    } catch {
      console.error('[document-terms] HIVE offerings unavailable')
      return null
    }
  }
  const [rate, settings] = await Promise.all([
    retainerFromHive(),
    db.from('organization_settings').select('default_quote_valid_days,default_payment_days').eq('organization_id', organization.id).maybeSingle(),
  ])
  if (settings.error) throw settings.error

  const values = buildPlaceholderValues({
    retainer: rate,
    validDays: settings.data?.default_quote_valid_days ?? null,
    paymentDays: settings.data?.default_payment_days ?? null,
    formatMoney: (amount) => formatCurrency(amount, 'ZAR'),
  })
  return { resolved: resolveTerms({ layers, values }), offerings: offerings.map(offeringToken) }
}

