import 'server-only'

import { cache } from 'react'

import { isUuid } from '@/lib/utils'
import type { PlanItemKind } from '../billing-plan-view'
import { documentContext } from '../server-context'
import { getDocument } from './get-document'

export type PlanLink = { kind: PlanItemKind; quoteId: string; quoteNumber: string }

/**
 * Whether an invoice is the invoice of a billing plan month, and if so which kind of month and which quote the plan belongs to; null
 * for an invoice that belongs to no plan. The invoice page uses it to hide Issue invoice on the first invoice of a plan and to link to
 * the quote where it is approved. Read only; wrapped in cache() so the header buttons and the banner of one page share a single load.
 */
export const getPlanLink = cache(async (invoiceId: string): Promise<PlanLink | null> => {
  if (!isUuid(invoiceId)) return null
  const bundle = await getDocument('invoice', invoiceId)
  const itemId = bundle?.record.billing_plan_item_id
  if (typeof itemId !== 'string' || !isUuid(itemId)) return null

  const { organization, db } = await documentContext()
  const item = await db.from('billing_plan_items').select('kind,quote_id').eq('id', itemId).eq('organization_id', organization.id).maybeSingle()
  if (item.error) throw item.error
  if (!item.data) return null
  const quote = await db.from('quotes').select('quote_number').eq('id', item.data.quote_id).eq('organization_id', organization.id).maybeSingle()
  if (quote.error) throw quote.error
  return { kind: item.data.kind as PlanItemKind, quoteId: String(item.data.quote_id), quoteNumber: String(quote.data?.quote_number ?? '') }
})
