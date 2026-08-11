import assert from 'node:assert/strict'
import test from 'node:test'

function organizationStoragePrefix(organizationId: string) {
  return `organizations/${organizationId}/`
}

test('storage prefixes are unique per organization', () => {
  assert.notEqual(organizationStoragePrefix('himark'), organizationStoragePrefix('other'))
})

