import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { partnerLevels } from '../../config/partner-levels.ts'
import { PROJECTS, RATE_CARD, TIERS, packageName, rateItem } from '../../features/billing/rate-card.ts'

test('the rate card has the 28 items the workbook defines, with unique keys', () => {
  assert.equal(RATE_CARD.length, 28)
  assert.equal(new Set(RATE_CARD.map((item) => item.key)).size, 28)
  const count = (kind: string) => RATE_CARD.filter((item) => item.kind === kind).length
  assert.deepEqual(
    [count('retainer_monthly'), count('retainer_implementation'), count('retainer_top_up'), count('project'), count('project_top_up'), count('support')],
    [4, 4, 4, 5, 1, 10],
  )
})

test('retainer prices, credits, implementation fees, top-up rates and initiative limits match the workbook', () => {
  const expected: Record<string, [monthly: number, credits: number, top: number, limit: number | null]> = {
    signature: [100000, 40, 2500, 2],
    growth: [150000, 75, 2000, 4],
    private: [200000, 120, 1666.67, 6],
    reserve: [300000, 220, 1363.64, null],
  }
  for (const tier of TIERS) {
    const [monthly, credits, top, limit] = expected[tier.key]
    const m = rateItem(`retainer.${tier.key}.monthly`)!
    const i = rateItem(`retainer.${tier.key}.implementation`)!
    const t = rateItem(`retainer.${tier.key}.top_up`)!
    assert.equal(m.price, monthly, `${tier.key} monthly`)
    assert.equal(m.credits, credits, `${tier.key} credits`)
    assert.equal(m.initiativeLimit, limit, `${tier.key} limit`)
    assert.equal(i.price, monthly, `${tier.key} implementation equals one monthly fee`)
    assert.equal(i.credits, credits, `${tier.key} implementation credits equal the monthly credits`)
    assert.equal(t.price, top, `${tier.key} top-up`)
    assert.equal(t.status, 'proposed')
    assert.equal(m.status, 'agreed')
  }
})

test('project fees, credits and the project top-up rate match the workbook', () => {
  const expected: Record<string, [number, number]> = {
    operating_model: [120000, 40],
    intelligence_ai: [150000, 50],
    digital_experience: [65000, 22],
    digital_presence: [45000, 15],
    visual_communication: [35000, 12],
  }
  assert.deepEqual(PROJECTS.map((p) => p.key), Object.keys(expected))
  for (const [key, [price, credits]] of Object.entries(expected)) {
    const item = rateItem(`project.${key}`)!
    assert.equal(item.price, price, key)
    assert.equal(item.credits, credits, key)
  }
  const top = rateItem('project.top_up')!
  assert.equal(top.price, 3000)
  assert.equal(top.status, 'proposed')
  assert.equal(top.packageKey, null)
})

test('support services: price, credits and the project each belongs to', () => {
  const expected: Record<string, [price: number, credits: number, project: string]> = {
    'support.operations_improvement': [35000, 12, 'operating_model'],
    'support.ai_automation_care': [15000, 5, 'intelligence_ai'],
    'support.digital_experience_management': [30000, 10, 'digital_experience'],
    'support.application_interface_care': [10000, 3, 'digital_experience'],
    'support.digital_presence_management': [20000, 7, 'digital_presence'],
    'support.website_care': [5000, 2, 'digital_presence'],
    'support.communication_asset_care': [5000, 2, 'visual_communication'],
    'support.podcast_content': [25000, 8, 'visual_communication'],
    'support.integrated_podcast_social': [40000, 13, 'visual_communication'],
    'support.social_media_content': [20000, 7, 'visual_communication'],
  }
  for (const [key, [price, credits, project]] of Object.entries(expected)) {
    const item = rateItem(key)!
    assert.equal(item.price, price, key)
    assert.equal(item.credits, credits, key)
    assert.equal(item.packageKey, project, key)
    assert.equal(item.kind, 'support')
  }
})

test('the four retainer prices agree with the partner levels the provisioning wizard uses', () => {
  for (const level of partnerLevels) assert.equal(rateItem(`retainer.${level.id}.monthly`)!.price, level.price, level.id)
})

test('package names resolve for tiers and projects and fall back to the key', () => {
  assert.equal(packageName('growth'), 'Growth Partner')
  assert.equal(packageName('reserve'), 'HIMARK Reserve')
  assert.equal(packageName('operating_model'), 'Operating Model & Operations Transformation')
  assert.equal(packageName('x'), 'x')
})

test('every item states its credits in the line text where it has any', () => {
  for (const item of RATE_CARD) {
    if (item.credits !== null && item.kind !== 'retainer_top_up') assert.match(item.description, new RegExp(`\\b${item.credits}\\b`), `${item.key} description names its credits`)
    if (item.status === 'proposed') assert.match(item.description, /Proposed rate, not yet agreed\./, `${item.key} says it is proposed`)
  }
})

test('the migration seed rows equal the data file', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '20261012100000_rate_card.sql'), 'utf8')
  const rows = [...sql.matchAll(/^\s*\(('retainer\.[^\n]*|'project\.[^\n]*|'support\.[^\n]*)\),?\s*$/gm)].map((m) => m[1])
  assert.equal(rows.length, 28, 'the seed lists 28 rows')
  const tokens = (row: string) => [...row.matchAll(/'((?:[^']|'')*)'|(-?\d+(?:\.\d+)?)|\b(null)\b/g)].map((m) => (m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2] !== undefined ? Number(m[2]) : null))
  for (const row of rows) {
    const [key, kind, packageKey, title, description, price, credits, status, limit] = tokens(row)
    const item = rateItem(String(key))
    assert.ok(item, `${key} is in the data file`)
    assert.deepEqual(
      [kind, packageKey, title, description, price, credits, status, limit],
      [item!.kind, item!.packageKey, item!.title, item!.description, item!.price, item!.credits, item!.status, item!.initiativeLimit],
      `${key} seed row matches`,
    )
  }
  assert.deepEqual(new Set(rows.map((r) => tokens(r)[0])), new Set(RATE_CARD.map((i) => i.key)))
})
