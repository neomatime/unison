import 'server-only'

import { mapRows } from '@/features/commercial-finance/queries/phase-six'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSalesStage, type SalesCard } from '../sales-board'

/** Every opportunity of this workspace that is not archived, newest first, as board cards. A failed read throws; it is never shown as an empty board. */
export async function listSalesBoardCards(): Promise<SalesCard[]> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const { data, error } = await db
    .from('sales_opportunities')
    .select('*')
    .eq('organization_id', organization.id)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  const records = await mapRows('opportunity', (data ?? []) as any[])
  return records
    .filter((record) => isSalesStage(record.stage))
    .map((record) => ({
      id: String(record.id),
      name: String(record.name ?? ''),
      client: record.clientName ? String(record.clientName) : '—',
      owner: record.owner ? String(record.owner) : 'Unassigned',
      stage: record.stage as SalesCard['stage'],
      value: Number(record.expectedValue ?? 0),
      currency: String(record.currency ?? 'ZAR'),
      probability: Number(record.probabilityPercent ?? 0),
      close: record.expectedClose ? String(record.expectedClose).slice(0, 10) : '—',
    }))
}
