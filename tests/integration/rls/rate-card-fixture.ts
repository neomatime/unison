import { RATE_CARD } from '../../../features/billing/rate-card.ts'
import { admin } from './helpers.ts'

/** Gives a fixture organisation the full rate card (the migration only seeds HIMARK). Uses the service role, which the guards do not hold. */
export async function seedRateCard(organizationId: string): Promise<void> {
  const rows = RATE_CARD.map((item) => ({
    organization_id: organizationId,
    rate_key: item.key,
    item_kind: item.kind,
    package_key: item.packageKey,
    title: item.title,
    description: item.description,
    unit_price: item.price,
    credits: item.credits,
    rate_status: item.status,
    initiative_limit: item.initiativeLimit,
    vat_code: 'standard',
  }))
  const { error } = await admin.from('price_list_items').insert(rows)
  if (error) throw error
}
