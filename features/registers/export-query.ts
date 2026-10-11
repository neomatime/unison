// Reads an export request: the format, which register (if any) and the register parameters, all checked with the same
// rules as the page. Pure: no directive, relative imports only.
import { readRegisterParams, type RegisterParams } from './read-register-params.ts'
import { REGISTERS, isRegisterKind, type RegisterKind } from './register-spec.ts'

export const EXPORT_LIMIT = 5000
export const EXPORT_TOO_MANY = 'More than 5,000 rows match. Narrow the search and try again.'

export type ExportRequest = { format: 'csv' | 'xlsx' | 'pdf' | null; kind: RegisterKind | null; params: RegisterParams | null }

export function readExportRequest(search: URLSearchParams): ExportRequest {
  const format = search.get('format')?.toLowerCase() ?? ''
  const rawKind = search.get('kind')
  const kind = isRegisterKind(rawKind) && search.get('collection') === REGISTERS[rawKind].collection ? rawKind : null
  return {
    format: format === 'csv' || format === 'xlsx' || format === 'pdf' ? format : null,
    kind,
    params: kind ? readRegisterParams(kind, search) : null,
  }
}

/** PostgREST answers at most this many rows per request (the project's max rows), whatever `limit` asks for. */
export const PAGE_ROWS = 1000

/** True when the exact count of matching rows is above the export cap. Decided from a count-only query, before any row is read. */
export function isOverCap(count: number | null | undefined): boolean {
  return typeof count === 'number' && count > EXPORT_LIMIT
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/**
 * Reads every matching row, one range at a time. `readRange(from, to)` runs the same ordered query with `.range(from, to)`.
 * The next range starts after the rows actually received (so a server that answers fewer than `pageRows` rows never makes
 * the reader skip or stop early), and reading stops once `total` rows are in hand or a range comes back empty. If more
 * than the cap arrive (rows added since the count), it reports `tooMany` and returns no rows.
 */
export async function readAllRows<T>(
  readRange: (from: number, to: number) => PromiseLike<PageResult<T>>,
  total: number,
  pageRows: number = PAGE_ROWS,
): Promise<{ rows: T[]; error: string | null; tooMany: boolean }> {
  const rows: T[] = []
  while (rows.length < total) {
    const { data, error } = await readRange(rows.length, rows.length + pageRows - 1)
    if (error) return { rows: [], error: error.message, tooMany: false }
    if (!data || data.length === 0) break
    rows.push(...data)
    if (rows.length > EXPORT_LIMIT) return { rows: [], error: null, tooMany: true }
  }
  return { rows, error: null, tooMany: false }
}
