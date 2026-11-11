import 'server-only'

import { roleHasPermission } from '@/config/roles'
import { isUuid } from '@/lib/utils'
import { documentContext } from '../server-context'

export type InvoiceRemindersView = {
  enabled: boolean
  canManage: boolean
  paused: { reason: string } | null
  sent: Array<{ sequence: number; sentOn: string; to: string }>
  dueDate: string | null
  status: string
  balance: number
}

/**
 * What the invoice page shows about an invoice's payment reminders (accept to invoice, stage 3); null for an invoice that belongs to no
 * billing plan (reminders cover plan invoices only). Read with the member's own client, so row level security limits it to the caller's
 * organisation, and nothing is written. Only reminders that went out are listed: a claim that never became a send is not a reminder.
 * "Enabled" is both switches: the runner needs billing plans and payment reminders on.
 */
export async function getInvoiceReminders(invoiceId: string): Promise<InvoiceRemindersView | null> {
  if (!isUuid(invoiceId)) return null
  const { organization, role, db } = await documentContext()

  const invoice = await db
    .from('invoices')
    .select('status,due_date,balance_amount,billing_plan_item_id')
    .eq('id', invoiceId)
    .eq('organization_id', organization.id)
    .maybeSingle()
  if (invoice.error) throw invoice.error
  const itemId = invoice.data?.billing_plan_item_id
  if (typeof itemId !== 'string' || !isUuid(itemId)) return null

  const [item, sent, settings] = await Promise.all([
    db.from('billing_plan_items').select('reminders_paused_at,reminders_pause_reason').eq('id', itemId).eq('organization_id', organization.id).maybeSingle(),
    db
      .from('billing_reminders')
      .select('sequence,sent_at,to_address')
      .eq('invoice_id', invoiceId)
      .eq('organization_id', organization.id)
      .not('sent_at', 'is', null)
      .order('sequence'),
    db.from('organization_settings').select('billing_plans_enabled,billing_reminders_enabled').eq('organization_id', organization.id).maybeSingle(),
  ])
  for (const result of [item, sent, settings]) {
    if (result.error) throw result.error
  }

  return {
    enabled: settings.data?.billing_plans_enabled === true && settings.data?.billing_reminders_enabled === true,
    canManage: roleHasPermission(role, 'company.manage'),
    paused: item.data?.reminders_paused_at ? { reason: String(item.data.reminders_pause_reason ?? '') } : null,
    sent: ((sent.data ?? []) as Array<Record<string, any>>).map((row) => ({
      sequence: Number(row.sequence),
      sentOn: String(row.sent_at).slice(0, 10),
      to: String(row.to_address ?? ''),
    })),
    dueDate: invoice.data?.due_date ?? null,
    status: String(invoice.data?.status ?? ''),
    balance: Number(invoice.data?.balance_amount ?? 0),
  }
}
