import assert from 'node:assert/strict'
import test from 'node:test'
import { safeRedirectPath } from '../../lib/auth/safe-redirect.ts'

test('preserves a normal same-origin relative path', () => {
  assert.equal(safeRedirectPath('/operations/clients'), '/operations/clients')
})

test('falls back to /overview for an absolute URL', () => {
  assert.equal(safeRedirectPath('https://evil.example'), '/overview')
})

test('falls back to /overview for a protocol-relative URL', () => {
  assert.equal(safeRedirectPath('//evil.example'), '/overview')
})

test('falls back to /overview for a backslash-prefixed value', () => {
  assert.equal(safeRedirectPath('/\\evil.example'), '/overview')
})

test('falls back to /overview for an empty value', () => {
  assert.equal(safeRedirectPath(''), '/overview')
})

test('falls back to /overview for a missing value', () => {
  assert.equal(safeRedirectPath(undefined), '/overview')
  assert.equal(safeRedirectPath(null), '/overview')
})

test('falls back to /overview for a value with no leading slash', () => {
  assert.equal(safeRedirectPath('evil.example'), '/overview')
})
