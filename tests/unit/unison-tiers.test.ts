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

test('Enterprise and Strategic Enterprise include the full current product', () => {
  const enterprise = getEntitledModuleIds('enterprise')
  assert.deepEqual(getEntitledModuleIds('strategic-enterprise'), enterprise)
  assert.deepEqual(enterprise, [...deliveryAndTeam, 'clients', 'onboarding', 'leads', 'quotes', 'sales', 'invoices', 'expenses', 'forecast'])
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
