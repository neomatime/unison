import assert from 'node:assert/strict'
import test from 'node:test'

import { selectClientOptions, selectFrameworkOptions, selectOwnerOptions, selectPhaseOptions } from '../../features/delivery/form-options.ts'

const ACTIVE = { userId: 'u-active', displayName: 'Active Member', status: 'active' }
const REMOVED = { userId: 'u-removed', displayName: 'Departed Member', status: 'removed' }
const INVITED = { userId: 'u-invited', displayName: 'Invited Member', status: 'invited' }

test('the owner picker offers active members only when creating', () => {
  assert.deepEqual(selectOwnerOptions([ACTIVE, REMOVED, INVITED]), [
    { id: 'u-active', name: 'Active Member' },
  ])
})

test('a removed owner is retained so an edit cannot silently null owner_id', () => {
  // The defect this guards: the select's defaultValue matched no option, so the
  // browser fell back to the empty "Unassigned" option and saving any unrelated
  // field wrote owner_id: null.
  const options = selectOwnerOptions([ACTIVE, REMOVED], 'u-removed')

  assert.equal(options.length, 2)
  assert.ok(
    options.some((option) => option.id === 'u-removed'),
    'the current owner must remain selectable even after being removed',
  )
})

test('a retained owner is labelled, so staleness is visible rather than hidden', () => {
  const retained = selectOwnerOptions([ACTIVE, REMOVED], 'u-removed')
    .find((option) => option.id === 'u-removed')

  assert.equal(retained?.name, 'Departed Member (removed)')
})

test('an active current owner is offered once, not duplicated', () => {
  const options = selectOwnerOptions([ACTIVE, REMOVED], 'u-active')

  assert.deepEqual(options, [{ id: 'u-active', name: 'Active Member' }])
})

test('an owner id matching no member invents no option', () => {
  // projects_owner_fkey makes this unreachable through the product; the point
  // is that the fallback is an honest omission rather than a fabricated name.
  assert.deepEqual(selectOwnerOptions([ACTIVE], 'u-nobody'), [
    { id: 'u-active', name: 'Active Member' },
  ])
})

const OPEN_CLIENT = { id: 'c-open', name: 'Open Client', archived_at: null }
const ARCHIVED_CLIENT = { id: 'c-archived', name: 'Archived Client', archived_at: '2026-09-01T00:00:00Z' }

test('the client picker excludes archived clients when they are not the current one', () => {
  assert.deepEqual(selectClientOptions([OPEN_CLIENT, ARCHIVED_CLIENT]), [
    { id: 'c-open', name: 'Open Client' },
  ])
})

test('an archived current client is retained and labelled', () => {
  const options = selectClientOptions([OPEN_CLIENT, ARCHIVED_CLIENT], 'c-archived')

  assert.deepEqual(options, [
    { id: 'c-open', name: 'Open Client' },
    { id: 'c-archived', name: 'Archived Client (archived)' },
  ])
})

test('an open current client is offered once, not duplicated', () => {
  assert.deepEqual(selectClientOptions([OPEN_CLIENT, ARCHIVED_CLIENT], 'c-open'), [
    { id: 'c-open', name: 'Open Client' },
  ])
})

const OPEN_FRAMEWORK = { id: 'f-open', name: 'Open Framework', archived_at: null }
const ARCHIVED_FRAMEWORK = { id: 'f-archived', name: 'Archived Framework', archived_at: '2026-09-01T00:00:00Z' }

test('the framework picker excludes archived frameworks when they are not the current one', () => {
  assert.deepEqual(selectFrameworkOptions([OPEN_FRAMEWORK, ARCHIVED_FRAMEWORK]), [
    { id: 'f-open', name: 'Open Framework' },
  ])
})

test('an archived current framework is retained and labelled', () => {
  // The defect this guards: ProjectForm's framework <select> is controlled and
  // required, so a value matching no option leaves nothing selected — not even
  // a fallback empty option — and the browser refuses to submit the form.
  const options = selectFrameworkOptions([OPEN_FRAMEWORK, ARCHIVED_FRAMEWORK], 'f-archived')

  assert.deepEqual(options, [
    { id: 'f-open', name: 'Open Framework' },
    { id: 'f-archived', name: 'Archived Framework (archived)' },
  ])
})

test('an open current framework is offered once, not duplicated', () => {
  assert.deepEqual(selectFrameworkOptions([OPEN_FRAMEWORK, ARCHIVED_FRAMEWORK], 'f-open'), [
    { id: 'f-open', name: 'Open Framework' },
  ])
})

test('a framework id matching no framework invents no option', () => {
  assert.deepEqual(selectFrameworkOptions([OPEN_FRAMEWORK], 'f-nobody'), [
    { id: 'f-open', name: 'Open Framework' },
  ])
})

const OPEN_PHASE = { id: 'p-open', name: 'Design', frameworkId: 'f-1', archived_at: null }
const ARCHIVED_PHASE = { id: 'p-archived', name: 'Legacy Gate', frameworkId: 'f-1', archived_at: '2026-09-01T00:00:00Z' }

test('the phase picker excludes archived phases when they are not the current one', () => {
  assert.deepEqual(selectPhaseOptions([OPEN_PHASE, ARCHIVED_PHASE]), [
    { id: 'p-open', name: 'Design', frameworkId: 'f-1' },
  ])
})

test('an archived current phase is retained and labelled', () => {
  // Same defect as the removed owner: the select's defaultValue would match no
  // option, the browser would fall back to the empty one, and saving any
  // unrelated field would write phase_id: null.
  const options = selectPhaseOptions([OPEN_PHASE, ARCHIVED_PHASE], 'p-archived')

  assert.deepEqual(options, [
    { id: 'p-open', name: 'Design', frameworkId: 'f-1' },
    { id: 'p-archived', name: 'Legacy Gate (archived)', frameworkId: 'f-1' },
  ])
})

test('a retained phase keeps its frameworkId so the form can still filter it', () => {
  const retained = selectPhaseOptions([OPEN_PHASE, ARCHIVED_PHASE], 'p-archived')
    .find((option) => option.id === 'p-archived')

  assert.equal(retained?.frameworkId, 'f-1')
})

test('an open current phase is offered once, not duplicated', () => {
  assert.deepEqual(selectPhaseOptions([OPEN_PHASE, ARCHIVED_PHASE], 'p-open'), [
    { id: 'p-open', name: 'Design', frameworkId: 'f-1' },
  ])
})
