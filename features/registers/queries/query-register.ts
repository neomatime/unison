import 'server-only'

import { mapRows, type PhaseSixRecord } from '@/features/commercial-finance/queries/phase-six'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { applyRegisterFilters, applyRegisterOrder } from '../apply-filters'
import { pageWindow } from '../page-math'
import type { RegisterParams } from '../read-register-params'
import { REGISTERS, type RegisterKind } from '../register-spec'

/**
 * One page of a register, with the exact total. A page past the end is read again as the last page: PostgREST answers
 * a range that starts past the last row with an error (PGRST103, "Requested range not satisfiable"), not with an empty
 * page, so that one code is handled by reading page 1 for the total and then the last page. Any other failed read throws.
 */
export async function queryRegister(kind: RegisterKind, params: RegisterParams): Promise<{ records: PhaseSixRecord[]; total: number; window: ReturnType<typeof pageWindow> }> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const spec = REGISTERS[kind]

  const read = async (page: number) => {
    const window = pageWindow(page, Number.MAX_SAFE_INTEGER)
    let query = db.from(spec.table).select('*', { count: 'exact' })
    query = applyRegisterFilters(query, kind, params, organization.id)
    query = applyRegisterOrder(query, kind, params)
    return query.range(window.rangeFrom, window.rangeTo)
  }

  let result = await read(params.page)
  let pageRead = params.page
  if (result.error?.code === 'PGRST103' && params.page > 1) {
    result = await read(1)
    pageRead = 1
  }
  if (result.error) throw result.error
  const total = Number(result.count ?? 0)
  const window = pageWindow(params.page, total)
  let rows = (result.data ?? []) as any[]
  if (window.page !== pageRead) {
    // The requested page is past the end: show the last page instead.
    const last = await read(window.page)
    if (last.error) throw last.error
    rows = (last.data ?? []) as any[]
  }
  return { records: await mapRows(kind, rows), total, window }
}
