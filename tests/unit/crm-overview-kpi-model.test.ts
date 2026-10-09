import assert from 'node:assert/strict'
import test from 'node:test'

import { buildKpiCards, type KpiBody, type KpiCardId } from '../../features/crm-overview/kpi-model.ts'
import type { KpiData, Section } from '../../features/crm-overview/types.ts'

const squash = (value: string) => value.replace(/[\s  ]/g, '')

const data = (over: Partial<KpiData> = {}): Section<KpiData> => ({
  status: 'ready',
  data: {
    clients: { total: 24, atPreviousMonthEnd: 22 },
    leads: { open: 18, createdThisMonth: 4 },
    quotes: { active: 12, sent: 5 },
    revenue: { byCurrency: [{ currency: 'ZAR', yearToDate: 3_800_000, previousYearToDate: 3_300_000, deals: 5 }], wonWithoutDate: 0 },
    ...over,
  },
})

const card = (kpis: Section<KpiData>, id: KpiCardId) => buildKpiCards(kpis).find((entry) => entry.id === id)!
const ready = (body: KpiBody) => {
  assert.equal(body.state, 'ready')
  return body as Extract<KpiBody, { state: 'ready' }>
}

test('the four cards are in the stated order, each linking to its own module', () => {
  assert.deepEqual(
    buildKpiCards(data()).map((entry) => [entry.id, entry.label, entry.href]),
    [
      ['clients', 'Total clients', '/operations/clients'],
      ['leads', 'Open leads', '/commercial/leads'],
      ['quotes', 'Active quotes', '/commercial/quotes'],
      ['revenue', 'Sales revenue (YTD)', '/commercial/sales'],
    ],
  )
})

test('each card shows its own figure, so no number can sit under the wrong label', () => {
  const cards = buildKpiCards(data())
  assert.equal(ready(cards[0].body).value, '24')
  assert.equal(ready(cards[1].body).value, '18')
  assert.equal(ready(cards[2].body).value, '12')
  assert.match(squash(ready(cards[3].body).value), /^R3[,.]8M$/)
})

test('clients compare against the end of last month, and only when that base is above zero', () => {
  const up = ready(card(data(), 'clients').body)
  assert.deepEqual(up.delta, { direction: 'up', text: '9%' })
  assert.equal(up.deltaLabel, 'vs last month')

  const down = ready(card(data({ clients: { total: 20, atPreviousMonthEnd: 25 } }), 'clients').body)
  assert.deepEqual(down.delta, { direction: 'down', text: '20%' })

  const noBase = ready(card(data({ clients: { total: 5, atPreviousMonthEnd: 0 } }), 'clients').body)
  assert.equal(noBase.delta, null, 'growth from nothing has no percentage')
})

test('a genuine zero is shown as zero with an honest caption', () => {
  const body = ready(card(data({ clients: { total: 0, atPreviousMonthEnd: 0 } }), 'clients').body)
  assert.equal(body.value, '0')
  assert.equal(body.caption, 'No clients recorded yet')
  assert.equal(body.delta, null)
})

test('leads and quotes never claim a comparison, because no status history exists to build one', () => {
  for (const id of ['leads', 'quotes'] as const) {
    const body = ready(card(data(), id).body)
    assert.equal(body.delta, null, id)
  }
  assert.equal(ready(card(data(), 'leads').body).caption, '4 new this month')
  assert.equal(ready(card(data(), 'quotes').body).caption, '5 awaiting a response')
  assert.equal(ready(card(data({ quotes: { active: 3, sent: 0 } }), 'quotes').body).caption, 'None awaiting a response')
})

test('revenue compares with the same period last year when there is one currency', () => {
  const body = ready(card(data(), 'revenue').body)
  assert.deepEqual(body.delta, { direction: 'up', text: '15%' })
  assert.equal(body.deltaLabel, 'vs same period last year')
  assert.equal(body.caption, '5 won deals this year')
  assert.match(squash(body.valueTitle!), /^R3800000$/, 'the tooltip carries the exact figure')
})

test('revenue never compares across currencies and lists each separately', () => {
  const body = ready(card(data({
    revenue: {
      byCurrency: [
        { currency: 'USD', yearToDate: 40_000, previousYearToDate: 10_000, deals: 1 },
        { currency: 'ZAR', yearToDate: 1_200_000, previousYearToDate: 900_000, deals: 2 },
      ],
      wonWithoutDate: 0,
    },
  }), 'revenue').body)
  assert.equal(body.delta, null)
  assert.equal(body.noComparisonReason, 'No comparison across currencies')
  assert.ok(squash(body.value).includes('+'), 'both currencies are shown side by side')
  assert.equal(body.caption, '3 won deals this year')
})

test('revenue with no won sales is a confirmed zero, not a dash or a made-up growth figure', () => {
  const body = ready(card(data({ revenue: { byCurrency: [], wonWithoutDate: 0 } }), 'revenue').body)
  assert.equal(body.value, '0')
  assert.equal(body.delta, null)
  assert.equal(body.caption, 'No won sales this year')
})

test('revenue that fell to zero from a real base shows the drop, in its currency', () => {
  const body = ready(card(data({
    revenue: { byCurrency: [{ currency: 'ZAR', yearToDate: 0, previousYearToDate: 500_000, deals: 0 }], wonWithoutDate: 0 },
  }), 'revenue').body)
  assert.match(squash(body.value), /^R0$/)
  assert.deepEqual(body.delta, { direction: 'down', text: '100%' })
})

test('won deals that have no date are disclosed, not silently dropped', () => {
  const body = ready(card(data({
    revenue: { byCurrency: [{ currency: 'ZAR', yearToDate: 100, previousYearToDate: 0, deals: 1 }], wonWithoutDate: 2 },
  }), 'revenue').body)
  assert.match(body.caption, /2 won without a date, not counted/)
  assert.equal(body.delta, null, 'nothing to compare against')
})

test('a module the plan excludes is "unavailable", never a zero', () => {
  const kpis = data({ leads: null, quotes: null, revenue: null })
  assert.equal(card(kpis, 'leads').body.state, 'unavailable')
  assert.equal(card(kpis, 'quotes').body.state, 'unavailable')
  assert.equal(card(kpis, 'revenue').body.state, 'unavailable')
  assert.equal(card(kpis, 'clients').body.state, 'ready')
})

test('a failed load is an error on every card, never zeros', () => {
  for (const failed of [{ status: 'error' }, { status: 'unavailable' }] as Array<Section<KpiData>>) {
    for (const entry of buildKpiCards(failed)) assert.equal(entry.body.state, 'error', `${entry.id} must not render a value`)
  }
})
