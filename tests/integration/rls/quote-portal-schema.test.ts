import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

// Quote portal, slice 1, task 1: the objects the link functions, the portal and the email build on. Nothing here
// has a function behind it yet, so the service role writes the fixtures and the signed-in roles are only asked
// what the privilege layer and the policies let them do.

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let memberA: U
let ownerB: U
let memberClient: SupabaseClient
let ownerBClient: SupabaseClient
let quoteB: string

const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const tokenHash = () => createHash('sha256').update(randomUUID()).digest('hex')
const inOneDay = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

// A sent quote never carries a DRAFT- reference, so a quote that is to take a status past Draft gets a real number.
const newQuote = async (organizationId: string) =>
  must(await admin.from('quotes').insert({ organization_id: organizationId, client_name: 'Portal Client', quote_number: `RLS-Q-${randomUUID().slice(0, 8)}` }).select('id').single()).id as string
const newLine = async (organizationId: string, quoteId: string) =>
  must(await admin.from('quote_lines').insert({ organization_id: organizationId, quote_id: quoteId, position: 1, title: 'Advisory', quantity: 1, unit_price: 100 }).select('id').single()).id as string
const newLink = async (organizationId: string, quoteId: string, overrides: Record<string, unknown> = {}) =>
  admin.from('quote_access_links').insert({ organization_id: organizationId, quote_id: quoteId, token_hash: tokenHash(), recipient_email: 'client@example.test', expires_at: inOneDay(), ...overrides }).select('id').single()

before(async () => {
  orgA = await createFixtureOrg('portal-schema-a')
  orgB = await createFixtureOrg('portal-schema-b')
  memberA = await createFixtureUser(orgA, 'member')
  ownerB = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(memberA.email, memberA.password)
  ownerBClient = await signedInClient(ownerB.email, ownerB.password)
  must(await admin.from('organization_settings').insert({ organization_id: orgA, legal_name: 'Portal Co', document_prefix: 'PRT', vat_rate: 15 }).select('id').single())
  quoteB = await newQuote(orgB)
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [memberA?.id, ownerB?.id].filter(Boolean))
})

test('Superseded is an accepted quote status and an unknown one is not', async () => {
  const quote = await newQuote(orgA)
  const accepted = await admin.from('quotes').update({ status: 'Superseded' }).eq('id', quote)
  assert.equal(accepted.error, null)
  assert.equal(must(await admin.from('quotes').select('status').eq('id', quote).single()).status, 'Superseded')

  const refused = await admin.from('quotes').update({ status: 'Bogus' }).eq('id', quote)
  assert.equal(refused.error?.code, '23514')
  assert.match(refused.error?.message ?? '', /quotes_status_check/)
  assert.equal(must(await admin.from('quotes').select('status').eq('id', quote).single()).status, 'Superseded', 'the refused change left the status alone')

  for (const status of ['Draft', 'Internal Review', 'Sent', 'Accepted', 'Declined', 'Expired']) {
    assert.equal((await admin.from('quotes').update({ status }).eq('id', quote)).error, null, `${status} is still accepted`)
  }
})

test('charge_kind accepts once_off, monthly and null and nothing else', async () => {
  const quote = await newQuote(orgA)
  const line = await newLine(orgA, quote)
  assert.equal(must(await admin.from('quote_lines').select('charge_kind').eq('id', line).single()).charge_kind, null, 'a line starts without a kind')
  for (const kind of ['once_off', 'monthly', null]) {
    assert.equal((await admin.from('quote_lines').update({ charge_kind: kind }).eq('id', line)).error, null, `${kind} is accepted`)
    assert.equal(must(await admin.from('quote_lines').select('charge_kind').eq('id', line).single()).charge_kind, kind)
  }
  for (const kind of ['weekly', 'Monthly', 'once-off', '']) {
    const refused = await admin.from('quote_lines').update({ charge_kind: kind }).eq('id', line)
    assert.equal(refused.error?.code, '23514', `${JSON.stringify(kind)} is refused`)
  }
})

test('quote_portal_enabled defaults to false and cannot be null', async () => {
  const settings = must(await admin.from('organization_settings').select('quote_portal_enabled').eq('organization_id', orgA).single())
  assert.equal(settings.quote_portal_enabled, false)
  const refused = await admin.from('organization_settings').update({ quote_portal_enabled: null }).eq('organization_id', orgA)
  assert.equal(refused.error?.code, '23502')
})

