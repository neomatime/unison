import assert from 'node:assert/strict'
import test from 'node:test'

import { projectInputSchema } from '../../features/delivery/schemas/project.ts'

test('a name is required', () => {
  const result = projectInputSchema.safeParse({ name: '', frameworkId: crypto.randomUUID() })
  assert.equal(result.success, false)
})

test('a framework is required', () => {
  const result = projectInputSchema.safeParse({ name: 'Claims Intake' })
  assert.equal(result.success, false)
})

test('empty optional fields become null rather than empty strings', () => {
  // The database distinguishes "not set" from "set to nothing"; the form only
  // ever sends strings, so the schema is where that distinction is restored.
  const result = projectInputSchema.parse({
    name: 'Claims Intake', frameworkId: '11111111-1111-4111-8111-111111111111',
    clientId: '', phaseId: '', ownerId: '', nextGate: '', dueDate: '', notes: '',
  })
  assert.equal(result.clientId, null)
  assert.equal(result.phaseId, null)
  assert.equal(result.dueDate, null)
  assert.equal(result.notes, null)
})

test('progress is coerced from the form string and bounded', () => {
  assert.equal(projectInputSchema.parse({
    name: 'X', frameworkId: '11111111-1111-4111-8111-111111111111', progress: '74',
  }).progress, 74)

  assert.equal(projectInputSchema.safeParse({
    name: 'X', frameworkId: '11111111-1111-4111-8111-111111111111', progress: '140',
  }).success, false)
})

test('status and health default to the same values as the column defaults', () => {
  const parsed = projectInputSchema.parse({ name: 'X', frameworkId: '11111111-1111-4111-8111-111111111111' })
  assert.equal(parsed.status, 'Active')
  assert.equal(parsed.health, 'On Track')
})

const base = { name: 'Claims Platform', frameworkId: '3f1a7b6e-1f0d-4a4e-9c2b-6f2a9d8e1c34' }

test('a valid owner id is accepted', () => {
  const parsed = projectInputSchema.safeParse({ ...base, ownerId: '9a7c1d2e-3b4f-4a5c-8d6e-7f8a9b0c1d2e' })
  assert.equal(parsed.success, true)
  assert.equal(parsed.data!.ownerId, '9a7c1d2e-3b4f-4a5c-8d6e-7f8a9b0c1d2e')
})

test('an empty owner id becomes null rather than an empty string', () => {
  // FormData sends "" for an unselected picker; the column is a uuid.
  const parsed = projectInputSchema.safeParse({ ...base, ownerId: '' })
  assert.equal(parsed.success, true)
  assert.equal(parsed.data!.ownerId, null)
})

test('a non-uuid owner id is refused', () => {
  const parsed = projectInputSchema.safeParse({ ...base, ownerId: 'neo.matime' })
  assert.equal(parsed.success, false)
})

test('a malformed due date is refused with a field message, not a database error', () => {
  // dueDate was validated only as "non-empty string" and handed to a date
  // column, so "31 September" reached Postgres and came back as a 500-shaped
  // failure rather than a field-level refusal.
  const parsed = projectInputSchema.safeParse({ ...base, dueDate: '31 September' })
  assert.equal(parsed.success, false)
})

test('a valid due date is accepted and an empty one becomes null', () => {
  assert.equal(projectInputSchema.safeParse({ ...base, dueDate: '2026-09-30' }).success, true)
  const empty = projectInputSchema.safeParse({ ...base, dueDate: '' })
  assert.equal(empty.success, true)
  assert.equal(empty.data!.dueDate, null)
})

test('notes are not capped shorter than the column allows', () => {
  // projects.notes is unbounded text; the schema capped it at 500 for no stated
  // reason, so a long note was refused by the form and accepted by the database.
  const parsed = projectInputSchema.safeParse({ ...base, notes: 'x'.repeat(2000) })
  assert.equal(parsed.success, true)
})
