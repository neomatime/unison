import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { CollectionRecord } from '@/features/product-ui/components/record-collection-workspace'
import { escapeLikePattern, sortColumn } from './list-projects-helpers'

export { escapeLikePattern, sortColumn }

const PAGE_SIZE = 25

export async function listProjects(params: { q?: string; status?: string; sort?: string; page?: number }) {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()
  const page = Math.max(1, params.page ?? 1)

  let query = supabase
    .from('projects')
    .select(
      'id, name, status, health, progress, next_gate, due_date, updated_at, frameworks(name), framework_phases(name), clients(name)',
      { count: 'exact' },
    )
    .eq('organization_id', organization.id)
    .is('archived_at', null)

  if (params.q) query = query.ilike('name', `%${escapeLikePattern(params.q)}%`)
  if (params.status) query = query.eq('status', params.status)

  const column = sortColumn(params.sort)
  query = query.order(column, { ascending: column === 'name' })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const { data, error, count } = await query
  if (error) throw error

  const records: CollectionRecord[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    health: row.health,
    // CollectionRecord requires this; the existing screen used the framework
    // name as the row's supporting line, so it keeps doing so.
    context: row.frameworks?.name ?? '—',
    framework: row.frameworks?.name ?? '—',
    phase: row.framework_phases?.name ?? '—',
    client: row.clients?.name ?? '—',
    owner: '—', // Owner is a user id; resolving names needs a profiles join. Not fabricated.
    nextGate: row.next_gate ?? '—',
    due: row.due_date
      ? new Date(row.due_date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—',
    progress: `${row.progress}%`,
    updated: new Date(row.updated_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }),
  }))

  return { records, total: count ?? 0, page, pageSize: PAGE_SIZE }
}
