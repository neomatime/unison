'use server'

import { revalidatePath } from 'next/cache'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

export type RelationshipActionState = { error?: string; success?: string } | undefined

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const optional = (form: FormData, key: string) => text(form, key) || null

async function context(clientId: string) {
  if (!isUuid(clientId)) return null
  const { organization, user } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const client = await db.from('clients').select('id').eq('organization_id', organization.id).eq('id', clientId).is('archived_at', null).maybeSingle()
  if (client.error || !client.data) return null
  return { organization, user, db }
}

function refresh(clientId: string) {
  revalidatePath(`/operations/clients/${clientId}`)
  revalidatePath('/overview')
}

export async function createClientContactAction(clientId: string, _previous: RelationshipActionState, form: FormData): Promise<RelationshipActionState> {
  const ctx = await context(clientId)
  if (!ctx) return { error: 'The client could not be verified.' }
  const fullName = text(form, 'fullName')
  const email = optional(form, 'email')
  if (!fullName) return { error: 'Contact name is required.' }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid email address.' }
  const isPrimary = form.get('isPrimary') === 'on'
  if (isPrimary) {
    const cleared = await ctx.db.from('client_contacts').update({ is_primary: false }).eq('organization_id', ctx.organization.id).eq('client_id', clientId).eq('is_primary', true)
    if (cleared.error) return { error: 'The existing primary contact could not be updated.' }
  }
  const result = await ctx.db.from('client_contacts').insert({
    organization_id: ctx.organization.id,
    client_id: clientId,
    full_name: fullName,
    job_title: optional(form, 'jobTitle'),
    email,
    phone: optional(form, 'phone'),
    relationship_role: text(form, 'relationshipRole') || 'Contact',
    preferred_communication: optional(form, 'preferredCommunication'),
    is_primary: isPrimary,
  })
  if (result.error) return { error: 'The contact could not be saved.' }
  refresh(clientId)
  return { success: 'Contact added.' }
}

export async function createClientInteractionAction(clientId: string, _previous: RelationshipActionState, form: FormData): Promise<RelationshipActionState> {
  const ctx = await context(clientId)
  if (!ctx) return { error: 'The client could not be verified.' }
  const summary = text(form, 'summary')
  const occurredAt = text(form, 'occurredAt')
  if (!summary || !occurredAt || Number.isNaN(new Date(occurredAt).getTime())) return { error: 'Interaction date and summary are required.' }
  const contactId = optional(form, 'contactId')
  if (contactId && !isUuid(contactId)) return { error: 'Select a valid contact.' }
  const member = await ctx.db.from('team_members').select('id').eq('organization_id', ctx.organization.id).eq('user_id', ctx.user.id).is('archived_at', null).maybeSingle()
  if (member.error) return { error: 'Your team profile could not be resolved.' }
  const nextDue = optional(form, 'nextActionDueAt')
  const result = await ctx.db.from('client_interactions').insert({
    organization_id: ctx.organization.id,
    client_id: clientId,
    contact_id: contactId,
    team_member_id: member.data?.id ?? null,
    interaction_type: text(form, 'interactionType') || 'General Note',
    occurred_at: new Date(occurredAt).toISOString(),
    summary,
    next_action: optional(form, 'nextAction'),
    next_action_due_at: nextDue && !Number.isNaN(new Date(nextDue).getTime()) ? new Date(nextDue).toISOString() : null,
    concern_recorded: form.get('concernRecorded') === 'on',
    confidentiality: text(form, 'confidentiality') || 'Internal',
    created_by: ctx.user.id,
  })
  if (result.error) return { error: 'The interaction could not be recorded.' }
  refresh(clientId)
  return { success: 'Interaction recorded.' }
}

export async function createClientMilestoneAction(clientId: string, _previous: RelationshipActionState, form: FormData): Promise<RelationshipActionState> {
  const ctx = await context(clientId)
  if (!ctx) return { error: 'The client could not be verified.' }
  const name = text(form, 'name')
  const date = text(form, 'milestoneDate')
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Milestone name and date are required.' }
  const result = await ctx.db.from('client_milestones').insert({
    organization_id: ctx.organization.id,
    client_id: clientId,
    name,
    milestone_type: text(form, 'milestoneType') || 'Important Client Event',
    milestone_date: date,
    recurring_annually: form.get('recurringAnnually') === 'on',
    notes: optional(form, 'notes'),
    created_by: ctx.user.id,
  })
  if (result.error) return { error: 'The milestone could not be saved.' }
  refresh(clientId)
  return { success: 'Milestone added.' }
}

export async function createClientFollowUpAction(clientId: string, _previous: RelationshipActionState, form: FormData): Promise<RelationshipActionState> {
  const ctx = await context(clientId)
  if (!ctx) return { error: 'The client could not be verified.' }
  const title = text(form, 'title')
  const dueAt = text(form, 'dueAt')
  if (!title) return { error: 'Follow-up title is required.' }
  const member = await ctx.db.from('team_members').select('id').eq('organization_id', ctx.organization.id).eq('user_id', ctx.user.id).is('archived_at', null).maybeSingle()
  if (member.error) return { error: 'Your team profile could not be resolved.' }
  const result = await ctx.db.from('tasks').insert({
    organization_id: ctx.organization.id,
    client_id: clientId,
    title,
    description: optional(form, 'description'),
    assignee_id: member.data?.id ?? null,
    created_by: ctx.user.id,
    priority: text(form, 'priority') || 'Medium',
    status: 'Planned',
    due_at: dueAt && !Number.isNaN(new Date(dueAt).getTime()) ? new Date(dueAt).toISOString() : null,
  })
  if (result.error) return { error: 'The follow-up could not be created.' }
  refresh(clientId)
  return { success: member.data ? 'Follow-up assigned to you.' : 'Follow-up created without an assignee because your account has no team profile.' }
}

export async function completeClientMilestoneAction(clientId: string, milestoneId: string): Promise<void> {
  const ctx = await context(clientId)
  if (!ctx || !isUuid(milestoneId)) return
  await ctx.db.from('client_milestones').update({ status: 'Complete' }).eq('organization_id', ctx.organization.id).eq('client_id', clientId).eq('id', milestoneId)
  refresh(clientId)
}

export async function dismissClientRecommendationAction(clientId: string, key: string): Promise<void> {
  const ctx = await context(clientId)
  if (!ctx || !key || key.length > 250) return
  await ctx.db.from('client_recommendation_dismissals').upsert({
    organization_id: ctx.organization.id,
    client_id: clientId,
    recommendation_key: key,
    dismissed_by: ctx.user.id,
  }, { onConflict: 'organization_id,recommendation_key,dismissed_by' })
  refresh(clientId)
}
