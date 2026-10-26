'use server'

import { revalidatePath } from 'next/cache'

import { roleHasPermission } from '@/config/roles'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'

/**
 * The billing plans switch (accept to invoice, stage 1). It is its own small action, apart from the company details
 * and apart from the client portal switch, so saving one never touches the others. It gates only what happens from
 * now on: with it off, an accepted quote gets no billing plan and nothing more is approved; plans already made stay
 * on their quotes. Only an owner or admin may change it; the database says the same through the policy on
 * organization_settings, which is why no updated row means there is nothing to switch. The time the switch was
 * turned on is stamped by the database, never written here.
 */
export async function setBillingPlansEnabledAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { organization, role, db } = await documentContext()
  if (!roleHasPermission(role, 'company.manage')) return { error: 'Only an owner or admin can change this.' }
  const billing_plans_enabled = form.has('enabled')
  const saved = await db
    .from('organization_settings')
    .update({ billing_plans_enabled })
    .eq('organization_id', organization.id)
    .select('id')
  if (saved.error) {
    console.error('[documents:billing-switch]', saved.error)
    return { error: 'The setting could not be saved. Please try again.' }
  }
  if (!saved.data?.length) return { error: 'Save the company details first.' }
  revalidatePath('/settings/company')
  revalidateDocumentPages()
  return { success: billing_plans_enabled ? 'Billing plans switched on. A quote accepted on the portal now gets a billing plan and a draft first invoice for approval.' : 'Billing plans switched off. Nothing new is created and nothing more is approved; existing plans stay on their quotes.' }
}
