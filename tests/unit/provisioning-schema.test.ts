import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveSlug, provisioningInputSchema } from '../../features/internal-provisioning/schemas/provisioning.ts'

test('a name and an admin email are required', () => {
  assert.equal(provisioningInputSchema.safeParse({ name: '', adminEmail: 'a@b.com' }).success, false)
  assert.equal(provisioningInputSchema.safeParse({ name: 'Acme' }).success, false)
})

test('the admin email must look like an address', () => {
  assert.equal(provisioningInputSchema.safeParse({ name: 'Acme', adminEmail: 'not-an-email' }).success, false)
})

test('a slug is derived from the name when none is given', () => {
  assert.equal(deriveSlug('Acme Holdings'), 'acme-holdings')
  assert.equal(deriveSlug('  Acme   Holdings  '), 'acme-holdings')
})

test('slug derivation strips characters that cannot appear in a URL', () => {
  assert.equal(deriveSlug('Acme & Co. (Pty) Ltd'), 'acme-co-pty-ltd')
  assert.equal(deriveSlug('Café Ürban'), 'caf-rban')
})

test('a name with no usable characters is rejected rather than producing an empty slug', () => {
  // An empty slug would collide with any other empty slug on the unique index,
  // and produce a URL segment that resolves to nothing.
  assert.equal(provisioningInputSchema.safeParse({ name: '???', adminEmail: 'a@b.com' }).success, false)
})

test('an explicit slug is normalised, not trusted', () => {
  const parsed = provisioningInputSchema.parse({ name: 'Acme', adminEmail: 'a@b.com', slug: 'Acme Holdings!' })
  assert.equal(parsed.slug, 'acme-holdings')
})
