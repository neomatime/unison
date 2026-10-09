import assert from 'node:assert/strict'
import test from 'node:test'

import { modules } from '../../config/modules.ts'
import { navigationSectionsFor } from '../../config/navigation.ts'
import { getEntitledModuleIds } from '../../config/unison-tiers.ts'

const idsFor = (tier: Parameters<typeof getEntitledModuleIds>[0]) =>
  navigationSectionsFor(getEntitledModuleIds(tier)).flatMap((section) => section.items.map((item) => item.id))

test('a Core tenant sees Overview, People and the Vendors register under Operations', () => {
  const headings = navigationSectionsFor(getEntitledModuleIds('core')).map((section) => section.heading)
  assert.deepEqual(headings, [undefined, 'People', 'Operations'])
})

test('a Framework tenant also gets Clients and Onboarding under Operations', () => {
  const sections = navigationSectionsFor(getEntitledModuleIds('framework'))
  assert.deepEqual(sections.map((section) => section.heading), [undefined, 'People', 'Operations'])
  assert.deepEqual(sections[2].items.map((item) => item.id), ['clients', 'onboarding', 'vendors'])
})

test('an Enterprise tenant sees every section, in the CRM order', () => {
  const headings = navigationSectionsFor(getEntitledModuleIds('enterprise')).map((section) => section.heading)
  assert.deepEqual(headings, [undefined, 'People', 'Operations', 'Commercial', 'Finance'])
})

test('the sidebar is exactly the CRM structure for a full tenant', () => {
  const sections = navigationSectionsFor(getEntitledModuleIds('strategic-enterprise'))
  assert.deepEqual(
    sections.map((section) => [section.heading ?? 'Overview', section.items.map((item) => item.label)]),
    [
      ['Overview', ['Overview']],
      ['People', ['Team']],
      ['Operations', ['Clients', 'Onboarding', 'Vendors']],
      ['Commercial', ['Leads', 'Quotes', 'Sales']],
      ['Finance', ['Invoices', 'Expenses', 'Forecasting']],
    ],
  )
})

test('there is no Delivery section for any tier, and no delivery module in the menu', () => {
  for (const tier of ['core', 'framework', 'enterprise', 'strategic-enterprise'] as const) {
    const sections = navigationSectionsFor(getEntitledModuleIds(tier))
    assert.ok(!sections.some((section) => (section.heading as string | undefined) === 'Delivery'), `${tier} must have no Delivery heading`)
    const ids = idsFor(tier)
    for (const removed of ['portfolio', 'projects', 'frameworks', 'approvals'] as const) {
      assert.ok(!ids.includes(removed), `${tier} must not list ${removed}`)
    }
  }
})

test('Vendors sits directly below Onboarding in Operations', () => {
  const operations = navigationSectionsFor(getEntitledModuleIds('strategic-enterprise')).find((section) => section.heading === 'Operations')!
  const order = operations.items.map((item) => item.id)
  assert.equal(order.indexOf('vendors'), order.indexOf('onboarding') + 1)
})

test('Overview is isolated above the headed sections', () => {
  const [overview] = navigationSectionsFor(getEntitledModuleIds('core'))
  assert.equal(overview.heading, undefined)
  assert.deepEqual(overview.items.map((item) => item.id), ['overview'])
})

test('removing the menu entries removes no route and no entitlement', () => {
  // Hiding a module from the sidebar must not be a way of switching it off:
  // its route keeps working and its tier entitlement is untouched.
  const routes = Object.fromEntries(modules.map((module) => [module.id, module.route]))
  assert.equal(routes.portfolio, '/delivery/portfolio')
  assert.equal(routes.projects, '/operations/projects')
  assert.equal(routes.frameworks, '/delivery/frameworks')
  assert.equal(routes.approvals, '/delivery/approvals')
  assert.equal(routes.vendors, '/delivery/vendors', 'Vendors moved in the menu, not in the URL space')
  for (const removed of ['portfolio', 'projects', 'frameworks', 'approvals', 'vendors'] as const) {
    assert.ok(getEntitledModuleIds('core').includes(removed), `${removed} must stay entitled on Core`)
  }
  for (const module of modules) assert.equal(module.enabled, true, `${module.id} must stay enabled`)
})

test('a section with no entitled modules is omitted, not left empty', () => {
  // An empty "Finance" heading would tell a Core tenant they are missing
  // something without saying what, which is worse than not showing it.
  const sections = navigationSectionsFor(getEntitledModuleIds('core'))
  assert.equal(sections.every((section) => section.items.length > 0), true)
})

test('only entitled modules appear as items', () => {
  const items = idsFor('core')
  assert.ok(!items.includes('invoices'))
  assert.ok(!items.includes('leads'))
  assert.ok(items.includes('team'))
  assert.ok(items.includes('vendors'))
})

test('every retained module still has a route', () => {
  const routes = new Set<string>()
  for (const id of idsFor('strategic-enterprise')) {
    const module = modules.find((entry) => entry.id === id)!
    assert.match(module.route, /^\/[a-z]+(\/[a-z-]+)?$/, `${id} must keep a plain route`)
    assert.ok(!routes.has(module.route), `${module.route} must be listed once`)
    routes.add(module.route)
  }
  assert.equal(routes.size, 11)
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
