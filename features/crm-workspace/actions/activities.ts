'use server'

import { isUuid } from '@/lib/utils'
import { readActivityFields } from '../fields'
import { fetchTimeline } from '../queries/get-record-workspace'
import { revalidateWorkspacePages } from '../revalidate'
import { writeContext } from '../server-context'
import type { ActionState, ParentKind, TimelinePage } from '../types'

const PARENT_COLUMN = { lead: 'lead_id', client: 'client_id', opportunity: 'opportunity_id', quote: 'quote_id' } as const

export async function logActivityAction(
  parentKind: ParentKind,
  parentId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!Object.hasOwn(PARENT_COLUMN, parentKind) || !isUuid(parentId)) return { error: 'That record is invalid.' }
  const fields = readActivityFields(form)
  if ('error' in fields) return { error: fields.error }
  const { organization, user, db } = await writeContext()
  const { error } = await db.from('activities').insert({
    organization_id: organization.id,
    kind: fields.kind,
    subject: fields.subject,
    body: fields.body,
    ...(fields.occurred_at ? { occurred_at: fields.occurred_at } : {}),
    created_by: user.id,
    [PARENT_COLUMN[parentKind]]: parentId,
  })
  if (error) return { error: error.code === '23503' ? 'That record no longer exists.' : 'The activity could not be saved.' }
  revalidateWorkspacePages()
  return { success: 'Activity logged.' }
}

export async function updateActivityAction(activityId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(activityId)) return { error: 'That entry is invalid.' }
  const fields = readActivityFields(form)
  if ('error' in fields) return { error: fields.error }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('activities')
    .update({ kind: fields.kind, subject: fields.subject, body: fields.body, ...(fields.occurred_at ? { occurred_at: fields.occurred_at } : {}) })
    .eq('id', activityId)
    .eq('organization_id', organization.id)
    .select('id')
    .maybeSingle()
  if (error) return { error: 'The entry could not be updated.' }
  // RLS expresses "not yours to change", and a system entry, as zero rows.
  if (!data) return { error: 'That entry no longer exists, or is not yours to change.' }
  revalidateWorkspacePages()
  return { success: 'Entry updated.' }
}

export async function deleteActivityAction(activityId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(activityId)) return { error: 'That entry is invalid.' }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('activities')
    .delete()
    .eq('id', activityId)
    .eq('organization_id', organization.id)
    .select('id')
  if (error) return { error: 'The entry could not be removed.' }
  if (!data || data.length === 0) return { error: 'That entry no longer exists, or is not yours to remove.' }
  revalidateWorkspacePages()
  return { success: 'Entry removed.' }
}

/** Not a form action: the timeline's "Load more" calls it with the last entry shown. */
export async function loadMoreTimelineAction(
  kind: ParentKind,
  id: string,
  beforeAt: string,
  beforeId: string,
): Promise<TimelinePage | { error: string }> {
  if (!Object.hasOwn(PARENT_COLUMN, kind) || !isUuid(id) || !isUuid(beforeId) || Number.isNaN(new Date(beforeAt).getTime())) {
    return { error: 'That page of the timeline is invalid.' }
  }
  try {
    const { db } = await writeContext()
    return await fetchTimeline(db, kind, id, { at: beforeAt, id: beforeId })
  } catch {
    return { error: 'The timeline could not be loaded.' }
  }
}
