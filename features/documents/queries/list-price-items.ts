import 'server-only'

import { isUuid } from '@/lib/utils'
import { documentContext } from '../server-context'
import type { PriceItem, RateCardItem } from '../types'

const COLUMNS = 'id,title,description,unit_price,vat_code,archived_at,rate_key,item_kind,credits,initiative_limit,rate_status'

/** The price list. By default only custom items: the rate card is not offered in a document's picker, because its lines
 *  come from the billing buttons and are locked. The price list screen asks for everything. */
export async function listPriceItems(options: { includeRateCard?: boolean } = {}): Promise<PriceItem[]> {
  const { organization, db } = await documentContext()
  let query = db.from('price_list_items').select(COLUMNS).eq('organization_id', organization.id).is('archived_at', null)
  if (!options.includeRateCard) query = query.is('rate_key', null)
  const result = await query.order('title')
  if (result.error) throw result.error
  return (result.data ?? []) as PriceItem[]
}

export async function getPriceItem(id: string): Promise<PriceItem | null> {
  if (!isUuid(id)) return null
  const { organization, db } = await documentContext()
  const result = await db.from('price_list_items').select(COLUMNS).eq('id', id).eq('organization_id', organization.id).is('archived_at', null).maybeSingle()
  if (result.error) throw result.error
  return (result.data as PriceItem | null) ?? null
}

const RATE_COLUMNS = 'rate_key,item_kind,title,description,unit_price,credits,rate_status'

/** The rate card (retainers, implementation fees, projects, support services, top-up credits), for the "Add from rate card" picker. */
export async function listRateCardItems(): Promise<RateCardItem[]> {
  const { organization, db } = await documentContext()
  const result = await db
    .from('price_list_items')
    .select(RATE_COLUMNS)
    .eq('organization_id', organization.id)
    .not('rate_key', 'is', null)
    .is('archived_at', null)
    .order('item_kind')
    .order('unit_price')
  if (result.error) throw result.error
  return (result.data ?? []) as RateCardItem[]
}
