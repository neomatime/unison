'use server'

import { revalidatePath } from 'next/cache'

import { isUuid } from '@/lib/utils'
import { failureState } from '../../documents/action-failure'
import { revalidateDocumentPages } from '../../documents/revalidate'
import { documentContext } from '../../documents/server-context'
import type { ActionState } from '../../documents/types'
import { readPaymentFields, readVoidReason } from '../fields'

function refresh() {
  revalidateDocumentPages()
  revalidatePath('/finance/forecast')
}

export async function recordPaymentAction(invoiceId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(invoiceId)) return { error: 'That invoice was not found.' }
  const fields = readPaymentFields(form)
  if ('error' in fields) return { error: fields.error }
  const { db } = await documentContext()
  const result = await db.rpc('record_payment', {
    p_invoice: invoiceId,
    p_amount: fields.amount,
    p_received_on: fields.received_on,
    p_method: fields.method,
    p_reference: fields.reference,
  })
  if (result.error) return failureState(result.error, 'The payment could not be recorded. Please try again.')
  refresh()
  return { success: 'Payment recorded.' }
}

export async function voidPaymentAction(paymentId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(paymentId)) return { error: 'That payment was not found.' }
  const reason = readVoidReason(form)
  if ('error' in reason) return { error: reason.error }
  const { db } = await documentContext()
  const result = await db.rpc('void_payment', { p_payment: paymentId, p_reason: reason.reason })
  if (result.error) return failureState(result.error, 'The payment could not be voided. Please try again.')
  refresh()
  return { success: 'Payment voided.' }
}

export async function cancelInvoiceAction(invoiceId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(invoiceId)) return { error: 'That invoice was not found.' }
  const { db } = await documentContext()
  const result = await db.rpc('cancel_invoice', { p_invoice: invoiceId })
  if (result.error) return failureState(result.error, 'The invoice could not be cancelled. Please try again.')
  refresh()
  return { success: 'Invoice cancelled.' }
}
