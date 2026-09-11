'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createServerSupabase } from '@/lib/supabase/server'
import { requireInternalAdministrator, requireTenantKnowledgeAdministrator } from './authorization'

export type PlatformActionState = { error?: string } | undefined

const optionalText = (value: FormDataEntryValue | null) => String(value ?? '').trim() || null
const lines = (value: FormDataEntryValue | null) => String(value ?? '').split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean)

const configurationSchema = z.object({
  organizationId: z.string().uuid(),
  operatingModel: z.enum(['centralized', 'federated', 'hybrid']),
  defaultCurrency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  timezone: z.string().trim().min(2).max(100),
  dataRegion: z.string().trim().min(2).max(100),
  retentionDays: z.coerce.number().int().min(30).max(3650),
  approvalEscalationHours: z.coerce.number().int().min(1).max(720),
  projectVisibility: z.enum(['organization', 'restricted']),
})

export async function saveTenantConfigurationAction(_previous: PlatformActionState, form: FormData): Promise<PlatformActionState> {
  const parsed = configurationSchema.safeParse({
    organizationId: form.get('organizationId'),
    operatingModel: form.get('operatingModel'),
    defaultCurrency: form.get('defaultCurrency'),
    timezone: form.get('timezone'),
    dataRegion: form.get('dataRegion'),
    retentionDays: form.get('retentionDays'),
    approvalEscalationHours: form.get('approvalEscalationHours'),
    projectVisibility: form.get('projectVisibility'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the tenant configuration.' }
  const { user } = await requireInternalAdministrator()
  const db = (await createServerSupabase()) as any
  const { error } = await db.from('tenant_configurations').upsert({
    organization_id: parsed.data.organizationId,
    operating_model: parsed.data.operatingModel,
    default_currency: parsed.data.defaultCurrency,
    timezone: parsed.data.timezone,
    data_region: parsed.data.dataRegion,
    retention_days: parsed.data.retentionDays,
    approval_escalation_hours: parsed.data.approvalEscalationHours,
    evidence_required: form.get('evidenceRequired') === 'on',
    project_visibility: parsed.data.projectVisibility,
    strategic_objectives: lines(form.get('strategicObjectives')),
    updated_by: user.id,
  }, { onConflict: 'organization_id' })
  if (error) return { error: 'The tenant configuration could not be saved.' }
  revalidatePath('/internal/tenants')
  redirect(`/internal/tenants/${parsed.data.organizationId}`)
}

const subscriptionSchema = z.object({
  organizationId: z.string().uuid(),
  planKey: z.enum(['core', 'framework', 'enterprise', 'strategic-enterprise']),
  status: z.enum(['draft', 'pending', 'active', 'paused', 'cancelled', 'expired']),
  billingCycle: z.enum(['monthly', 'annual', 'custom']),
  seatLimit: z.coerce.number().int().min(1).max(100000),
  startsOn: z.string().date(),
  renewsOn: z.union([z.string().date(), z.literal('')]),
  amount: z.coerce.number().min(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  billingEmail: z.union([z.string().trim().email(), z.literal('')]),
})

export async function saveSubscriptionAction(id: string | undefined, _previous: PlatformActionState, form: FormData): Promise<PlatformActionState> {
  const parsed = subscriptionSchema.safeParse({
    organizationId: form.get('organizationId'), planKey: form.get('planKey'), status: form.get('status'), billingCycle: form.get('billingCycle'),
    seatLimit: form.get('seatLimit'), startsOn: form.get('startsOn'), renewsOn: form.get('renewsOn'), amount: form.get('amount'), currency: form.get('currency'), billingEmail: form.get('billingEmail'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the subscription.' }
  const { user } = await requireInternalAdministrator()
  const db = (await createServerSupabase()) as any
  const values = {
    organization_id: parsed.data.organizationId,
    plan_key: parsed.data.planKey,
    status: parsed.data.status,
    billing_cycle: parsed.data.billingCycle,
    seat_limit: parsed.data.seatLimit,
    starts_on: parsed.data.startsOn,
    renews_on: parsed.data.renewsOn || null,
    amount: parsed.data.amount,
    currency: parsed.data.currency,
    billing_email: parsed.data.billingEmail || null,
    notes: optionalText(form.get('notes')),
    updated_by: user.id,
    ...(id ? {} : { created_by: user.id }),
  }
  const result = id
    ? await db.from('platform_subscriptions').update(values).eq('id', id).select('id').maybeSingle()
    : await db.from('platform_subscriptions').insert(values).select('id').single()
  if (result.error || !result.data) return { error: result.error?.code === '23505' ? 'That organization already has a subscription.' : 'The subscription could not be saved.' }
  revalidatePath('/internal/subscriptions')
  redirect(`/internal/subscriptions/${result.data.id}/edit`)
}

export async function changeSubscriptionStatusAction(form: FormData) {
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(['active', 'paused', 'cancelled']) }).safeParse({ id: form.get('id'), status: form.get('status') })
  if (!parsed.success) throw new Error('Invalid subscription status request.')
  const { user } = await requireInternalAdministrator()
  const db = (await createServerSupabase()) as any
  const { error } = await db.from('platform_subscriptions').update({ status: parsed.data.status, updated_by: user.id }).eq('id', parsed.data.id)
  if (error) throw new Error('The subscription status could not be changed.')
  revalidatePath('/internal/subscriptions')
  revalidatePath(`/internal/subscriptions/${parsed.data.id}/edit`)
}

const supportSchema = z.object({
  organizationId: z.string().uuid(),
  subject: z.string().trim().min(3).max(160),
  category: z.enum(['General', 'Access', 'Data', 'Delivery', 'Billing', 'Technical']),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  status: z.enum(['Open', 'Investigating', 'Waiting on Customer', 'Resolved', 'Closed']),
  assigneeName: z.string().trim().max(160),
  slaDueAt: z.string(),
  supportTicketId: z.union([z.string().uuid(), z.literal('')]),
})

export async function saveSupportCaseAction(id: string | undefined, _previous: PlatformActionState, form: FormData): Promise<PlatformActionState> {
  const parsed = supportSchema.safeParse({
    organizationId: form.get('organizationId'), subject: form.get('subject'), category: form.get('category'), priority: form.get('priority'), status: form.get('status'), assigneeName: form.get('assigneeName'), slaDueAt: form.get('slaDueAt'), supportTicketId: form.get('supportTicketId') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the support case.' }
  const { user } = await requireInternalAdministrator()
  const db = (await createServerSupabase()) as any
  if (parsed.data.supportTicketId) {
    const ticket = await db.from('support_tickets').select('organization_id').eq('id', parsed.data.supportTicketId).maybeSingle()
    if (ticket.error || !ticket.data || ticket.data.organization_id !== parsed.data.organizationId) {
      return { error: 'The linked support request does not belong to the selected organization.' }
    }
  }
  const values = {
    organization_id: parsed.data.organizationId,
    subject: parsed.data.subject,
    category: parsed.data.category,
    priority: parsed.data.priority,
    status: parsed.data.status,
    assignee_name: parsed.data.assigneeName || null,
    sla_due_at: parsed.data.slaDueAt ? new Date(parsed.data.slaDueAt).toISOString() : null,
    internal_notes: optionalText(form.get('internalNotes')),
    resolution: optionalText(form.get('resolution')),
    support_ticket_id: parsed.data.supportTicketId || null,
    updated_by: user.id,
    ...(id ? {} : { created_by: user.id }),
  }
  const result = id
    ? await db.from('support_cases').update(values).eq('id', id).select('id').maybeSingle()
    : await db.from('support_cases').insert(values).select('id').single()
  if (result.error || !result.data) return { error: 'The support case could not be saved.' }
  revalidatePath('/internal/support')
  redirect(`/internal/support/${result.data.id}`)
}

type KnowledgeScope = 'internal' | 'tenant'

async function knowledgeContext(scope: KnowledgeScope) {
  if (scope === 'internal') {
    const context = await requireInternalAdministrator()
    return { organization: context.internalOrganization, user: context.user }
  }
  const context = await requireTenantKnowledgeAdministrator()
  return { organization: context.organization, user: context.user }
}

const knowledgeSchema = z.object({
  title: z.string().trim().min(3).max(180),
  summary: z.string().trim().max(500),
  content: z.string().trim().min(10).max(50000),
  category: z.enum(['Guide', 'Policy', 'Procedure', 'FAQ', 'Release Note', 'Troubleshooting']),
  visibility: z.enum(['organization', 'internal']),
  status: z.enum(['draft', 'published', 'archived']),
})

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160)
}

export async function saveKnowledgeArticleAction(scope: KnowledgeScope, id: string | undefined, _previous: PlatformActionState, form: FormData): Promise<PlatformActionState> {
  const parsed = knowledgeSchema.safeParse({ title: form.get('title'), summary: form.get('summary'), content: form.get('content'), category: form.get('category'), visibility: form.get('visibility'), status: form.get('status') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the knowledge article.' }
  const { organization, user } = await knowledgeContext(scope)
  const db = (await createServerSupabase()) as any
  let version = 1
  if (id) {
    const current = await db.from('knowledge_articles').select('version').eq('id', id).eq('organization_id', organization.id).maybeSingle()
    if (current.error || !current.data) return { error: 'The knowledge article could not be found.' }
    version = current.data.version + 1
  }
  const values = {
    organization_id: organization.id,
    title: parsed.data.title,
    slug: slugify(parsed.data.title),
    summary: parsed.data.summary || null,
    content: parsed.data.content,
    category: parsed.data.category,
    visibility: scope === 'internal' ? 'internal' : parsed.data.visibility,
    status: parsed.data.status,
    tags: lines(form.get('tags')),
    version,
    published_at: parsed.data.status === 'published' ? new Date().toISOString() : null,
    updated_by: user.id,
    ...(id ? {} : { created_by: user.id }),
  }
  const result = id
    ? await db.from('knowledge_articles').update(values).eq('id', id).eq('organization_id', organization.id).select('id').maybeSingle()
    : await db.from('knowledge_articles').insert(values).select('id').single()
  if (result.error || !result.data) return { error: result.error?.code === '23505' ? 'An article with this title already exists.' : 'The knowledge article could not be saved.' }
  const base = scope === 'internal' ? '/internal/knowledge' : '/knowledge'
  revalidatePath(base)
  redirect(`${base}/${result.data.id}`)
}

export async function changeKnowledgeStatusAction(scope: KnowledgeScope, form: FormData) {
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(['draft', 'published', 'archived']) }).safeParse({ id: form.get('id'), status: form.get('status') })
  if (!parsed.success) throw new Error('Invalid article status request.')
  const { organization, user } = await knowledgeContext(scope)
  const db = (await createServerSupabase()) as any
  const { error } = await db.from('knowledge_articles').update({
    status: parsed.data.status,
    published_at: parsed.data.status === 'published' ? new Date().toISOString() : null,
    updated_by: user.id,
  }).eq('id', parsed.data.id).eq('organization_id', organization.id)
  if (error) throw new Error('The article status could not be changed.')
  const base = scope === 'internal' ? '/internal/knowledge' : '/knowledge'
  revalidatePath(base)
  revalidatePath(`${base}/${parsed.data.id}`)
}
