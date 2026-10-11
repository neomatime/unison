// Turns the page address into checked register parameters. Pure: no directive, relative imports only. Nothing here
// returns a value that was not checked against the register's own lists, so nothing from the address can become a
// column name or a filter by itself.
import { isUuid } from '../../lib/utils/index.ts'
import { REGISTERS, type RegisterKind, type SortDir } from './register-spec.ts'

export const PAGE_SIZE = 25
export const SEARCH_MIN = 2
export const SEARCH_MAX = 120

export type RegisterParams = {
  q: string
  status: string | null
  owner: string | null
  archived: boolean
  sort: string | null
  dir: SortDir
  page: number
  /** One character was typed: shown as "Enter at least 2 characters to search." and not used. */
  searchTooShort: boolean
}

export type RawParams = Record<string, string | string[] | undefined> | URLSearchParams

const first = (raw: RawParams, key: string): string => {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? ''
  const value = raw[key]
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/** Keeps letters, digits, spaces and . @ + ' - ; every other run becomes one space; trimmed and cut to 120 characters. */
export function cleanSearch(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} .@+'-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX).trim()
}

export function readRegisterParams(kind: RegisterKind, raw: RawParams): RegisterParams {
  const spec = REGISTERS[kind]
  const cleaned = cleanSearch(first(raw, 'q'))
  const searchTooShort = cleaned.length > 0 && cleaned.length < SEARCH_MIN
  const status = first(raw, 'status')
  const owner = first(raw, 'owner')
  const sort = first(raw, 'sort')
  const pageText = first(raw, 'page')
  const page = /^\d+(\.\d+)?$/.test(pageText) ? Math.max(1, Math.floor(Number(pageText))) : 1
  return {
    q: searchTooShort ? '' : cleaned,
    status: spec.statuses.includes(status) ? status : null,
    owner: isUuid(owner) ? owner : null,
    archived: first(raw, 'archived') === '1',
    sort: Object.hasOwn(spec.sortable, sort) ? sort : null,
    dir: first(raw, 'dir') === 'desc' ? 'desc' : 'asc',
    page,
    searchTooShort,
  }
}

/**
 * The address of the same register with a change applied. Defaults are left out. Changing the search, the status, the
 * owner, the archived switch or the sort returns to page 1 unless the change names a page.
 */
export function registerHref(base: string, params: RegisterParams, change: Partial<RegisterParams> = {}): string {
  const next: RegisterParams = { ...params, ...change }
  if (change.page === undefined && ('q' in change || 'status' in change || 'owner' in change || 'archived' in change || 'sort' in change || 'dir' in change)) {
    next.page = 1
  }
  const query = new URLSearchParams()
  if (next.q) query.set('q', next.q)
  if (next.status) query.set('status', next.status)
  if (next.owner) query.set('owner', next.owner)
  if (next.archived) query.set('archived', '1')
  if (next.sort) {
    query.set('sort', next.sort)
    query.set('dir', next.dir)
  }
  if (next.page > 1) query.set('page', String(next.page))
  const text = query.toString()
  return text ? `${base}?${text}` : base
}
