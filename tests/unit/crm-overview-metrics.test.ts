import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRevenueChart,
  currentYearMonth,
  describeActivity,
  describeDelta,
  firstNameOf,
  formatMoney,
  formatMoneyList,
  greetingFor,
  initialsOf,
  niceMax,
  percentChange,
} from '../../features/crm-overview/metrics.ts'
import type { RevenueChartData } from '../../features/crm-overview/types.ts'

// Intl separates thousands with a no-break or narrow space; compare without it.
const squash = (value: string) => value.replace(/[\s  ]/g, '')

// ------------------------------------------------------------------ greeting

test('the greeting follows the viewer hour, with morning from 05:00 and evening from 18:00', () => {
  const cases: Array<[number, string]> = [
    [0, 'Good evening'], [4, 'Good evening'], [5, 'Good morning'], [11, 'Good morning'],
    [12, 'Good afternoon'], [17, 'Good afternoon'], [18, 'Good evening'], [23, 'Good evening'],
  ]
  for (const [hour, expected] of cases) assert.equal(greetingFor(hour), expected, `hour ${hour}`)
})

test('the first name is the first word, and never empty', () => {
  assert.equal(firstNameOf('Neo Matime'), 'Neo')
  assert.equal(firstNameOf('  Neo  '), 'Neo')
  assert.equal(firstNameOf(''), 'there')
  assert.equal(firstNameOf('   '), 'there')
})

test('initials use the first and last word, two letters at most', () => {
  assert.equal(initialsOf('Horizon Finance'), 'HF')
  assert.equal(initialsOf('Lumina Health Group'), 'LG')
  assert.equal(initialsOf('Zentra'), 'ZE')
  assert.equal(initialsOf('   '), '?')
})

// ------------------------------------------------------------------ comparison

test('percent change is whole-number rounded and signed', () => {
  assert.equal(percentChange(110, 100), 10)
  assert.equal(percentChange(90, 100), -10)
  assert.equal(percentChange(100, 100), 0)
  assert.equal(percentChange(0, 100), -100)
  assert.equal(percentChange(2, 3), -33)
})

test('percent change refuses to invent growth from a zero or unknown base', () => {
  assert.equal(percentChange(5, 0), null, 'a zero base has no percentage')
  assert.equal(percentChange(0, 0), null)
  assert.equal(percentChange(5, null), null)
  assert.equal(percentChange(5, undefined), null)
  assert.equal(percentChange(5, Number.NaN), null)
  assert.equal(percentChange(Number.NaN, 5), null)
  assert.equal(percentChange(5, -10), null, 'a negative base is not a comparable figure')
})

test('delta wording matches the direction', () => {
  assert.deepEqual(describeDelta(9), { direction: 'up', text: '9%' })
  assert.deepEqual(describeDelta(-4), { direction: 'down', text: '4%' })
  assert.deepEqual(describeDelta(0), { direction: 'flat', text: '0%' })
})

// ------------------------------------------------------------------ money

test('money formats in the stated currency and never in another', () => {
  assert.match(squash(formatMoney(1200, 'ZAR')), /^R1200$/)
  assert.match(squash(formatMoney(1234.5, 'ZAR')), /^R1234[,.]50$/)
  const usd = squash(formatMoney(40, 'USD'))
  assert.ok(usd.includes('40') && !usd.startsWith('R'), `USD must not render as rand: ${usd}`)
})

test('compact money abbreviates large amounts and leaves small ones exact', () => {
  assert.match(squash(formatMoney(3_800_000, 'ZAR', 'compact')), /^R3[,.]8M$/)
  assert.match(squash(formatMoney(950, 'ZAR', 'compact')), /^R950$/)
})

test('an unknown currency code falls back to the code instead of throwing', () => {
  assert.equal(formatMoney(5, 'not-a-currency'), 'not-a-currency 5')
})

test('per-currency totals are listed side by side, never added together', () => {
  const text = squash(formatMoneyList([{ currency: 'ZAR', amount: 1_200_000 }, { currency: 'USD', amount: 40_000 }], 'compact'))
  assert.match(text, /^R1[,.]2M\+.*40K$/)
  assert.equal(formatMoneyList([]), '')
  assert.equal(formatMoneyList([{ currency: 'ZAR', amount: 0 }]), '', 'a zero entry is not listed')
})

