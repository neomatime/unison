import assert from 'node:assert/strict'
import test from 'node:test'

import { assessRelationship, recommendationKey } from '../../features/clients/relationship-intelligence.ts'

const now = new Date('2026-10-09T10:00:00.000Z')

test('relationship assessment explains operational issues before recency', () => {
  const result = assessRelationship({
    lastInteractionAt: '2026-10-08T10:00:00.000Z',
    overdueFollowUps: 2,
    onboardingIssues: 0,
    overdueInvoices: 1,
    activeOpportunities: 1,
    recordedConcerns: 0,
    completedInteractions: 4,
  }, now)
  assert.equal(result.indicator, 'Needs Attention')
  assert.match(result.reason, /2 overdue follow-ups/)
  assert.match(result.reason, /1 overdue invoice/)
})

test('relationship assessment never invents a score when there is no evidence', () => {
  const result = assessRelationship({
    lastInteractionAt: null,
    overdueFollowUps: 0,
    onboardingIssues: 0,
    overdueInvoices: 0,
    activeOpportunities: 0,
    recordedConcerns: 0,
    completedInteractions: 0,
  }, now)
  assert.equal(result.indicator, 'Insufficient Data')
})

test('recent repeated interactions produce a strong, explainable result', () => {
  const result = assessRelationship({
    lastInteractionAt: '2026-10-01T10:00:00.000Z',
    overdueFollowUps: 0,
    onboardingIssues: 0,
    overdueInvoices: 0,
    activeOpportunities: 0,
    recordedConcerns: 0,
    completedInteractions: 2,
  }, now)
  assert.equal(result.indicator, 'Strong')
  assert.match(result.reason, /8 days ago/)
})

test('recommendation keys remain deterministic', () => {
  assert.equal(recommendationKey('quote-follow-up', 'abc'), 'quote-follow-up:abc')
})
