export type RelationshipIndicator = 'Strong' | 'Stable' | 'Needs Attention' | 'Insufficient Data'

export type RelationshipSignals = {
  lastInteractionAt: string | null
  overdueFollowUps: number
  onboardingIssues: number
  overdueInvoices: number
  activeOpportunities: number
  recordedConcerns: number
  completedInteractions: number
}

export type RelationshipAssessment = {
  indicator: RelationshipIndicator
  reason: string
  daysSinceInteraction: number | null
}

const day = 86_400_000

export function daysBetween(earlier: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(earlier).getTime()) / day))
}

/**
 * Explainable relationship assessment. Negative operational facts take priority;
 * recency alone never claims that a client is unhappy.
 */
export function assessRelationship(signals: RelationshipSignals, now = new Date()): RelationshipAssessment {
  const daysSinceInteraction = signals.lastInteractionAt ? daysBetween(signals.lastInteractionAt, now) : null
  const issues: string[] = []
  if (signals.overdueFollowUps > 0) issues.push(`${signals.overdueFollowUps} overdue follow-up${signals.overdueFollowUps === 1 ? '' : 's'}`)
  if (signals.overdueInvoices > 0) issues.push(`${signals.overdueInvoices} overdue invoice${signals.overdueInvoices === 1 ? '' : 's'}`)
  if (signals.onboardingIssues > 0) issues.push(`${signals.onboardingIssues} onboarding item${signals.onboardingIssues === 1 ? '' : 's'} requiring review`)
  if (signals.recordedConcerns > 0) issues.push(`${signals.recordedConcerns} recorded concern${signals.recordedConcerns === 1 ? '' : 's'}`)

  if (issues.length > 0) {
    return { indicator: 'Needs Attention', reason: issues.join(' · '), daysSinceInteraction }
  }

  const hasEvidence = signals.completedInteractions > 0
    || signals.activeOpportunities > 0
    || signals.lastInteractionAt !== null
  if (!hasEvidence) {
    return {
      indicator: 'Insufficient Data',
      reason: 'Not enough relationship activity has been recorded to assess this client.',
      daysSinceInteraction,
    }
  }

  if (daysSinceInteraction !== null && daysSinceInteraction <= 30 && signals.completedInteractions >= 2) {
    return {
      indicator: 'Strong',
      reason: `A meaningful interaction was recorded ${daysSinceInteraction === 0 ? 'today' : `${daysSinceInteraction} day${daysSinceInteraction === 1 ? '' : 's'} ago`} and no unresolved relationship issues were found.`,
      daysSinceInteraction,
    }
  }

  if (daysSinceInteraction !== null && daysSinceInteraction > 90) {
    return {
      indicator: 'Needs Attention',
      reason: `No meaningful interaction has been recorded for ${daysSinceInteraction} days; review the relationship cadence.`,
      daysSinceInteraction,
    }
  }

  return {
    indicator: 'Stable',
    reason: daysSinceInteraction === null
      ? 'Commercial activity exists, but no direct interaction has been recorded yet.'
      : `The last meaningful interaction was ${daysSinceInteraction === 0 ? 'today' : `${daysSinceInteraction} day${daysSinceInteraction === 1 ? '' : 's'} ago`} and no unresolved relationship issues were found.`,
    daysSinceInteraction,
  }
}

export function recommendationKey(kind: string, recordId: string): string {
  return `${kind}:${recordId}`
}
