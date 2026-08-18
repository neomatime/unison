import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import test, { after, before } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { admin, cleanup, createFixtureOrg } from './helpers.ts'

// invitation_preview is the ONLY database function an unauthenticated caller
// may invoke, so what it does and does not reveal is worth pinning down.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

/** A client with no session at all — exactly what an invitee has. */
const anonymous = createClient(url, publishable, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function hash(rawToken: string): string {
  return '\\x' + createHash('sha256').update(rawToken).digest('hex')
}

let org: string
const tokens: Record<string, string> = {}

async function seedInvitation(key: string, overrides: Record<string, unknown> = {}) {
  const rawToken = randomBytes(32).toString('base64url')
  tokens[key] = rawToken
  const { error } = await admin.from('invitations').insert({
    organization_id: org,
    email: `preview-${key}-${randomUUID().slice(0, 8)}@unison.test`,
    role_id: 'member',
    token_hash: hash(rawToken),
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    ...overrides,
  })
  if (error) throw error
}

before(async () => {
  org = await createFixtureOrg('Preview')
  await seedInvitation('pending')
  await seedInvitation('expired', { expires_at: new Date(Date.now() - 86_400_000).toISOString() })
  await seedInvitation('revoked', { status: 'revoked' })
  await seedInvitation('accepted', { status: 'accepted', accepted_at: new Date().toISOString() })
})

after(async () => { await cleanup([org], []) })

test('an anonymous caller can resolve a pending invitation', async () => {
  const { data, error } = await anonymous.rpc('invitation_preview', { raw_token: tokens.pending })
  assert.equal(error, null)
  assert.equal(data?.length, 1)
  assert.match(data![0].email, /^preview-pending-/)
  assert.ok(data![0].organization_name.startsWith('RLS Preview'))
})

test('it returns only the address and organization name, nothing else', async () => {
  // If this ever grows a field, that is a deliberate decision about what an
  // unauthenticated stranger holding a token may learn — not an accident.
  const { data } = await anonymous.rpc('invitation_preview', { raw_token: tokens.pending })
  assert.deepEqual(Object.keys(data![0]).sort(), ['email', 'organization_name'])
})

for (const state of ['expired', 'revoked', 'accepted'] as const) {
  test(`a ${state} invitation resolves to nothing`, async () => {
    const { data, error } = await anonymous.rpc('invitation_preview', { raw_token: tokens[state] })
    assert.equal(error, null)
    assert.deepEqual(data, [])
  })
}

test('an unknown token resolves to nothing, indistinguishably', async () => {
  // Same empty answer as expired/revoked/accepted above: the four cases must
  // not be tellable apart, or the endpoint becomes an oracle.
  const { data, error } = await anonymous.rpc('invitation_preview', {
    raw_token: randomBytes(32).toString('base64url'),
  })
  assert.equal(error, null)
  assert.deepEqual(data, [])
})

test('it exposes no invitation for a suspended organization', async () => {
  const suspended = await createFixtureOrg('Suspended')
  const rawToken = randomBytes(32).toString('base64url')
  await admin.from('invitations').insert({
    organization_id: suspended,
    email: `preview-suspended-${randomUUID().slice(0, 8)}@unison.test`,
    role_id: 'member',
    token_hash: hash(rawToken),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  })
  await admin.from('organizations').update({ status: 'suspended' }).eq('id', suspended)

  const { data } = await anonymous.rpc('invitation_preview', { raw_token: rawToken })
  assert.deepEqual(data, [], 'a suspended organization must not be joinable')

  await cleanup([suspended], [])
})

test('an anonymous caller still cannot read the invitations table directly', async () => {
  // The function is a deliberate narrow hole; the table itself stays shut.
  const { data } = await anonymous.from('invitations').select('email, token_hash')
  assert.deepEqual(data ?? [], [])
})