// ------------------------------------------------------------------ chart

const data = (over: Partial<RevenueChartData> = {}): RevenueChartData => ({
  currentYear: 2026,
  currentMonth: 10,
  wonByMonth: [],
  wonThisMonthByWeek: [],
  pipelineByMonth: [],
  pipelineThisMonthByWeek: [],
  pipelineNotCharted: { noCloseDate: 0, pastCloseDate: 0, nextYearOrLater: 0 },
  ...over,
})

const populated = data({
  wonByMonth: [
    { key: '2026-03', currency: 'ZAR', amount: 100, deals: 2 },
    { key: '2026-03', currency: 'USD', amount: 50, deals: 1 },
    { key: '2025-12', currency: 'ZAR', amount: 70, deals: 1 },
    { key: '2024-05', currency: 'ZAR', amount: 999, deals: 9 },
  ],
  pipelineByMonth: [{ key: '2026-11', currency: 'ZAR', amount: 200, deals: 3 }],
  wonThisMonthByWeek: [{ key: '2', currency: 'ZAR', amount: 40, deals: 1 }],
  pipelineThisMonthByWeek: [{ key: '4', currency: 'ZAR', amount: 15, deals: 1 }],
})

test('this year has twelve months, with won revenue in the month it was won', () => {
  const chart = buildRevenueChart(populated, 'this-year')
  assert.equal(chart.buckets.length, 12)
  const march = chart.buckets[2]
  assert.equal(march.label, 'Mar')
  assert.equal(march.won, 100)
  assert.equal(march.wonDeals, 2)
  assert.equal(chart.wonTotal, 100, 'last year and 2024 rows must not leak into this year')
})

test('currencies are never added together', () => {
  const chart = buildRevenueChart(populated, 'this-year')
  assert.deepEqual(chart.currencies, ['USD', 'ZAR'])
  assert.equal(chart.currency, 'ZAR', 'the largest currency in the window is chosen by default')
  assert.equal(chart.buckets[2].won, 100, 'March is 100 ZAR, not 150')

  const usd = buildRevenueChart(populated, 'this-year', 'USD')
  assert.equal(usd.currency, 'USD')
  assert.equal(usd.buckets[2].won, 50)
  assert.equal(usd.buckets[10].pipeline, 0, 'there is no USD pipeline in November, a confirmed zero')
})

test('an unknown requested currency falls back to the default instead of showing nothing', () => {
  assert.equal(buildRevenueChart(populated, 'this-year', 'EUR').currency, 'ZAR')
})

test('pipeline is unknown for past months, and a confirmed zero from the current month on', () => {
  const chart = buildRevenueChart(populated, 'this-year')
  for (const index of [0, 1, 2, 7, 8]) assert.equal(chart.buckets[index].pipeline, null, `month ${index + 1} is in the past`)
  assert.equal(chart.buckets[9].pipeline, 0, 'October is current, nothing scheduled')
  assert.equal(chart.buckets[10].pipeline, 200)
  assert.equal(chart.buckets[10].pipelineDeals, 3)
  assert.equal(chart.pipelineTotal, 200)
  assert.equal(chart.pipelineShown, true)
})

test('last year shows won revenue only, and says it cannot show pipeline', () => {
  const chart = buildRevenueChart(populated, 'last-year')
  assert.equal(chart.buckets[11].won, 70)
  assert.ok(chart.buckets.every((bucket) => bucket.pipeline === null))
  assert.equal(chart.pipelineShown, false)
  assert.equal(chart.currency, 'ZAR')
})

test('this quarter is the three months of the quarter containing the current month', () => {
  const chart = buildRevenueChart(populated, 'this-quarter')
  assert.deepEqual(chart.buckets.map((bucket) => bucket.label), ['Oct', 'Nov', 'Dec'])
  assert.equal(chart.buckets[1].pipeline, 200)

  const q1 = buildRevenueChart(data({ currentMonth: 2 }), 'this-quarter')
  assert.deepEqual(q1.buckets.map((bucket) => bucket.label), ['Jan', 'Feb', 'Mar'])
})

