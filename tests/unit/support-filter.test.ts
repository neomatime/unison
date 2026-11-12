import assert from 'node:assert/strict'
import test from 'node:test'

import { filterSupportTickets, hasSupportFilters, readSupportFilters } from '../../features/collaboration/support-filter.ts'

const row = (n: number, subject: string, status = 'Open', priority = 'Low', category = 'General', description = 'Something is not working properly') =>
  ({ ticket_number: n, subject, status, priority, category, description })

const tickets = [
  row(12, 'Cannot sign in', 'Open', 'High', 'Access'),
  row(13, 'Invoice total looks wrong', 'In Progress', 'Medium', 'Billing'),
  row(14, 'Export is slow', 'Resolved', 'Low', 'Technical', 'The export to Excel takes minutes'),
]

test('the page address is read safely, and an unknown status or priority is ignored', () => {
  assert.deepEqual(readSupportFilters({ q: '  sign  ', status: 'Open', priority: 'High' }), { q: 'sign', status: 'Open', priority: 'High' })
  assert.deepEqual(readSupportFilters({ status: 'Banana', priority: 'Urgent' }), { q: '', status: '', priority: '' })
  assert.deepEqual(readSupportFilters({ q: ['a', 'b'] }), { q: 'a', status: '', priority: '' })
  assert.equal(readSupportFilters({ q: 'x'.repeat(500) }).q.length, 100)
})

test('search matches the reference, the number, the subject, the category and the details', () => {
  const find = (q: string) => filterSupportTickets(tickets, { q, status: '', priority: '' }).map((t) => t.ticket_number)
  assert.deepEqual(find('SUP-000012'), [12])
  assert.deepEqual(find('13'), [13])
  assert.deepEqual(find('INVOICE'), [13])
  assert.deepEqual(find('technical'), [14])
  assert.deepEqual(find('excel'), [14])
  assert.deepEqual(find(''), [12, 13, 14])
  assert.deepEqual(find('zzz'), [])
})

test('status and priority narrow the list and combine with the search', () => {
  assert.deepEqual(filterSupportTickets(tickets, { q: '', status: 'Resolved', priority: '' }).map((t) => t.ticket_number), [14])
  assert.deepEqual(filterSupportTickets(tickets, { q: '', status: '', priority: 'High' }).map((t) => t.ticket_number), [12])
  assert.deepEqual(filterSupportTickets(tickets, { q: 'export', status: 'Open', priority: '' }), [])
  assert.equal(hasSupportFilters({ q: '', status: '', priority: '' }), false)
  assert.equal(hasSupportFilters({ q: 'a', status: '', priority: '' }), true)
})
