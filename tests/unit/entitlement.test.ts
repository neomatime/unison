import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getEntitledModuleIds,
  lockedModuleIds,
  lowestTierIncluding,
  unisonTiers,
} from '../../config/unison-tiers.ts'

// The per-tier module sets are asserted once, in tests/unit/unison-tiers.test.ts,
// which is named for the config module that defines them and already covers the
// rest of its helpers. They were duplicated here in a second style; two files
// failing for one regression with different messages is how the two copies of
// the Strategic Enterprise assertion drifted apart in wording. This file keeps
// only what unison-tiers.test.ts does not assert.

test('every locked module is in every tier', () => {
  for (const tier of unisonTiers) {
    for (const moduleId of lockedModuleIds) {
      assert.ok(
        getEntitledModuleIds(tier.id).includes(moduleId),
        `${moduleId} must be in ${tier.id}: Delivery and Team are in every tier`,
      )
    }
  }
})

test('lowestTierIncluding names the cheapest tier that carries a module', () => {
  assert.equal(lowestTierIncluding('projects')?.id, 'core')
  assert.equal(lowestTierIncluding('clients')?.id, 'framework')
  assert.equal(lowestTierIncluding('invoices')?.id, 'enterprise')
})

test('lowestTierIncluding never names a tier that excludes the module', () => {
  for (const module of ['clients', 'invoices', 'sales', 'team'] as const) {
    const tier = lowestTierIncluding(module)
    assert.ok(tier, `expected a tier for ${module}`)
    assert.ok(getEntitledModuleIds(tier.id).includes(module))
  }
})
