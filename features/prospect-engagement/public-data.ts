import 'server-only'

import { createHmac } from 'node:crypto'

import { readSupabaseSecretKey } from '@/lib/env'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { parseFormConfig, type EngagementSubmission } from './schema'
import type { PublicEngagementContext } from './types'

type SourceRow = {
  id: string
  token: string
  channel: string
  form_version_id: string | null
}

type VersionRow = {
  id: string
  version: string
  config: unknown
  status: string
}

const HIMARK_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'

/**
 * Signed-out DAL for the public engagement route. Service role is necessary because
 * anonymous database access is deliberately revoked; this module returns only the
 * published public wording and non-sensitive acquisition label.
 */
export async function loadPublicEngagementContext(token: string | null): Promise<PublicEngagementContext | null> {
  const db = createAdminSupabase() as any
  let source: SourceRow | null = null

  if (token) {
    const result = await db
      .from('acquisition_links')
      .select('id, token, channel, form_version_id')
      .eq('organization_id', HIMARK_ORGANIZATION_ID)
      .eq('token', token)
      .eq('active', true)
      .maybeSingle()
    if (result.error) throw result.error
    if (!result.data) return null
    source = result.data as SourceRow
  }

  let query = db
    .from('engagement_form_versions')
    .select('id, version, config, status')
    .eq('organization_id', HIMARK_ORGANIZATION_ID)
  if (source?.form_version_id) {
    query = query.eq('id', source.form_version_id).in('status', ['published', 'retired'])
  } else {
    query = query.eq('status', 'published').order('published_at', { ascending: false }).limit(1)
  }
  const versionResult = await query.maybeSingle()
  if (versionResult.error) throw versionResult.error
  const version = versionResult.data as VersionRow | null
  if (!version) return null

  return {
    formVersionId: version.id,
    formVersion: version.version,
    config: parseFormConfig(version.config),
    source: source ? { token: source.token, channel: source.channel } : null,
  }
}

export async function consumePublicRateLimit(identifier: string) {
  const secret = readSupabaseSecretKey(process.env)
  const identifierHash = createHmac('sha256', secret).update(identifier).digest('hex')
  const db = createAdminSupabase() as any
  const { data, error } = await db.rpc('consume_prospect_rate_limit', {
    p_identifier_hash: identifierHash,
    p_limit: 10,
    p_window_seconds: 3600,
  })
  if (error) throw error
  return data === true
}

export async function recordPublicVisit(token: string) {
  const db = createAdminSupabase() as any
  const { data, error } = await db.rpc('record_acquisition_visit', { p_token: token })
  if (error) throw error
  return data === true
}

export async function submitProspectEngagement(submission: EngagementSubmission) {
  const db = createAdminSupabase() as any
  const payload = {
    submission_key: submission.submissionKey,
    form_version_id: submission.formVersionId,
    selected_services: submission.selectedServices,
    primary_service: submission.primaryService,
    primary_objective: submission.primaryObjective,
    expected_timeline: submission.expectedTimeline,
    additional_information: submission.additionalInformation,
    organisation_name: submission.organisationName,
    industry: submission.industry,
    full_name: submission.fullName,
    email: submission.email,
    job_title: submission.jobTitle,
    phone: submission.phone,
    country: submission.country,
    contact_preference: submission.contactPreference,
    privacy_acknowledged: submission.privacyAcknowledged,
    marketing_consent: submission.marketingConsent,
    source_token: submission.sourceToken,
    channel: submission.sourceToken ? submission.channel : 'corporate-website',
    utm: submission.utm,
  }
  const { data, error } = await db.rpc('submit_prospect_engagement', { p_submission: payload })
  if (error) throw error
  return data as { accepted: boolean; duplicate: boolean }
}

