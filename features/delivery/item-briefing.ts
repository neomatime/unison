import { bandFor, HEALTH_BANDS, type PhaseColumn } from './overview-bands.ts'

/**
 * Shared by the server query and its unit tests, so this module must remain
 * free of `server-only` imports — the same split overview-bands.ts and
 * delivery-item-tree.ts already use.
 */

export type BriefingItemRow = {
  projectId: string
  phaseId: string | null
  health: string
  status: string
}

export type ItemBriefing = {
  /**
   * Delivery items of the charted framework's projects, by phase.
   *
   * EMPTY when there are none. That is the honest-zero rule and not an
   * oversight: the panel is labelled as charting items, so an axis of zeroes
   * would imply items were placed and none arrived. An absent register and an
   * empty one are different statements.
   */
  itemPhaseColumns: PhaseColumn[]
  /** Items belonging to the charted framework's projects. */
  leadingFrameworkItemCount: number
  /** Of those, the ones carrying no phase — a real recording gap. */
  itemsWithoutPhaseCount: number
  /** Blocked items across EVERY active project, not only the charted framework. */
  blockedItemCount: number
  /** Distinct projects those blocked items sit in. Different number; easy to conflate. */
  blockedItemProjectCount: number
  /**
   * Items across every active project, blocked or not.
   *
   * This is what lets the focus line tell "none are blocked" from "none are
   * recorded" — the honest-zero rule. leadingFrameworkItemCount cannot serve:
   * it is framework-scoped while the blocked counts are organisation-wide.
   */
  activeItemCount: number
}

export function summariseDeliveryItems({
  rows,
  leadingFrameworkPhases,
  leadingFrameworkProjectIds,
  activeProjectIds,
}: {
  rows: ReadonlyArray<BriefingItemRow>
  leadingFrameworkPhases: ReadonlyArray<{ id: string; name: string; position: number }>
  /** Projects of the framework being charted — always a subset of the active ones. */
  leadingFrameworkProjectIds: ReadonlySet<string>
  /** Every active project. The briefing frames everything by these. */
  activeProjectIds: ReadonlySet<string>
}): ItemBriefing {
  const inFramework = rows.filter((row) => leadingFrameworkProjectIds.has(row.projectId))

  // Blocked reads from every ACTIVE project, not from inFramework: "what is
  // stuck" is an organisation-wide question, and scoping it to the charted
  // framework would hide stuck work behind a chart's axis.
  const inActiveProject = rows.filter((row) => activeProjectIds.has(row.projectId))
  const blocked = inActiveProject.filter((row) => row.status === 'Blocked')

  return {
    itemPhaseColumns: inFramework.length === 0 ? [] : leadingFrameworkPhases.map((phase) => {
      const counts = Object.fromEntries(HEALTH_BANDS.map((band) => [band, 0])) as PhaseColumn['counts']
      let total = 0
      for (const row of inFramework) {
        if (row.phaseId !== phase.id) continue
        counts[bandFor(row.health)] += 1
        total += 1
      }
      return { phase: phase.name, position: phase.position, total, counts }
    }),
    leadingFrameworkItemCount: inFramework.length,
    itemsWithoutPhaseCount: inFramework.filter((row) => row.phaseId === null).length,
    blockedItemCount: blocked.length,
    blockedItemProjectCount: new Set(blocked.map((row) => row.projectId)).size,
    activeItemCount: inActiveProject.length,
  }
}
