'use server'

import { revalidatePath } from 'next/cache'

import { roleHasPermission } from '@/config/roles'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'

/**
 * The automatic sending switch (accept to invoice, stage 2). Its own small action, apart from the company details, the portal switch
 * and the billing plans switch, so saving one never touches the others. With it on (and billing plans on), the runner issues and
 * emails each month of an approved plan on its date; with it off nothing more is issued or emailed automatically, and invoices
 * already issued stay as they are. It can only be switched on while billing plans are on: the update is conditioned on that, so a
 * miss means either no settings row or plans off. Only an owner or admin may change it; the database says the same through the
 * policy on organization_settings. The time it was turned on is stamped by the database, never written here.
 */
export async function setBillingAutoSendEnabledAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { organization, role, db } = await documentContext()
  if (!roleHasPermission(role, 'company.manage')) return { error: 'Only an owner or admin can change this.' }
  const billing_auto_send_enabled = form.has('enabled')
  let update = db
    .from('organization_settings')
    .update({ billing_auto_send_enabled })
    .eq('organization_id', organization.id)
  if (billing_auto_send_enabled) update = update.eq('billing_plans_enabled', true)
  const saved = await update.select('id')
  if (saved.error) {
    console.error('[documents:billing-auto-switch]', saved.error)
    return { error: 'The setting could not be saved. Please try again.' }
  }
  if (!saved.data?.length) return { error: billing_auto_send_enabled ? 'Turn on billing plans first, then try again.' : 'Save the company details first.' }
  revalidatePath('/settings/company')
  revalidateDocumentPages()
  return { success: billing_auto_send_enabled ? 'Automatic sending switched on. Each month of an approved billing plan is now issued and emailed on its date, after the same checks as the first invoice.' : 'Automatic sending switched off. Nothing more is issued or emailed automatically; invoices already issued stay as they are.' }
}
