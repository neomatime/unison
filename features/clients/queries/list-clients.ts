import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { MockRecord } from '@/features/product-ui/types'

const PAGE_SIZE = 25

// ilike treats % and _ as wildcards and \ as its escape character, and
// PostgREST rewrites * to % inside a like/ilike filter value before Postgres
// sees it — escape all four so a search for e.g. "50% Off", "big_corp" or
// "Acme*" matches the literal text instead of silently matching more rows.
// See features/delivery/queries/list-projects-helpers.ts for the same rule and
// the one case it cannot fix (a literal asterisk reaches Postgres as '%').
function escapeLikePattern(value: string) {
  return value.replace(/[\\%_*]/g, (match) => `\\${match}`)
}

export async function listClients(params: { q?: string; status?: string; sort?: string; page?: number }) {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()
  const page = Math.max(1, params.page ?? 1)

  let query = supabase
    .from('clients')
    .select('id, name, status, health, contact_name, service, updated_at, archived_at', { count: 'exact' })
    .eq('organization_id', organization.id)
    .is('archived_at', null)

  if (params.q) query = query.ilike('name', `%${escapeLikePattern(params.q)}%`)
  if (params.status) query = query.eq('status', params.status)

  const column = params.sort === 'name' ? 'name' : params.sort === 'status' ? 'status' : 'updated_at'
  query = query.order(column, { ascending: column === 'name' })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const { data, error, count } = await query
  if (error) throw error

  const records: MockRecord[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    owner: '—',
    updated: new Date(row.updated_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }),
    contact: row.contact_name ?? '—',
    service: row.service ?? '—',
    health: row.health,
    // public.projects exists now, but this query does not count it: a per-row
    // count needs an aggregate embed, and a wrong or missing count is worse
    // than an honest dash. Not fabricated as 0.
    projects: '—',
  }))

  return { records, total: count ?? 0, page, pageSize: PAGE_SIZE }
}
