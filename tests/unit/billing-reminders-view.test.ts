import assert from 'node:assert/strict'
import test from 'node:test'

import { describeReminders, nextReminderDate, REMINDER_TOTAL } from '../../features/documents/billing-reminders-view.ts'

// Accept to invoice, stage 3, task 5: what the invoice page says about an invoice's payment reminders. Pure.

const TODAY = '2027-01-10'
const base = { enabled: true, paused: null, sent: [] as Array<{ sequence: number; sentOn: string }>, dueDate: '2027-01-02', status: 'Overdue', balance: 1725, today: TODAY }

test('nextReminderDate is due plus 3, 10, 17, 24 and 31 days, and none after five', () => {
  assert.equal(nextReminderDate('2027-01-02', 0), '2027-01-05')
  assert.equal(nextReminderDate('2027-01-02', 1), '2027-01-12')
  assert.equal(nextReminderDate('2027-01-02', 2), '2027-01-19')
  assert.equal(nextReminderDate('2027-01-02', 3), '2027-01-26')
  assert.equal(nextReminderDate('2027-01-02', 4), '2027-02-02')
  assert.equal(nextReminderDate('2027-01-02', 5), null)
  assert.equal(REMINDER_TOTAL, 5)
})

test('nextReminderDate crosses month ends and leap years correctly', () => {
  assert.equal(nextReminderDate('2027-01-30', 0), '2027-02-02')
  assert.equal(nextReminderDate('2028-02-27', 0), '2028-03-01', 'a leap year')
  assert.equal(nextReminderDate('2027-12-30', 1), '2028-01-09')
})

test('nextReminderDate gives null for a date that cannot be read', () => {
  for (const bad of ['', 'soon', '2027-02-30', '2027-13-01']) assert.equal(nextReminderDate(bad, 0), null, bad)
})

test('switched off: the line says so, whatever else is true', () => {
  assert.deepEqual(describeReminders({ ...base, enabled: false }), { line: 'Reminders are switched off.', tone: 'muted' })
})

test('nothing owing: paid, cancelled and a zero balance get no reminders', () => {
  for (const status of ['Paid', 'Cancelled', 'Draft']) assert.deepEqual(describeReminders({ ...base, status }), { line: 'No reminders: nothing is owing.', tone: 'muted' }, status)
  assert.deepEqual(describeReminders({ ...base, balance: 0 }), { line: 'No reminders: nothing is owing.', tone: 'muted' })
})

test('paused shows the reason and wins over the schedule', () => {
  assert.deepEqual(describeReminders({ ...base, paused: { reason: 'Client promised payment on Friday' } }), { line: 'Paused: Client promised payment on Friday', tone: 'attention' })
})

test('none sent yet: the first date, or a nudge when the date has passed', () => {
  assert.deepEqual(describeReminders({ ...base, today: '2027-01-02' }), { line: 'No reminder sent yet. The first goes out on 5 January 2027.', tone: 'waiting' })
  assert.deepEqual(describeReminders({ ...base, today: '2027-01-10' }), { line: 'No reminder sent yet. The first is due on the next run.', tone: 'waiting' })
})

test('some sent: how many and when the next goes out', () => {
  assert.deepEqual(describeReminders({ ...base, sent: [{ sequence: 1, sentOn: '2027-01-05' }] }), { line: '1 of 5 sent. The next goes out on 12 January 2027.', tone: 'waiting' })
  assert.deepEqual(describeReminders({ ...base, sent: [{ sequence: 1, sentOn: '2027-01-05' }, { sequence: 2, sentOn: '2027-01-12' }], today: '2027-01-25' }), { line: '2 of 5 sent. The next is due on the next run.', tone: 'waiting' })
})

test('all five sent: the owner follows up themselves', () => {
  const sent = [1, 2, 3, 4, 5].map((sequence) => ({ sequence, sentOn: '2027-02-02' }))
  assert.deepEqual(describeReminders({ ...base, sent, today: '2027-02-10' }), { line: 'All five reminders were sent. Follow up with the client yourself.', tone: 'attention' })
})

test('a part payment still says reminders go on for the balance', () => {
  assert.match(describeReminders({ ...base, status: 'Partially Paid', balance: 500 }).line, /No reminder sent yet/)
})

test('no line claims the invoice is paid unless it is', () => {
  for (const status of ['Issued', 'Partially Paid', 'Overdue']) {
    assert.doesNotMatch(describeReminders({ ...base, status }).line, /\bpaid\b/i)
  }
})
