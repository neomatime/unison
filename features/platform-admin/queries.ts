import 'server-only'

import { notFound } from 'next/navigation'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireInternalAdministrator } from './authorization'
import type { KnowledgeArticle, PlatformOrganization, PlatformSubscription, SubscriptionEvent, SupportCase, SupportTicketOption, TenantConfiguration } from './types'

async function platformOrganizations(): Promise<PlatformOrganization[]> {
  await requireInternalAdministrator()
  const db = (await createServerSupabase()) as any
  const { data, error } = await db.from('organizations').select('id,name,slug,status,tier').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    tier: row.tier,
  }))
}

export async function listPlatformOrganizations() {
  return platformOrganizations()
}

export async function listTenantConfigurations() {
  const organizations = await platformOrganizations()
  const db = (await createServerSupabase()) as any
  const { data, error } = await db.from('tenant_configurations').select('*')
  if (error) throw error
  const byOrganization = new Map<string, TenantConfiguration>((data ?? []).map((row: TenantConfiguration) => [row.organization_id, row]))
  return organizations.map((organization) => ({ organization, configuration: byOrganization.get(organization.id) ?? null }))
}

export async function getTenantConfiguration(organizationId: string) {
  const organizations = await platformOrganizations()
  const organization = organizations.find((item) => item.id === organizationId)
  if (!organization) notFound()
  const db = (await createServerSupabase()) as any
  const { data, error } = await db.from('tenant_configurations').select('*').eq('organization_id', organizationId).maybeSingle()
  if (error) throw error
  return { organization, configuration: data as TenantConfiguration | null }
}

export async function listPlatformSubscriptions() {
  const organizations = await platformOrganizations()
  const names = new Map(organizations.map((item) => [item.id, item.name]))
  const db = (await createServerSupabase()) as any
  const { data, error } = await db.from('platform_subscriptions').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: PlatformSubscription) => ({ ...row, organization_name: names.get(row.organization_id) ?? 'Unknown organization' }))
}

export async function getPlatformSubscription(id: string) {
  const organizations = await platformOrganizations()
  const db = (await createServerSupabase()) as any
  const [{ data, error }, events] = await Promise.all([
    db.from('platform_subscriptions').select('*').eq('id', id).maybeSingle(),
    db.from('subscription_events').select('id,action,old_value,new_value,created_at').eq('subscription_id', id).order('created_at', { ascending: false }),
  ])
  if (error) throw error
  if (!data) notFound()
  if (events.error) throw events.error
  return {
    subscription: { ...data, organization_name: organizations.find((item) => item.id === data.organization_id)?.name ?? 'Unknown organization' } as PlatformSubscription,
    events: (events.data ?? []) as SubscriptionEvent[],
  }
}

export async function listSupportCases() {
  const organizations = await platformOrganizations()
  const names = new Map(organizations.map((item) => [item.id, item.name]))
  const db = (await createServerSupabase()) as any
  const { data, error } = await db.from('support_cases').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: SupportCase) => ({ ...row, organization_name: names.get(row.organization_id) ?? 'Unknown organization' }))
}

export async function listUnlinkedSupportTickets(): Promise<SupportTicketOption[]> {
  const organizations = await platformOrganizations()
  const names = new Map(organizations.map((item) => [item.id, item.name]))
  const db = (await createServerSupabase()) as any
  const [tickets, cases] = await Promise.all([
    db.from('support_tickets').select('id,organization_id,ticket_number,subject,category,priority,status').order('updated_at', { ascending: false }),
    db.from('support_cases').select('support_ticket_id').not('support_ticket_id', 'is', null),
  ])
  if (tickets.error) throw tickets.error
  if (cases.error) throw cases.error
  const linked = new Set<string>((cases.data ?? []).map((item: { support_ticket_id: string }) => item.support_ticket_id))
  return (tickets.data ?? []).filter((item: SupportTicketOption) => !linked.has(item.id)).map((item: SupportTicketOption) => ({ ...item, organization_name: names.get(item.organization_id) ?? 'Unknown organization' }))
}

export async function getSupportCase(id: string) {
  const organizations = await platformOrganizations()
  const db = (await createServerSupabase()) as any
  const { data, error } = await db.from('support_cases').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) notFound()
  return { ...data, organization_name: organizations.find((item) => item.id === data.organization_id)?.name ?? 'Unknown organization' } as SupportCase
}

export async function listInternalKnowledgeArticles() {
  const { internalOrganization } = await requireInternalAdministrator()
  const db = (await createServerSupabase()) as any
  const { data, error } = await db.from('knowledge_articles').select('*').eq('organization_id', internalOrganization.id).order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as KnowledgeArticle[]
}

export async function getInternalKnowledgeArticle(id: string) {
  const { internalOrganization } = await requireInternalAdministrator()
  return getKnowledgeArticleForOrganization(id, internalOrganization.id)
}

export async function listTenantKnowledgeArticles() {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const { data, error } = await db.from('knowledge_articles').select('*').eq('organization_id', organization.id).order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as KnowledgeArticle[]
}

export async function canManageTenantKnowledge() {
  const { membership } = await getSessionContext()
  return ['owner', 'admin'].includes(membership.roleId.toLowerCase())
}

export async function getTenantKnowledgeArticle(id: string) {
  const { organization } = await getSessionContext()
  return getKnowledgeArticleForOrganization(id, organization.id)
}

async function getKnowledgeArticleForOrganization(id: string, organizationId: string) {
  const db = (await createServerSupabase()) as any
  const { data, error } = await db.from('knowledge_articles').select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle()
  if (error) throw error
  if (!data) notFound()
  return data as KnowledgeArticle
}
