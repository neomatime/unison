'use server'

import { roleHasPermission } from '@/config/roles'
import { isUuid } from '@/lib/utils'
import { failureState } from '../action-failure'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'

/**
 * Pause or resume payment reminders on one invoice (accept to invoice, stage 3). Only an owner or admin may; the database says the
 * same (billing_reminders_set_paused), so the check here only saves the trip and is made before any database call. The invoice and
 * the direction are bound by the caller; the only thing read from the form is the reason (required to pause, optional to resume; the
 * database holds it to 1 to 500 characters once trimmed). Pausing is a person's recorded decision: it stops the reminders on this
 * invoice until someone resumes them, and the ones already sent stay on record.
 */
export async function setInvoiceRemindersPausedAction(invoiceId: string, paused: boolean, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(invoiceId)) return { error: 'That invoice was not found.' }
  const { role, db } = await documentContext()
  if (!roleHasPermission(role, 'company.manage')) return { error: 'Only an owner or admin can pause or resume reminders.' }
  const reason = String(form.get('reason') ?? '')
  const result = await db.rpc('billing_reminders_set_paused', { p_invoice_id: invoiceId, p_paused: paused, p_reason: reason })
  if (result.error) return failureState(result.error, 'That could not be done. Please try again.')
  revalidateDocumentPages()
  return { success: paused ? 'Reminders paused.' : 'Reminders resumed.' }
}
