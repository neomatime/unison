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
