'use server'

import { revalidatePath } from 'next/cache'

import { roles } from '@/config/roles'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { listDirectoryPeople } from '@/lib/integrations/microsoft-directory'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'
import { ROLE_CHANGE_DENIED_MESSAGE, mayChangeRole, mayChooseAdvanceRole } from '../access-model'

export type SetRoleResult = { ok: true } | { ok: false; error: string }

/** Writes the role change to the rights activity history. A failure here never undoes the change. */
async function recordRoleChange(db: any, organizationId: string, actorId: string, targetId: string, roleId: string, members: Awaited<ReturnType<typeof listOrganizationMembers>>) {
  try {
    // `members` was read before the change, so the target still shows the old role.
    const target = members.find((m) => m.userId === targetId)
    const actor = members.find((m) => m.userId === actorId)
    const label = roles.find((r) => r.id === roleId)?.label ?? roleId
    await db.from('rights_audit').insert({
      organization_id: organizationId, subject_user_id: targetId, subject_email: target?.email ?? null, subject_name: target?.displayName ?? 'Unknown',
      actor_id: actorId, actor_name: actor?.displayName ?? 'Unknown', kind: 'role.changed',
      summary: `Role changed: ${roles.find((r) => r.id === target?.roleId)?.label ?? target?.roleId ?? '—'} → ${label}`,
      changes: [{ label: 'Role', before: roles.find((r) => r.id === target?.roleId)?.label ?? String(target?.roleId ?? ''), after: label }],
    })
  } catch (error) {
    console.error('rights audit: role change not recorded', error instanceof Error ? error.message : error)
  }
}

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
  const membersBefore = await listOrganizationMembers()
  const result = await db.from('memberships').update({ role_id: roleId }).eq('organization_id', organization.id).eq('user_id', userId).eq('status', 'active').select('id').maybeSingle()
  if (result.error || !result.data) return { ok: false, error: 'The role could not be changed. A workspace must keep at least one Owner.' }
  await recordRoleChange(db, organization.id, user.id, userId, roleId, membersBefore)
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
