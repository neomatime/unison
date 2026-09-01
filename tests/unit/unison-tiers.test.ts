import assert from 'node:assert/strict'
import test from 'node:test'

import { getEnabledCounts, getEntitledModuleIds, getModuleEntitlement, lockedModuleIds, reconcileActiveModules } from '../../config/unison-tiers.ts'

const deliveryAndTeam = ['overview', 'portfolio', 'projects', 'frameworks', 'approvals', 'vendors', 'team']

test('Core includes Delivery and Team only', () => {
  assert.deepEqual(getEntitledModuleIds('core'), deliveryAndTeam)
})

test('Framework adds Operations to Core', () => {
  assert.deepEqual(getEntitledModuleIds('framework'), [...deliveryAndTeam, 'clients', 'onboarding'])
})

test('Enterprise includes the full current product', () => {
  assert.deepEqual(getEntitledModuleIds('enterprise'), [...deliveryAndTeam, 'clients', 'onboarding', 'leads', 'quotes', 'sales', 'invoices', 'expenses', 'forecast'])
})

test('Strategic Enterprise currently receives the full Enterprise module set', () => {
  // TEMPORARY, not a product rule. Strategic Enterprise is the
  // client-configured tier; it receives the Enterprise set only until the
  // Strategic tenant-configuration layer is implemented. When that layer lands,
  // delete this assertion -- it is a placeholder being retired, not a rule
  // being broken.
  assert.deepEqual(getEntitledModuleIds('strategic-enterprise'), getEntitledModuleIds('enterprise'))
})

test('Delivery and Team are locked while modules outside entitlement cannot activate', () => {
  assert.deepEqual(lockedModuleIds, deliveryAndTeam)
  assert.deepEqual(getModuleEntitlement('core', 'team', []), { included: true, locked: true, active: true })
  assert.deepEqual(getModuleEntitlement('core', 'sales', ['sales']), { included: false, locked: false, active: false })
})

test('a downgrade removes unavailable modules while preserving required modules', () => {
  const active = reconcileActiveModules('core', getEntitledModuleIds('enterprise'))
  assert.deepEqual(active, deliveryAndTeam)
})

test('enabled counts reflect the active module set', () => {
  assert.deepEqual(getEnabledCounts(getEntitledModuleIds('framework')), { delivery: 6, people: 1, operations: 2, commercial: 0, finance: 0 })
})
