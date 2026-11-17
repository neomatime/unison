'use server'

import { revalidatePath } from 'next/cache'

import { roles } from '@/config/roles'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { listDirectoryPeople } from '@/lib/integrations/microsoft-directory'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'
import { ROLE_CHANGE_DENIED_MESSAGE, mayChangeRole, mayChooseAdvanceRole } from '../access-model'

export type SetRoleResult = { ok: true } | { ok: false; error: string }

const knownRole = (roleId: string) => roles.some((role) => role.id === roleId)

/**
 * Changes the role of someone who already has a login. Owner only, never for oneself, and limited to this workspace's active
 * members. The database enforces the same rules (and keeps at least one Owner), so a refusal there is reported, not hidden.
 */
export async function setMemberRoleAction(userId: string, roleId: string): Promise<SetRoleResult> {
  if (!isUuid(userId) || !knownRole(roleId)) return { ok: false, error: 'That change is not valid.' }
  const { organization, role, user } = await getSessionContext()
  if (!mayChangeRole(String(role), user.id, userId)) return { ok: false, error: ROLE_CHANGE_DENIED_MESSAGE }
  const db = (await createServerSupabase()) as any
  const result = await db.from('memberships').update({ role_id: roleId }).eq('organization_id', organization.id).eq('user_id', userId).eq('status', 'active').select('id').maybeSingle()
  if (result.error || !result.data) return { ok: false, error: 'The role could not be changed. A workspace must keep at least one Owner.' }
  revalidatePath('/settings/access')
  return { ok: true }
}

/**
 * Chooses the role of someone in the Microsoft directory who has not signed in yet. It is kept and applied at their first sign-in.
 * The address must really be in the directory (read again here, never taken from the browser), and Owner cannot be chosen.
 */
export async function setAdvanceRoleAction(email: string, roleId: string): Promise<SetRoleResult> {
  const { organization, role } = await getSessionContext()
  if (!mayChooseAdvanceRole(String(role), roleId)) return { ok: false, error: 'You cannot choose that role in advance.' }
  const address = String(email).trim().toLowerCase()
  const db = (await createServerSupabase()) as any
  const org = await db.from('organizations').select('email_domain').eq('id', organization.id).maybeSingle()
  const directory = await listDirectoryPeople(org.data?.email_domain)
  if (!directory.ok || !directory.people.some((person) => person.email === address)) return { ok: false, error: 'That person was not found in the Microsoft directory.' }
  const result = roleId === 'member'
    ? await db.from('pending_access').delete().eq('organization_id', organization.id).eq('email', address)
    : await db.from('pending_access').upsert({ organization_id: organization.id, email: address, role_id: roleId }, { onConflict: 'organization_id,email' })
  if (result.error) return { ok: false, error: 'The role could not be saved. Try again.' }
  revalidatePath('/settings/access')
  return { ok: true }
}
