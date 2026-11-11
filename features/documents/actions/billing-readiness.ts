'use server'

import { roleHasPermission } from '@/config/roles'
import { isUuid } from '@/lib/utils'
import { failureState } from '../action-failure'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'

/**
 * Decide that the work on a quote may start although its start date has not arrived or its first invoice is not paid, or take that
 * decision back (accept to invoice, stage 4). Only an owner or admin may; the database says the same
 * (billing_set_readiness_override), so the check here only saves the trip and is made before any database call. The quote and the
 * direction are bound by the caller; the only thing read from the form is the reason (required to decide, optional to remove; the
 * database holds it to 1 to 500 characters once trimmed). The decision is recorded with who made it and why; it never changes an
 * invoice, and nothing is sent anywhere.
 */
export async function setBillingReadinessOverrideAction(quoteId: string, override: boolean, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(quoteId)) return { error: 'That quote was not found.' }
  const { role, db } = await documentContext()
  if (!roleHasPermission(role, 'company.manage')) return { error: 'Only an owner or admin can decide this.' }
  const reason = String(form.get('reason') ?? '')
  const result = await db.rpc('billing_set_readiness_override', { p_quote_id: quoteId, p_override: override, p_reason: reason })
  if (result.error) return failureState(result.error, 'That could not be done. Please try again.')
  revalidateDocumentPages()
  return { success: override ? 'Start decision saved.' : 'Start decision removed.' }
}
