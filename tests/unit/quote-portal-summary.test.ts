import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import * as copy from '../../features/quote-portal/copy.ts'
import { buildCommercialSummary, clientStatusLabel, versionLabel } from '../../features/quote-portal/summary.ts'
import type { PortalLine } from '../../lib/quote-portal/types.ts'

// Git on Windows may check files out with CRLF line endings; the guards match on LF.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')

let counter = 0
const line = (overrides: Partial<PortalLine> & Pick<PortalLine, 'line_amount'>): PortalLine => {
  counter += 1
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    position: counter,
    title: `Line ${counter}`,
    description: null,
    quantity: 1,
    unit_price: overrides.line_amount,
    vat_code: 'standard',
    charge_kind: null,
    ...overrides,
  }
}
const monthly = (amount: PortalLine['line_amount'], overrides: Partial<PortalLine> = {}) => line({ line_amount: amount, charge_kind: 'monthly', ...overrides })
const onceOff = (amount: PortalLine['line_amount'], overrides: Partial<PortalLine> = {}) => line({ line_amount: amount, charge_kind: 'once_off', ...overrides })

// ---------------------------------------------------------------------------------------------------------------
// Client-facing status words and the version label
// ---------------------------------------------------------------------------------------------------------------

test('clientStatusLabel shows Sent as Awaiting response and keeps every other status as it is', () => {
  assert.equal(clientStatusLabel('Sent'), 'Awaiting response')
  for (const status of ['Draft', 'Internal Review', 'Accepted', 'Declined', 'Expired', 'Superseded']) {
    assert.equal(clientStatusLabel(status), status, status)
  }
  // Only the exact name is renamed.
  for (const status of ['sent', 'SENT', ' Sent', 'Sent ', '']) assert.equal(clientStatusLabel(status), status, JSON.stringify(status))
})

test('versionLabel names the version, and the quote it replaces when there is one', () => {
  assert.equal(versionLabel(1, null), 'Version 1')
  assert.equal(versionLabel(2, 'HMK-Q-2026-00045'), 'Version 2, replacing HMK-Q-2026-00045')
  assert.equal(versionLabel(3, 'HMK-Q-2026-00046'), 'Version 3, replacing HMK-Q-2026-00046')
  // A version above 1 whose predecessor is not shown (another client's, or unnumbered) is just the version.
  assert.equal(versionLabel(2, null), 'Version 2')
  assert.equal(versionLabel(2, ''), 'Version 2')
  assert.equal(versionLabel(2, '   '), 'Version 2')
})

// ---------------------------------------------------------------------------------------------------------------
// Commercial summary: grouped only when every line has a kind and at least one is monthly
// ---------------------------------------------------------------------------------------------------------------

test('buildCommercialSummary groups a quote whose lines are all monthly', () => {
  const lines = [monthly(1000), monthly('500.50')]
  const summary = buildCommercialSummary(lines, 15)
  // 150,050 cents of standard-rated lines at 15% is 22,507.5 cents: half a cent rounds away from zero to 22,508.
  assert.deepEqual(summary, {
    grouped: true,
    onceOff: [],
    monthly: lines,
    onceOffSubtotal: 0,
    monthlySubtotal: 1500.5,
    monthlyVat: 225.08,
    monthlyIncludingVat: 1725.58,
  })
})

test('buildCommercialSummary splits once-off from monthly lines and adds VAT only to the standard-rated ones', () => {
  const setUp = onceOff(2000)
  const exportFee = onceOff(800, { vat_code: 'zero' })
  const retainer = monthly(1000)
  const hosting = monthly(250, { vat_code: 'zero' })
  // Deliberately interleaved, as lines can be in position order.
  const summary = buildCommercialSummary([setUp, retainer, exportFee, hosting], 15)
  assert.deepEqual(summary, {
    grouped: true,
    onceOff: [setUp, exportFee],
    monthly: [retainer, hosting],
    onceOffSubtotal: 2800,
    monthlySubtotal: 1250,
    monthlyVat: 150,
    monthlyIncludingVat: 1400,
  })
})

