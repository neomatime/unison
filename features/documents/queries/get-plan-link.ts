import 'server-only'

import { cache } from 'react'

import { isUuid } from '@/lib/utils'
import type { PlanItemKind, PlanStatus } from '../billing-plan-view'
import { documentContext } from '../server-context'
import { getDocument } from './get-document'

export type PlanLink = { kind: PlanItemKind; planStatus: PlanStatus; quoteId: string; quoteNumber: string }

/**
 * Whether an invoice is the invoice of a billing plan month, and if so which kind of month, whether the plan is active, paused or ended,
 * and which quote the plan belongs to; null for an invoice that belongs to no plan. The invoice page uses it to hide Issue invoice on the
 * first invoice of a plan and to link to the quote where it is approved (or where to see why it cannot be). Read only; wrapped in cache() so the header buttons and the banner of one page share a single load.
 */
export const getPlanLink = cache(async (invoiceId: string): Promise<PlanLink | null> => {
  if (!isUuid(invoiceId)) return null
  const bundle = await getDocument('invoice', invoiceId)
  const itemId = bundle?.record.billing_plan_item_id
  if (typeof itemId !== 'string' || !isUuid(itemId)) return null

  const { organization, db } = await documentContext()
  const item = await db.from('billing_plan_items').select('kind,quote_id,plan_id').eq('id', itemId).eq('organization_id', organization.id).maybeSingle()
  if (item.error) throw item.error
  if (!item.data) return null
  const [plan, quote] = await Promise.all([
    db.from('billing_plans').select('status').eq('id', item.data.plan_id).eq('organization_id', organization.id).maybeSingle(),
    db.from('quotes').select('quote_number').eq('id', item.data.quote_id).eq('organization_id', organization.id).maybeSingle(),
  ])
  if (plan.error) throw plan.error
  if (quote.error) throw quote.error
  if (!plan.data) return null
  return {
    kind: item.data.kind as PlanItemKind,
    planStatus: plan.data.status as PlanStatus,
    quoteId: String(item.data.quote_id),
    quoteNumber: String(quote.data?.quote_number ?? ''),
  }
})
