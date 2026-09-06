import assert from 'node:assert/strict'
import test from 'node:test'

import { FRAMEWORK_TYPES, frameworkInputSchema, phaseNameSchema } from '../../features/delivery/schemas/framework.ts'

test('a framework requires a name', () => {
  const result = frameworkInputSchema.safeParse({ name: '   ', type: 'Enterprise' })
  assert.equal(result.success, false)
})

test('a framework type must be one the register offers', () => {
  assert.equal(frameworkInputSchema.safeParse({ name: 'Valid', type: 'Enterprise' }).success, true)
  assert.equal(frameworkInputSchema.safeParse({ name: 'Valid', type: 'Nonsense' }).success, false)
})

test('an absent type is null, not an empty string', () => {
  const result = frameworkInputSchema.safeParse({ name: 'Valid', type: '' })
  assert.equal(result.success, true)
  assert.equal(result.data!.type, null)
})

test('the offered types are exactly the five the product names', () => {
  assert.deepEqual([...FRAMEWORK_TYPES], ['Enterprise', 'Technology', 'Operations', 'Compliance', 'Commercial'])
})

test('a phase requires a name', () => {
  assert.equal(phaseNameSchema.safeParse({ name: '' }).success, false)
  assert.equal(phaseNameSchema.safeParse({ name: 'Discover' }).success, true)
})
