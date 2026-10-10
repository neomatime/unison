'use server'

import { revalidatePath } from 'next/cache'

import { isUuid } from '@/lib/utils'
import { readStageChange } from '../fields'
import { revalidateWorkspacePages } from '../revalidate'
import { writeContext } from '../server-context'
import type { ActionState } from '../types'

export async function changeOpportunityStageAction(opportunityId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(opportunityId)) return { error: 'That opportunity is invalid.' }
  const change = readStageChange(form)
  if ('error' in change) return { error: change.error }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('sales_opportunities')
    .update({ stage: change.stage, lost_reason: change.lost_reason })
    .eq('id', opportunityId)
    .eq('organization_id', organization.id)
    .select('id')
    .maybeSingle()
  if (error) {
    return { error: String(error.message).includes('lost_reason') ? 'Say why this opportunity was lost.' : 'The stage could not be changed.' }
  }
  if (!data) return { error: 'That opportunity no longer exists.' }
  revalidateWorkspacePages()
  revalidatePath('/commercial/sales')
  return { success: `Stage changed to ${change.stage}.` }
}
