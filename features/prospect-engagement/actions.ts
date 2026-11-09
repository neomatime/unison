'use server'

import { randomBytes } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { roleHasPermission } from '@/config/roles'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { SERVICE_IDS } from './catalog'
import { acquisitionLinkInputSchema, formConfigSchema } from './schema'

export type AcquisitionActionState = { error?: string; success?: string } | undefined

async function managementContext() {
  const { organization, role, user } = await getSessionContext()
  if (!roleHasPermission(role, 'acquisition.manage')) throw new Error('FORBIDDEN')
  return { organization, user, db: (await createServerSupabase()) as any }
}

const nullable = (form: FormData, name: string) => {
  const value = String(form.get(name) ?? '').trim()
  return value || null
}

export async function createAcquisitionLinkAction(_state: AcquisitionActionState, form: FormData): Promise<AcquisitionActionState> {
  let context
  try {
    context = await managementContext()
  } catch {
    return { error: 'You do not have permission to manage acquisition links.' }
  }
  const parsed = acquisitionLinkInputSchema.safeParse({
    name: String(form.get('name') ?? ''),
    channel: String(form.get('channel') ?? ''),
    campaignName: nullable(form, 'campaignName'),
    eventName: nullable(form, 'eventName'),
    assignedToId: nullable(form, 'assignedToId'),
    referringEmployeeId: nullable(form, 'referringEmployeeId'),
    formVersionId: nullable(form, 'formVersionId'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Review the link details.' }
  const token = randomBytes(12).toString('base64url')
  const { data, error } = await context.db.from('acquisition_links').insert({
    organization_id: context.organization.id,
    token,
    name: parsed.data.name,
    channel: parsed.data.channel,
    campaign_name: parsed.data.campaignName,
    event_name: parsed.data.eventName,
    assigned_to_id: parsed.data.assignedToId,
    referring_employee_id: parsed.data.referringEmployeeId,
    form_version_id: parsed.data.formVersionId,
    created_by: context.user.id,
  }).select('id').single()
  if (error || !data) return { error: 'The acquisition link could not be created.' }
  revalidatePath('/commercial/acquisition')
  redirect(`/commercial/acquisition/${data.id}`)
}

export async function setAcquisitionLinkActiveAction(id: string, active: boolean) {
  const parsedId = z.uuid().safeParse(id)
  if (!parsedId.success) return
  const { organization, db } = await managementContext()
  const { error } = await db.from('acquisition_links').update({ active, disabled_at: active ? null : new Date().toISOString() }).eq('id', id).eq('organization_id', organization.id)
  if (error) throw error
  revalidatePath('/commercial/acquisition')
  revalidatePath(`/commercial/acquisition/${id}`)
}

export async function createFormVersionAction(_state: AcquisitionActionState, form: FormData): Promise<AcquisitionActionState> {
  let context
  try {
    context = await managementContext()
  } catch {
    return { error: 'You do not have permission to publish the engagement form.' }
  }
  const version = z.string().regex(/^[0-9]+\.[0-9]+$/, 'Use a version such as 1.1.').safeParse(String(form.get('version') ?? '').trim())
  const config = formConfigSchema.safeParse({
    headline: String(form.get('headline') ?? ''),
    supportingText: String(form.get('supportingText') ?? ''),
    privacyNoticeUrl: String(form.get('privacyNoticeUrl') ?? ''),
    privacyNoticeVersion: String(form.get('privacyNoticeVersion') ?? ''),
    enabledServices: SERVICE_IDS.filter((id) => form.get(`service:${id}`) === 'on'),
  })
  if (!version.success) return { error: version.error.issues[0]?.message }
  if (!config.success) return { error: config.error.issues[0]?.message ?? 'Review the form configuration.' }

  const inserted = await context.db.from('engagement_form_versions').insert({
    organization_id: context.organization.id,
    version: version.data,
    status: 'draft',
    config: config.data,
    created_by: context.user.id,
  }).select('id').single()
  if (inserted.error || !inserted.data) {
    return { error: inserted.error?.code === '23505' ? 'That form version already exists.' : 'The form version could not be created.' }
  }
  const published = await context.db.rpc('publish_engagement_form_version', { p_version_id: inserted.data.id })
  if (published.error) return { error: 'The version was saved as a draft but could not be published.' }
  revalidatePath('/commercial/acquisition')
  revalidatePath('/commercial/acquisition/form')
  revalidatePath('/engage')
  return { success: `Form version ${version.data} is now published.` }
}

