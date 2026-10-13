import 'server-only'

import { documentContext } from '@/features/documents/server-context'
import { fetchHiveOfferings } from '@/lib/integrations/hive-offerings'
import { formatCurrency } from '@/lib/utils/format-money'
import { resolveTerms, type ResolvedLayer, type ResolvedTerms } from '../resolve-terms'
import { appliesToKind, currentVersion, saToday } from '../selection'
import { buildPlaceholderValues } from '../values'

export type TemplateInfo = {
  id: string
  targetKind: 'company' | 'retainer' | 'project' | 'support'
  targetKey: string | null
  appliesTo: 'quote' | 'invoice' | 'both'
  title: string
}

/**
 * The terms as a client would read them: the current company terms (for quotes, or for invoices when the template is for
 * invoices), then the given version of this template, with the placeholders filled from the HIVE offerings feed and the company
 * settings as they are today.
 */
export async function loadTermsPreview(template: TemplateInfo, version: { id: string; version: number; body: string; inclusions: string }): Promise<ResolvedTerms> {
  const { organization, db } = await documentContext()
  const kind = template.appliesTo === 'invoice' ? 'invoice' : 'quote'
  const layers: ResolvedLayer[] = []

  if (template.targetKind !== 'company') {
    const companyTemplates = await db.from('terms_templates').select('id,applies_to').eq('organization_id', organization.id).eq('target_kind', 'company')
    if (companyTemplates.error) throw companyTemplates.error
    const ids = (companyTemplates.data ?? []).filter((row: any) => appliesToKind(row.applies_to, kind)).map((row: any) => row.id as string)
    if (ids.length > 0) {
      const rows = await db.from('terms_template_versions').select('id,template_id,version,status,effective_from,body,inclusions').eq('organization_id', organization.id).in('template_id', ids).eq('status', 'approved')
      if (rows.error) throw rows.error
      const today = saToday()
      for (const id of ids) {
        const own = (rows.data ?? []).filter((row: any) => row.template_id === id).map((row: any) => ({ ...row, effectiveFrom: row.effective_from }))
        const current = currentVersion(own, today) as any
        if (current) layers.push({ layer: 'company', templateId: id, versionId: current.id, version: current.version, body: current.body, inclusions: current.inclusions })
      }
    }
  }

  layers.push({
    layer: template.targetKind === 'company' ? 'company' : 'offering',
    templateId: template.id, versionId: version.id, version: version.version, body: version.body, inclusions: version.inclusions,
  })

  // The retainer's fee, credits and project limit come from HIVE. When HIVE cannot be reached they stay unfilled, which the
  // preview shows as unresolved placeholders, never as a guessed number.
  const retainerFromHive = async () => {
    if (template.targetKind !== 'retainer' || !template.targetKey) return null
    try {
      const offering = (await fetchHiveOfferings()).offerings.find((candidate) => candidate.key === `retainer:${template.targetKey}`)
      const amount = offering?.price.amount
      if (!offering || typeof amount !== 'number') return null
      const credits = (offering.credits as { amount?: unknown } | null | undefined)?.amount
      return {
        monthlyFee: amount,
        credits: typeof credits === 'number' ? credits : null,
        initiativeLimit: typeof offering.projectLimit === 'number' ? offering.projectLimit : null,
      }
    } catch {
      console.error('[terms-preview] HIVE offerings unavailable')
      return null
    }
  }
  const [retainer, settings] = await Promise.all([
    retainerFromHive(),
    db.from('organization_settings').select('default_quote_valid_days,default_payment_days').eq('organization_id', organization.id).maybeSingle(),
  ])
  if (settings.error) throw settings.error

  const values = buildPlaceholderValues({
    retainer,
    validDays: settings.data?.default_quote_valid_days ?? null,
    paymentDays: settings.data?.default_payment_days ?? null,
    formatMoney: (amount) => formatCurrency(amount, 'ZAR'),
  })
  return resolveTerms({ layers, values })
}
