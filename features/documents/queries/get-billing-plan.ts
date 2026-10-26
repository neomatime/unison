import 'server-only'

import { roleHasPermission } from '@/config/roles'
import { isUuid } from '@/lib/utils'
import { isAwaitingApproval, type BillingPlanItemView, type BillingPlanView, type PlanItemInvoice, type PlanStatus } from '../billing-plan-view'
import { documentContext } from '../server-context'

/**
 * The billing plan of a quote, for the panel on the quote page; null when the quote has none. Read with the member's own client, so row
 * level security limits it to the caller's organisation, and nothing is written.
 *
 * An invoice that is an archived Draft is a discarded one: the database lets its month go the next time it is built (and cancels the month
 * when a plan ends), so it is not the month's invoice here either. Every other invoice linked to a month, a Cancelled one included, is.
 *
 * `blockers` is read only while the first invoice awaits approval (it is the only time the list can matter), and `emailed` only once that
 * invoice is not a Draft: a row in document_emails is written only after the mail server accepted the message.
 */
export async function getBillingPlan(quoteId: string): Promise<BillingPlanView | null> {
  if (!isUuid(quoteId)) return null
  const { organization, role, db } = await documentContext()

  const plan = await db
    .from('billing_plans')
    .select('id,status,status_reason,start_date,term_months')
    .eq('quote_id', quoteId)
    .eq('organization_id', organization.id)
    .maybeSingle()
  if (plan.error) throw plan.error
  if (!plan.data) return null
  const planRow = plan.data as Record<string, any>
  const planStatus = planRow.status as PlanStatus

  const itemRows = await db
    .from('billing_plan_items')
    .select('id,kind,month_number,bill_on,status,approved_at')
    .eq('plan_id', planRow.id)
    .eq('organization_id', organization.id)
    .order('month_number')
  if (itemRows.error) throw itemRows.error
  const rows = (itemRows.data ?? []) as Array<Record<string, any>>

  const invoiceByItem = new Map<string, PlanItemInvoice>()
  if (rows.length > 0) {
    const invoiceRows = await db
      .from('invoices')
      .select('id,invoice_number,status,billing_plan_item_id,archived_at')
      .in('billing_plan_item_id', rows.map((row) => row.id))
      .eq('organization_id', organization.id)
    if (invoiceRows.error) throw invoiceRows.error
    for (const row of (invoiceRows.data ?? []) as Array<Record<string, any>>) {
      if (row.status === 'Draft' && row.archived_at) continue
      invoiceByItem.set(row.billing_plan_item_id, { id: row.id, number: row.invoice_number, status: row.status })
    }
  }

  const items: BillingPlanItemView[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    monthNumber: Number(row.month_number),
    billOn: String(row.bill_on),
    status: row.status,
    approvedAt: row.approved_at ?? null,
    invoice: invoiceByItem.get(row.id) ?? null,
  }))

  const firstItem = items.find((item) => item.kind === 'first')
  let blockers: string[] = []
  if (firstItem?.invoice && isAwaitingApproval(firstItem, firstItem.invoice, planStatus)) {
    const readiness = await db.rpc('billing_invoice_readiness', { p_invoice_id: firstItem.invoice.id })
    if (readiness.error) throw readiness.error
    blockers = Array.isArray(readiness.data) ? readiness.data.map(String) : []
  }

  let emailed = false
  if (firstItem?.invoice && firstItem.invoice.status !== 'Draft') {
    const sent = await db
      .from('document_emails')
      .select('id')
      .eq('invoice_id', firstItem.invoice.id)
      .eq('organization_id', organization.id)
      .limit(1)
    if (sent.error) throw sent.error
    emailed = ((sent.data ?? []) as unknown[]).length > 0
  }

  return {
    plan: {
      id: planRow.id,
      status: planStatus,
      statusReason: planRow.status_reason ?? null,
      startDate: planRow.start_date ?? null,
      termMonths: planRow.term_months === null || planRow.term_months === undefined ? null : Number(planRow.term_months),
    },
    items,
    blockers,
    emailed,
    canManage: roleHasPermission(role, 'company.manage'),
  }
}
