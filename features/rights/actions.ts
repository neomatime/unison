'use server'

import { revalidatePath } from 'next/cache'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { listDirectoryPeople } from '@/lib/integrations/microsoft-directory'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'
import { cleanOverrides, cleanRestrictions, cleanScopes, describeChanges, escalations, mayEditRights, type Overrides, type Scopes } from './model'
import { getMyRights, type StoredRights } from './server'

export type RightsResult = { ok: true } | { ok: false; error: string }
export type RightsSubject = { userId: string | null; email: string | null }

type Target = { userId: string | null; email: string | null; name: string; role: string }

/**
 * Finds the person whose rights are being changed, from this workspace's own member list or the Microsoft directory. The browser
 * only says who; the role, name and address are read here, so none of them can be forged.
 */
async function resolveTarget(subject: RightsSubject): Promise<Target | null> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  if (subject.userId) {
    if (!isUuid(subject.userId)) return null
    const member = (await listOrganizationMembers()).find((m) => m.userId === subject.userId && m.status === 'active')
    return member ? { userId: member.userId, email: member.email, name: member.displayName, role: member.roleId } : null
  }
  const email = String(subject.email ?? '').trim().toLowerCase()
  if (!email) return null
  const org = await db.from('organizations').select('email_domain').eq('id', organization.id).maybeSingle()
  const directory = await listDirectoryPeople(org.data?.email_domain)
  const person = directory.ok ? directory.people.find((p) => p.email === email) : null
  if (!person) return null
  const pending = await db.from('pending_access').select('role_id').eq('organization_id', organization.id).eq('email', email).maybeSingle()
  return { userId: null, email, name: person.name, role: pending.data?.role_id ?? 'member' }
}

async function stored(target: Target): Promise<StoredRights> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  let query = db.from('user_rights').select('overrides, scopes, restrictions').eq('organization_id', organization.id)
  query = target.userId ? query.eq('user_id', target.userId) : query.eq('email', target.email)
  const { data } = await query.maybeSingle()
  return { overrides: (data?.overrides ?? {}) as Overrides, scopes: cleanScopes((data?.scopes ?? {}) as Record<string, unknown>), restrictions: cleanRestrictions(data?.restrictions ?? []) }
}

async function actorName(): Promise<string> {
  const { user } = await getSessionContext()
  const members = await listOrganizationMembers()
  return members.find((m) => m.userId === user.id)?.displayName ?? user.email ?? 'Unknown'
}

/**
 * Saves one person's rights: their overrides on top of the role, their data access per area and their restrictions. Checked here
 * and again by the database's row rules: the actor must be an Owner (anyone but another Owner) or an Admin (a Member only), never
 * for oneself, and may not grant a right they do not hold. Every change is written to the activity history.
 */
export async function saveRightsAction(subject: RightsSubject, input: { overrides: Overrides; scopes: Scopes; restrictions: string[] }): Promise<RightsResult> {
  const { organization, role, user } = await getSessionContext()
  const target = await resolveTarget(subject)
  if (!target) return { ok: false, error: 'That person could not be found.' }
  if (!mayEditRights(String(role), user.id, target.role, target.userId)) return { ok: false, error: 'You cannot change this person’s rights. Owners’ rights are fixed, only an Owner can change an Admin’s, and nobody changes their own.' }

  const next: StoredRights = { overrides: cleanOverrides(target.role, input.overrides ?? {}), scopes: cleanScopes((input.scopes ?? {}) as Record<string, unknown>), restrictions: cleanRestrictions(input.restrictions) }
  const before = await stored(target)
  const mine = await getMyRights()
  const climbing = escalations(mine, before.overrides, next.overrides, target.role)
  if (climbing.length) return { ok: false, error: `You cannot grant rights you do not have yourself: ${climbing.slice(0, 3).join(', ')}.` }

  const changes = describeChanges(target.role, before, next)
  if (changes.length === 0) return { ok: true }

  const db = (await createServerSupabase()) as any
  const row = { organization_id: organization.id, user_id: target.userId, email: target.userId ? null : target.email, overrides: next.overrides, scopes: next.scopes, restrictions: next.restrictions, updated_by: user.id, updated_at: new Date().toISOString() }
  let write
  const existing = await db.from('user_rights').select('id').eq('organization_id', organization.id).match(target.userId ? { user_id: target.userId } : { email: target.email }).maybeSingle()
  if (existing.data?.id) write = await db.from('user_rights').update(row).eq('id', existing.data.id)
  else write = await db.from('user_rights').insert(row)
  if (write.error) return { ok: false, error: 'The rights could not be saved. Try again.' }

  await db.from('rights_audit').insert({
    organization_id: organization.id, subject_user_id: target.userId, subject_email: target.email, subject_name: target.name,
    actor_id: user.id, actor_name: await actorName(), kind: 'rights.updated',
    summary: changes.length === 1 ? `${changes[0].label}: ${changes[0].before} → ${changes[0].after}` : `${changes.length} changes to ${target.name}’s rights`,
    changes,
  })
  revalidatePath('/settings/access')
  return { ok: true }
}

/** Removes every override, data-access choice and restriction, so the person gets exactly what their role gives. */
export async function resetRightsAction(subject: RightsSubject): Promise<RightsResult> {
  const { organization, role, user } = await getSessionContext()
  const target = await resolveTarget(subject)
  if (!target) return { ok: false, error: 'That person could not be found.' }
  if (!mayEditRights(String(role), user.id, target.role, target.userId)) return { ok: false, error: 'You cannot change this person’s rights.' }
  const before = await stored(target)
  const changes = describeChanges(target.role, before, { overrides: {}, scopes: {}, restrictions: [] })
  const db = (await createServerSupabase()) as any
  const del = await db.from('user_rights').delete().eq('organization_id', organization.id).match(target.userId ? { user_id: target.userId } : { email: target.email })
  if (del.error) return { ok: false, error: 'The rights could not be reset. Try again.' }
  if (changes.length) {
    await db.from('rights_audit').insert({
      organization_id: organization.id, subject_user_id: target.userId, subject_email: target.email, subject_name: target.name,
      actor_id: user.id, actor_name: await actorName(), kind: 'rights.reset',
      summary: `Reset ${target.name}’s rights to the ${target.role} defaults`, changes,
    })
  }
  revalidatePath('/settings/access')
  return { ok: true }
}
