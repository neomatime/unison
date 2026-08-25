import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveDisplayName } from '../../lib/auth/display-name.ts'

test('the provider name wins when it is present', () => {
  assert.equal(
    resolveDisplayName({ email: 'neo.matime@himark.co.za', user_metadata: { full_name: 'Neo Matime' } }),
    'Neo Matime',
  )
})

test('name is accepted when full_name is absent', () => {
  // Which key holds it depends on the claims the provider returned.
  assert.equal(resolveDisplayName({ email: 'a.b@himark.co.za', user_metadata: { name: 'Given Name' } }), 'Given Name')
})

test('a blank provider name does not win', () => {
  assert.equal(
    resolveDisplayName({ email: 'neo.matime@himark.co.za', user_metadata: { full_name: '   ' } }),
    'Neo Matime',
  )
})

test('a person-shaped address becomes a name', () => {
  assert.equal(resolveDisplayName({ email: 'neo.matime@himark.co.za', user_metadata: {} }), 'Neo Matime')
  assert.equal(resolveDisplayName({ email: 'jane_doe@himark.co.za', user_metadata: {} }), 'Jane Doe')
})

test('hyphens stay inside a name part', () => {
  assert.equal(resolveDisplayName({ email: 'anne-marie.dupont@himark.co.za' }), 'Anne-Marie Dupont')
})

test('a shared address keeps its address rather than inventing a name', () => {
  // "Info" would read as a person who does not exist.
  assert.equal(resolveDisplayName({ email: 'info@himark.co.za', user_metadata: {} }), 'info@himark.co.za')
})

test('an account with nothing to show falls back', () => {
  assert.equal(resolveDisplayName({ email: null, user_metadata: {} }), 'HIMARK User')
  assert.equal(resolveDisplayName({}), 'HIMARK User')
})
