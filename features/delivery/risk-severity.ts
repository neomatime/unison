/**
 * Ranks entries in the project risk register.
 *
 * `project_risks` models probability and impact as two separate constrained
 * vocabularies (see 20260910130104_core_delivery_governance.sql). Neither alone
 * orders a register: ranking on likelihood buries the rare catastrophe, and
 * ranking on impact promotes every theoretical one. The briefing panel is
 * called "top risks", so it needs an ordering, and the matrix is the ordering
 * the two stored fields were modelled to express.
 *
 * Pure, and free of `server-only`, so it is unit testable -- the same split
 * overview-bands.ts, item-briefing.ts and dependency-status.ts already use.
 */

/** Worst first. The order is the ranking. */
export const RISK_BANDS = ['Critical', 'High', 'Moderate', 'Low'] as const

export type RiskBand = (typeof RISK_BANDS)[number]

/** Matches project_risks_probability_check. */
const PROBABILITY_WEIGHT: Record<string, number> = {
  Rare: 1,
  Unlikely: 2,
  Possible: 3,
  Likely: 4,
  'Almost Certain': 5,
}

/** Matches project_risks_impact_check. */
const IMPACT_WEIGHT: Record<string, number> = {
  Minor: 1,
  Moderate: 2,
  Major: 3,
  Severe: 4,
}

export type RankableRisk = {
  id: string
  title: string
  probability: string
  impact: string
  /** ISO yyyy-mm-dd, or null when none is recorded. */
  targetDate: string | null
}

/**
 * Score is probability x impact, 1..20. A value outside either stored
 * vocabulary scores 0 rather than throwing -- the CHECK constraints make that
 * unreachable from the database, and a briefing should not fall over if it
 * ever is reached.
 */
export function riskSeverity(probability: string, impact: string): { band: RiskBand; score: number } {
  const score = (PROBABILITY_WEIGHT[probability] ?? 0) * (IMPACT_WEIGHT[impact] ?? 0)
  return { band: bandForScore(score), score }
}

function bandForScore(score: number): RiskBand {
  if (score >= 12) return 'Critical'
  if (score >= 8) return 'High'
  // 4 is the floor for Critical-impact-at-lowest-probability (Rare x Severe),
  // which must not sit in the same band as a rare minor annoyance.
  if (score >= 4) return 'Moderate'
  return 'Low'
}

/**
 * Worst first, then soonest target date, then title, then id.
 *
 * The last two are not decoration: without a total order, rows of equal
 * severity render in whatever order Postgres returned them and reshuffle
 * between reloads, which reads as data changing when nothing has.
 */
export function compareRisks(a: RankableRisk, b: RankableRisk): number {
  const severityDifference = riskSeverity(b.probability, b.impact).score - riskSeverity(a.probability, a.impact).score
  if (severityDifference) return severityDifference

  // Undated risks sort last rather than first: a risk nobody has put a date
  // against is not thereby the most urgent one.
  const dateDifference = (a.targetDate ?? '9999-12-31').localeCompare(b.targetDate ?? '9999-12-31')
  if (dateDifference) return dateDifference

  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
}
