import 'server-only'

import { appliesToKind, currentVersion, saToday } from '../selection'

/**
 * Whether an approved company-wide template is in force for quotes and for invoices. When it is, the template (not the
 * default text box in the company details) is the source of a document's terms, and the box is no longer offered.
 */
export async function companyTermsManaged(db: any, organizationId: string): Promise<{ quote: boolean; invoice: boolean }> {
  const templates = await db.from('terms_templates').select('id,applies_to').eq('organization_id', organizationId).eq('target_kind', 'company')
  if (templates.error) throw templates.error
  const rows = (templates.data ?? []) as Array<{ id: string; applies_to: 'quote' | 'invoice' | 'both' }>
  if (rows.length === 0) return { quote: false, invoice: false }
  const versions = await db.from('terms_template_versions').select('template_id,version,status,effective_from').eq('organization_id', organizationId).in('template_id', rows.map((row) => row.id)).eq('status', 'approved')
  if (versions.error) throw versions.error
  const today = saToday()
  const inForce = (kind: 'quote' | 'invoice') =>
    rows.some((row) =>
      appliesToKind(row.applies_to, kind) &&
      currentVersion((versions.data ?? []).filter((v: any) => v.template_id === row.id).map((v: any) => ({ version: v.version, status: v.status, effectiveFrom: v.effective_from })), today) !== null,
    )
  return { quote: inForce('quote'), invoice: inForce('invoice') }
}