test('buildCommercialSummary charges no VAT on monthly lines that are all zero-rated', () => {
  const summary = buildCommercialSummary([onceOff(500), monthly(300, { vat_code: 'zero' }), monthly('99.99', { vat_code: 'zero' })], 15)
  assert.ok(summary.grouped)
  assert.equal(summary.monthlySubtotal, 399.99)
  assert.equal(summary.monthlyVat, 0)
  assert.equal(summary.monthlyIncludingVat, 399.99)
  assert.equal(summary.onceOffSubtotal, 500)
})

test('buildCommercialSummary falls back to one flat list when any line has no charge kind', () => {
  const lines = [onceOff(1000), monthly(500), line({ line_amount: 250, charge_kind: null })]
  assert.deepEqual(buildCommercialSummary(lines, 15), { grouped: false, lines })
  // One line without a kind is enough, wherever it sits.
  const first = [line({ line_amount: 250, charge_kind: null }), monthly(500), monthly(100)]
  assert.deepEqual(buildCommercialSummary(first, 15), { grouped: false, lines: first })
  // A quote from before charge kinds existed has none at all.
  const legacy = [line({ line_amount: 100, charge_kind: null }), line({ line_amount: 200, charge_kind: null })]
  assert.deepEqual(buildCommercialSummary(legacy, 15), { grouped: false, lines: legacy })
})

test('buildCommercialSummary falls back to one flat list when there are no monthly lines', () => {
  const lines = [onceOff(1000), onceOff(250.25, { vat_code: 'zero' })]
  assert.deepEqual(buildCommercialSummary(lines, 15), { grouped: false, lines })
})

test('buildCommercialSummary falls back to one flat list when there are no lines at all', () => {
  assert.deepEqual(buildCommercialSummary([], 15), { grouped: false, lines: [] })
})

test('buildCommercialSummary treats a kind it does not know as no kind', () => {
  const lines = [monthly(100), line({ line_amount: 50, charge_kind: 'weekly' as unknown as PortalLine['charge_kind'] })]
  assert.deepEqual(buildCommercialSummary(lines, 15), { grouped: false, lines })
})

test('buildCommercialSummary keeps lines in the order they came in, within each group', () => {
  const a = monthly(1, { title: 'a' })
  const b = onceOff(2, { title: 'b' })
  const c = monthly(3, { title: 'c' })
  const d = onceOff(4, { title: 'd' })
  const summary = buildCommercialSummary([a, b, c, d], 15)
  assert.ok(summary.grouped)
  assert.deepEqual(summary.monthly.map((l) => l.title), ['a', 'c'])
  assert.deepEqual(summary.onceOff.map((l) => l.title), ['b', 'd'])
})

test('buildCommercialSummary reads amounts that arrive as numeric strings', () => {
  const summary = buildCommercialSummary([onceOff('1234.50'), monthly('0.10'), monthly('2000.00'), monthly('15')], 15)
  assert.ok(summary.grouped)
  assert.equal(summary.onceOffSubtotal, 1234.5)
  assert.equal(summary.monthlySubtotal, 2015.1)
  // 201,510 cents at 15% is 30,226.5 cents, which rounds to 30,227.
  assert.equal(summary.monthlyVat, 302.27)
  assert.equal(summary.monthlyIncludingVat, 2317.37)
})

test('buildCommercialSummary does its sums in whole cents, so floating point never drifts', () => {
  // 0.1 + 0.2 is 0.30000000000000004 in floating point.
  const tenths = buildCommercialSummary([monthly(0.1, { vat_code: 'zero' }), monthly(0.2, { vat_code: 'zero' })], 15)
  assert.ok(tenths.grouped)
  assert.equal(tenths.monthlySubtotal, 0.3)
  assert.equal(tenths.monthlyIncludingVat, 0.3)

  // 0.7 + 0.1 is 0.7999999999999999, and 4.35 three times is 13.049999999999999.
  const more = buildCommercialSummary([monthly(0.7, { vat_code: 'zero' }), monthly(0.1, { vat_code: 'zero' }), onceOff(1.1, { vat_code: 'zero' }), onceOff(2.2, { vat_code: 'zero' })], 15)
  assert.ok(more.grouped)
  assert.equal(more.monthlySubtotal, 0.8)
  assert.equal(more.onceOffSubtotal, 3.3)
  const threes = buildCommercialSummary([monthly(4.35, { vat_code: 'zero' }), monthly(4.35, { vat_code: 'zero' }), monthly(4.35, { vat_code: 'zero' })], 15)
  assert.ok(threes.grouped)
  assert.equal(threes.monthlySubtotal, 13.05)

  // 1,234.56 + 0.07 + 0.07 is 1234.6999999999998 in floating point.
  const long = buildCommercialSummary([monthly(1234.56, { vat_code: 'zero' }), monthly(0.07, { vat_code: 'zero' }), monthly(0.07, { vat_code: 'zero' })], 15)
  assert.ok(long.grouped)
  assert.equal(long.monthlySubtotal, 1234.7)
})

