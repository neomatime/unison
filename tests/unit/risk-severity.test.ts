import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RISK_BANDS,
  compareRisks,
  riskSeverity,
  type RankableRisk,
} from '../../features/delivery/risk-severity.ts'

test('severity rises with both probability and impact', () => {
  const low = riskSeverity('Rare', 'Minor')
  const high = riskSeverity('Almost Certain', 'Severe')

  assert.equal(low.band, 'Low')
  assert.equal(high.band, 'Critical')
  assert.ok(high.score > low.score, 'a near-certain severe risk must outrank a rare minor one')
})

test('a certain-but-trivial risk does not outrank a likely major one', () => {
  // The whole point of a matrix rather than a single field: neither axis alone
  // decides. "Almost Certain / Minor" is a nuisance; "Likely / Major" is the
  // one a delivery lead has to act on.
  const nuisance = riskSeverity('Almost Certain', 'Minor')
  const real = riskSeverity('Likely', 'Major')

  assert.ok(real.score > nuisance.score)
  assert.equal(real.band, 'Critical')
  assert.equal(nuisance.band, 'Moderate')
})

test('a rare but severe risk still registers above the floor', () => {
  // Low probability must not bury a catastrophic impact at the bottom of the
  // register, which is the classic failure of ranking on likelihood alone.
  const result = riskSeverity('Rare', 'Severe')
  assert.notEqual(result.band, 'Low')
})

test('every stored probability and impact maps to a known band', () => {
  // The database CHECK constraints pin both vocabularies. If either ever gains
  // a value, this fails rather than silently scoring it at the floor.
  const probabilities = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain']
  const impacts = ['Minor', 'Moderate', 'Major', 'Severe']

  for (const probability of probabilities) {
    for (const impact of impacts) {
      const result = riskSeverity(probability, impact)
      assert.ok(RISK_BANDS.includes(result.band), `${probability}/${impact} produced ${result.band}`)
      assert.ok(result.score > 0, `${probability}/${impact} must score above zero`)
    }
  }
})

test('an unrecognised value scores at the floor rather than throwing', () => {
  // Defensive only: the CHECK constraints make this unreachable from the
  // database. It must not take the briefing down if it ever is reached.
  assert.doesNotThrow(() => riskSeverity('Nonsense', 'Minor'))
  assert.equal(riskSeverity('Nonsense', 'Nonsense').score, 0)
})

function risk(over: Partial<RankableRisk> = {}): RankableRisk {
  return { id: 'r-1', title: 'Risk', probability: 'Possible', impact: 'Moderate', targetDate: null, ...over }
}

test('risks order by severity first', () => {
  const ordered = [
    risk({ id: 'a', probability: 'Rare', impact: 'Minor' }),
    risk({ id: 'b', probability: 'Almost Certain', impact: 'Severe' }),
  ].sort(compareRisks)

  assert.equal(ordered[0].id, 'b', 'the worst risk must lead the register')
})

test('equal severity breaks to the soonest target date, and undated risks sort last', () => {
  const ordered = [
    risk({ id: 'undated', targetDate: null }),
    risk({ id: 'later', targetDate: '2026-12-01' }),
    risk({ id: 'sooner', targetDate: '2026-10-01' }),
  ].sort(compareRisks)

  assert.deepEqual(ordered.map((r) => r.id), ['sooner', 'later', 'undated'])
})

test('the ordering is total, so equal rows cannot render in database order', () => {
  // Without a final tiebreaker the panel reshuffles between reloads for no
  // visible reason, which reads as data changing when nothing has.
  const ordered = [risk({ id: 'b', title: 'Same' }), risk({ id: 'a', title: 'Same' })].sort(compareRisks)
  assert.deepEqual(ordered.map((r) => r.id), ['a', 'b'])
})
