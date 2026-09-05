/**
 * Shared by the server query and the client chart, so it carries no `server-only`
 * import. `HEALTH_BANDS` is a runtime value rather than a type, so importing it
 * from the query module would pull `next/headers` into the client bundle — the
 * build fails outright rather than degrading, which is the useful behaviour.
 */

/**
 * Four bands, not the five values `projects_health_check` permits. `On Track` and
 * `Healthy` share one because `healthStyles` in delivery-primitives.tsx already
 * renders them identically; splitting them in the chart would invent a
 * distinction the rest of the product does not make.
 */
export type HealthBand = 'On track' | 'Watch' | 'At Risk' | 'Critical'

/** Ordered good to critical. The chart stacks in this order so risk always sits
 * at the top of every column and the eye can read the risk line straight across. */
export const HEALTH_BANDS: readonly HealthBand[] = ['On track', 'Watch', 'At Risk', 'Critical']

export function bandFor(health: string): HealthBand {
  if (health === 'On Track' || health === 'Healthy') return 'On track'
  if (health === 'Watch') return 'Watch'
  if (health === 'At Risk') return 'At Risk'
  return 'Critical'
}

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
  nextGate: string | null
  targetDate: string | null
  targetDateLabel: string
  note: string | null
}

export type DeliveryOverview = {
  activeProjects: number
  healthCounts: Record<HealthBand, number>
  projectDatesDue: number
  projectDatesDueThisWeek: number
  /** Share of active projects on track, or null when there are none to divide by. */
  portfolioHealth: number | null
  /** The framework the lifecycle chart describes. */
  framework: { id: string; name: string } | null
  columns: PhaseColumn[]
  /** Active projects in the At Risk or Critical bands, worst first. */
  attention: AttentionRow[]
}

/**
 * Database dates are stored as date-only ISO strings. Comparing them at UTC
 * midnight avoids moving a project into another day when environments use
 * different time zones.
 */
export function isDateWithinDays(value: string | null, start: string, days: number) {
  if (!value) return false

  const startDate = new Date(`${start}T00:00:00Z`)
  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + days)
  const candidate = new Date(`${value}T00:00:00Z`)

  return candidate >= startDate && candidate <= endDate
}
