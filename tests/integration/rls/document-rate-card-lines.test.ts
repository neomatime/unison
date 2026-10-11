import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'
import { seedRateCard } from './rate-card-fixture.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let member: U
let outsider: U
let memberClient: SupabaseClient
let outsiderClient: SupabaseClient

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const refused = (error: { message: string } | null, token: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
}

let counter = 0
async function draft(kind: 'quote' | 'invoice', org = orgA): Promise<string> {
  counter += 1
  const table = kind === 'quote' ? 'quotes' : 'invoices'
  return must(await admin.from(table).insert({ organization_id: org, client_name: `Pick Client ${counter}`, status: 'Draft' }).select('id').single()).id
}
const linesOf = async (kind: 'quote' | 'invoice', id: string) =>
  must(await admin.from(kind === 'quote' ? 'quote_lines' : 'invoice_lines').select('*').eq(kind === 'quote' ? 'quote_id' : 'invoice_id', id).order('position')) as Record<string, any>[]
const totalsOf = async (kind: 'quote' | 'invoice', id: string) =>
  must(await admin.from(kind === 'quote' ? 'quotes' : 'invoices').select('subtotal, tax_amount, total_amount').eq('id', id).single()) as Record<string, any>
const fill = (kind: 'quote' | 'invoice', id: string, key: string, db: SupabaseClient = memberClient) =>
  db.rpc('fill_document_from_package', { p_kind: kind, p_document: id, p_package_key: key })
const addLine = (kind: 'quote' | 'invoice', id: string, key: string, quantity: unknown = 1, db: SupabaseClient = memberClient) =>
  db.rpc('add_rate_card_line', { p_kind: kind, p_document: id, p_rate_key: key, p_quantity: quantity })
/** Closes a document the way the send/issue flow would: a real number first, because a draft reference may only live on a draft. */
let numberSeed = 0
async function close(kind: 'quote' | 'invoice', id: string) {
  numberSeed += 1
  const patch = kind === 'quote'
    ? { quote_number: `T-Q-${Date.now()}-${numberSeed}`, status: 'Declined' }
    : { invoice_number: `T-I-${Date.now()}-${numberSeed}`, status: 'Cancelled' }
  assert.equal((await admin.from(kind === 'quote' ? 'quotes' : 'invoices').update(patch).eq('id', id)).error, null)
}

before(async () => {
  orgA = await createFixtureOrg('pick-a')
  orgB = await createFixtureOrg('pick-b')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  await seedRateCard(orgA)
  await seedRateCard(orgB)
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [member?.id, outsider?.id].filter(Boolean))
})

test('a retainer tier fills a new quote with the monthly fee and the implementation fee, locked, at the rate card prices', async () => {
  for (const [tier, subtotal] of [['signature', 200000], ['growth', 300000], ['private', 400000], ['reserve', 600000]] as const) {
    const id = await draft('quote')
    assert.equal((await fill('quote', id, tier)).error, null, tier)
    const lines = await linesOf('quote', id)
    assert.equal(lines.length, 2)
    assert.match(lines[0].title, /monthly retainer/)
    assert.match(lines[1].title, /one-time implementation/)
    assert.deepEqual(lines.map((l) => l.rate_locked), [true, true])
    assert.ok(lines.every((l) => Number(l.quantity) === 1 && l.price_list_item_id))
    const totals = await totalsOf('quote', id)
    assert.equal(Number(totals.subtotal), subtotal, `${tier} subtotal`)
    assert.equal(Number(totals.total_amount), Math.round(subtotal * 115) / 100, `${tier} total including VAT`)
  }
})

test('a project fills a new invoice with its fee only, with its credits in the line text', async () => {
  const id = await draft('invoice')
  assert.equal((await fill('invoice', id, 'operating_model')).error, null)
  const lines = await linesOf('invoice', id)
  assert.equal(lines.length, 1)
  assert.match(lines[0].description, /40 implementation credits/)
  assert.equal(Number((await totalsOf('invoice', id)).total_amount), 138000)
})

test('filling is refused for a document that has lines, an unknown package, a document that is not a draft, and another organisation', async () => {
  const id = await draft('quote')
  assert.equal((await fill('quote', id, 'growth')).error, null)
  refused((await fill('quote', id, 'growth')).error, 'DOCUMENT_NOT_EMPTY')

  const fresh = await draft('quote')
  refused((await fill('quote', fresh, 'platinum')).error, 'PACKAGE_UNKNOWN')
  refused((await fill('quote', fresh, 'support.website_care')).error, 'PACKAGE_UNKNOWN')
  refused((await fill('quote', fresh, 'project.top_up')).error, 'PACKAGE_UNKNOWN')
  refused((await fill('quote', fresh, 'growth', outsiderClient)).error, 'QUOTE_NOT_FOUND')
  refused((await fill('quote' as any, '00000000-0000-0000-0000-000000000000', 'growth')).error, 'QUOTE_NOT_FOUND')
  refused((await memberClient.rpc('fill_document_from_package', { p_kind: 'expense', p_document: fresh, p_package_key: 'growth' })).error, 'DOCUMENT_KIND_UNKNOWN')

  await close('quote', fresh)
  refused((await fill('quote', fresh, 'growth')).error, 'QUOTE_NOT_DRAFT')
  const invoice = await draft('invoice')
  await close('invoice', invoice)
  refused((await fill('invoice', invoice, 'growth')).error, 'INVOICE_NOT_DRAFT')
  assert.equal((await linesOf('invoice', invoice)).length, 0)
  const other = await draft('invoice')
  refused((await fill('invoice', other, 'growth', outsiderClient)).error, 'INVOICE_NOT_FOUND')
})

