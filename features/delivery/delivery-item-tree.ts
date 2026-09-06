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
}

export type DeliveryItemNode = DeliveryItem & { children: DeliveryItem[] }

/** A flat row as read from the database, before assembly into a tree. */
export type DeliveryItemRow = DeliveryItem & { parentId: string | null }

/**
 * Assembles the flat row set into a two-level tree.
 *
 * Archived rows are not filtered out at either level -- an archived item is a
 * legitimate, visible, restorable state, not a hidden one. A live child
 * therefore always nests under its actual parent, live or archived, because
 * that parent is always present in the returned tree. (There used to be an
 * "orphan promotion" step here for a live child whose parent was archived,
 * back when archived parents were dropped and such a child would otherwise
 * vanish. Now that archived parents are rendered like any other parent, that
 * step is dead: the child just nests where it already belongs, so it and the
 * `parentArchived` flag it needed are gone.)
 *
 * Within each level, live items sort before archived ones, so the working
 * set stays at the top and the archived tail reads as a secondary group. The
 * row set is already ordered by name (see listDeliveryItems), and Array#sort
 * is stable, so this only reorders live-vs-archived and leaves each group's
 * internal order untouched.
 */
export function assembleDeliveryItemTree(rows: ReadonlyArray<DeliveryItemRow>): DeliveryItemNode[] {
  const liveFirst = (a: DeliveryItemRow, b: DeliveryItemRow): number => {
    if ((a.archivedAt === null) === (b.archivedAt === null)) return 0
    return a.archivedAt === null ? -1 : 1
  }

  const toDeliveryItem = (row: DeliveryItemRow): DeliveryItem => {
    const { parentId: _parentId, ...item } = row
    return item
  }

  const level1Rows = rows.filter((row) => row.level === 1).slice().sort(liveFirst)
  const level2Rows = rows.filter((row) => row.level === 2)

  return level1Rows.map((parent) => ({
    ...toDeliveryItem(parent),
    children: level2Rows
      .filter((child) => child.parentId === parent.id)
      .slice()
      .sort(liveFirst)
      .map(toDeliveryItem),
  }))
}
