import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeActivity,
  normalizeKpis,
  normalizePipeline,
  normalizeRevenue,
} from '../../features/crm-overview/normalize.ts'

const kpis = () => ({
  timezone: 'Africa/Johannesburg',
  clients: { total: 24, at_previous_month_end: 22 },
  leads: { open: 18, created_this_month: 4 },
  quotes: { active: 12, sent: 5 },
  revenue: {
    by_currency: [{ currency: 'ZAR', year_to_date: 3_800_000, previous_year_to_date: 3_300_000, deals: 5 }],
    won_without_date: 0,
  },
})

test('KPIs are read into the typed shape', () => {
  const read = normalizeKpis(kpis())
  assert.deepEqual(read.clients, { total: 24, atPreviousMonthEnd: 22 })
  assert.deepEqual(read.leads, { open: 18, createdThisMonth: 4 })
  assert.deepEqual(read.quotes, { active: 12, sent: 5 })
  assert.deepEqual(read.revenue, {
    byCurrency: [{ currency: 'ZAR', yearToDate: 3_800_000, previousYearToDate: 3_300_000, deals: 5 }],
    wonWithoutDate: 0,
  })
})

test('a module the plan excludes arrives as null and stays null, not zero', () => {
  const read = normalizeKpis({ ...kpis(), leads: null, revenue: null })
  assert.equal(read.leads, null)
  assert.equal(read.revenue, null)
  assert.notEqual(read.clients, null)
})

test('a genuine zero is kept as zero', () => {
  const read = normalizeKpis({ ...kpis(), clients: { total: 0, at_previous_month_end: 0 } })
  assert.deepEqual(read.clients, { total: 0, atPreviousMonthEnd: 0 })
})

test('numeric strings from Postgres numerics are accepted', () => {
  const read = normalizeKpis({ ...kpis(), clients: { total: '24', at_previous_month_end: '22' } })
  assert.equal(read.clients!.total, 24)
})

test('a malformed or missing figure throws, so the card shows an error and never a fake zero', () => {
  assert.throws(() => normalizeKpis({ ...kpis(), clients: { total: null, at_previous_month_end: 1 } }), /clients\.total/)
  assert.throws(() => normalizeKpis({ ...kpis(), clients: { total: 'many', at_previous_month_end: 1 } }), /clients\.total/)
  assert.throws(() => normalizeKpis({ ...kpis(), clients: { total: '', at_previous_month_end: 1 } }), /clients\.total/)
  assert.throws(() => normalizeKpis({ ...kpis(), clients: { at_previous_month_end: 1 } }), /clients\.total/)
  const { quotes: _omitted, ...withoutQuotes } = kpis()
  assert.throws(() => normalizeKpis(withoutQuotes), /quotes is missing/)
  assert.throws(() => normalizeKpis(null), /not an object/)
  assert.throws(() => normalizeKpis([]), /not an object/)
})

const stage = (name: string, count = 0, totals: unknown[] = [], previews: unknown[] = []) => ({ stage: name, count, totals, previews })
const pipeline = () => ({
  stages: [stage('Discovery', 2, [{ currency: 'ZAR', amount: 1500 }], [
    { id: 'a', name: 'Opp A', client_name: 'Acme', expected_value: 1000, currency: 'ZAR', expected_close: null },
  ]), stage('Qualified'), stage('Proposal'), stage('Negotiation')],
  won: { count: 1, totals: [{ currency: 'ZAR', amount: 2000 }], previews: [
    { id: 'w', name: 'Won deal', client_name: 'Beta', expected_value: 2000, currency: 'ZAR', won_at: '2026-10-01T00:00:00Z' },
  ] },
})

test('the pipeline keeps the four open stages in their fixed order whatever order they arrive in', () => {
  const shuffled = { ...pipeline(), stages: [...pipeline().stages].reverse() }
  const read = normalizePipeline(shuffled)!
  assert.deepEqual(read.stages.map((entry) => entry.stage), ['Discovery', 'Qualified', 'Proposal', 'Negotiation'])
  assert.equal(read.stages[0].count, 2)
  assert.deepEqual(read.stages[0].totals, [{ currency: 'ZAR', amount: 1500 }])
  assert.equal(read.stages[0].previews[0].clientName, 'Acme')
  assert.equal(read.won.count, 1)
  assert.equal(read.won.previews[0].value, 2000)
})

test('a plan without the Sales module yields no pipeline rather than an empty one', () => {
  assert.equal(normalizePipeline({ stages: null, won: null }), null)
})

test('a pipeline missing a stage is an error, not a quietly shorter board', () => {
  const broken = { ...pipeline(), stages: pipeline().stages.slice(0, 3) }
  assert.throws(() => normalizePipeline(broken), /Negotiation is missing/)
})

test('a pipeline with an unreadable amount is an error', () => {
  const broken = pipeline()
  broken.stages[0].totals = [{ currency: 'ZAR', amount: 'lots' }]
  assert.throws(() => normalizePipeline(broken), /amount/)
})

const revenue = () => ({
  timezone: 'Africa/Johannesburg',
  won_by_month: [{ month: '2026-03', currency: 'ZAR', amount: 100, deals: 2 }],
  won_this_month_by_week: [{ week: 2, currency: 'ZAR', amount: 40, deals: 1 }],
  pipeline_by_month: [{ month: '2026-11', currency: 'ZAR', amount: 200, deals: 3 }],
  pipeline_this_month_by_week: [],
  pipeline_not_charted: { no_close_date: 1, past_close_date: 2, next_year_or_later: 3 },
})

test('revenue buckets read their keys, with weeks as strings', () => {
  const read = normalizeRevenue(revenue(), { year: 2026, month: 10 })!
  assert.equal(read.currentYear, 2026)
  assert.equal(read.currentMonth, 10)
  assert.deepEqual(read.wonByMonth, [{ key: '2026-03', currency: 'ZAR', amount: 100, deals: 2 }])
  assert.deepEqual(read.wonThisMonthByWeek, [{ key: '2', currency: 'ZAR', amount: 40, deals: 1 }])
  assert.deepEqual(read.pipelineNotCharted, { noCloseDate: 1, pastCloseDate: 2, nextYearOrLater: 3 })
})

test('a plan without Sales yields no revenue chart, and a malformed payload throws', () => {
  assert.equal(normalizeRevenue(null, { year: 2026, month: 10 }), null)
  assert.throws(() => normalizeRevenue({ ...revenue(), won_by_month: 'x' }, { year: 2026, month: 10 }), /won_by_month/)
  assert.throws(() => normalizeRevenue({ ...revenue(), pipeline_not_charted: null }, { year: 2026, month: 10 }), /pipeline_not_charted/)
})

test('activity events are read, with a missing subtitle as null', () => {
  const read = normalizeActivity([
    { kind: 'lead.created', record_id: 'r1', title: 'Acme', subtitle: null, occurred_at: '2026-10-09T10:00:00Z' },
    { kind: 'quote.sent', record_id: 'r2', title: 'Q-1', subtitle: 'Beta', occurred_at: '2026-10-09T09:00:00Z' },
  ])
  assert.equal(read.length, 2)
  assert.equal(read[0].subtitle, null)
  assert.equal(read[1].subtitle, 'Beta')
  assert.deepEqual(normalizeActivity([]), [], 'no events is a valid empty list')
})

test('an unreadable activity row is an error, never silently dropped', () => {
  assert.throws(() => normalizeActivity([{ kind: 'lead.created', title: 'x', occurred_at: 'now' }]), /record_id/)
  assert.throws(() => normalizeActivity(null), /not an array/)
})
