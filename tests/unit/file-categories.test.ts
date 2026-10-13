import assert from 'node:assert/strict'
import test from 'node:test'

import { FILE_TYPES, FILE_VISIBILITY, fileTypeLabel, fileVisibilityLabel } from '../../features/documents/file-categories.ts'

test('the stored values still match what the database check allows, and every one has a client-facing label', () => {
  assert.deepEqual(FILE_TYPES.map((item) => item.value), ['Project Evidence', 'Requirements', 'Compliance', 'Design Artefact', 'Commercial', 'Other'])
  assert.deepEqual(FILE_VISIBILITY.map((item) => item.value), ['Internal', 'Confidential', 'Restricted'])
  for (const item of [...FILE_TYPES, ...FILE_VISIBILITY]) assert.notEqual(item.label, item.value)
})

test('labels never mention projects, and an unknown stored value is shown as it is', () => {
  for (const item of [...FILE_TYPES, ...FILE_VISIBILITY]) assert.doesNotMatch(item.label, /project/i)
  assert.equal(fileTypeLabel('Commercial'), 'Quotes, contracts and agreements with the client')
  assert.equal(fileVisibilityLabel('Internal'), 'Internal: our team only')
  assert.equal(fileTypeLabel('Something else'), 'Something else')
})
