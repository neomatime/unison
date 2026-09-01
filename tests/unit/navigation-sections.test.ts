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

test('sections carry no functions, so they survive the RSC boundary', () => {
  // These are built in app/(unison)/layout.tsx — a Server Component — and handed
  // to the client Sidebar through context. React refuses to serialise a function
  // across that boundary: "Functions cannot be passed directly to Client
  // Components". A Lucide icon is a function component, so attaching one here
  // 500s every tenant route for signed-in users while still compiling, type-
  // checking and passing every other test. That shipped once. This is the guard.
  const functionsIn = (value: unknown, path: string): string[] => {
    if (typeof value === 'function') return [path]
    if (Array.isArray(value)) return value.flatMap((entry, index) => functionsIn(entry, `${path}[${index}]`))
    if (value && typeof value === 'object') {
      return Object.entries(value).flatMap(([key, entry]) => functionsIn(entry, `${path}.${key}`))
    }
    return []
  }

  for (const tier of ['core', 'framework', 'enterprise', 'strategic-enterprise'] as const) {
    const found = functionsIn(navigationSectionsFor(getEntitledModuleIds(tier)), tier)
    assert.deepEqual(found, [], `non-serialisable values at: ${found.join(', ')}`)
  }
})
