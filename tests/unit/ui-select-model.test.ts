import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement, Fragment } from 'react'

import {
  filterOptions,
  nextEnabledIndex,
  readOptions,
  selectedOption,
  shouldShowSearch,
  SEARCH_THRESHOLD,
} from '../../lib/ui/select-model.ts'

const opt = (value: string | undefined, label: string, extra: Record<string, unknown> = {}) =>
  createElement('option', { value, ...extra }, label)

test('readOptions reads option value and label, using the label when no value is given', () => {
  const found = readOptions([opt('a', 'Alpha'), opt(undefined, 'Beta')])
  assert.deepEqual(
    found.map((o) => [o.value, o.label]),
    [['a', 'Alpha'], ['Beta', 'Beta']],
  )
})

test('readOptions flattens mapped arrays, fragments and optgroups and keeps disabled', () => {
  const found = readOptions([
    opt('', 'Select…'),
    ['x', 'y'].map((v) => opt(v, v.toUpperCase())),
    createElement(Fragment, null, opt('z', 'Z', { disabled: true })),
    createElement('optgroup', { label: 'Group' }, opt('g1', 'G1')),
    null,
    false,
  ])
  assert.deepEqual(found.map((o) => o.value), ['', 'x', 'y', 'z', 'g1'])
  assert.equal(found[3].disabled, true)
  assert.equal(found[4].group, 'Group')
  assert.equal(found[0].group, null)
})

test('the search box shows only above five options', () => {
  assert.equal(SEARCH_THRESHOLD, 5)
  assert.equal(shouldShowSearch(4), false)
  assert.equal(shouldShowSearch(5), false)
  assert.equal(shouldShowSearch(6), true)
})

test('filterOptions matches any part of a label, ignoring case and surrounding spaces', () => {
  const options = readOptions([opt('1', 'South Africa'), opt('2', 'Sudan'), opt('3', 'Norway')])
  assert.deepEqual(filterOptions(options, ' AFRI ').map((o) => o.value), ['1'])
  assert.deepEqual(filterOptions(options, 's').map((o) => o.value), ['1', '2'])
  assert.equal(filterOptions(options, '').length, 3)
  assert.equal(filterOptions(options, 'zzz').length, 0)
})

test('selectedOption finds by exact value and is null for an unknown value', () => {
  const options = readOptions([opt('', 'None'), opt('a', 'Alpha')])
  assert.equal(selectedOption(options, 'a')?.label, 'Alpha')
  assert.equal(selectedOption(options, '')?.label, 'None')
  assert.equal(selectedOption(options, 'nope'), null)
})

test('nextEnabledIndex skips disabled options and wraps in both directions', () => {
  const options = readOptions([opt('a', 'A'), opt('b', 'B', { disabled: true }), opt('c', 'C')])
  assert.equal(nextEnabledIndex(options, 0, 1), 2)
  assert.equal(nextEnabledIndex(options, 2, 1), 0)
  assert.equal(nextEnabledIndex(options, 0, -1), 2)
  assert.equal(nextEnabledIndex([], 0, 1), -1)
  assert.equal(nextEnabledIndex(readOptions([opt('a', 'A', { disabled: true })]), 0, 1), -1)
})
