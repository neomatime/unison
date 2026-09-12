'use server'

import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

export type RequirementActionState = { error?: string; success?: string } | undefined

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']
const STATUSES = ['Draft', 'Approved', 'In Progress', 'Delivered', 'Verified']

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const optional = (form: FormData, key: string) => value(form, key) || null

async function context() {
  const { organization } = await getSessionContext()
  return { organization, supabase: (await createServerSupabase()) as any }
}

function readFields(form: FormData) {
  const title = value(form, 'title')
  if (!title) return { error: 'A title is required.' }
  const priority = value(form, 'priority')
  if (!PRIORITIES.includes(priority)) return { error: 'Choose a valid priority.' }
  const status = value(form, 'status')
  if (!STATUSES.includes(status)) return { error: 'Choose a valid status.' }
  const ownerId = optional(form, 'ownerId')
  if (ownerId && !isUuid(ownerId)) return { error: 'Choose a valid owner.' }
  return {
    title,
    priority,
    status,
    description: optional(form, 'description'),
    owner_id: ownerId,
    target_date: optional(form, 'targetDate'),
  }
}

export async function createRequirementAction(
  projectId: string,
  _previous: RequirementActionState,
  form: FormData,
): Promise<RequirementActionState> {
  if (!isUuid(projectId)) return { error: 'That project is invalid.' }
  const fields = readFields(form)
  if ('error' in fields) return fields
  const { organization, supabase } = await context()
  const { error } = await supabase.from('requirements').insert({
    organization_id: organization.id,
    project_id: projectId,
    ...fields,
  })
  if (error) return { error: 'The requirement could not be recorded.' }
  revalidatePath(`/operations/projects/${projectId}`)
  return { success: 'Requirement recorded.' }
}

export async function updateRequirementAction(
  requirementId: string,
  _previous: RequirementActionState,
  form: FormData,
): Promise<RequirementActionState> {
  if (!isUuid(requirementId)) return { error: 'That requirement is invalid.' }
  const fields = readFields(form)
  if ('error' in fields) return fields
  const { organization, supabase } = await context()
  const { data, error } = await supabase.from('requirements')
    .update(fields)
    .eq('id', requirementId).eq('organization_id', organization.id)
    .select('project_id').maybeSingle()
  if (error || !data) return { error: 'The requirement could not be updated.' }
  revalidatePath(`/operations/projects/${data.project_id}`)
  return { success: 'Requirement updated.' }
}

export async function deleteRequirementAction(
  requirementId: string,
  _previous: RequirementActionState,
  form: FormData,
): Promise<RequirementActionState> {
  if (!isUuid(requirementId)) return { error: 'That requirement is invalid.' }
  const { organization, supabase } = await context()
  // organization_id is redundant with RLS and stated anyway: a delete whose
  // filter is wrong deletes nothing rather than something else.
  const { data, error } = await supabase.from('requirements')
    .delete().eq('id', requirementId).eq('organization_id', organization.id)
    .select('id, project_id')
  if (error) return { error: 'The requirement could not be removed.' }
  if (!data || data.length === 0) return { error: 'That requirement no longer exists, or is not yours.' }
  revalidatePath(`/operations/projects/${data[0].project_id}`)
  return { success: 'Requirement removed.' }
}
