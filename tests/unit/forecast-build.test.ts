import assert from 'node:assert/strict'
import test from 'node:test'

import { buildForecast, type ForecastRow } from '../../features/forecast/build-forecast.ts'

const TODAY = '2026-10-11'
const row = (over: Partial<ForecastRow>): ForecastRow => ({ bucket: 'month', month: '2026-10-01', currency: 'ZAR', collected: 0, invoices_due: 0, pipeline: 0, ...over })

test('no data gives no blocks', () => {
  assert.deepEqual(buildForecast([], TODAY).blocks, [])
})

test('a block has the three previous months, the current month and the next six, zero-filled, with the current one marked', () => {
  const [block] = buildForecast([row({ collected: 100 })], TODAY).blocks
  assert.deepEqual(block.months.map((entry) => entry.month), [
    '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01', '2027-04-01',
  ])
  assert.deepEqual(block.months.map((entry) => entry.label).slice(0, 4), ['Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026'])
  assert.equal(block.months.filter((entry) => entry.isCurrent).length, 1)
  assert.equal(block.months.find((entry) => entry.isCurrent)!.month, '2026-10-01')
  assert.equal(block.months[0].collected, 0)
  assert.equal(block.months[3].collected, 100)
})

test('rows are placed by month, currency blocks are separate and never added together', () => {
  const model = buildForecast([
    row({ month: '2026-10-01', currency: 'ZAR', collected: 500, invoices_due: 200 }),
    row({ month: '2026-11-01', currency: 'ZAR', pipeline: 300.5 }),
    row({ month: '2026-10-01', currency: 'USD', collected: 40 }),
  ], TODAY)
  assert.deepEqual(model.blocks.map((block) => block.currency), ['USD', 'ZAR'])
  const zar = model.blocks.find((block) => block.currency === 'ZAR')!
  assert.deepEqual(zar.totals, { collected: 500, due: 200, pipeline: 300.5 })
  assert.equal(model.blocks.find((block) => block.currency === 'USD')!.totals.collected, 40)
})

test('the later and no-date lines are kept apart and counted in the totals', () => {
  const [block] = buildForecast([
    row({ bucket: 'later', month: null, invoices_due: 70, pipeline: 30 }),
    row({ bucket: 'undated', month: null, pipeline: 1000 }),
    row({ collected: 10 }),
  ], TODAY).blocks
  assert.deepEqual(block.later, { collected: 0, due: 70, pipeline: 30 })
  assert.deepEqual(block.undated, { collected: 0, due: 0, pipeline: 1000 })
  assert.deepEqual(block.totals, { collected: 10, due: 70, pipeline: 1030 })
})

test('a block with no later or undated rows has none, and string amounts from the database are read as numbers', () => {
  const [block] = buildForecast([row({ collected: '1234.56' as unknown as number, pipeline: '0.10' as unknown as number })], TODAY).blocks
  assert.equal(block.later, null)
  assert.equal(block.undated, null)
  assert.equal(block.totals.collected, 1234.56)
  assert.equal(block.totals.pipeline, 0.1)
})

test('sums do not drift: ten cents ten times is one rand', () => {
  const rows = Array.from({ length: 10 }, (_, index) => row({ month: `2026-${String(index + 1).padStart(2, '0')}-01`, pipeline: 0.1 }))
  const [block] = buildForecast([...rows, row({ bucket: 'undated', month: null, pipeline: 0.1 })], TODAY).blocks
  // Rows for 2026-01 to 2026-10: only 2026-07 to 2026-10 are inside the window (four rows), plus the undated one.
  assert.equal(block.totals.pipeline, 0.5, 'five tenths, exactly, not 0.5000000000000001')
})

test('a row for a month outside the window is ignored', () => {
  const [block] = buildForecast([row({ month: '2025-01-01', collected: 999 }), row({ collected: 1 })], TODAY).blocks
  assert.equal(block.totals.collected, 1)
})
