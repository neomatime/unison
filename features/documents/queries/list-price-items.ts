import 'server-only'

import { isUuid } from '@/lib/utils'
import { documentContext } from '../server-context'
import type { PriceItem } from '../types'

const COLUMNS = 'id,title,description,unit_price,vat_code,archived_at'

export async function listPriceItems(options: { includeArchived?: boolean } = {}): Promise<PriceItem[]> {
  const { organization, db } = await documentContext()
  let query = db.from('price_list_items').select(COLUMNS).eq('organization_id', organization.id).order('title')
  if (!options.includeArchived) query = query.is('archived_at', null)
  const result = await query
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
