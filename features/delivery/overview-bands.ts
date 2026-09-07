/**
 * Shared by the server query and presentation components, so this module must
 * remain free of `server-only` imports.
 */

/**
 * The database permits both `On Track` and `Healthy`. The executive briefing
 * intentionally groups those positive states, and the label names both so the
 * aggregation does not silently change either record's meaning.
 */
export type HealthBand = 'On Track / Healthy' | 'Watch' | 'At Risk' | 'Critical'

/** Ordered positive to critical for consistent summaries and visual stacks. */
export const HEALTH_BANDS: readonly HealthBand[] = ['On Track / Healthy', 'Watch', 'At Risk', 'Critical']

export function bandFor(health: string): HealthBand {
  switch (health) {
    case 'On Track':
    case 'Healthy':
      return 'On Track / Healthy'
    case 'Watch':
      return 'Watch'
    case 'At Risk':
      return 'At Risk'
    case 'Critical':
      return 'Critical'
    default:
      throw new Error(`Unsupported project health: ${health}`)
  }
}

/**
 * The shared 30-day lookahead window. `delivery-overview.ts` uses it for
 * upcoming project dates and `dependency-status.ts` uses it for the At Risk
 * threshold -- the two are deliberately the same window, so it lives here
 * once rather than as two independent `30`s bound only by a comment.
 */
export const PROJECT_DATE_WINDOW_DAYS = 30

export type PhaseColumn = {
  phase: string
  position: number
  total: number
  counts: Record<HealthBand, number>
}

export type AttentionRow = {
  id: string
  name: string
  health: string
  phase: string
  framework: string
  client: string
  owner: string
  nextGate: string | null
  targetDate: string | null
  targetDateLabel: string
  note: string | null
}

export type UpcomingProjectDate = {
  id: string
  name: string
  health: string
  dueDate: string
  dueDateLabel: string
  nextGate: string | null
}

export type DeliveryOverview = {
  activeProjects: number
  healthCounts: Record<HealthBand, number>
  projectDatesNext7: number
  projectDatesNext30: number
  overdueProjectDates: number
  missingNextGateCount: number
  unassignedOwnerCount: number
  /** Share of active projects recorded as either On Track or Healthy. */
  portfolioHealth: number | null
  /** The single framework described by the lifecycle distribution. */
  framework: { id: string; name: string } | null
  /** Delivery items belonging to the charted framework's projects. */
  leadingFrameworkItemCount: number
  /** Of those, the ones carrying no phase. */
  itemsWithoutPhaseCount: number
  /**
   * Delivery items by phase, for the charted framework. Named for its unit
   * because it used to carry projects: a field whose meaning changes while its
   * name stays is how a later reader is misled.
   *
   * Empty when there are no items — see the honest-zero rule in item-briefing.ts.
   */
  itemPhaseColumns: PhaseColumn[]
  /** Blocked delivery items across every active project. */
  blockedItemCount: number
  /** Distinct projects those blocked items sit in. */
  blockedItemProjectCount: number
  /** Delivery items across every active project, blocked or not. */
  activeItemCount: number
  /** All active At Risk or Critical projects, in deterministic triage order. */
  attention: AttentionRow[]
  /** Active project due dates in the end-exclusive 30-day window. */
  upcomingProjectDates: UpcomingProjectDate[]
}

export type PositionNarrative = {
  headline: string
  description: string
}

/**
 * Builds briefing copy only from recorded project health. It deliberately
 * avoids schedule, cause, impact, gate, decision, or dependency assertions.
 */
export function positionNarrative({
  activeProjects,
  healthCounts,
}: Pick<DeliveryOverview, 'activeProjects' | 'healthCounts'>): PositionNarrative {
  const countedProjects = HEALTH_BANDS.reduce((total, band) => total + healthCounts[band], 0)
  if (countedProjects !== activeProjects) {
    throw new Error(`Project health counts (${countedProjects}) do not match active projects (${activeProjects})`)
  }

  if (activeProjects === 0) {
    return {
      headline: 'No active delivery yet.',
      description: 'Create or activate a project to begin building a live delivery briefing.',
    }
  }

  const critical = healthCounts.Critical
  const atRisk = healthCounts['At Risk']
  const watch = healthCounts.Watch

  if (critical > 0) {
    const criticalCopy = markedShare(critical, activeProjects, 'Critical')
    const atRiskCopy = atRisk > 0 ? ` ${markedShare(atRisk, activeProjects, 'At Risk')}.` : ''
    return {
      headline: 'Delivery requires intervention.',
      description: `${criticalCopy}.${atRiskCopy}`,
    }
  }

  if (atRisk > 0) {
    return {
      headline: 'Delivery needs focused attention.',
      description: `${markedShare(atRisk, activeProjects, 'At Risk')}. No active project is marked Critical.`,
    }
  }

  if (watch > 0) {
    return {
      headline: 'Delivery remains broadly on track.',
      description: `${markedShare(watch, activeProjects, 'Watch')}. No active project is marked At Risk or Critical.`,
    }
  }

  return {
    headline: 'Delivery remains on track.',
    description: activeProjects === 1
      ? 'The active project is recorded as On Track or Healthy.'
      : `All ${activeProjects} active projects are recorded as On Track or Healthy.`,
  }
}

function markedShare(count: number, total: number, health: 'Watch' | 'At Risk' | 'Critical') {
  return `${count} of ${total} active ${plural('project', total)} ${count === 1 ? 'is' : 'are'} marked ${health}`
}

function plural(word: string, count: number) {
  return count === 1 ? word : `${word}s`
}

/**
 * Database dates are date-only ISO strings. UTC-midnight arithmetic preserves
 * the stored calendar date across server time zones. The end is exclusive, so
 * a 7-day window contains today plus the following six dates.
 */
export function isDateWithinDays(value: string | null, start: string, days: number) {
  if (!Number.isInteger(days) || days <= 0) return false

  const startDate = parseDateOnly(start)
  const candidate = parseDateOnly(value)
  if (!startDate || !candidate) return false

  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + days)

  return candidate >= startDate && candidate < endDate
}

export function isDateOverdue(value: string | null, today: string) {
  const todayDate = parseDateOnly(today)
  const candidate = parseDateOnly(value)
  return Boolean(todayDate && candidate && candidate < todayDate)
}

function parseDateOnly(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null
  return parsed
}
