import 'server-only'

import { isUuid } from '@/lib/utils'
import { documentContext } from '../server-context'

export type QuoteInvoiceRow = { id: string; number: string; status: string; total: number; currency: string; createdAt: string }

/** The invoices made from a quote (drafts included), newest first. Row level security limits them to the caller's organisation. */
export async function listInvoicesFromQuote(quoteId: string): Promise<QuoteInvoiceRow[]> {
  if (!isUuid(quoteId)) return []
  const { organization, db } = await documentContext()
  const result = await db
    .from('invoices')
    .select('id,invoice_number,status,total_amount,currency,created_at')
    .eq('quote_id', quoteId)
    .eq('organization_id', organization.id)
    .order('created_at', { ascending: false })
  if (result.error) throw result.error
  return ((result.data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    number: row.invoice_number,
    status: row.status,
    total: Number(row.total_amount),
    currency: row.currency,
    createdAt: row.created_at,
  }))
}