test('buildCommercialSummary rounds VAT half a cent away from zero, as the database does', () => {
  // Each pair is a standard-rated monthly amount and the 15% VAT the database would store for it: round(x * 15 / 100, 2).
  // Floating point gets these wrong: 1.5 * 0.15 * 100 is 22.5 minus a speck, and 6.7 * 0.15 * 100 is 100.49999999999999.
  const cases: Array<[amount: number, vat: number]> = [
    [1.5, 0.23], [6.7, 1.01], [1.9, 0.29], [3.3, 0.5], [8.5, 1.28], [0.1, 0.02], [0.03, 0], [0.04, 0.01], [100, 15], [1500.5, 225.08], [9999999.99, 1500000],
  ]
  for (const [amount, vat] of cases) {
    const summary = buildCommercialSummary([monthly(amount)], 15)
    assert.ok(summary.grouped)
    assert.equal(summary.monthlyVat, vat, `VAT on ${amount}`)
  }
})

test('buildCommercialSummary uses the rate it is given, to two decimals', () => {
  const at = (rate: number) => {
    const summary = buildCommercialSummary([monthly(100)], rate)
    assert.ok(summary.grouped)
    return summary.monthlyVat
  }
  assert.equal(at(0), 0)
  assert.equal(at(15), 15)
  assert.equal(at(7.5), 7.5)
  assert.equal(at(14.25), 14.25)
  assert.equal(at(100), 100)
  // 33.33 at 15.5% is 5.16615, which is 5.17.
  const odd = buildCommercialSummary([monthly(33.33)], 15.5)
  assert.ok(odd.grouped)
  assert.equal(odd.monthlyVat, 5.17)
})

test('buildCommercialSummary takes each amount from line_amount, not from quantity times price', () => {
  // The database computed line_amount; if it ever differs from a recalculation, the stored figure is the one the client was quoted.
  const summary = buildCommercialSummary([monthly(25, { quantity: 2, unit_price: 10 }), onceOff(7, { quantity: 3, unit_price: 3 })], 15)
  assert.ok(summary.grouped)
  assert.equal(summary.monthlySubtotal, 25)
  assert.equal(summary.onceOffSubtotal, 7)
})

test('buildCommercialSummary stays exact at the largest amounts a quote can hold', () => {
  const lines = Array.from({ length: 20 }, () => monthly(9999999.99))
  const summary = buildCommercialSummary(lines, 15)
  assert.ok(summary.grouped)
  assert.equal(summary.monthlySubtotal, 199999999.8)
  assert.equal(summary.monthlyVat, 29999999.97)
  assert.equal(summary.monthlyIncludingVat, 229999999.77)
})

test('buildCommercialSummary rounds a negative figure away from zero too, and never returns negative zero', () => {
  // Not reachable from the database (prices are not negative) but the rounding is symmetric by design.
  const summary = buildCommercialSummary([monthly(-1.5)], 15)
  assert.ok(summary.grouped)
  assert.equal(summary.monthlyVat, -0.23)
  // -0.03 at 15% is -0.0045, which rounds to nothing: that must be 0, not -0 (which prints and compares differently).
  const tiny = buildCommercialSummary([monthly(-0.03)], 15)
  assert.ok(tiny.grouped)
  assert.ok(Object.is(tiny.monthlyVat, 0), 'positive zero')
})

test('buildCommercialSummary shows the flat list rather than a wrong figure when a number cannot be read', () => {
  const good = [onceOff(100), monthly(50)]
  for (const rate of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(buildCommercialSummary(good, rate), { grouped: false, lines: good }, `rate ${rate}`)
  }
  for (const amount of ['abc', '', null, undefined, Number.NaN] as unknown as Array<PortalLine['line_amount']>) {
    const lines = [onceOff(100), monthly(amount)]
    assert.deepEqual(buildCommercialSummary(lines, 15), { grouped: false, lines }, `amount ${String(amount)}`)
  }
})

