'use server'

import { revalidatePath } from 'next/cache'

import { roleHasPermission } from '@/config/roles'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'

/**
 * The payment reminders switch (accept to invoice, stage 3). Its own small action, apart from the company details and the other
 * billing switches, so saving one never touches the others. With it on (and billing plans on), the runner sends a friendly reminder
 * for an unpaid plan invoice 3 days after its due date and then every week, five in all; with it off no more are sent and the ones
 * already sent stay on record. It can only be switched on while billing plans are on: the update is conditioned on that, so a miss
 * means either no settings row or plans off. Only an owner or admin may change it; the database says the same through the policy on
 * organization_settings. The time it was turned on is stamped by the database, never written here: invoices that fell due before it
 * are never reminded.
 */
export async function setBillingRemindersEnabledAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { organization, role, db } = await documentContext()
  if (!roleHasPermission(role, 'company.manage')) return { error: 'Only an owner or admin can change this.' }
  const billing_reminders_enabled = form.has('enabled')
  let update = db
    .from('organization_settings')
    .update({ billing_reminders_enabled })
    .eq('organization_id', organization.id)
  if (billing_reminders_enabled) update = update.eq('billing_plans_enabled', true)
  const saved = await update.select('id')
  if (saved.error) {
    console.error('[documents:billing-reminders-switch]', saved.error)
    return { error: 'The setting could not be saved. Please try again.' }
  }
  if (!saved.data?.length) return { error: billing_reminders_enabled ? 'Turn on billing plans first, then try again.' : 'Save the company details first.' }
  revalidatePath('/settings/company')
  revalidateDocumentPages()
  return { success: billing_reminders_enabled ? 'Payment reminders switched on. An unpaid plan invoice that falls due from today gets a friendly reminder 3 days after its due date, then every week, five in all.' : 'Payment reminders switched off. No more reminders are sent; reminders already sent stay on record.' }
}
