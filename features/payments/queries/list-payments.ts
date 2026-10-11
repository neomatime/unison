import 'server-only'

import { cache } from 'react'

import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { isUuid } from '@/lib/utils'
import { documentContext } from '../../documents/server-context'

export type PaymentRow = {
  id: string
  amount: number
  receivedOn: string
  method: string
  reference: string | null
  recordedBy: string
  voided: boolean
  voidReason: string | null
  voidedBy: string | null
  voidedAt: string | null
}

/** The payments of one invoice, newest first, voided ones included. Cached so the header and the section share one load. */
export const listPayments = cache(async (invoiceId: string): Promise<PaymentRow[]> => {
  if (!isUuid(invoiceId)) return []
  const { organization, db } = await documentContext()
  const [rows, members] = await Promise.all([
    db
      .from('payments')
      .select('id,amount,received_on,method,reference,recorded_by,recorded_at,voided_at,voided_by,void_reason')
      .eq('invoice_id', invoiceId)
      .eq('organization_id', organization.id)
      .order('received_on', { ascending: false })
      .order('recorded_at', { ascending: false }),
    listOrganizationMembers(),
  ])
  if (rows.error) throw rows.error
  const names = new Map<string, string>(members.map((member) => [member.userId, member.displayName]))
  const who = (id: string | null) => (id && names.get(id)) || 'Former member'
  return ((rows.data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    receivedOn: row.received_on,
    method: row.method,
    reference: row.reference,
    recordedBy: who(row.recorded_by),
    voided: row.voided_at !== null,
    voidReason: row.void_reason,
    voidedBy: row.voided_at !== null ? who(row.voided_by) : null,
    voidedAt: row.voided_at,
  }))
})