test('this month is four weekly buckets', () => {
  const chart = buildRevenueChart(populated, 'this-month')
  assert.deepEqual(chart.buckets.map((bucket) => bucket.label), ['1–7', '8–14', '15–21', '22–end'])
  assert.equal(chart.buckets[1].won, 40)
  assert.equal(chart.buckets[3].pipeline, 15)
  assert.equal(chart.buckets[0].pipeline, 0)
})

test('an empty period reports no data instead of drawing zeros as if they were results', () => {
  const chart = buildRevenueChart(data(), 'this-year')
  assert.equal(chart.hasData, false)
  assert.equal(chart.currency, null)
  assert.deepEqual(chart.currencies, [])
  assert.equal(chart.buckets.length, 12)
})

test('rows in the same bucket and currency are summed', () => {
  const chart = buildRevenueChart(data({
    wonByMonth: [
      { key: '2026-05', currency: 'ZAR', amount: 10, deals: 1 },
      { key: '2026-05', currency: 'ZAR', amount: 15, deals: 2 },
    ],
  }), 'this-year')
  assert.equal(chart.buckets[4].won, 25)
  assert.equal(chart.buckets[4].wonDeals, 3)
})

test('the axis maximum is a round number above the largest value', () => {
  assert.equal(niceMax(0), 1)
  assert.equal(niceMax(-5), 1)
  assert.equal(niceMax(1), 1)
  assert.equal(niceMax(2.3), 2.5)
  assert.equal(niceMax(7), 10)
  assert.equal(niceMax(4200), 5000)
  assert.equal(niceMax(1_500_000), 2_000_000)
  for (const value of [0.4, 3, 99, 12_345, 3_840_000]) assert.ok(niceMax(value) >= value, `niceMax(${value}) must not clip the bar`)
})

test('the reporting date is read in the reporting timezone, not the server timezone', () => {
  assert.deepEqual(currentYearMonth('Africa/Johannesburg', new Date('2026-12-31T23:30:00Z')), { year: 2027, month: 1 })
  assert.deepEqual(currentYearMonth('UTC', new Date('2026-12-31T23:30:00Z')), { year: 2026, month: 12 })
})

// ------------------------------------------------------------------ activity

test('every event kind has wording, an icon and a link to its own record', () => {
  const cases: Array<[string, string, string]> = [
    ['lead.created', 'New lead created', '/commercial/leads/r1'],
    ['client.created', 'Client added', '/operations/clients/r1'],
    ['quote.created', 'Quote created', '/commercial/quotes/r1'],
    ['quote.sent', 'Quote sent', '/commercial/quotes/r1'],
    ['quote.accepted', 'Quote accepted', '/commercial/quotes/r1'],
    ['opportunity.created', 'Opportunity created', '/commercial/sales/r1'],
    ['opportunity.won', 'Opportunity won', '/commercial/sales/r1'],
    ['invoice.created', 'Invoice created', '/finance/invoices/r1'],
    ['vendor.added', 'Vendor added', '/delivery/vendors/r1'],
    ['onboarding.started', 'Onboarding started', '/operations/onboarding/r1'],
  ]
  for (const [kind, label, href] of cases) {
    const described = describeActivity({ kind, recordId: 'r1', title: 'Acme', subtitle: 'Beta', occurredAt: '2026-10-09T10:00:00Z' })
    assert.ok(described, kind)
    assert.equal(described!.label, label)
    assert.equal(described!.href, href)
    assert.ok(described!.text.includes('Acme'), `${kind} must name the record`)
  }
})

test('an unknown event kind is skipped rather than rendered half-built', () => {
  assert.equal(describeActivity({ kind: 'mystery.happened', recordId: 'r1', title: 'x', subtitle: null, occurredAt: '2026-10-09T10:00:00Z' }), null)
})

test('a missing counterparty is left out of the sentence, not printed as null', () => {
  const sent = describeActivity({ kind: 'quote.sent', recordId: 'r1', title: 'Q-9', subtitle: null, occurredAt: '2026-10-09T10:00:00Z' })
  assert.equal(sent!.text, 'Quote Q-9 was sent.')
  const withClient = describeActivity({ kind: 'quote.sent', recordId: 'r1', title: 'Q-9', subtitle: 'Delta Health', occurredAt: '2026-10-09T10:00:00Z' })
  assert.equal(withClient!.text, 'Quote Q-9 was sent to Delta Health.')
})
