import assert from 'node:assert/strict'
import test from 'node:test'

import { formatCurrency } from '../../lib/utils/format-money.ts'

test('a currency symbol is attached to the figure, with no gap after it', () => {
  assert.match(formatCurrency(0, 'ZAR', { maximumFractionDigits: 0 }), /^R0$/)
  assert.match(formatCurrency(1_234_567, 'ZAR', { maximumFractionDigits: 0 }), /^R1\D?234\D?567$/)
  assert.match(formatCurrency(40, 'USD', { maximumFractionDigits: 0 }), /^US\$40$/)
})

test('a negative amount keeps its sign and still has no gap', () => {
  assert.match(formatCurrency(-1500, 'ZAR', { maximumFractionDigits: 0 }), /^-R1\D?500$/)
})

test('a code with no symbol of its own keeps the space before the figure', () => {
  assert.match(formatCurrency(40, 'CHF', { maximumFractionDigits: 0 }), /^CHF\s40$/)
})

test('an unknown currency still throws, so callers can fall back to the code', () => {
  assert.throws(() => formatCurrency(5, 'not-a-currency'))
})
