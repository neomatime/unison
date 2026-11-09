import 'server-only'

import { roleHasPermission } from '@/config/roles'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { parseFormConfig } from './schema'
import type { AcquisitionLinkRow, EngagementDetails } from './types'

export type AcquisitionAdminData = {
  canManage: boolean
  links: AcquisitionLinkRow[]
  members: Array<{ id: string; name: string }>
  versions: Array<{ id: string; version: string; status: string; config: ReturnType<typeof parseFormConfig>; publishedAt: string | null; createdAt: string }>
  report: {
    total: number
    qualified: number
    opportunities: number
    wonRevenue: number
    conversionRate: number
    byChannel: Array<{ label: string; value: number }>
    byIndustry: Array<{ label: string; value: number }>
    byService: Array<{ label: string; value: number }>
    byEvent: Array<{ label: string; value: number }>
    byEmployee: Array<{ label: string; value: number }>
  }
}

async function context() {
  const session = await getSessionContext()
  return { ...session, db: (await createServerSupabase()) as any }
}

export async function getAcquisitionAdminData(): Promise<AcquisitionAdminData> {
  const { organization, role, db } = await context()
  const orgId = organization.id
  const [linkResult, memberResult, versionResult, engagementResult] = await Promise.all([
    db.from('acquisition_links').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
    db.from('team_members').select('id, full_name').eq('organization_id', orgId).eq('status', 'Active').is('archived_at', null).order('full_name'),
    db.from('engagement_form_versions').select('id, version, status, config, published_at, created_at').eq('organization_id', orgId).order('created_at', { ascending: false }),
    db.from('prospect_engagements').select('lead_id, acquisition_channel, industry, primary_service, event_name, referring_employee_id').eq('organization_id', orgId).order('submitted_at', { ascending: false }).limit(5000),
  ])
  for (const result of [linkResult, memberResult, versionResult, engagementResult]) if (result.error) throw result.error

  const members = (memberResult.data ?? []).map((row: any) => ({ id: row.id, name: row.full_name }))
  const memberNames = new Map<string, string>(members.map((member: { id: string; name: string }) => [member.id, member.name]))
  const links: AcquisitionLinkRow[] = (linkResult.data ?? []).map((row: any) => ({
    id: row.id,
    token: row.token,
    name: row.name,
    channel: row.channel,
    campaignName: row.campaign_name,
    eventName: row.event_name,
    assignedToId: row.assigned_to_id,
    assignedToName: row.assigned_to_id ? memberNames.get(row.assigned_to_id) ?? null : null,
    referringEmployeeId: row.referring_employee_id,
    referringEmployeeName: row.referring_employee_id ? memberNames.get(row.referring_employee_id) ?? null : null,
    formVersionId: row.form_version_id,
    active: row.active,
    visits: Number(row.visit_count),
    submissions: Number(row.submission_count),
    createdAt: row.created_at,
  }))
  const versions = (versionResult.data ?? []).map((row: any) => ({
    id: row.id,
    version: row.version,
    status: row.status,
    config: parseFormConfig(row.config),
    publishedAt: row.published_at,
    createdAt: row.created_at,
  }))

  const engagements = engagementResult.data ?? []
  const leadIds = [...new Set<string>(engagements.map((row: any) => row.lead_id))]
  let qualified = 0
  let opportunityRows: any[] = []
  if (leadIds.length) {
    const [leads, opportunities] = await Promise.all([
      db.from('leads').select('id, status').eq('organization_id', orgId).in('id', leadIds),
      db.from('sales_opportunities').select('lead_id, stage, expected_value').eq('organization_id', orgId).in('lead_id', leadIds).is('archived_at', null),
    ])
    if (leads.error) throw leads.error
    if (opportunities.error) throw opportunities.error
    qualified = (leads.data ?? []).filter((row: any) => ['Qualified', 'Converted'].includes(row.status)).length
    opportunityRows = opportunities.data ?? []
  }

  return {
    canManage: roleHasPermission(role, 'acquisition.manage'),
    links,
    members,
    versions,
    report: {
      total: engagements.length,
      qualified,
      opportunities: opportunityRows.length,
      wonRevenue: opportunityRows.filter((row) => row.stage === 'Won').reduce((sum, row) => sum + Number(row.expected_value ?? 0), 0),
      conversionRate: engagements.length ? Math.round((opportunityRows.length / engagements.length) * 1000) / 10 : 0,
      byChannel: countBy(engagements, 'acquisition_channel'),
      byIndustry: countBy(engagements, 'industry'),
      byService: countBy(engagements, 'primary_service'),
      byEvent: countBy(engagements, 'event_name'),
      byEmployee: countValues(engagements.map((row: any) => row.referring_employee_id ? memberNames.get(row.referring_employee_id) ?? 'Former team member' : 'Unattributed')),
    },
  }
}

export async function getAcquisitionLink(id: string) {
  const data = await getAcquisitionAdminData()
  return { ...data, link: data.links.find((link) => link.id === id) ?? null }
}

export async function getLeadEngagementDetails(leadId: string): Promise<EngagementDetails[]> {
  const { organization, db } = await context()
  const { data, error } = await db
    .from('prospect_engagements')
    .select('*')
    .eq('organization_id', organization.id)
    .eq('lead_id', leadId)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    selectedServices: row.selected_services ?? [],
    primaryService: row.primary_service,
    primaryObjective: row.primary_objective,
    expectedTimeline: row.expected_timeline,
    additionalInformation: row.additional_information,
    organisationName: row.organisation_name,
    industry: row.industry,
    country: row.country,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    jobTitle: row.job_title,
    preferredContact: row.preferred_contact,
    channel: row.acquisition_channel,
    sourceName: row.source_name,
    campaignName: row.campaign_name,
    eventName: row.event_name,
    marketingConsent: row.marketing_consent,
    privacyNoticeVersion: row.privacy_notice_version,
    submittedAt: row.submitted_at,
    formVersion: row.form_version,
    utm: row.utm_parameters ?? {},
  }))
}

function countBy(rows: any[], key: string) {
  return countValues(rows.map((row) => String(row[key] || 'Unspecified')))
}

function countValues(values: string[]) {
  const counts = new Map<string, number>()
  for (const label of values) {
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

