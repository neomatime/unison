'use server'

import { revalidatePath } from 'next/cache'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

export type ClientFeedKeyState = { error?: string; key?: string } | undefined
export type ClientFeedGateState = { error?: string; success?: string } | undefined

const NOT_ADMINISTRATOR = 'Only an organization administrator can manage the client feed.'
const ACKNOWLEDGE_FIRST = "Tick the box to confirm that HIVE's maintainers have been told."
const GATE_NOT_SAVED = 'The setting could not be saved. Please try again.'

async function requireAdministrator() {
  const context = await getSessionContext()
  if (!['owner', 'admin'].includes(context.role.toLowerCase())) {
    throw new Error(NOT_ADMINISTRATOR)
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

/**
 * The HIVE feed gate switch (quote portal, slice 3): whether the client feed returns only clients with an accepted quote.
 * Only an owner or admin may change it; the database says the same through the policy on organization_settings, which is
 * why no updated row means there is nothing to switch. Turning it on narrows a feed HIVE already reads, so the server
 * refuses it unless the form carries the acknowledgement that HIVE's maintainers have been told; it reads no current
 * value, so a refusal costs no database call. Turning it off needs none.
 */
export async function setClientFeedGateAction(
  _previous: ClientFeedGateState,
  form: FormData,
): Promise<ClientFeedGateState> {
  let organizationId: string
  try {
    organizationId = (await requireAdministrator()).organization.id
  } catch (error) {
    // The refusal is ours to show; anything else (a session that could not be read) stays out of the message.
    return { error: error instanceof Error && error.message === NOT_ADMINISTRATOR ? NOT_ADMINISTRATOR : GATE_NOT_SAVED }
  }
  const enabled = form.has('enabled')
  if (enabled && !form.has('acknowledged')) return { error: ACKNOWLEDGE_FIRST }
  const db = (await createServerSupabase()) as any
  const saved = await db
    .from('organization_settings')
    .update({ hive_feed_requires_accepted_quote: enabled })
    .eq('organization_id', organizationId)
    .select('id')
  if (saved.error) {
    console.error('[client-feed:gate]', saved.error)
    return { error: GATE_NOT_SAVED }
  }
  if (!saved.data?.length) return { error: 'Save the company details first.' }
  revalidatePath('/settings/integrations')
  return {
    success: enabled
      ? 'Only clients with an accepted quote are now included in the HIVE client feed.'
      : 'The HIVE client feed includes every client again.',
  }
}
