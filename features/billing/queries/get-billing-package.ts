import 'server-only'

import { documentContext } from '@/features/documents/server-context'
import { isUuid } from '@/lib/utils'
import { buildBillingPackageView, type BillingPackageView } from '../billing-package-model'

const RATE_COLUMNS = 'rate_key,item_kind,package_key,title,unit_price,credits,initiative_limit,rate_status'

/** Everything the client page's Billing package section shows, or null when the id is not a client of this organisation. */
export async function getBillingPackage(clientId: string): Promise<BillingPackageView | null> {
  if (!isUuid(clientId)) return null
  const { organization, db } = await documentContext()
  const engagements = await db
    .from('client_engagements')
    .select('id,kind,package_key,start_date,ended_on,replaces_id,root_id')
    .eq('organization_id', organization.id)
    .eq('client_id', clientId)
    .order('start_date')
  if (engagements.error) throw engagements.error
  const engagementRows = engagements.data ?? []
  const ids: string[] = engagementRows.map((row: { id: string }) => row.id)
  const rootIds: string[] = [...new Set<string>(engagementRows.map((row: { root_id: string }) => row.root_id))]

  const [rates, support, firsts, documents] = await Promise.all([
    db.from('price_list_items').select(RATE_COLUMNS).eq('organization_id', organization.id).not('rate_key', 'is', null).is('archived_at', null),
    ids.length
      ? db.from('engagement_support').select('id,engagement_id,service_key,start_date,ended_on').eq('organization_id', organization.id).in('engagement_id', ids).order('start_date')
      : Promise.resolve({ data: [], error: null }),
    rootIds.length
      ? db.from('invoices').select('engagement_id').eq('organization_id', organization.id).eq('billing_kind', 'first').neq('status', 'Cancelled').in('engagement_id', rootIds)
      : Promise.resolve({ data: [], error: null }),
    db.from('invoices')
      .select('id,invoice_number,status,billing_kind,billing_month,total_amount,currency,created_at')
      .eq('organization_id', organization.id).eq('client_id', clientId).not('billing_kind', 'is', null)
      .order('created_at', { ascending: false }).limit(15),
  ])
  for (const result of [rates, support, firsts, documents]) if (result.error) throw result.error
  return buildBillingPackageView({
    // The South African calendar date, as private.sa_today() gives it to the database functions ('en-CA' formats YYYY-MM-DD).
    today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date()),
    engagements: engagementRows,
    support: support.data ?? [],
    rateRows: rates.data ?? [],
    firstInvoiceEngagementIds: (firsts.data ?? []).map((row: { engagement_id: string }) => row.engagement_id),
    documents: documents.data ?? [],
  })
}
