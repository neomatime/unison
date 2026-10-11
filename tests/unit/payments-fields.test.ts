import assert from 'node:assert/strict'
import test from 'node:test'

import { formatSouthAfricanDate, readPaymentFields, readVoidReason, todayInJohannesburg } from '../../features/payments/fields.ts'
import { PAYMENT_METHODS, isPaymentMethod } from '../../features/payments/vocabulary.ts'

const form = (values: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
const TODAY = '2026-10-11'
const valid = { amount: '1500', receivedOn: '2026-10-10', method: 'Bank transfer', reference: 'REF-1' }

test('the methods are the four the database allows', () => {
  assert.deepEqual([...PAYMENT_METHODS], ['Bank transfer', 'Card', 'Cash', 'Other'])
  assert.equal(isPaymentMethod('Card'), true)
  assert.equal(isPaymentMethod('Cheque'), false)
  assert.equal(isPaymentMethod(undefined), false)
})

test('todayInJohannesburg is the South African date, not the UTC date', () => {
  assert.equal(todayInJohannesburg(new Date('2026-10-10T21:59:00Z')), '2026-10-10')
  assert.equal(todayInJohannesburg(new Date('2026-10-10T22:01:00Z')), '2026-10-11', 'after 22:00 UTC it is already tomorrow in South Africa')
  assert.equal(todayInJohannesburg(new Date('2026-12-31T22:30:00Z')), '2027-01-01')
})

test('a paid date stored as South African midnight shows as that South African day, not the UTC day before', () => {
  const day = (iso: string) => formatSouthAfricanDate(iso)
  assert.equal(day('2026-10-10T22:00:00Z'), day('2026-10-11T12:00:00Z'), 'midnight on the 11th in South Africa is the 11th')
  assert.equal(day('2026-10-10T21:59:00Z'), day('2026-10-10T12:00:00Z'), 'one minute earlier is still the 10th')
  assert.notEqual(day('2026-10-10T22:00:00Z'), day('2026-10-10T21:59:00Z'))
  assert.match(day('2026-10-10T22:00:00Z'), /2026/)
  assert.doesNotMatch(day('2026-10-10T22:00:00Z'), /:/, 'a date only, no time')
})

test('a valid payment is read as numbers and trimmed text', () => {
  assert.deepEqual(readPaymentFields(form(valid), TODAY), { amount: 1500, received_on: '2026-10-10', method: 'Bank transfer', reference: 'REF-1' })
  assert.deepEqual(readPaymentFields(form({ ...valid, amount: '99,50', reference: '   ' }), TODAY), { amount: 99.5, received_on: '2026-10-10', method: 'Bank transfer', reference: null })
  assert.deepEqual(readPaymentFields(form({ ...valid, amount: '1 500', receivedOn: TODAY }), TODAY), { amount: 1500, received_on: TODAY, method: 'Bank transfer', reference: 'REF-1' })
})

test('an amount typed the wrong way gets a plain message and nothing is sent on', () => {
  for (const amount of ['', 'abc', '-5', '1,500', '12.5.3', '1e3']) {
    const result = readPaymentFields(form({ ...valid, amount }), TODAY)
    assert.ok('error' in result, JSON.stringify(amount))
  }
  assert.deepEqual(readPaymentFields(form({ ...valid, amount: '0' }), TODAY), { error: 'Enter an amount above zero.' })
  assert.deepEqual(readPaymentFields(form({ ...valid, amount: '0.001' }), TODAY), { error: 'Enter at most two decimals.' })
  assert.deepEqual(readPaymentFields(form({ ...valid, amount: '10000000' }), TODAY), { error: 'That amount is too large.' })
})

test('the date, the method and the reference are checked', () => {
  assert.deepEqual(readPaymentFields(form({ ...valid, receivedOn: '' }), TODAY), { error: 'Enter the date the payment was received.' })
  assert.deepEqual(readPaymentFields(form({ ...valid, receivedOn: '2026-02-30' }), TODAY), { error: 'Enter the date the payment was received.' })
  assert.deepEqual(readPaymentFields(form({ ...valid, receivedOn: '2026-10-12' }), TODAY), { error: "The payment date can't be in the future." })
  assert.deepEqual(readPaymentFields(form({ ...valid, method: 'Cheque' }), TODAY), { error: 'Choose Bank transfer, Card, Cash or Other.' })
  assert.deepEqual(readPaymentFields(form({ ...valid, reference: 'x'.repeat(121) }), TODAY), { error: 'The reference is too long (120 characters at most).' })
  assert.ok(!('error' in readPaymentFields(form({ ...valid, reference: 'x'.repeat(120) }), TODAY)))
  assert.deepEqual(readPaymentFields(new FormData(), TODAY), { error: 'Enter the amount as a plain number, for example 1500 or 99.50 (no thousands separators).' })
})

test('a void needs a reason of up to 500 characters', () => {
  assert.deepEqual(readVoidReason(form({ reason: '  Wrong client  ' })), { reason: 'Wrong client' })
  assert.deepEqual(readVoidReason(form({ reason: '   ' })), { error: 'A reason is required to void a payment.' })
  assert.deepEqual(readVoidReason(new FormData()), { error: 'A reason is required to void a payment.' })
  assert.deepEqual(readVoidReason(form({ reason: 'x'.repeat(501) })), { error: 'The reason is too long (500 characters at most).' })
})
