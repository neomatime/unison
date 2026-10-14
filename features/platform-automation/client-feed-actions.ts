'use server'

import { revalidatePath } from 'next/cache'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

export type ClientFeedKeyState = { error?: string; key?: string } | undefined

async function requireAdministrator() {
  const context = await getSessionContext()
  if (!['owner', 'admin'].includes(context.role.toLowerCase())) {
    throw new Error('Only an organization administrator can manage the client feed.')
  }
  return context
}

export async function createClientFeedKeyAction(
  _previous: ClientFeedKeyState,
  formData: FormData,
): Promise<ClientFeedKeyState> {
  try {
    const { organization } = await requireAdministrator()
    const name = String(formData.get('name') ?? '').trim()
    if (!name || name.length > 80) return { error: 'Give the key a name of up to 80 characters.' }
    const db = (await createServerSupabase()) as any
    const { data, error } = await db.rpc('create_client_feed_key', { p_organization_id: organization.id, p_name: name })
    if (error || !data) return { error: 'The key could not be created.' }
    revalidatePath('/settings/integrations')
    return { key: String(data) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The key could not be created.' }
  }
}

export async function revokeClientFeedKeyAction(keyId: string): Promise<{ error?: string }> {
  try {
    await requireAdministrator()
    if (!isUuid(keyId)) return { error: 'Choose a valid key.' }
    const db = (await createServerSupabase()) as any
    const { error } = await db.rpc('revoke_client_feed_key', { p_key_id: keyId })
    if (error) return { error: 'The key could not be revoked.' }
    revalidatePath('/settings/integrations')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The key could not be revoked.' }
  }
}
