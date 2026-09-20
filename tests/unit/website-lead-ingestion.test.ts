import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createWebsiteLeadSignature,
  HIMARK_ORGANIZATION_ID,
  mapWebsiteLead,
  verifyWebsiteLeadSignature,
  websiteLeadSchema,
} from '../../lib/integrations/website-leads.ts'

const payload = {
  deliveryId: 'a'.repeat(64),
  submittedAt: '2026-09-20T10:00:00.000Z',
  assessment: {
    outcome: 'qualified' as const,
    signals: {
      impact: true,
      timing: true,
      readiness: true,
      organisation: false,
      engagement: true,
    },
    score: 4,
    manualReviewRequired: true,
    reviewOverride: null,
  },
  data: {
    firstName: 'Neo',
    lastName: 'Matime',
    email: 'neo@example.com',
    phone: '+27 11 555 0100',
    organisation: 'Oak & Pixel Studio',
    role: 'CEO',
    organisationSize: '1–10',
    industry: 'Professional Services',
    areasOfInterest: ['Digital Infrastructure', 'LOGIC ONE'],
    primaryChallenge: 'Replace disconnected manual approval processes.',
    businessImpact: ['Productivity', 'Turnaround time'],
    impactSeverity: 'High',
    urgency: 'Within 3 months',
    buyingStage: 'We are evaluating providers',
    engagementType: 'Project + ongoing support',
  },
}

test('website lead signatures cover the exact request body', () => {
  const raw = JSON.stringify(payload)
  const signature = createWebsiteLeadSignature(raw, 'integration-secret')
  assert.equal(verifyWebsiteLeadSignature(raw, signature, 'integration-secret'), true)
  assert.equal(verifyWebsiteLeadSignature(`${raw} `, signature, 'integration-secret'), false)
  assert.equal(verifyWebsiteLeadSignature(raw, signature, 'different-secret'), false)
})

test('website lead payload maps every qualification field into the HIMARK lead row', () => {
  const parsed = websiteLeadSchema.parse(payload)
  const row = mapWebsiteLead(parsed)

  assert.equal(row.organization_id, HIMARK_ORGANIZATION_ID)
  assert.equal(row.company_name, payload.data.organisation)
  assert.equal(row.contact_name, 'Neo Matime')
  assert.equal(row.source, 'Website')
  assert.equal(row.status, 'Qualified')
  assert.equal(row.website_submission_key, payload.deliveryId)
  assert.deepEqual(row.areas_of_interest, payload.data.areasOfInterest)
  assert.equal(row.primary_challenge, payload.data.primaryChallenge)
  assert.deepEqual(row.business_impact, payload.data.businessImpact)
  assert.equal(row.qualification_score, 4)
  assert.deepEqual(row.qualification_signals, payload.assessment.signals)
  assert.equal(row.manual_review_required, true)
})
