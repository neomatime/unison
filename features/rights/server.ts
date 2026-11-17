import 'server-only'

import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { can, cleanRestrictions, cleanScopes, type Overrides, type RightAction, type RightsInput, type Scopes } from './model'

export type StoredRights = { overrides: Overrides; scopes: Scopes; restrictions: string[] }

/** The signed-in person's own rights in the active organisation: their role plus their saved overrides and restrictions. Per request. */
export const getMyRights = cache(async function getMyRights(): Promise<RightsInput & StoredRights> {
  const { organization, role, user } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const { data } = await db.from('user_rights').select('overrides, scopes, restrictions').eq('organization_id', organization.id).eq('user_id', user.id).maybeSingle()
  return {
    role: String(role),
    overrides: (data?.overrides ?? {}) as Overrides,
    scopes: cleanScopes((data?.scopes ?? {}) as Record<string, unknown>),
    restrictions: cleanRestrictions(data?.restrictions ?? []),
  }
})

export async function myRight(moduleId: string, action: RightAction): Promise<boolean> {
  return can(await getMyRights(), moduleId, action)
}

export const RIGHT_DENIED_MESSAGE = 'You do not have permission to do that. Ask an Owner or Admin.'

/** For a server action that reports errors as text: null when allowed, the message when not. */
export async function rightDenied(moduleId: string, action: RightAction): Promise<string | null> {
  return (await myRight(moduleId, action)) ? null : RIGHT_DENIED_MESSAGE
}

/**
 * For a page: sends the person to the overview when they may not view this area. The overview itself cannot redirect to itself, so
 * someone without the right to view it gets "not found".
 */
export async function requireViewOrRedirect(moduleId: string): Promise<void> {
  if (await myRight(moduleId, 'view')) return
  if (moduleId === 'overview') notFound()
  redirect('/overview?denied=1')
}

/** Integrations, automations and jobs: refused when the person is restricted from them (an Owner never is). */
export async function requireIntegrationsOrRedirect(): Promise<void> {
  const mine = await getMyRights()
  if (mine.role !== 'owner' && mine.restrictions.includes('integrations')) redirect('/settings?denied=1')
}
