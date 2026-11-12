import assert from 'node:assert/strict'
import test from 'node:test'

import { groupNotifications } from '../../lib/ui/notification-groups.ts'

const at = (iso: string) => ({ created_at: new Date(iso).toISOString() })

test('notifications are grouped by the viewer\'s calendar day, newest group first, empty groups left out', () => {
  const now = new Date(2026, 10, 12, 15, 0)
  const items = [
    { id: 'a', created_at: new Date(2026, 10, 12, 9, 0).toISOString() },
    { id: 'b', created_at: new Date(2026, 10, 11, 23, 30).toISOString() },
    { id: 'c', created_at: new Date(2026, 10, 9, 10, 0).toISOString() },
    { id: 'd', created_at: new Date(2026, 10, 12, 14, 59).toISOString() },
  ]
  const groups = groupNotifications(items, now)
  assert.deepEqual(groups.map((group) => [group.label, group.items.map((item) => item.id)]), [['Today', ['a', 'd']], ['Yesterday', ['b']], ['Earlier', ['c']]])
})

test('only the groups with items are returned, and a bad date falls into Earlier', () => {
  const now = new Date(2026, 10, 12, 15, 0)
  assert.deepEqual(groupNotifications([], now), [])
  const groups = groupNotifications([{ created_at: 'not a date' }, at('2026-11-12T10:00:00')], now)
  assert.ok(groups.some((group) => group.label === 'Earlier' && group.items.length === 1))
})
