'use server'

import { revalidatePath } from 'next/cache'

import { roleHasPermission } from '@/config/roles'
import { revalidateDocumentPages } from '../revalidate'
import { documentContext } from '../server-context'
import type { ActionState } from '../types'

/**
 * The quote portal switch (quote portal, slice 1). It is its own small action, apart from the company details,
 * so saving one never touches the other. It gates only the minting of new links: links already sent keep working
 * when it is turned off, until someone revokes them. Only an owner or admin may change it; the database says the
 * same through the policy on organization_settings, which is why no updated row means there is nothing to switch.
 */
export async function setQuotePortalEnabledAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { organization, role, db } = await documentContext()
  if (!roleHasPermission(role, 'company.manage')) return { error: 'Only an owner or admin can change this.' }
  const quote_portal_enabled = form.has('enabled')
  const saved = await db
    .from('organization_settings')
    .update({ quote_portal_enabled })
    .eq('organization_id', organization.id)
    .select('id')
  if (saved.error) {
    console.error('[documents:portal-switch]', saved.error)
    return { error: 'The setting could not be saved. Please try again.' }
  }
  if (!saved.data?.length) return { error: 'Save the company details first.' }
  revalidatePath('/settings/company')
  revalidateDocumentPages()
  return { success: quote_portal_enabled ? 'Client portal switched on. New quote emails carry a secure link.' : 'Client portal switched off. Quote emails go out as before; links already sent keep working until you revoke them.' }
}
