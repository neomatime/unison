import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

import type { Database } from '@/types/database'

export const HIMARK_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'

const signalsSchema = z.strictObject({
  impact: z.boolean(),
  timing: z.boolean(),
  readiness: z.boolean(),
  organisation: z.boolean(),
  engagement: z.boolean(),
})

const outcomeSchema = z.enum(['qualified', 'nurture', 'not_a_fit'])

export const websiteLeadSchema = z.strictObject({
  deliveryId: z.string().regex(/^[0-9a-f]{64}$/),
  submittedAt: z.iso.datetime({ offset: true }),
  assessment: z.strictObject({
    outcome: outcomeSchema,
    signals: signalsSchema,
    score: z.number().int().min(0).max(5),
    manualReviewRequired: z.boolean(),
    reviewOverride: outcomeSchema.nullable(),
  }),
  data: z.strictObject({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.email().max(254),
    phone: z.string().trim().max(40),
    organisation: z.string().trim().min(1).max(180),
    role: z.string().trim().max(120),
    organisationSize: z.string().trim().max(40),
    industry: z.string().trim().max(100),
    areasOfInterest: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    primaryChallenge: z.string().trim().min(10).max(3000),
    businessImpact: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    impactSeverity: z.string().trim().max(40),
    urgency: z.string().trim().min(1).max(100),
    buyingStage: z.string().trim().min(1).max(150),
    engagementType: z.string().trim().max(100),
  }),
})

export type WebsiteLeadPayload = z.infer<typeof websiteLeadSchema>
export type LeadInsert = Database['public']['Tables']['leads']['Insert']

export function createWebsiteLeadSignature(rawBody: string, secret: string) {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

export function verifyWebsiteLeadSignature(rawBody: string, signature: string, secret: string) {
  if (!/^[0-9a-f]{64}$/.test(signature)) return false
  const supplied = Buffer.from(signature, 'hex')
  const expected = Buffer.from(createWebsiteLeadSignature(rawBody, secret), 'hex')
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export function mapWebsiteLead(payload: WebsiteLeadPayload): LeadInsert {
  const { assessment, data, deliveryId, submittedAt } = payload
  return {
    organization_id: HIMARK_ORGANIZATION_ID,
    company_name: data.organisation,
    contact_name: `${data.firstName} ${data.lastName}`,
    contact_email: data.email,
    contact_phone: data.phone || null,
    contact_role: data.role || null,
    organization_size: data.organisationSize || null,
    industry: data.industry || null,
    source: 'Website',
    status: assessment.outcome === 'qualified' ? 'Qualified' : 'New',
    last_activity_at: submittedAt,
    website_submission_key: deliveryId,
    website_submitted_at: submittedAt,
    areas_of_interest: data.areasOfInterest,
    primary_challenge: data.primaryChallenge,
    business_impact: data.businessImpact,
    impact_severity: data.impactSeverity || null,
    urgency: data.urgency,
    buying_stage: data.buyingStage,
    engagement_type: data.engagementType || null,
    qualification_outcome: assessment.outcome,
    qualification_score: assessment.score,
    qualification_signals: assessment.signals,
    manual_review_required: assessment.manualReviewRequired,
    review_override: assessment.reviewOverride,
    notes: 'Submitted through the HIMARK website. Review the qualification evidence before acting.',
  }
}
