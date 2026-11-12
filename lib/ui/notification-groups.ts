// Groups a notification list by day for the panel. Pure: no directive, no imports.

export type NotificationGroup<T> = { label: 'Today' | 'Yesterday' | 'Earlier'; items: T[] }

const dayNumber = (date: Date) => Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000)

/** Groups by the viewer's own calendar day, keeping the order given. Empty groups are left out. */
export function groupNotifications<T extends { created_at: string }>(items: readonly T[], now: Date): Array<NotificationGroup<T>> {
  const today = dayNumber(now)
  const groups: Array<NotificationGroup<T>> = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Earlier', items: [] },
  ]
  for (const item of items) {
    const created = new Date(item.created_at)
    const age = Number.isNaN(created.getTime()) ? Infinity : today - dayNumber(created)
    groups[age <= 0 ? 0 : age === 1 ? 1 : 2].items.push(item)
  }
  return groups.filter((group) => group.items.length > 0)
}
