import 'server-only'

import { cache } from 'react'

import { isUuid } from '@/lib/utils'
import { documentContext } from '../server-context'

/**
 * Whether a quote has a billing plan, in any state (active, paused or ended); false for an id that is not a quote's. A quote with a plan is
 * billed through the plan, so its header has no Create invoice button (the database refuses it too: QUOTE_HAS_BILLING_PLAN). A small read
 * through the member's own client, so row level security limits it to the caller's organisation; nothing is written. Wrapped in cache() so
 * one request reads it once.
 */
export const quoteHasBillingPlan = cache(async (quoteId: string): Promise<boolean> => {
  if (!isUuid(quoteId)) return false
  const { organization, db } = await documentContext()
  const found = await db
    .from('billing_plans')
    .select('id')
    .eq('quote_id', quoteId)
    .eq('organization_id', organization.id)
    .maybeSingle()
  if (found.error) throw found.error
  return found.data !== null
})
