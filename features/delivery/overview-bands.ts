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
  due: string
}

export type DeliveryOverview = {
  activeProjects: number
  atRisk: number
  gatesDue: number
  /** Share of active projects on track, or null when there are none to divide by. */
  portfolioHealth: number | null
  /** The framework the lifecycle chart describes. */
  framework: { id: string; name: string } | null
  columns: PhaseColumn[]
  /** Active projects in the At Risk or Critical bands, worst first. */
  attention: AttentionRow[]
}
