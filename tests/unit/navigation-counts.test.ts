import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { NAV_MODULES } from '../../features/rights/modules.ts'

test('the menu shows how many records a list page holds, only for pages that list records, and never a guessed number', () => {
  const counts = readFileSync('features/navigation/counts.ts', 'utf8')
  for (const table of ['clients', 'client_onboardings', 'vendors', 'leads', 'quotes', 'sales_opportunities', 'invoices', 'expenses']) assert.match(counts, new RegExp(`'${table}'`))
  assert.match(counts, /\.is\('archived_at', null\)/, 'archived records are not counted, as on the page')
  assert.match(counts, /\.eq\('organization_id', organization\.id\)/)
  assert.match(counts, /error \|\| typeof count !== 'number' \? null/, 'a failed count is left out')
  for (const id of ['clients', 'onboarding', 'vendors', 'leads', 'quotes', 'sales', 'invoices', 'expenses']) assert.ok(NAV_MODULES[id], `${id} is a menu item`)
  const layout = readFileSync('app/(unison)/layout.tsx', 'utf8')
  assert.match(layout, /getNavigationCounts\(visibleSections/, 'only items the person may view are counted')
  assert.match(readFileSync('components/navigation/sidebar.tsx', 'utf8'), /typeof item\.count === 'number'/)
})
