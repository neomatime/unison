import { PROJECT_DATE_WINDOW_DAYS as AT_RISK_WINDOW_DAYS } from './overview-bands.ts'

/**
 * Derives a dependency's status from the prerequisite's CURRENT state.
 *
 * Nothing here is stored. Pending and Satisfied depend on a project that
 * changes independently of the dependency row, so a stored status would go
 * stale silently -- precisely the failure this feature exists to remove.
 *
 * Pure, and free of `server-only`, so it is unit testable -- the same split
 * overview-bands.ts and item-briefing.ts already use.
 */

export type DependencyStatus = 'Satisfied' | 'Pending' | 'At Risk' | 'Blocked'

export type PrerequisiteState = {
  name: string
  status: string
  health: string
  archived: boolean
  /** Position of the prerequisite's current phase; null when none is recorded. */
  currentPhasePosition: number | null
}

export type DependencyRequirement = {
  /** Exactly one of requiredStatus / requiredPhasePosition is set — enforced by the database. */
  requiredStatus: string | null
  requiredPhaseName: string | null
  requiredPhasePosition: number | null
  /** ISO yyyy-mm-dd, or null. A dependency with no date can never be late. */
  requiredByDate: string | null
}

export function deriveDependencyStatus(
  requirement: DependencyRequirement,
  prerequisite: PrerequisiteState,
  /** ISO yyyy-mm-dd. Injected rather than read from the clock, so this is testable. */
  today: string,
): { status: DependencyStatus; reason: string } {
  const target = requirement.requiredPhaseName ?? requirement.requiredStatus ?? 'its required state'

  if (isSatisfied(requirement, prerequisite)) {
    return { status: 'Satisfied', reason: `${prerequisite.name} has reached ${target}.` }
  }

  // Permanent unreachability outranks the date, and outranks health. A
  // dependency waiting on a cancelled or archived project is blocked now, not
  // whenever its date happens to lapse.
  if (prerequisite.archived) {
    return { status: 'Blocked', reason: `${prerequisite.name} has been archived and cannot reach ${target}.` }
  }
  if (prerequisite.status === 'Cancelled') {
    return { status: 'Blocked', reason: `${prerequisite.name} was cancelled and cannot reach ${target}.` }
  }

  const daysRemaining = requirement.requiredByDate === null
    ? null
    : daysBetween(today, requirement.requiredByDate)

  if (daysRemaining !== null && daysRemaining < 0) {
    return { status: 'Blocked', reason: `${prerequisite.name} has not reached ${target}, and the required-by date has passed.` }
  }
  if (daysRemaining !== null && daysRemaining <= AT_RISK_WINDOW_DAYS) {
    // 0 and 1 are both reachable -- a dependency due today is correctly At
    // Risk rather than Blocked, and "within 1 days" / "within 0 days" are not
    // sentences a PM should have to read past.
    const dueCopy = daysRemaining === 0
      ? 'is required today'
      : `is required within ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`
    return { status: 'At Risk', reason: `${prerequisite.name} has not reached ${target}, and ${dueCopy}.` }
  }
  if (prerequisite.health === 'At Risk' || prerequisite.health === 'Critical') {
    return { status: 'At Risk', reason: `${prerequisite.name} has not reached ${target}, and its own health is ${prerequisite.health}.` }
  }

  return { status: 'Pending', reason: `${prerequisite.name} has not yet reached ${target}.` }
}

function isSatisfied(requirement: DependencyRequirement, prerequisite: PrerequisiteState): boolean {
  if (requirement.requiredPhasePosition !== null) {
    // "Reached" means reached OR passed. Requiring the prerequisite to sit
    // exactly on the phase would un-satisfy the dependency the moment that
    // project moved forward, which is the opposite of what a prerequisite means.
    // A prerequisite with no phase recorded has no position and cannot satisfy.
    return prerequisite.currentPhasePosition !== null
      && prerequisite.currentPhasePosition >= requirement.requiredPhasePosition
  }
  return prerequisite.status === requirement.requiredStatus
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000)
}