test('buildCommercialSummary shows the flat list rather than a figure it cannot add exactly', () => {
  // 80 billion rand of standard-rated monthly lines is 8e12 cents; times a 15% rate it passes 2^53, where integers stop being exact.
  const lines = [onceOff(100), monthly(80000000000)]
  assert.deepEqual(buildCommercialSummary(lines, 15), { grouped: false, lines })
  // The same lines are fine zero-rated: nothing is multiplied.
  const zeroRated = [onceOff(100), monthly(80000000000, { vat_code: 'zero' })]
  const summary = buildCommercialSummary(zeroRated, 15)
  assert.ok(summary.grouped)
  assert.equal(summary.monthlySubtotal, 80000000000)
})

test('buildCommercialSummary does not change the lines or the array it is given', () => {
  const lines = Object.freeze([Object.freeze(onceOff('10.00')), Object.freeze(monthly('20.00'))]) as unknown as PortalLine[]
  const before = JSON.stringify(lines)
  buildCommercialSummary(lines, 15)
  buildCommercialSummary(lines.slice(0, 1), 15)
  assert.equal(JSON.stringify(lines), before)
})

// ---------------------------------------------------------------------------------------------------------------
// Copy: the spec appendix, character for character
// ---------------------------------------------------------------------------------------------------------------

const EXPECTED_COPY = {
  PORTAL_HEADING: 'Review your quotation',
  PORTAL_INTRO: "Thank you for considering HIMARK as your strategic partner. Please review the details of your quotation below. If you have any questions, we're here to help.",
  READY_TO_RESPOND: 'Ready to respond?',
  TERMS_STRIP: 'This quotation is subject to the terms and conditions below. Please review them carefully before responding.',
  EMAIL_HEADING: 'Your quotation is ready for review',
  EMAIL_DEFAULT_NOTE: 'Thank you for considering HIMARK as your strategic partner. Your quotation is ready for review. Please review the details below and respond electronically using your secure quotation link.',
  EMAIL_NEXT_STEPS: 'If you choose to proceed, our team will coordinate onboarding, project planning and activation of the agreed services.',
  QUESTIONS_HEADING: 'Questions about this quotation?',
  RECURRING_NOTE: 'Monthly charges recur each month; the first month is included in the total above.',
  SLICE_ONE_RESPOND_NOTE: 'To accept or decline this quotation, reply to the email you received or contact your HIMARK contact.',
} as const

test('each copy constant is exactly its appendix string', () => {
  for (const [name, expected] of Object.entries(EXPECTED_COPY)) {
    assert.equal((copy as Record<string, unknown>)[name], expected, name)
  }
})

test('the copy constants are plain ASCII, with a straight apostrophe and no stray spaces', () => {
  for (const name of Object.keys(EXPECTED_COPY)) {
    const value = (copy as Record<string, unknown>)[name]
    assert.equal(typeof value, 'string', name)
    const text = value as string
    assert.match(text, /^[\x20-\x7e]+$/, `${name} is printable ASCII`)
    assert.equal(text, text.trim(), `${name} has no leading or trailing space`)
    assert.ok(!/ {2}/.test(text), `${name} has no double space`)
  }
  assert.equal(copy.PORTAL_INTRO.includes("we're"), true, 'the apostrophe in we\'re is U+0027')
  assert.equal(copy.PORTAL_INTRO.charCodeAt(copy.PORTAL_INTRO.indexOf("we're") + 2), 39)
})

test('the copy constants appear in the spec appendix as written there', () => {
  // The spec wraps its lines; join them with single spaces before comparing. SLICE_ONE_RESPOND_NOTE is a controller
  // ruling for slice 1 and is not in the spec.
  const spec = read('docs', 'superpowers', 'specs', '2026-10-18-quote-portal-design.md').replace(/\s+/g, ' ')
  for (const [name, expected] of Object.entries(EXPECTED_COPY)) {
    if (name === 'SLICE_ONE_RESPOND_NOTE') continue
    assert.ok(spec.includes(`"${expected}"`), `${name} is quoted in the spec`)
  }
})
