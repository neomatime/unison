import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { OPPORTUNITY_STAGES } from '../../features/crm-workspace/vocabulary.ts'
import { SALES_STAGES, canMoveSales, isSalesStage, moveSalesCard, needsLostReason, salesColumns, type SalesCard } from '../../features/crm-workspace/sales-board.ts'
import { SALES_HINTS, hintFor } from '../../features/registers/hints.ts'

const card = (id: string, stage: SalesCard['stage'], value = 100, currency = 'ZAR'): SalesCard => ({ id, name: `Deal ${id}`, client: 'C', owner: 'O', stage, value, currency, probability: 50, close: '—' })

test('the columns are the stages the database allows, in pipeline order', () => {
  assert.deepEqual([...SALES_STAGES], [...OPPORTUNITY_STAGES])
  assert.deepEqual([...SALES_STAGES], ['Discovery', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'])
  assert.equal(isSalesStage('Won'), true)
  assert.equal(isSalesStage('Made up'), false)
})

test('cards are grouped by stage with per-currency totals, and nothing is lost', () => {
  const columns = salesColumns([card('a', 'Qualified', 200), card('b', 'Qualified', 50), card('c', 'Won', 10, 'USD')])
  assert.equal(columns.length, 6)
  assert.deepEqual(columns.map((column) => column.cards.length), [0, 2, 0, 0, 1, 0])
  assert.deepEqual(columns[1].total, { ZAR: 250 })
  assert.deepEqual(columns[4].total, { USD: 10 })
})

test('moving a card changes only that card; a drop on its own stage or of an unknown card does nothing', () => {
  const before = [card('a', 'Discovery'), card('b', 'Proposal')]
  const after = moveSalesCard(before, 'a', 'Won', 100)
  assert.deepEqual(after.map((item) => [item.id, item.stage, item.probability]), [['a', 'Won', 100], ['b', 'Proposal', 50]])
  assert.equal(before[0].stage, 'Discovery')
  assert.equal(canMoveSales(before, 'a', 'Discovery'), false)
  assert.equal(canMoveSales(before, 'a', 'Qualified'), true)
  assert.equal(canMoveSales(before, 'zzz', 'Qualified'), false)
  assert.equal(needsLostReason('Lost'), true)
  assert.equal(needsLostReason('Won'), false)
})

test('Sales explains probability and weighted forecast, and the board saves through the same stage rule', () => {
  assert.match(SALES_HINTS['Weighted forecast'], /multiplied by its probability/)
  assert.equal(hintFor('opportunity', 'Probability')?.includes('estimate'), true)
  assert.equal(hintFor('lead', 'Probability'), undefined)
  const action = readFileSync('features/crm-workspace/actions/sales-board.ts', 'utf8')
  assert.match(action, /readStageChange/)
  assert.match(action, /\.eq\('organization_id', organization\.id\)/)
  assert.match(action, /\.is\('archived_at', null\)/)
  const screen = readFileSync('features/registers/components/register-screen.tsx', 'utf8')
  assert.match(screen, /SalesBoard/)
  assert.match(screen, /hint=\{hintFor\(kind, card\.label\)\}/)
})