test('a rate card item is added at its fixed price, locked, in order, and top-up credits take a whole quantity', async () => {
  const id = await draft('quote')
  assert.equal((await fill('quote', id, 'growth')).error, null)
  assert.equal((await addLine('quote', id, 'support.operations_improvement')).error, null)
  assert.equal((await addLine('quote', id, 'retainer.signature.top_up', 15)).error, null)
  const lines = await linesOf('quote', id)
  assert.deepEqual(lines.map((l) => l.position), [1, 2, 3, 4])
  assert.equal(Number(lines[2].unit_price), 35000)
  assert.equal(Number(lines[3].quantity), 15)
  assert.equal(Number(lines[3].unit_price), 2500)
  assert.ok(lines.every((l) => l.rate_locked === true))
  assert.match(lines[3].description, /Proposed rate, not yet agreed\./)
  // 150000 + 150000 + 35000 + 15 x 2500 = 372500; plus 15% VAT
  assert.equal(Number((await totalsOf('quote', id)).total_amount), 428375)
})

test('rate card quantities and keys are checked, and a draft invoice takes lines too', async () => {
  const id = await draft('invoice')
  for (const bad of [0, -1, 1.5, 10001, null]) refused((await addLine('invoice', id, 'project.top_up', bad)).error, 'RATE_QUANTITY_INVALID')
  for (const bad of [2, 0, 0.5, null]) refused((await addLine('invoice', id, 'support.website_care', bad)).error, 'RATE_QUANTITY_INVALID')
  refused((await addLine('invoice', id, 'nonsense')).error, 'RATE_ITEM_UNAVAILABLE')
  refused((await addLine('invoice', id, 'retainer.growth.monthly', 1, outsiderClient)).error, 'INVOICE_NOT_FOUND')
  assert.equal((await addLine('invoice', id, 'project.top_up', 10000)).error, null)
  assert.equal((await linesOf('invoice', id)).length, 1)

  const archived = must(await admin.from('price_list_items').select('id').eq('organization_id', orgA).eq('rate_key', 'support.podcast_content').single())
  assert.equal((await admin.from('price_list_items').update({ archived_at: new Date().toISOString() }).eq('id', archived.id)).error, null)
  try {
    refused((await addLine('invoice', id, 'support.podcast_content')).error, 'RATE_ITEM_UNAVAILABLE')
  } finally {
    await admin.from('price_list_items').update({ archived_at: null }).eq('id', archived.id)
  }

  await close('invoice', id)
  refused((await addLine('invoice', id, 'support.website_care')).error, 'INVOICE_NOT_DRAFT')
  const quote = await draft('quote')
  await close('quote', quote)
  refused((await addLine('quote', quote, 'support.website_care')).error, 'QUOTE_NOT_DRAFT')
  refused((await memberClient.rpc('add_rate_card_line', { p_kind: 'expense', p_document: quote, p_rate_key: 'support.website_care', p_quantity: 1 })).error, 'DOCUMENT_KIND_UNKNOWN')
})

test('lines added from the rate card cannot be edited by a member, can be removed on a draft, and custom lines still work', async () => {
  const id = await draft('quote')
  assert.equal((await fill('quote', id, 'signature')).error, null)
  const lines = await linesOf('quote', id)
  refused((await memberClient.from('quote_lines').update({ unit_price: 1 }).eq('id', lines[0].id).select('id')).error, 'RATE_LINE_LOCKED')
  refused((await memberClient.from('quote_lines').update({ quantity: 3 }).eq('id', lines[1].id).select('id')).error, 'RATE_LINE_LOCKED')
  const removed = await memberClient.from('quote_lines').delete().eq('id', lines[1].id).select('id')
  assert.equal(removed.error, null)
  assert.equal(removed.data!.length, 1)
  const custom = await memberClient.from('quote_lines').insert({ organization_id: orgA, quote_id: id, position: 5, title: 'Custom workshop', quantity: 2, unit_price: 1500 }).select('id').single()
  assert.equal(custom.error, null)
  assert.equal((await addLine('quote', id, 'support.website_care')).error, null, 'adding from the rate card still works after other edits')
})

test('the rate card is in rand: a document in another currency is refused until it is set to ZAR', async () => {
  const id = must(await admin.from('quotes').insert({ organization_id: orgA, client_name: 'Dollar Client', currency: 'USD', status: 'Draft' }).select('id').single()).id
  refused((await fill('quote', id, 'growth')).error, 'RATE_CARD_CURRENCY')
  refused((await addLine('quote', id, 'support.website_care')).error, 'RATE_CARD_CURRENCY')
  assert.equal((await linesOf('quote', id)).length, 0)
  assert.equal((await admin.from('quotes').update({ currency: 'ZAR' }).eq('id', id)).error, null)
  assert.equal((await fill('quote', id, 'growth')).error, null)
  assert.equal((await linesOf('quote', id)).length, 2)
})

test('a quote in Internal Review can still be filled', async () => {
  const id = await draft('quote')
  assert.equal((await admin.from('quotes').update({ status: 'Internal Review' }).eq('id', id)).error, null)
  assert.equal((await fill('quote', id, 'private')).error, null)
  assert.equal((await linesOf('quote', id)).length, 2)
})
