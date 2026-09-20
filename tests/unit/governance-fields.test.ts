import assert from 'node:assert/strict'
import test from 'node:test'

import { readArtefactFields, readRiskFields } from '../../features/delivery/governance-fields.ts'

const OWNER = '3f3b2bbc-a9e8-46d4-8dfb-083cc5a2b5a0'

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const validRisk = { title: 'Supplier delay', probability: 'Likely', impact: 'Major', status: 'Open' }

test('a minimal valid risk reads through, with optional fields null', () => {
  assert.deepEqual(readRiskFields(form(validRisk)), {
    title: 'Supplier delay',
    description: null,
    probability: 'Likely',
    impact: 'Major',
    status: 'Open',
    owner_id: null,
    mitigation: null,
    target_date: null,
  })
})

test('a fully populated risk reads through, trimmed', () => {
  const fields = readRiskFields(form({
    ...validRisk,
    title: '  Supplier delay  ',
    description: 'Hardware arrives late',
    mitigation: 'Second supplier',
    ownerId: OWNER,
    targetDate: '2026-10-31',
  }))
  assert.deepEqual(fields, {
    title: 'Supplier delay',
    description: 'Hardware arrives late',
    probability: 'Likely',
    impact: 'Major',
    status: 'Open',
    owner_id: OWNER,
    mitigation: 'Second supplier',
    target_date: '2026-10-31',
  })
})

test('every status in the vocabulary is accepted', () => {
  for (const status of ['Open', 'Mitigating', 'Accepted', 'Closed']) {
    assert.ok(!('error' in readRiskFields(form({ ...validRisk, status }))), `${status} must be accepted`)
  }
})

test('a risk with no title is refused', () => {
  assert.deepEqual(readRiskFields(form({ ...validRisk, title: '   ' })), { error: 'A risk title is required.' })
})

test('a probability, impact or status outside the vocabulary is refused', () => {
  assert.deepEqual(readRiskFields(form({ ...validRisk, probability: 'Certain' })), { error: 'Choose a valid probability.' })
  assert.deepEqual(readRiskFields(form({ ...validRisk, impact: 'Catastrophic' })), { error: 'Choose a valid impact.' })
  assert.deepEqual(readRiskFields(form({ ...validRisk, status: 'Resolved' })), { error: 'Choose a valid status.' })
})

test('a missing select is refused, not defaulted', () => {
  // createRiskAction used to default a missing probability to "Possible".
  const { probability: _omitted, ...withoutProbability } = validRisk
  assert.deepEqual(readRiskFields(form(withoutProbability)), { error: 'Choose a valid probability.' })
})

test('a malformed owner id is refused, and a blank owner is Unassigned', () => {
  assert.deepEqual(readRiskFields(form({ ...validRisk, ownerId: 'not-a-uuid' })), { error: 'Choose a valid owner.' })
  const blank = readRiskFields(form({ ...validRisk, ownerId: '' }))
  assert.ok(!('error' in blank))
  assert.equal(blank.owner_id, null)
})

test('an impossible target date is refused, and a blank one is null', () => {
  assert.deepEqual(readRiskFields(form({ ...validRisk, targetDate: '2026-02-30' })), { error: 'Enter a valid target date.' })
  const blank = readRiskFields(form({ ...validRisk, targetDate: '' }))
  assert.ok(!('error' in blank))
  assert.equal(blank.target_date, null)
})

test('a valid artefact reads through, with notes optional', () => {
  assert.deepEqual(readArtefactFields(form({ name: 'Test report', externalUrl: 'https://example.com/report' })), {
    name: 'Test report',
    external_url: 'https://example.com/report',
    notes: null,
  })
  const withNotes = readArtefactFields(form({ name: 'Test report', externalUrl: 'https://example.com/report', notes: ' Signed off ' }))
  assert.ok(!('error' in withNotes))
  assert.equal(withNotes.notes, 'Signed off')
})

test('an artefact needs a name and a url', () => {
  const message = { error: 'An artefact name and secure URL are required.' }
  assert.deepEqual(readArtefactFields(form({ name: '', externalUrl: 'https://example.com' })), message)
  assert.deepEqual(readArtefactFields(form({ name: 'Report', externalUrl: '' })), message)
})

test('an artefact url must be https', () => {
  const message = { error: 'Use a valid HTTPS evidence URL.' }
  assert.deepEqual(readArtefactFields(form({ name: 'Report', externalUrl: 'http://example.com' })), message)
  assert.deepEqual(readArtefactFields(form({ name: 'Report', externalUrl: 'not a url' })), message)
})
