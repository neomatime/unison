import assert from 'node:assert/strict'
import test from 'node:test'

import { FRAMEWORK_TYPES, frameworkInputSchema, levelLabel, phaseNameSchema } from '../../features/delivery/schemas/framework.ts'

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

test('level labels are optional and empty becomes null', () => {
  const result = frameworkInputSchema.safeParse({ name: 'F', type: 'Enterprise', level1Label: '', level2Label: '  ' })
  assert.equal(result.success, true)
  assert.equal(result.data!.level1Label, null)
  assert.equal(result.data!.level2Label, null)
})

test('level labels are trimmed and kept when set', () => {
  const result = frameworkInputSchema.safeParse({ name: 'F', type: 'Enterprise', level1Label: ' Epic ', level2Label: 'Feature' })
  assert.equal(result.data!.level1Label, 'Epic')
  assert.equal(result.data!.level2Label, 'Feature')
})

test('an unset label falls back to a neutral level name, never an invented one', () => {
  // Defaulting to "Epic" would assert a methodology the organisation has not
  // chosen, which is the opposite of what the generic model exists to do.
  assert.equal(levelLabel(1, { level1Label: null, level2Label: null }), 'Level 1')
  assert.equal(levelLabel(2, { level1Label: null, level2Label: null }), 'Level 2')
  assert.equal(levelLabel(1, { level1Label: 'Obligation', level2Label: 'Control' }), 'Obligation')
  assert.equal(levelLabel(2, { level1Label: 'Obligation', level2Label: 'Control' }), 'Control')
})
