import assert from 'node:assert/strict'
import test from 'node:test'

import { groupHiveOfferings, hiveOfferingToLine, toHiveOfferingChoice } from '../../features/documents/hive-offerings.ts'
import { parseHiveOfferingsFeed } from '../../lib/integrations/hive-offerings.ts'

const feed = parseHiveOfferingsFeed({
  schemaVersion: '1.0', source: 'HIVE Origin', workspace: { key: 'himark', name: 'HIMARK' }, generatedAt: 'x', revision: 'r',
  offerings: [
    { key: 'retainer:growth', kind: 'retainer', name: 'Growth', description: 'Expanded delivery.', status: 'active',
      price: { model: 'fixed', currency: 'ZAR', amount: 150000, billingPeriod: 'month', binding: true },
      credits: { amount: 75, unit: 'month', rolloverAllowed: false } },
    { key: 'project:dp', kind: 'project', name: 'Digital Presence', status: 'active',
      price: { model: 'credit_range', currency: null, amount: null, billingPeriod: null, binding: false },
      credits: { minimum: 15, maximum: 150, unit: 'project' } },
    { key: 'retainer:old', kind: 'retainer', name: 'Old', status: 'inactive',
      price: { model: 'fixed', currency: 'ZAR', amount: 1, billingPeriod: 'month', binding: true } },
    { key: 'retainer:usd', kind: 'retainer', name: 'Usd', status: 'active',
      price: { model: 'fixed', currency: 'USD', amount: 10, billingPeriod: 'month', binding: true } },
  ],
})
const [growth, project, inactive, usd] = feed.offerings

test('a priced retainer becomes a one-unit standard-VAT line at the HIVE price', () => {
  const line = hiveOfferingToLine(growth)
  assert.deepEqual(line, {
    title: 'Growth Partner: monthly retainer',
    description: 'Includes 75 credits a month.',
    quantity: 1, unit_price: 150000, vat_code: 'standard',
  })
})

test('a project has no rand price, so it cannot become a line', () => {
  assert.equal(hiveOfferingToLine(project), null)
  assert.equal(toHiveOfferingChoice(project).price, null)
  assert.equal(toHiveOfferingChoice(project).credits, '15 to 150 credits per project')
})

test('inactive and non-rand offerings are refused', () => {
  assert.equal(hiveOfferingToLine(inactive), null)
  assert.equal(hiveOfferingToLine(usd), null)
})

import { readFileSync } from 'node:fs'

test('the HIVE action trusts only an offering key from the browser and reads the price from HIVE', () => {
  const action = readFileSync(new URL('../../features/documents/actions/hive-offering-line.ts', import.meta.url), 'utf8')
  assert.deepEqual([...action.matchAll(/form\.get\('(\w+)'\)/g)].map((m) => m[1]), ['offeringKey'])
  assert.match(action, /fetchHiveOfferings\(\)/)
  assert.match(action, /currency !== 'ZAR'/)
  const picker = readFileSync(new URL('../../features/documents/components/hive-offering-picker.tsx', import.meta.url), 'utf8')
  assert.deepEqual([...picker.matchAll(/data\.set\('(\w+)'/g)].map((m) => m[1]), ['offeringKey'])
})

test('groups follow the rate card order, price-less offerings are left out, and one-time fees say so', () => {
  const mk = (key: string, kind: string, amount: number | null, period: string | null) => ({
    key, kind, name: key, status: 'active',
    price: { model: amount === null ? 'credit_range' : 'fixed', currency: amount === null ? null : 'ZAR', amount, billingPeriod: period, binding: amount !== null },
  })
  const parsed = parseHiveOfferingsFeed({
    schemaVersion: '1.0', source: 's', workspace: { key: 'k', name: 'n' }, generatedAt: 'x', revision: 'r',
    offerings: [mk('pack', 'credit_pack', 17500, 'once'), mk('p', 'project', null, null), mk('r', 'retainer', 1, 'month'), mk('i', 'retainer_implementation', 1, 'once'), mk('s', 'support', 1, 'month'), mk('z', 'weird', 5, 'month')],
  })
  const groups = groupHiveOfferings(parsed.offerings.map(toHiveOfferingChoice))
  assert.deepEqual(groups.map((g) => g.items[0].key), ['r', 'i', 's', 'pack', 'z'])
  assert.equal(groups.at(-1)?.label, 'Other HIVE offerings')
  assert.match(hiveOfferingToLine(parsed.offerings[3])?.description ?? '', /Charged once at activation\./)
})

test('line wording matches the old rate card lines', () => {
  const mk = (key: string, kind: string, name: string, credits: Record<string, unknown>, description: string | null, period: string) => ({
    key, kind, name, description, status: 'active', credits,
    price: { model: 'fixed', currency: 'ZAR', amount: 100000, billingPeriod: period, binding: true },
  })
  const wording = (o: ReturnType<typeof mk>) => {
    const line = hiveOfferingToLine(parseHiveOfferingsFeed({
      schemaVersion: '1.0', source: 's', workspace: { key: 'k', name: 'n' }, generatedAt: 'x', revision: 'r', offerings: [o],
    }).offerings[0])
    return [line?.title, line?.description]
  }
  assert.deepEqual(wording(mk('retainer:signature', 'retainer', 'Signature', { amount: 40, unit: 'month' }, 'x', 'month')),
    ['Signature Partner: monthly retainer', 'Includes 40 credits a month.'])
  assert.deepEqual(wording(mk('implementation:signature', 'retainer_implementation', 'Signature implementation', { amount: 40, unit: 'once' }, 'y', 'once')),
    ['Signature Partner: one-time implementation', 'Charged once at activation. Includes 40 one-time implementation credits.'])
  assert.deepEqual(wording(mk('retainer:reserve', 'retainer', 'HIMARK Reserve', { amount: 220, unit: 'month' }, null, 'month')),
    ['HIMARK Reserve: monthly retainer', 'Includes 220 credits a month.'])
  assert.deepEqual(wording(mk('project:digital-presence', 'project', 'Digital Presence', { minimum: 15, maximum: 150, unit: 'project' }, null, 'once')),
    ['Digital Presence: project', 'Fixed-scope project fee. Includes 15 implementation credits.'])
  assert.deepEqual(wording(mk('support:website-care', 'support', 'Website Care', { amount: 2, unit: 'month' }, 'Optional monthly care.', 'month')),
    ['Website Care: monthly', 'Includes 2 credits a month. Optional monthly care.'])
})
