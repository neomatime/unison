import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCards, mainCurrency, money } from '../../features/registers/summary.ts'

test('the main currency is ZAR when present, otherwise the first by name, otherwise none', () => {
  assert.equal(mainCurrency([{ USD: 5, ZAR: 1 }]), 'ZAR')
  assert.equal(mainCurrency([{ USD: 5, EUR: 1 }]), 'EUR')
  assert.equal(mainCurrency([{}, {}]), null)
  assert.equal(mainCurrency([{ ZAR: 0 }]), 'ZAR')
})

test('money is a whole-unit amount in the currency, and an unknown currency code does not crash', () => {
  assert.match(money(1234.5, 'ZAR'), /1\s?235/)
  assert.doesNotThrow(() => money(10, 'XXXX'))
  assert.doesNotThrow(() => money(10, ''))
})

test('the invoice cards are the count, the outstanding balance and the overdue count', () => {
  const cards = buildCards('invoice', { count: 1102, outstanding: { ZAR: 460 }, overdue: 1 })
  assert.deepEqual(cards.map((card) => card.label), ['Invoices', 'Outstanding', 'Overdue'])
  assert.equal(cards[0].value, '1102')
  assert.match(cards[1].value, /460/)
  assert.equal(cards[2].value, '1')
  assert.doesNotMatch(cards[1].detail, /other currencies/)
})

test('another currency is never added: the main currency is shown and the card says the rest is left out', () => {
  const [, outstanding] = buildCards('invoice', { count: 3, outstanding: { ZAR: 100, USD: 900 }, overdue: 0 })
  assert.match(outstanding.value, /100/)
  assert.doesNotMatch(outstanding.value, /1\s?000/)
  assert.match(outstanding.detail, /other currencies not included/)
})

test('every register has three cards, and an empty summary shows zeros', () => {
  const empty: Record<string, unknown> = { lead: {}, quote: {}, opportunity: {}, invoice: {}, expense: {} }
  for (const kind of ['lead', 'quote', 'opportunity', 'invoice', 'expense'] as const) {
    const cards = buildCards(kind, empty[kind])
    assert.equal(cards.length, 3, kind)
    for (const card of cards) assert.match(card.value, /^[\D]*0[\D]*$/, `${kind} ${card.label} is zero`)
  }
})

test('the card labels are the ones the registers show today', () => {
  assert.deepEqual(buildCards('lead', { count: 4, qualified: 2, value: { ZAR: 10 } }).map((card) => card.label), ['Active leads', 'Qualified', 'Estimated value'])
  assert.deepEqual(buildCards('quote', {}).map((card) => card.label), ['Active quotes', 'Accepted', 'Quoted value'])
  assert.deepEqual(buildCards('opportunity', {}).map((card) => card.label), ['Open opportunities', 'Pipeline value', 'Weighted forecast'])
  assert.deepEqual(buildCards('expense', {}).map((card) => card.label), ['Recorded expenses', 'Awaiting approval', 'Approved'])
})
