import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/** Menu item id → the table whose records its page lists (not archived), matching the "Showing x of y" count on that page. */
export const COUNTED_TABLES: Record<string, string> = {
  clients: 'clients',
  onboarding: 'client_onboardings',
  vendors: 'vendors',
  leads: 'leads',
  quotes: 'quotes',
  sales: 'sales_opportunities',
  invoices: 'invoices',
  expenses: 'expenses',
}

/**
 * How many records each counted page lists. One cheap head-count per table, run together. A count that fails is left out, so the
 * menu never shows a wrong number. Only the ids asked for are counted (people only count what they may view).
 */
export async function getNavigationCounts(ids: readonly string[]): Promise<Record<string, number>> {
  const wanted = ids.filter((id) => COUNTED_TABLES[id])
  if (wanted.length === 0) return {}
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const results = await Promise.all(wanted.map(async (id) => {
    try {
      const { count, error } = await db.from(COUNTED_TABLES[id]).select('id', { count: 'exact', head: true }).eq('organization_id', organization.id).is('archived_at', null)
      return error || typeof count !== 'number' ? null : ([id, count] as const)
    } catch {
      return null
    }
  }))
  return Object.fromEntries(results.filter((entry): entry is readonly [string, number] => entry !== null))
}
