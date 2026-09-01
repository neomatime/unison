import assert from 'node:assert/strict'
import test from 'node:test'

import { navigationSectionsFor } from '../../config/navigation.ts'
import { getEntitledModuleIds } from '../../config/unison-tiers.ts'

test('a Core tenant sees Delivery and People only', () => {
  const headings = navigationSectionsFor(getEntitledModuleIds('core')).map((section) => section.heading)
  assert.deepEqual(headings, ['Delivery', 'People'])
})

test('a Framework tenant also sees Operations', () => {
  const headings = navigationSectionsFor(getEntitledModuleIds('framework')).map((section) => section.heading)
  assert.deepEqual(headings, ['Delivery', 'Operations', 'People'])
})

test('an Enterprise tenant sees every section', () => {
  const headings = navigationSectionsFor(getEntitledModuleIds('enterprise')).map((section) => section.heading)
  assert.deepEqual(headings, ['Delivery', 'Operations', 'Commercial', 'Finance', 'People'])
})

test('a section with no entitled modules is omitted, not left empty', () => {
  // An empty "Finance" heading would tell a Core tenant they are missing
  // something without saying what, which is worse than not showing it.
  const sections = navigationSectionsFor(getEntitledModuleIds('core'))
  assert.equal(sections.every((section) => section.items.length > 0), true)
})

test('only entitled modules appear as items', () => {
  const items = navigationSectionsFor(getEntitledModuleIds('core')).flatMap((s) => s.items.map((i) => i.id))
  assert.ok(!items.includes('invoices'))
  assert.ok(items.includes('projects'))
})
