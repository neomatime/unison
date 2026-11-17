import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { LEAD_FIELD_HINTS, QUALIFICATION_SCORE_MAX, SIGNAL_LABELS, outcomeLabel, scoreLabel, signalRows } from '../../features/commercial-finance/lead-qualification.ts'

test('the score shows what it is out of, matching the database check', () => {
  assert.equal(QUALIFICATION_SCORE_MAX, 5)
  assert.equal(scoreLabel(2), '2 / 5')
  assert.equal(scoreLabel('4'), '4 / 5')
  assert.equal(scoreLabel(0), '0 / 5')
  assert.equal(scoreLabel(undefined), '—')
  const sql = readFileSync('supabase/migrations/20260920132531_website_lead_ingestion.sql', 'utf8')
  assert.match(sql, /qualification_score between 0 and 5/)
})

test('signals read in plain words, in a fixed order, with a tick or cross', () => {
  const rows = signalRows({ organisation: false, engagement: true, impact: false, readiness: true, timing: false })
  assert.deepEqual(rows.map((row) => row.key), ['impact', 'timing', 'readiness', 'organisation', 'engagement'])
  assert.deepEqual(rows.map((row) => row.met), [false, false, true, false, true])
  assert.equal(rows.filter((row) => row.met).length, 2, 'the score is the number of met signals')
  assert.equal(SIGNAL_LABELS.timing, 'Urgent timeline')
  assert.equal(SIGNAL_LABELS.impact, 'Clear business impact')
  assert.deepEqual(signalRows(null), [])
  assert.equal(signalRows({ newOne: true })[0].label, 'NewOne')
})

test('outcomes read as words and the field is called Qualification outcome', () => {
  assert.equal(outcomeLabel('nurture'), 'Nurture')
  assert.equal(outcomeLabel('not_a_fit'), 'Not a fit')
  assert.equal(outcomeLabel(null), '—')
  const detail = readFileSync('features/commercial-finance/components/phase-six-detail.tsx', 'utf8')
  assert.match(detail, /\["Qualification outcome", "qualificationOutcome"\]/)
  assert.match(detail, /\["Manual review", "manualReviewRequired"\]/, 'manual review keeps its name')
  for (const label of ['Qualification outcome', 'Qualification score', 'Signals', 'Manual review']) assert.ok(LEAD_FIELD_HINTS[label], `${label} has a hint`)
})

test('the lead detail really formats the score and outcome through the helpers', () => {
  const detail = readFileSync('features/commercial-finance/components/phase-six-detail.tsx', 'utf8')
  assert.match(detail, /key === "qualificationScore"\) return scoreLabel\(value\)/)
  assert.match(detail, /key === "qualificationOutcome"\) return outcomeLabel\(value\)/)
  assert.match(detail, /signalRows\(value\)\.map/)
})
