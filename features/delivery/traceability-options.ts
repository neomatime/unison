/**
 * Coverage is derived from link counts, never stored -- the same reasoning
 * dependency-status.ts uses: a stored value would go stale the moment a link
 * is added or removed elsewhere, which is exactly the failure this feature
 * exists to remove.
 */

export type Coverage = 'Not linked' | 'Built' | 'Verified'

export function deriveCoverage(deliveryItemCount: number, evidenceCount: number): Coverage {
  if (evidenceCount > 0) return 'Verified'
  if (deliveryItemCount > 0) return 'Built'
  return 'Not linked'
}

/** Removes options a requirement is already linked to, so an add picker never re-offers a duplicate. */
export function unlinkedOptions<T extends { id: string }>(all: readonly T[], linkedIds: readonly string[]): T[] {
  const linked = new Set(linkedIds)
  return all.filter((option) => !linked.has(option.id))
}
