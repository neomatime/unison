import 'server-only'
import { createServerSupabase } from '@/lib/supabase/server'
import { getEntitledModuleIds, unisonTiers, type UnisonTierId } from '@/config/unison-tiers'
import { listPlatformOrganizations } from '@/features/platform-admin/queries'
import { getPartnerLevel, PARTNER_PRICE_CURRENCY } from '@/config/partner-levels'
import { formatCurrency } from '@/lib/utils/format-money'

export type OrganisationRow = {
  id: string
  name: string
  tier: string
  status: string
  modules: string
  admin: string
  partnerLevel: string
  created: string
  price: string
}

/**
 * Shaped to what OrganisationsScreen already renders. Modules is the count the tier entitles.
 * Implementation owner and last activity have no backing column, so they render
 * '—' rather than a fabricated value — the same rule the delivery queries follow.
 */
export async function listOrganizations(): Promise<OrganisationRow[]> {
  const supabase = await createServerSupabase()
  const [{ data, error }, platform] = await Promise.all([supabase.rpc('list_provisioned_organizations'), listPlatformOrganizations()])
  if (error) throw error
  const tierLabels = new Map<string, string>(unisonTiers.map((tier) => [tier.id, tier.label]))
  const tiers = new Map(platform.map((organisation) => [organisation.id, organisation.tier]))
  const levels = new Map(platform.map((organisation) => [organisation.id, organisation.partner_level]))

  return (data ?? []).map((row) => {
    const partner = getPartnerLevel(levels.get(row.id))
    return {
    id: row.id,
    name: row.name,
    tier: tierLabels.get(tiers.get(row.id) ?? '') ?? '—',
    status: row.status,
    modules: tiers.has(row.id) ? String(getEntitledModuleIds(tiers.get(row.id) as UnisonTierId).length) : '—',
    admin: row.admin_email ?? '—',
    partnerLevel: partner?.label ?? '—',
    created: new Date(row.created_at).toLocaleDateString('en-ZA', {
      day: '2-digit', month: 'short', year: 'numeric',
    }),
    price: partner ? formatCurrency(partner.price, PARTNER_PRICE_CURRENCY, { maximumFractionDigits: 0 }) : '—',
    }
  })
}
