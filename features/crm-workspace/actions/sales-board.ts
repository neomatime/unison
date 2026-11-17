'use server'

import { revalidatePath } from 'next/cache'

import { rightDenied } from '@/features/rights/server'
import { isUuid } from '@/lib/utils'
import { readStageChange } from '../fields'
import { revalidateWorkspacePages } from '../revalidate'
import { writeContext } from '../server-context'

export type MoveSalesResult = { ok: true; probability: number } | { ok: false; error: string }

/**
 * Saves a card dropped on a new stage of the Sales board. It uses the same stage rule as the "Change stage" control on the
 * opportunity (a valid stage, and a reason when it is Lost), limited to this workspace and to opportunities that are not archived.
 */
export async function moveOpportunityStageBoardAction(id: string, stage: string, lostReason?: string): Promise<MoveSalesResult> {
  const denied = await rightDenied('sales', 'edit')
  if (denied) return { ok: false, error: denied }
  if (!isUuid(id)) return { ok: false, error: 'That move is not valid.' }
  const form = new FormData()
  form.set('stage', stage)
  if (lostReason) form.set('lostReason', lostReason)
  const change = readStageChange(form)
  if ('error' in change) return { ok: false, error: change.error }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('sales_opportunities')
    .update({ stage: change.stage, lost_reason: change.lost_reason })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .is('archived_at', null)
    .select('probability_percent')
    .maybeSingle()
  if (error) return { ok: false, error: String(error.message).includes('lost_reason') ? 'Say why this opportunity was lost.' : 'The move could not be saved. Try again.' }
  if (!data) return { ok: false, error: 'This opportunity could not be found. It may have been archived.' }
  revalidateWorkspacePages()
  revalidatePath('/commercial/sales')
  revalidatePath(`/commercial/sales/${id}`)
  return { ok: true, probability: Number(data.probability_percent ?? 0) }
}
