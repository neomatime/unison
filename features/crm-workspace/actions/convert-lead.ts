'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { isUuid } from '@/lib/utils'
import { readConvertTarget } from '../fields'
import { revalidateWorkspacePages } from '../revalidate'
import { writeContext } from '../server-context'
import type { ActionState } from '../types'

// convert_lead raises these tokens (see 20261010110000_crm_convert_lead.sql).
const MESSAGES: Record<string, string> = {
  LEAD_NOT_FOUND: 'That lead no longer exists, or is not yours.',
  LEAD_ARCHIVED: 'This lead is archived and cannot be converted.',
  LEAD_ALREADY_CONVERTED: 'This lead has already been converted.',
  CLIENT_NOT_FOUND: 'That client no longer exists or is archived.',
}

export async function convertLeadAction(leadId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(leadId)) return { error: 'That lead is invalid.' }
  const target = readConvertTarget(form)
  if ('error' in target) return { error: target.error }
  const { db } = await writeContext()
  const { data, error } = await db.rpc('convert_lead', { p_lead_id: leadId, p_client_id: target.clientId })
  if (error) {
    const token = Object.keys(MESSAGES).find((key) => String(error.message).includes(key))
    if (token) return { error: MESSAGES[token] }
    // A blank contact name fails the contacts check after the client was created; the
    // whole conversion rolled back.
    if (error.code === '23514' && String(error.message).includes('contacts')) {
      return { error: "The lead's contact name is blank. Add a contact name to the lead, then convert it. Nothing was changed." }
    }
    return { error: 'The lead could not be converted. Nothing was changed.' }
  }
  revalidateWorkspacePages()
  revalidatePath('/commercial/leads')
  revalidatePath('/commercial/sales')
  revalidatePath('/operations/clients')
  // redirect() throws, so it stays outside any try/catch.
  redirect(`/commercial/sales/${data.opportunity_id}`)
}
