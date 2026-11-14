import 'server-only'

import { isUuid } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the market tables are newer than the generated types
type Db = any

/** A lead started from the map's Create Lead carries the organisation it came from in this hidden field. */
export const MARKET_ORGANIZATION_FIELD = 'marketOrganizationId'

/**
 * Links a lead that was just saved to the mining organisation it was created from. Only an organisation with no lead
 * and no client yet, so an existing relationship is never replaced. A failure here never fails the lead itself.
 */
export async function linkNewLead(db: Db, organizationId: string, marketOrganizationId: string | null, leadId: string) {
  if (!marketOrganizationId || !isUuid(marketOrganizationId) || !isUuid(leadId)) return
  await db
    .from('market_organizations')
    .update({ lead_id: leadId })
    .eq('id', marketOrganizationId)
    .eq('organization_id', organizationId)
    .is('lead_id', null)
    .is('client_id', null)
}

/** The facts a new lead is started with: only what the verified market data holds. Contacts are left to the user. */
export async function marketLeadPrefill(db: Db, organizationId: string, marketOrganizationId: string | undefined) {
  if (!marketOrganizationId || !isUuid(marketOrganizationId)) return null
  const { data } = await db
    .from('market_organizations')
    .select('id,registered_name,trading_name,parent_name,registration_number,website,commodities,source,client_id,lead_id')
    .eq('id', marketOrganizationId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!data) return null
  const facts = [
    data.trading_name ? `Trading as ${data.trading_name}.` : null,
    data.parent_name ? `Parent: ${data.parent_name}.` : null,
    data.registration_number ? `Registration number: ${data.registration_number}.` : null,
    data.website ? `Website: ${data.website}` : null,
    data.commodities?.length ? `Commodities: ${data.commodities.join(', ')}.` : null,
    `From HIMARK Mining Market Intelligence (source: ${data.source}).`,
  ].filter(Boolean)
  return {
    id: String(data.id),
    clientId: data.client_id as string | null,
    leadId: data.lead_id as string | null,
    companyName: String(data.registered_name),
    notes: facts.join('\n'),
  }
}
