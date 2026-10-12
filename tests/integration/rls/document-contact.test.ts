import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let org: string
let member: U
let memberClient: SupabaseClient

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}

let counter = 0
async function draft(kind: 'quote' | 'invoice', extra: Record<string, unknown> = {}): Promise<string> {
  counter += 1
  const table = kind === 'quote' ? 'quotes' : 'invoices'
  return must(await admin.from(table).insert({ organization_id: org, client_name: `Contact Client ${counter}`, status: 'Draft', ...extra }).select('id').single()).id
}
/** Closes a document the way the send/issue flow would: a real number first, because a draft reference may only live on a draft. */
async function close(kind: 'quote' | 'invoice', id: string) {
  counter += 1
  const patch = kind === 'quote'
    ? { quote_number: `T-Q-${Date.now()}-${counter}`, status: 'Declined' }
    : { invoice_number: `T-I-${Date.now()}-${counter}`, status: 'Cancelled' }
  assert.equal((await admin.from(kind === 'quote' ? 'quotes' : 'invoices').update(patch).eq('id', id)).error, null)
}
const setContact = (kind: 'quote' | 'invoice', id: string, name: string | null, db: SupabaseClient = memberClient) =>
  db.from(kind === 'quote' ? 'quotes' : 'invoices').update({ contact_name: name }).eq('id', id)
const contactOf = async (kind: 'quote' | 'invoice', id: string) =>
  (must(await admin.from(kind === 'quote' ? 'quotes' : 'invoices').select('contact_name').eq('id', id).single()) as { contact_name: string | null }).contact_name

before(async () => {
  org = await createFixtureOrg('contact')
  member = await createFixtureUser(org, 'member')
  memberClient = await signedInClient(member.email, member.password)
})

after(async () => {
  await cleanup([org].filter(Boolean), [member?.id].filter(Boolean))
})

for (const kind of ['quote', 'invoice'] as const) {
  test(`a draft ${kind} takes and changes its contact`, async () => {
    const id = await draft(kind)
    assert.equal((await setContact(kind, id, 'Thandi Dlamini')).error, null)
    assert.equal(await contactOf(kind, id), 'Thandi Dlamini')
    assert.equal((await setContact(kind, id, 'Sipho Nkosi')).error, null)
    assert.equal(await contactOf(kind, id), 'Sipho Nkosi')
  })

  test(`a ${kind} that has gone out keeps its contact; a signed-in role cannot change it`, async () => {
    const id = await draft(kind, { contact_name: 'Thandi Dlamini' })
    await close(kind, id)
    const refused = await setContact(kind, id, 'Someone Else')
    assert.ok(refused.error, 'the change is refused')
    assert.match(refused.error.message, kind === 'quote' ? /QUOTE_FROZEN/ : /INVOICE_FROZEN/)
    assert.equal(await contactOf(kind, id), 'Thandi Dlamini')
    assert.equal((await setContact(kind, id, 'Thandi Dlamini')).error, null, 'writing the same value back is not a change')
    assert.equal((await setContact(kind, id, 'Admin Fix', admin)).error, null, 'the service role is not a signed-in role')
  })
}

test('an invoice contact over 200 characters is refused', async () => {
  const id = await draft('invoice')
  const result = await setContact('invoice', id, 'x'.repeat(201))
  assert.ok(result.error)
  assert.equal(await contactOf('invoice', id), null)
})

test('an invoice made from a quote takes the quote contact when it has none, and keeps its own when it has one', async () => {
  const quoteId = await draft('quote', { contact_name: 'Thandi Dlamini' })
  const inherits = await draft('invoice', { quote_id: quoteId })
  assert.equal(await contactOf('invoice', inherits), 'Thandi Dlamini')
  const own = await draft('invoice', { quote_id: quoteId, contact_name: 'Sipho Nkosi' })
  assert.equal(await contactOf('invoice', own), 'Sipho Nkosi')
  const blank = await draft('invoice', { quote_id: quoteId, contact_name: '   ' })
  assert.equal(await contactOf('invoice', blank), 'Thandi Dlamini', 'a blank contact counts as none')
  const noQuote = await draft('invoice')
  assert.equal(await contactOf('invoice', noQuote), null)
})
