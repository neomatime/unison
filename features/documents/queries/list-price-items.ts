import 'server-only'

import { isUuid } from '@/lib/utils'
import { documentContext } from '../server-context'
import { HiveOfferingsError, fetchHiveOfferings } from '@/lib/integrations/hive-offerings'
import { toHiveOfferingChoice } from '../hive-offerings'
import type { HiveOfferingsResult, PriceItem } from '../types'

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

/** The HIVE offering catalogue for the picker. Never throws: when HIVE is unreachable the page still renders and the picker says why. */
export async function listHiveOfferings(): Promise<HiveOfferingsResult> {
  try {
    const feed = await fetchHiveOfferings()
    return { offerings: feed.offerings.filter((offering) => offering.status === 'active').map(toHiveOfferingChoice), error: null }
  } catch (error) {
    const reason = error instanceof HiveOfferingsError ? error.reason : 'unavailable'
    console.error('[hive-offerings] feed unavailable', { reason })
    const message = error instanceof Error && error.name === 'MissingEnvError'
      ? 'HIVE offerings are not configured for this environment.'
      : 'HIVE offerings are unavailable right now. Try again shortly.'
    return { offerings: [], error: message }
  }
}
