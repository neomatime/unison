// Applies the checked register parameters to a Supabase query builder. The same function builds the page query and
// the export query, so the screen and the download always agree. Pure apart from the calls on the builder it is given:
// no directive and no imports of server code (unit tests give it a recording builder).
import type { RegisterParams } from './read-register-params.ts'
import { REGISTERS, type RegisterKind } from './register-spec.ts'

type Chainable = { [method: string]: (...args: any[]) => any }

/** `col1.ilike.%text%,col2.ilike.%text%`: the text has already been cleaned by cleanSearch, so it holds no comma, bracket, quote or wildcard. */
export function searchFilter(columns: readonly string[], q: string): string {
  return columns.map((column) => `${column}.ilike.%${q}%`).join(',')
}

export function applyRegisterFilters<T extends Chainable>(query: T, kind: RegisterKind, params: RegisterParams, organizationId: string): T {
  const spec = REGISTERS[kind]
  let next: Chainable = query.eq('organization_id', organizationId)
  next = params.archived ? next.not('archived_at', 'is', null) : next.is('archived_at', null)
  if (params.status) next = next.eq(spec.statusColumn, params.status)
  if (params.owner) next = next.eq(spec.ownerColumn, params.owner)
  if (params.q) next = next.or(searchFilter(spec.searchColumns, params.q))
  return next as T
}

/** The chosen column (or the register's default), then the id, so paging is stable. */
export function applyRegisterOrder<T extends Chainable>(query: T, kind: RegisterKind, params: RegisterParams): T {
  const spec = REGISTERS[kind]
  const chosen = params.sort ? { column: spec.sortable[params.sort], dir: params.dir } : spec.defaultSort
  return query
    .order(chosen.column, { ascending: chosen.dir === 'asc', nullsFirst: false })
    .order('id', { ascending: true }) as T
}
