import assert from 'node:assert/strict'
import test from 'node:test'

import { selectClientOptions, selectOwnerOptions } from '../../features/delivery/form-options.ts'

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
