import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeCompanyName,
  readActivityFields,
  readContactFields,
  readConvertTarget,
  readFollowUpFields,
  readStageChange,
  resolveFollowUpAssignee,
} from '../../features/crm-workspace/fields.ts'

const form = (entries: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}
const NOW = new Date('2026-10-10T12:00:00.000Z')
const UUID = '3f0c6a52-8a51-4b1f-9f3e-2a4d7c9e1b10'

test('a contact needs a name, and its email must look like one', () => {
  assert.deepEqual(readContactFields(form({ fullName: '  ' })), { error: 'A contact name is required.' })
  assert.deepEqual(readContactFields(form({ fullName: 'Pat', email: 'not-an-email' })), { error: 'Enter a valid email address.' })
  assert.deepEqual(readContactFields(form({ fullName: ' Pat Doe ', email: ' pat@x.co ', phone: '', jobTitle: 'CFO', notes: '' })), {
    full_name: 'Pat Doe', email: 'pat@x.co', phone: null, job_title: 'CFO', notes: null,
  })
  assert.deepEqual(readContactFields(form({ fullName: 'Pat' })), { full_name: 'Pat', email: null, phone: null, job_title: null, notes: null })
})

test('an activity needs a known kind and a subject', () => {
  assert.deepEqual(readActivityFields(form({ kind: 'gossip', subject: 'x' }), NOW), { error: 'Choose a call, meeting, email or note.' })
  assert.deepEqual(readActivityFields(form({ kind: 'lead.converted', subject: 'x' }), NOW), { error: 'Choose a call, meeting, email or note.' })
  assert.deepEqual(readActivityFields(form({ kind: 'call', subject: '  ' }), NOW), { error: 'A subject is required.' })
  assert.deepEqual(readActivityFields(form({ kind: ' call ', subject: ' Rang Pat ', body: ' went well ' }), NOW), {
    kind: 'call', subject: 'Rang Pat', body: 'went well', occurred_at: null,
  })
})

test('an activity time must be a real time and not in the future', () => {
  const at = (occurredAt: string) => readActivityFields(form({ kind: 'note', subject: 's', occurredAt }), NOW)
  assert.equal((at('2026-10-10T09:30:00.000Z') as { occurred_at: string }).occurred_at, '2026-10-10T09:30:00.000Z')
  assert.deepEqual(at('yesterday'), { error: 'Enter a valid date and time.' })
  assert.deepEqual(at('2026-13-45T10:00:00.000Z'), { error: 'Enter a valid date and time.' })
  assert.deepEqual(at('2026-10-11T12:00:00.000Z'), { error: 'An activity cannot be in the future.' })
  assert.equal('error' in at('2026-10-10T12:04:00.000Z'), false, 'within five minutes of now is allowed')
  assert.deepEqual(at('2026-10-10T12:06:00.000Z'), { error: 'An activity cannot be in the future.' })
})

test('a follow-up needs a title and a known priority, and a real due date', () => {
  const read = (over: Record<string, string>) => readFollowUpFields(form({ title: 'Call back', priority: 'Medium', ...over }))
  assert.deepEqual(read({ title: ' ' }), { error: 'A follow-up title is required.' })
  assert.deepEqual(read({ priority: 'Urgent' }), { error: 'Choose a valid priority.' })
  assert.deepEqual(read({ priority: 'medium' }), { error: 'Choose a valid priority.' })
  assert.deepEqual(read({ dueDate: '2026-02-30' }), { error: 'Enter a valid due date.' })
  assert.deepEqual(read({ dueDate: 'next week' }), { error: 'Enter a valid due date.' })
  assert.deepEqual(read({ assigneeId: 'not-a-uuid' }), { error: 'Choose a valid assignee.' })
  assert.deepEqual(read({ priority: ' High ', dueDate: '2026-10-20', assigneeId: UUID }), {
    title: 'Call back', priority: 'High', due_at: '2026-10-20T12:00:00.000Z', assignee_id: UUID,
  })
  assert.deepEqual(read({}), { title: 'Call back', priority: 'Medium', due_at: null, assignee_id: null })
})

test('a stage change needs a known stage, and Lost needs a reason', () => {
  assert.deepEqual(readStageChange(form({ stage: 'Pending' })), { error: 'Choose a valid stage.' })
  assert.deepEqual(readStageChange(form({ stage: 'Lost', lostReason: '  ' })), { error: 'Say why this opportunity was lost.' })
  assert.deepEqual(readStageChange(form({ stage: 'Lost', lostReason: ' Budget ' })), { stage: 'Lost', lost_reason: 'Budget' })
  assert.deepEqual(readStageChange(form({ stage: 'Won', lostReason: 'left over' })), { stage: 'Won', lost_reason: null }, 'a stale reason is not kept')
  assert.deepEqual(readStageChange(form({ stage: 'Proposal' })), { stage: 'Proposal', lost_reason: null })
})

test('the conversion target is a new client, or a valid existing one', () => {
  assert.deepEqual(readConvertTarget(form({})), { clientId: null })
  assert.deepEqual(readConvertTarget(form({ clientId: '' })), { clientId: null })
  assert.deepEqual(readConvertTarget(form({ clientId: 'new' })), { clientId: null })
  assert.deepEqual(readConvertTarget(form({ clientId: UUID })), { clientId: UUID })
  assert.deepEqual(readConvertTarget(form({ clientId: 'abc' })), { error: 'Choose a valid client.' })
})

test('company names that differ only by capitals and spacing are the same company', () => {
  assert.equal(normalizeCompanyName('  Acme   Corp '), 'acme corp')
  assert.equal(normalizeCompanyName('ACME CORP'), normalizeCompanyName('acme\tcorp'))
  assert.equal(normalizeCompanyName('Acme\nCorp'), 'acme corp')
  assert.notEqual(normalizeCompanyName('Acme Corp'), normalizeCompanyName('Acme Corporation'))
  assert.equal(normalizeCompanyName('   '), '')
})

test('a follow-up goes to the person asked for, else the signed-in user, else nobody', () => {
  assert.equal(resolveFollowUpAssignee(UUID, ['a']), UUID)
  assert.equal(resolveFollowUpAssignee(null, ['a', 'b']), 'a')
  assert.equal(resolveFollowUpAssignee(null, []), null)
})
