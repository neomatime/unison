'use server'

import { roleHasPermission } from '@/config/roles'
import { isUuid } from '@/lib/utils'
import { failureState } from '../action-failure'
import { BILLING_PLAN_COPY, approvedNotEmailedSentence, parseChecksFailed } from '../billing-plan-view'
import { HOURLY_EMAIL_CAP } from '../email'
import { getDocument } from '../queries/get-document'
import { getEmailDefaults } from '../queries/get-email-defaults'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'
import { emailDocumentAction } from './email'

/**
 * Approve the first invoice of a billing plan and email it (accept to invoice, stage 1). Only an owner or admin may; the database says
 * the same (approve_first_invoice), so the check here only saves the trip and is made before any database call. The organisation's hourly
 * email cap is checked next, before the approval, because the approval is final: the invoice is numbered and issued for good. Then the invoice goes out through the existing email action, with the defaults the Email
 * to client form starts with, so the sender, the PDF, the limits and the record of the send are the ones every other invoice email has.
 *
 * Three outcomes, told apart: refused (nothing changed; the sentence says why), approved and emailed (only when the email action
 * itself returned success), and approved but not emailed (an error that says so and where to send it from). A refusal because a check
 * failed also refreshes the pages, so the panel lists what needs attention instead of the page staying as it was.
 */
export async function approveFirstInvoiceAction(itemId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(itemId)) return { error: 'That billing item was not found.' }
  const { organization, role, db } = await documentContext()
  if (!roleHasPermission(role, 'company.manage')) return { error: BILLING_PLAN_COPY.approveAdminOnly }

  // The hourly email cap is checked before the invoice is numbered, as the email action counts it: an approval that would only run into
  // the cap afterwards would leave an issued invoice that cannot be sent. A failed count stops the approval: nothing falls back to no limit.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recent = await db.from('document_emails').select('id', { count: 'exact', head: true }).eq('organization_id', organization.id).gte('sent_at', since)
  if (recent.error) return { error: 'The email limit could not be checked. Please try again.' }
  if ((recent.count ?? 0) >= HOURLY_EMAIL_CAP) {
    return { error: `This organisation has sent ${HOURLY_EMAIL_CAP} document emails in the last hour; try again later.` }
  }

  const approved = await db.rpc('approve_first_invoice', { p_item_id: itemId })
  if (approved.error) {
    if (parseChecksFailed(approved.error.message).length > 0) revalidateDocumentPages()
    return failureState(approved.error, BILLING_PLAN_COPY.fallback)
  }
  revalidateDocumentPages()

  const issued = approved.data as { invoice_id?: unknown; number?: unknown } | null
  const invoiceId = issued?.invoice_id
  const number = issued?.number
  if (typeof invoiceId !== 'string' || !isUuid(invoiceId) || typeof number !== 'string') return { error: BILLING_PLAN_COPY.approvedUnreadable }

  try {
    const bundle = await getDocument('invoice', invoiceId)
    if (!bundle) return { error: approvedNotEmailedSentence(number, BILLING_PLAN_COPY.invoiceNotLoaded) }
    const defaults = await getEmailDefaults('invoice', bundle)
    if (!defaults.to) return { error: approvedNotEmailedSentence(number, BILLING_PLAN_COPY.noAddress) }
    const email = new FormData()
    email.set('to', defaults.to)
    email.set('subject', defaults.subject)
    email.set('body', defaults.body)
    const sent = await emailDocumentAction('invoice', invoiceId, undefined, email)
    if (sent?.success) return { success: `Invoice ${number} approved and emailed to ${defaults.to}.` }
    return { error: approvedNotEmailedSentence(number, sent?.error ?? BILLING_PLAN_COPY.emailDidNotGo) }
  } catch (error) {
    console.error('[documents:billing-plan]', error)
    return { error: approvedNotEmailedSentence(number, BILLING_PLAN_COPY.emailNotPrepared) }
  }
}

/** The "Create invoice" button of one month of a plan: any member may make the draft; the database checks the month is the first or due. */
export async function createPlanItemInvoiceAction(itemId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(itemId)) return { error: 'That billing item was not found.' }
  const { db } = await documentContext()
  const result = await db.rpc('create_plan_item_invoice', { p_item_id: itemId })
  if (result.error) return failureState(result.error, BILLING_PLAN_COPY.fallback)
  revalidateDocumentPages()
  return { success: BILLING_PLAN_COPY.draftCreated }
}

/**
 * Pause, resume or end a plan. Only an owner or admin may. The plan and the word are bound by the caller; the only thing read from the
 * form is the reason (required to pause and to end, optional to resume; the database holds it to 1 to 500 characters once trimmed).
 */
export async function setBillingPlanStateAction(planId: string, action: 'pause' | 'resume' | 'end', _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(planId)) return { error: 'That billing plan was not found.' }
  if (action !== 'pause' && action !== 'resume' && action !== 'end') return { error: 'Choose pause, resume or end.' }
  const { role, db } = await documentContext()
  if (!roleHasPermission(role, 'company.manage')) return { error: BILLING_PLAN_COPY.planAdminOnly }
  const reason = String(form.get('reason') ?? '')
  const result = await db.rpc('billing_plan_set_state', { p_plan_id: planId, p_action: action, p_reason: reason })
  if (result.error) return failureState(result.error, BILLING_PLAN_COPY.fallback)
  revalidateDocumentPages()
  return { success: BILLING_PLAN_COPY.stateDone[action] }
}
