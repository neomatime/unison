'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { roleHasPermission } from '@/config/roles'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { organizationProfileInputSchema } from '../schemas/organization-profile'

export type OrganizationProfileActionState = {
  error?: string
  fieldErrors?: { name?: string[] }
} | undefined

export async function updateOrganizationProfileAction(
  _previousState: OrganizationProfileActionState,
  formData: FormData,
): Promise<OrganizationProfileActionState> {
  const parsed = organizationProfileInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

  const { organization, role } = await getSessionContext()
  if (!roleHasPermission(role, 'organization.manage')) {
    return { error: 'Only the organisation owner can edit organisation details.' }
  }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('organizations')
    .update({ name: parsed.data.name })
    .eq('id', organization.id)
    .select('id')

  if (error) return { error: 'The organisation could not be updated.' }
  if (!data?.length) return { error: 'The organisation no longer exists, or you do not have permission to edit it.' }

  revalidatePath('/settings')
  redirect('/settings?saved=1')
}
