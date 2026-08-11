import assert from 'node:assert/strict'
import test from 'node:test'
import { safeRedirectPath } from '../../lib/auth/safe-redirect.ts'

test('preserves a normal same-origin relative path', () => {
  assert.equal(safeRedirectPath('/operations/clients'), '/operations/clients')
})

test('preserves a same-origin relative path with a query string', () => {
  assert.equal(safeRedirectPath('/operations/clients?status=Active'), '/operations/clients?status=Active')
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

test('falls back to /overview for a slash followed by an embedded tab (WHATWG URL smuggling)', () => {
  assert.equal(safeRedirectPath('/\t/evil.example'), '/overview')
})

test('falls back to /overview for a slash followed by an embedded newline (WHATWG URL smuggling)', () => {
  assert.equal(safeRedirectPath('/\n/evil.example'), '/overview')
})

test('falls back to /overview for a slash followed by an embedded carriage return (WHATWG URL smuggling)', () => {
  assert.equal(safeRedirectPath('/\r/evil.example'), '/overview')
})

test('falls back to /overview for a value containing an embedded NUL', () => {
  assert.equal(safeRedirectPath('/operations\0/clients'), '/overview')
})
