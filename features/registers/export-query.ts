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
