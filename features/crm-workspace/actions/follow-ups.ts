'use server'

import { isUuid } from '@/lib/utils'
import { readFollowUpFields, resolveFollowUpAssignee } from '../fields'
import { revalidateWorkspacePages } from '../revalidate'
import { writeContext } from '../server-context'
import type { ActionState } from '../types'

const PARENT_COLUMN = { lead: 'lead_id', client: 'client_id', opportunity: 'opportunity_id' } as const

export async function addFollowUpAction(
  parentKind: 'lead' | 'client' | 'opportunity',
  parentId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!(parentKind in PARENT_COLUMN) || !isUuid(parentId)) return { error: 'That record is invalid.' }
  const fields = readFollowUpFields(form)
  if ('error' in fields) return { error: fields.error }
  const { organization, user, db } = await writeContext()

  // The signed-in user's own team profile, used when no assignee was chosen.
  const profiles = await db
    .from('team_members')
    .select('id')
    .eq('organization_id', organization.id)
    .eq('user_id', user.id)
    .is('archived_at', null)
  if (profiles.error) return { error: 'The follow-up could not be added.' }
  const assigneeId = resolveFollowUpAssignee(fields.assignee_id, (profiles.data ?? []).map((row: { id: string }) => row.id))

  // A follow-up on an opportunity also belongs to its client, so it shows on the client page.
  let clientId: string | null = parentKind === 'client' ? parentId : null
  if (parentKind === 'opportunity') {
    const opportunity = await db
      .from('sales_opportunities')
      .select('client_id')
      .eq('id', parentId)
      .eq('organization_id', organization.id)
      .maybeSingle()
    if (opportunity.error) return { error: 'The follow-up could not be added.' }
    if (!opportunity.data) return { error: 'That record no longer exists.' }
    clientId = opportunity.data.client_id
  }

  const { error } = await db.from('tasks').insert({
    organization_id: organization.id,
    title: fields.title,
    priority: fields.priority,
    due_at: fields.due_at,
    assignee_id: assigneeId,
    created_by: user.id,
    status: 'Planned',
    [PARENT_COLUMN[parentKind]]: parentId,
    ...(clientId && parentKind !== 'client' ? { client_id: clientId } : {}),
  })
  if (error) return { error: error.code === '23503' ? 'That record no longer exists.' : 'The follow-up could not be added.' }
  revalidateWorkspacePages()
  return { success: 'Follow-up added.' }
}

export async function setFollowUpDoneAction(
  taskId: string,
  done: boolean,
  _previous: ActionState,
  _form: FormData,
): Promise<ActionState> {
  if (!isUuid(taskId)) return { error: 'That follow-up is invalid.' }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('tasks')
    .update({ status: done ? 'Complete' : 'Planned', completed_at: done ? new Date().toISOString() : null })
    .eq('id', taskId)
    .eq('organization_id', organization.id)
    .select('id')
    .maybeSingle()
  if (error) return { error: 'The follow-up could not be updated.' }
  if (!data) return { error: 'That follow-up no longer exists.' }
  revalidateWorkspacePages()
  return { success: done ? 'Follow-up completed.' : 'Follow-up reopened.' }
}
