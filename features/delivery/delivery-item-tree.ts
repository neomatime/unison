/**
 * Pure tree-assembly for delivery items.
 *
 * Kept out of `queries/list-delivery-items.ts` because that module carries
 * `server-only` and so cannot be imported by a unit test -- the same split,
 * for the same reason, as `form-options.ts`.
 */

export type DeliveryItem = {
  id: string
  level: 1 | 2
  name: string
  description: string | null
  /** Resolved name, or 'Unassigned' / 'Former member'. Never a raw uuid. */
  ownerName: string
  status: string
  health: string
  phaseName: string | null
  /** Drives the "Archived in framework" qualifier. The component does no lookup. */
  phaseArchived: boolean
  startDate: string | null
  targetDate: string | null
  archivedAt: string | null
  /**
   * True only for a live level-2 item whose level-1 parent is archived.
   *
   * That state is reachable -- archive a child, archive the parent, then
   * restore the child -- and filtering archived rows out of the flat set
   * before grouping used to make such a child vanish entirely: not shown as
   * archived, not shown at all, unreachable in the UI. Instead of dropping
   * it, it is promoted to a top-level entry of its own, flagged here so a
   * later task can render a muted qualifier rather than pretending the item
   * has no parent by design.
   */
  parentArchived: boolean
}

export type DeliveryItemNode = DeliveryItem & { children: DeliveryItem[] }

/** A flat row as read from the database, before assembly into a tree. */
export type DeliveryItemRow = Omit<DeliveryItem, 'parentArchived'> & { parentId: string | null }

/**
 * Assembles the flat row set into a two-level tree.
 *
 * The row set must include archived level-1 rows, not just live ones --
 * that's what lets a live child's parent be told apart as "archived" rather
 * than "gone". An archived level-1 row is still excluded from the returned
 * parents, exactly as before; it is kept only in the pool used to resolve
 * each child's `parentId`.
 *
 * A live level-2 child of a live parent is nested under it, as always. A
 * live level-2 child of an archived parent is returned as its own top-level
 * entry, with `children: []` and `parentArchived: true`, rather than being
 * dropped along with the parent it can no longer be filed under.
 */
export function assembleDeliveryItemTree(rows: ReadonlyArray<DeliveryItemRow>): DeliveryItemNode[] {
  const level1Rows = rows.filter((row) => row.level === 1)
  const archivedParentIds = new Set(
    level1Rows.filter((row) => row.archivedAt !== null).map((row) => row.id),
  )
  const liveParents = level1Rows.filter((row) => row.archivedAt === null)
  const liveChildren = rows.filter((row) => row.level === 2 && row.archivedAt === null)

  const toDeliveryItem = (row: DeliveryItemRow, parentArchived: boolean): DeliveryItem => {
    const { parentId: _parentId, ...item } = row
    return { ...item, parentArchived }
  }

  const parentNodes: DeliveryItemNode[] = liveParents.map((parent) => ({
    ...toDeliveryItem(parent, false),
    children: liveChildren
      .filter((child) => child.parentId === parent.id)
      .map((child) => toDeliveryItem(child, false)),
  }))

  const orphanNodes: DeliveryItemNode[] = liveChildren
    .filter((child) => child.parentId !== null && archivedParentIds.has(child.parentId))
    .map((child) => ({ ...toDeliveryItem(child, true), children: [] }))

  return [...parentNodes, ...orphanNodes]
}
