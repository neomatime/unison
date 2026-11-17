import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { FINAL_STAGE, ONBOARDING_STAGES, boardColumns, canMove, isOnboardingStage, moveCard, progressAfterMove, type BoardCard } from '../../features/operations/onboarding-board.ts'

const card = (id: string, stage: BoardCard['stage'], progress = 20): BoardCard => ({ id, client: `Client ${id}`, type: 'Standard Client', owner: '—', stage, progress, health: 'On Track', goLive: '—' })

test('the columns are the six stages the database allows, in journey order', () => {
  assert.deepEqual([...ONBOARDING_STAGES], ['Welcome', 'Company Setup', 'Information & Documentation', 'Agreements', 'Review & Approval', 'Go Live / Handover'])
  const migrations = readFileSync('supabase/migrations/20260910171605_phase_four_team_operational_delivery.sql', 'utf8')
  for (const stage of ONBOARDING_STAGES) assert.ok(migrations.includes(`'${stage}'`), `${stage} is not an allowed stage in the database`)
})

test('cards are grouped by stage, every stage has a column, and nothing is lost', () => {
  const columns = boardColumns([card('a', 'Welcome'), card('b', 'Agreements'), card('c', 'Welcome')])
  assert.equal(columns.length, 6)
  assert.deepEqual(columns.map((column) => column.cards.map((item) => item.id)), [['a', 'c'], [], [], ['b'], [], []])
  assert.equal(boardColumns([]).every((column) => column.cards.length === 0), true)
})

test('reaching Go Live / Handover makes a card 100%; any other stage leaves the progress alone', () => {
  assert.equal(progressAfterMove(FINAL_STAGE, 35), 100)
  assert.equal(progressAfterMove('Agreements', 35), 35)
  assert.equal(progressAfterMove('Welcome', 80), 80, 'moving back does not lower the progress')
})

test('moving a card changes only that card', () => {
  const before = [card('a', 'Welcome', 10), card('b', 'Agreements', 50)]
  const after = moveCard(before, 'a', FINAL_STAGE)
  assert.deepEqual(after.map((item) => [item.id, item.stage, item.progress]), [['a', FINAL_STAGE, 100], ['b', 'Agreements', 50]])
  assert.equal(before[0].stage, 'Welcome', 'the original list is not changed')
})

test('a drop on the card\'s own stage, or of an unknown card, changes nothing', () => {
  const cards = [card('a', 'Welcome')]
  assert.equal(canMove(cards, 'a', 'Welcome'), false)
  assert.equal(canMove(cards, 'a', 'Agreements'), true)
  assert.equal(canMove(cards, 'zzz', 'Agreements'), false)
  assert.equal(isOnboardingStage('Welcome'), true)
  assert.equal(isOnboardingStage('Made up'), false)
})

test('the Onboarding page offers a Board view, hides archived onboardings and saves with the stage rule', () => {
  const page = readFileSync('app/(unison)/operations/onboarding/page.tsx', 'utf8')
  assert.match(page, /view/)
  const register = readFileSync('features/operations/components/phase-four-register.tsx', 'utf8')
  assert.match(register, /OnboardingBoard/)
  assert.match(register, /const active = rows\.filter\(\(row\) => !row\.archivedAt\)/)
  const action = readFileSync('features/operations/actions/onboarding-board.ts', 'utf8')
  assert.match(action, /isOnboardingStage/)
  assert.match(action, /progressAfterMove/)
  assert.match(action, /\.eq\("organization_id", organization\.id\)/)
  assert.match(action, /\.is\("archived_at", null\)/)
})
