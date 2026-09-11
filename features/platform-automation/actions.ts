'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'
import { automationInputSchema, integrationInputSchema } from './schemas'

export type PlatformActionState = { error?: string; secret?: string } | undefined

async function requireTenantAdministrator() {
  const context = await getSessionContext()
  if (!['owner', 'admin'].includes(context.role.toLowerCase())) {
    throw new Error('Only an active organization administrator can manage integrations and automations.')
  }
  return context
}

function databaseError(error: { code?: string } | null, fallback: string) {
  return error?.code === '23505' ? 'A record with the same name or event key already exists.' : fallback
}

export async function saveIntegrationAction(
  connectionId: string | undefined,
  _previous: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  try {
    const { organization, user } = await requireTenantAdministrator()
    const parsed = integrationInputSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the integration details.' }
    if (connectionId && !isUuid(connectionId)) return { error: 'Choose a valid integration.' }
    const db = (await createServerSupabase()) as any
    const values = {
      organization_id: organization.id,
      name: parsed.data.name,
      provider: parsed.data.provider,
      event_key: parsed.data.eventKey,
      ...(connectionId ? {} : { status: 'pending', created_by: user.id }),
    }
    const result = connectionId
      ? await db.from('integration_connections').update(values).eq('organization_id', organization.id).eq('id', connectionId).select('id').maybeSingle()
      : await db.from('integration_connections').insert(values).select('id').single()
    if (result.error || !result.data) return { error: databaseError(result.error, 'The integration could not be saved.') }
    revalidatePath('/settings')
    revalidatePath('/settings/integrations')
    redirect(`/settings/integrations/${result.data.id}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NEXT_REDIRECT')) throw error
    return { error: error instanceof Error ? error.message : 'The integration could not be saved.' }
  }
}

export async function setIntegrationStatusAction(formData: FormData) {
  const { organization } = await requireTenantAdministrator()
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!isUuid(id) || !['connected', 'disabled'].includes(status)) throw new Error('Invalid integration update.')
  const db = (await createServerSupabase()) as any
  const { data, error } = await db.from('integration_connections').update({ status, last_error: null })
    .eq('organization_id', organization.id).eq('id', id).select('id').maybeSingle()
  if (error || !data) throw new Error('The integration status could not be updated.')
  revalidatePath('/settings/integrations')
  revalidatePath(`/settings/integrations/${id}`)
}

export async function deleteIntegrationAction(formData: FormData) {
  const { organization } = await requireTenantAdministrator()
  const id = String(formData.get('id') ?? '')
  if (!isUuid(id)) throw new Error('Choose a valid integration.')
  const db = (await createServerSupabase()) as any
  const { error } = await db.from('integration_connections').delete().eq('organization_id', organization.id).eq('id', id)
  if (error) throw new Error('The integration could not be deleted. Remove dependent automations first.')
  revalidatePath('/settings/integrations')
  redirect('/settings/integrations')
}

export async function rotateIntegrationSecretAction(
  connectionId: string,
  _previous: PlatformActionState,
): Promise<PlatformActionState> {
  try {
    const { organization } = await requireTenantAdministrator()
    if (!isUuid(connectionId)) return { error: 'Choose a valid integration.' }
    const db = (await createServerSupabase()) as any
    const owned = await db.from('integration_connections').select('id').eq('organization_id', organization.id).eq('id', connectionId).maybeSingle()
    if (owned.error || !owned.data) return { error: 'The integration could not be found.' }
    const { data, error } = await db.rpc('rotate_integration_secret', { p_connection_id: connectionId })
    if (error || !data) return { error: 'A new integration secret could not be generated.' }
    revalidatePath(`/settings/integrations/${connectionId}`)
    return { secret: String(data) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The integration secret could not be rotated.' }
  }
}

export async function saveAutomationRuleAction(
  ruleId: string | undefined,
  _previous: PlatformActionState,
  formData: FormData,
): Promise<PlatformActionState> {
  try {
    const { organization, user } = await requireTenantAdministrator()
    const parsed = automationInputSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the automation details.' }
    if (ruleId && !isUuid(ruleId)) return { error: 'Choose a valid automation.' }
    const db = (await createServerSupabase()) as any
    const integrationId = parsed.data.integrationConnectionId || null
    if (integrationId) {
      const owned = await db.from('integration_connections').select('id').eq('organization_id', organization.id).eq('id', integrationId).maybeSingle()
      if (owned.error || !owned.data) return { error: 'The selected integration is not available in this organization.' }
    }
    const values = {
      organization_id: organization.id,
      integration_connection_id: integrationId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      trigger_type: parsed.data.triggerType,
      trigger_config: parsed.data.triggerType === 'integration_event' ? { event_key: parsed.data.eventKey || null } : {},
      action_type: 'notification',
      action_config: {
        title: parsed.data.notificationTitle,
        body: parsed.data.notificationBody || null,
        category: parsed.data.notificationCategory,
      },
      status: parsed.data.status,
      ...(ruleId ? {} : { created_by: user.id }),
    }
    const result = ruleId
      ? await db.from('automation_rules').update(values).eq('organization_id', organization.id).eq('id', ruleId).select('id').maybeSingle()
      : await db.from('automation_rules').insert(values).select('id').single()
    if (result.error || !result.data) return { error: databaseError(result.error, 'The automation could not be saved.') }
    const savedId = result.data.id as string
    if (parsed.data.triggerType === 'schedule') {
      const { error } = await db.from('automation_schedules').upsert({
        organization_id: organization.id,
        rule_id: savedId,
        interval_minutes: parsed.data.intervalMinutes,
        timezone: parsed.data.timezone,
        next_run_at: new Date(Date.now() + parsed.data.intervalMinutes * 60000).toISOString(),
        enabled: parsed.data.status === 'active',
      }, { onConflict: 'rule_id' })
      if (error) return { error: 'The automation was saved, but its schedule could not be configured.' }
    } else {
      const { error } = await db.from('automation_schedules').delete().eq('organization_id', organization.id).eq('rule_id', savedId)
      if (error) return { error: 'The automation was saved, but its old schedule could not be removed.' }
    }
    revalidatePath('/settings/automations')
    revalidatePath('/settings/jobs')
    redirect(`/settings/automations/${savedId}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NEXT_REDIRECT')) throw error
    return { error: error instanceof Error ? error.message : 'The automation could not be saved.' }
  }
}

export async function setAutomationStatusAction(formData: FormData) {
  const { organization } = await requireTenantAdministrator()
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  if (!isUuid(id) || !['active', 'paused'].includes(status)) throw new Error('Invalid automation update.')
  const db = (await createServerSupabase()) as any
  const { data, error } = await db.from('automation_rules').update({ status }).eq('organization_id', organization.id).eq('id', id).select('id').maybeSingle()
  if (error || !data) throw new Error('The automation status could not be updated.')
  await db.from('automation_schedules').update({ enabled: status === 'active' }).eq('organization_id', organization.id).eq('rule_id', id)
  revalidatePath('/settings/automations')
  revalidatePath(`/settings/automations/${id}`)
  revalidatePath('/settings/jobs')
}

export async function enqueueAutomationRuleAction(formData: FormData) {
  const { organization, user } = await requireTenantAdministrator()
  const id = String(formData.get('id') ?? '')
  if (!isUuid(id)) throw new Error('Choose a valid automation.')
  const db = (await createServerSupabase()) as any
  const owned = await db.from('automation_rules').select('id').eq('organization_id', organization.id).eq('id', id).maybeSingle()
  if (owned.error || !owned.data) throw new Error('The automation could not be found.')
  const { error } = await db.rpc('enqueue_automation_rule', { p_rule_id: id, p_input: { source: 'manual', requested_by: user.id } })
  if (error) throw new Error('The automation could not be queued.')
  revalidatePath('/settings/automations')
  revalidatePath(`/settings/automations/${id}`)
  revalidatePath('/settings/jobs')
  redirect('/settings/jobs?queued=1')
}

export async function deleteAutomationRuleAction(formData: FormData) {
  const { organization } = await requireTenantAdministrator()
  const id = String(formData.get('id') ?? '')
  if (!isUuid(id)) throw new Error('Choose a valid automation.')
  const db = (await createServerSupabase()) as any
  const { error } = await db.from('automation_rules').delete().eq('organization_id', organization.id).eq('id', id)
  if (error) throw new Error('The automation could not be deleted.')
  revalidatePath('/settings/automations')
  revalidatePath('/settings/jobs')
  redirect('/settings/automations')
}
