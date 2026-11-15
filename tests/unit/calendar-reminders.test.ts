import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_REMINDER_MINUTES, parseReminder, reminderLabel, REMINDER_OPTIONS } from '../../features/calendar/reminders.ts'

test('reminder: only the offered times are accepted, anything else is no reminder', () => {
  assert.equal(parseReminder('15'), 15)
  assert.equal(parseReminder(1440), 1440)
  assert.equal(parseReminder(''), null)
  assert.equal(parseReminder('none'), null)
  assert.equal(parseReminder('7'), null)
  assert.equal(parseReminder('-5'), null)
  assert.equal(parseReminder(null), null)
})

test('reminder: labels read naturally and the default is one of the choices', () => {
  assert.equal(reminderLabel(15), '15 minutes before')
  assert.equal(reminderLabel(60), '1 hour before')
  assert.equal(reminderLabel(null), 'No reminder')
  assert.ok(REMINDER_OPTIONS.some((option) => option.minutes === DEFAULT_REMINDER_MINUTES))
  assert.equal(new Set(REMINDER_OPTIONS.map((option) => option.minutes)).size, REMINDER_OPTIONS.length)
})
