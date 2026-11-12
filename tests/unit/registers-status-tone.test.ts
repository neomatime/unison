import assert from 'node:assert/strict'
import test from 'node:test'

import { REGISTERS } from '../../features/registers/register-spec.ts'
import { statusTone } from '../../features/registers/status-tone.ts'

test('good outcomes are positive, bad outcomes negative, waiting states attention', () => {
  for (const status of ['Qualified', 'Converted', 'Accepted', 'Paid', 'Approved', 'Won']) assert.equal(statusTone(status), 'positive', status)
  for (const status of ['Disqualified', 'Declined', 'Expired', 'Overdue', 'Rejected', 'Lost', 'Cancelled']) assert.equal(statusTone(status), 'negative', status)
  for (const status of ['Partially Paid', 'Awaiting Approval', 'Internal Review', 'Negotiation']) assert.equal(statusTone(status), 'attention', status)
})

test('drafts, unknown and empty statuses are neutral', () => {
  for (const status of ['Draft', 'New', 'Superseded', 'Something new', '', null, undefined]) assert.equal(statusTone(status), 'neutral', String(status))
})

test('every status the five registers filter on has a deliberate tone or is meant to be neutral', () => {
  const neutral = new Set(['Draft', 'New', 'Superseded'])
  for (const spec of Object.values(REGISTERS)) {
    for (const status of spec.statuses) {
      assert.ok(statusTone(status) !== 'neutral' || neutral.has(status), `${status} has no tone and is not on the neutral list`)
    }
  }
})
