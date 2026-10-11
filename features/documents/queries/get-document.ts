import 'server-only'

import { cache } from 'react'

import { isUuid } from '@/lib/utils'
import { documentContext } from '../server-context'
import type { CompanySettings, DocumentLine } from '../types'
import { DOCUMENTS, isDocumentKind, type DocumentKind } from '../vocabulary'

export type DocumentBundle = {
  record: Record<string, any>
  lines: DocumentLine[]
  client: Record<string, any> | null
  settings: CompanySettings | null
}

/**
 * A quote or invoice with its lines, its live client and the company details; null when it does not exist.
 * Wrapped in cache() so the header actions and the lines editor of one page share a single load per request.
 */
export const getDocument = cache(async (kind: DocumentKind, id: string): Promise<DocumentBundle | null> => {
  if (!isDocumentKind(kind) || !isUuid(id)) return null
  const { organization, db } = await documentContext()
  const info = DOCUMENTS[kind]
  const found = await db.from(info.table).select('*').eq('id', id).eq('organization_id', organization.id).maybeSingle()
  if (found.error) throw found.error
  if (!found.data) return null
  const record = found.data as Record<string, any>

  const [lines, client, settings] = await Promise.all([
    db.from(info.lines).select('*').eq(info.parentColumn, id).eq('organization_id', organization.id).order('position').order('created_at'),
    record.client_id
      ? db.from('clients').select('name,address_line1,address_line2,city,postal_code,country,vat_number,billing_email').eq('id', record.client_id).eq('organization_id', organization.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from('organization_settings').select('*').eq('organization_id', organization.id).maybeSingle(),
  ])
  for (const result of [lines, client, settings]) {
    if (result.error) throw result.error
  }
  return {
    record,
    lines: (lines.data ?? []) as DocumentLine[],
    client: (client.data as Record<string, any> | null) ?? null,
    settings: (settings.data as CompanySettings | null) ?? null,
  }
})
