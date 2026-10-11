// Page arithmetic for the register footer and the database range. Pure: no directive, no imports.
import { PAGE_SIZE } from './read-register-params.ts'

export function pageWindow(requested: number, total: number, size: number = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(total / size))
  const page = Math.min(Math.max(1, Math.floor(requested) || 1), pageCount)
  const rangeFrom = (page - 1) * size
  return {
    page,
    pageCount,
    from: total === 0 ? 0 : rangeFrom + 1,
    to: Math.min(page * size, total),
    rangeFrom,
    rangeTo: rangeFrom + size - 1,
  }
}