test("a member reads their organisation's links, never another's, and cannot write one", async () => {
  const quoteA = await newQuote(orgA)
  const link = must(await newLink(orgA, quoteA)).id as string

  const own = must(await memberClient.from('quote_access_links').select('id,quote_id,recipient_email').eq('id', link))
  assert.deepEqual(own, [{ id: link, quote_id: quoteA, recipient_email: 'client@example.test' }])
  const other = await ownerBClient.from('quote_access_links').select('id').eq('id', link)
  assert.equal(other.error, null)
  assert.deepEqual(other.data, [], 'another organisation sees nothing')

  const written = await memberClient.from('quote_access_links').insert({ organization_id: orgA, quote_id: quoteA, token_hash: tokenHash(), recipient_email: 'second@example.test', expires_at: inOneDay() })
  assert.ok(written.error, 'a member cannot insert a link')
  assert.equal(written.error.code, '42501')
  const changed = await memberClient.from('quote_access_links').update({ revoked_at: new Date().toISOString() }).eq('id', link).select('id')
  assert.ok(changed.error || changed.data?.length === 0, 'a member cannot update a link')
  const removed = await memberClient.from('quote_access_links').delete().eq('id', link).select('id')
  assert.ok(removed.error || removed.data?.length === 0, 'a member cannot delete a link')
  const ground = must(await admin.from('quote_access_links').select('revoked_at').eq('id', link).single())
  assert.equal(ground.revoked_at, null, 'the link is untouched')

  const anon = await anonymous.from('quote_access_links').select('id').limit(1)
  assert.match(anon.error?.message ?? '', /permission denied for table quote_access_links/)
})

test('a link needs a lower-case address with one @, a hash that is not already used, and is not tied to a quote of another organisation', async () => {
  const quoteA = await newQuote(orgA)
  for (const email of ['Client@Example.test', 'client.example.test', 'a@b@example.test']) {
    assert.equal((await newLink(orgA, quoteA, { recipient_email: email })).error?.code, '23514', `${email} is refused`)
  }
  const hash = tokenHash()
  must(await newLink(orgA, quoteA, { token_hash: hash }))
  assert.equal((await newLink(orgA, quoteA, { token_hash: hash })).error?.code, '23505', 'a hash is used once')
  assert.equal((await newLink(orgA, quoteB)).error?.code, '23503', 'the quote must belong to the same organisation')
  assert.equal((await newLink(orgA, quoteA, { recipient_name: null, created_by: null, revoked_at: null })).error, null, 'name, creator and revocation are optional')
  assert.equal((await newLink(orgA, quoteA, { expires_at: null })).error?.code, '23502', 'a link always expires')
})

test("supersedes_quote_id cannot point at another organisation's quote", async () => {
  const revision = await newQuote(orgA)
  const refused = await admin.from('quotes').update({ supersedes_quote_id: quoteB }).eq('id', revision)
  assert.equal(refused.error?.code, '23503')
  const original = await newQuote(orgA)
  assert.equal((await admin.from('quotes').update({ supersedes_quote_id: original }).eq('id', revision)).error, null, 'the same organisation is fine')
})

test('a quote cannot supersede itself, and deleting the original leaves the revision standing', async () => {
  const original = await newQuote(orgA)
  const revision = await newQuote(orgA)
  const self = await admin.from('quotes').update({ supersedes_quote_id: revision }).eq('id', revision)
  assert.equal(self.error?.code, '23514')

  assert.equal((await admin.from('quotes').update({ supersedes_quote_id: original }).eq('id', revision)).error, null)
  assert.equal((await admin.from('quotes').delete().eq('id', original)).error, null)
  const left = must(await admin.from('quotes').select('organization_id,supersedes_quote_id').eq('id', revision).single())
  assert.equal(left.supersedes_quote_id, null)
  assert.equal(left.organization_id, orgA, 'only the pointer was cleared, not the organisation')
})

test('deleting a quote deletes its links', async () => {
  const keep = await newQuote(orgA)
  const gone = await newQuote(orgA)
  const kept = must(await newLink(orgA, keep)).id as string
  const first = must(await newLink(orgA, gone)).id as string
  const second = must(await newLink(orgA, gone)).id as string
  assert.equal((await admin.from('quotes').delete().eq('id', gone)).error, null)
  const remaining = must(await admin.from('quote_access_links').select('id').in('id', [kept, first, second]))
  assert.deepEqual(remaining.map((row) => row.id), [kept])
})
