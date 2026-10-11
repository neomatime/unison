import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'
import { seedRateCard } from './rate-card-fixture.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let owner: U
let member: U
let outsider: U
let ownerClient: SupabaseClient
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
const rateItem = async (key: string) => must(await admin.from('price_list_items').select('*').eq('organization_id', orgA).eq('rate_key', key).single()) as Record<string, any>

before(async () => {
  orgA = await createFixtureOrg('rate-a')
  orgB = await createFixtureOrg('rate-b')
  owner = await createFixtureUser(orgA, 'owner')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  ownerClient = await signedInClient(owner.email, owner.password)
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  await seedRateCard(orgA)
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [owner?.id, member?.id, outsider?.id].filter(Boolean))
})

test('the rate card is readable by members of the organisation and nobody else', async () => {
  const mine = must(await memberClient.from('price_list_items').select('rate_key').eq('organization_id', orgA).not('rate_key', 'is', null))
  assert.equal(mine.length, 28)
  const theirs = must(await outsiderClient.from('price_list_items').select('id').eq('organization_id', orgA))
  assert.equal(theirs.length, 0)
})

test('a signed-in user cannot create a rate card row, and a custom item stays free for members', async () => {
  const hand = await memberClient.from('price_list_items').insert({ organization_id: orgA, title: 'Fake', unit_price: 1, rate_key: 'retainer.fake.monthly', item_kind: 'project', rate_status: 'agreed' })
  refused(hand.error, 'RATE_CARD_FIXED')
  const credit = await ownerClient.from('price_list_items').insert({ organization_id: orgA, title: 'Fake', unit_price: 1, credits: 5 })
  refused(credit.error, 'RATE_CARD_FIXED')
  const custom = await memberClient.from('price_list_items').insert({ organization_id: orgA, title: 'Custom workshop', unit_price: 1234.5 }).select('id').single()
  assert.equal(custom.error, null)
  const edited = await memberClient.from('price_list_items').update({ unit_price: 2000 }).eq('id', custom.data!.id).select('unit_price').single()
  assert.equal(edited.error, null)
  assert.equal(Number(edited.data!.unit_price), 2000)
})

test('only an owner or admin can change a rate card price, and not the item\'s identity', async () => {
  const growth = await rateItem('retainer.growth.monthly')
  const byMember = await memberClient.from('price_list_items').update({ unit_price: 1 }).eq('id', growth.id).select('id')
  refused(byMember.error, 'RATE_CARD_ADMIN_ONLY')
  const archiveByMember = await memberClient.from('price_list_items').update({ archived_at: new Date().toISOString() }).eq('id', growth.id).select('id')
  refused(archiveByMember.error, 'RATE_CARD_ADMIN_ONLY')
  const byOwner = await ownerClient.from('price_list_items').update({ unit_price: 150001 }).eq('id', growth.id).select('unit_price').single()
  assert.equal(byOwner.error, null)
  assert.equal(Number(byOwner.data!.unit_price), 150001)
  assert.equal((await ownerClient.from('price_list_items').update({ unit_price: 150000 }).eq('id', growth.id)).error, null)
  // Each change differs from the stored value (the growth monthly item is 'agreed'), so each is a change of identity.
  for (const change of [{ rate_key: 'x' }, { item_kind: 'support' }, { package_key: 'signature' }, { credits: 1 }, { rate_status: 'proposed' }]) {
    const identity = await ownerClient.from('price_list_items').update(change).eq('id', growth.id).select('id')
    refused(identity.error, 'RATE_CARD_FIXED')
  }
})

test('the initiative limit can be changed by an owner or admin, only on a retainer monthly item, and never by a member', async () => {
  const reserve = await rateItem('retainer.reserve.monthly')
  assert.equal(reserve.initiative_limit, null)
  refused((await memberClient.from('price_list_items').update({ initiative_limit: 3 }).eq('id', reserve.id).select('id')).error, 'RATE_CARD_ADMIN_ONLY')
  const set = await ownerClient.from('price_list_items').update({ initiative_limit: 8 }).eq('id', reserve.id).select('initiative_limit').single()
  assert.equal(set.error, null)
  assert.equal(set.data!.initiative_limit, 8)
  const cleared = await ownerClient.from('price_list_items').update({ initiative_limit: null }).eq('id', reserve.id).select('initiative_limit').single()
  assert.equal(cleared.error, null)
  const onProject = await rateItem('project.digital_presence')
  assert.ok((await ownerClient.from('price_list_items').update({ initiative_limit: 2 }).eq('id', onProject.id)).error, 'a limit only belongs on a retainer monthly item')
  assert.ok((await ownerClient.from('price_list_items').update({ initiative_limit: 0 }).eq('id', reserve.id)).error, 'a limit is positive')
  const custom = must(await admin.from('price_list_items').insert({ organization_id: orgA, title: 'Custom 2', unit_price: 1 }).select('id').single())
  refused((await ownerClient.from('price_list_items').update({ initiative_limit: 2 }).eq('id', custom.id).select('id')).error, 'RATE_CARD_FIXED')
})

test('a locked line cannot be edited, hand-made or unlocked by a signed-in user, but can be moved and removed while the document is a draft', async () => {
  const item = await rateItem('retainer.signature.monthly')
  const invoice = must(await admin.from('invoices').insert({ organization_id: orgA, client_name: 'Lock Client', status: 'Draft' }).select('id').single())
  const lock = must(await admin.from('invoice_lines').insert({
    organization_id: orgA, invoice_id: invoice.id, position: 1, title: item.title, description: item.description,
    quantity: 1, unit_price: 100000, vat_code: 'standard', price_list_item_id: item.id, rate_locked: true,
  }).select('id').single())
  const second = must(await admin.from('invoice_lines').insert({
    organization_id: orgA, invoice_id: invoice.id, position: 2, title: 'Extra', quantity: 1, unit_price: 5, vat_code: 'standard',
  }).select('id').single())

  for (const change of [{ unit_price: 1 }, { quantity: 2 }, { title: 'Cheaper' }, { description: 'x' }, { vat_code: 'zero' }, { price_list_item_id: null }]) {
    refused((await memberClient.from('invoice_lines').update(change).eq('id', lock.id).select('id')).error, 'RATE_LINE_LOCKED')
  }
  refused((await memberClient.from('invoice_lines').update({ rate_locked: false }).eq('id', lock.id).select('id')).error, 'RATE_LINE_LOCKED')
  refused((await memberClient.from('invoice_lines').update({ rate_locked: true }).eq('id', second.id).select('id')).error, 'RATE_LINE_LOCKED')
  const byHand = await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 3, title: 'Hand made', quantity: 1, unit_price: 1, rate_locked: true })
  refused(byHand.error, 'RATE_LINE_LOCKED')

  const moved = await memberClient.from('invoice_lines').update({ position: 5 }).eq('id', lock.id).select('position').single()
  assert.equal(moved.error, null)
  assert.equal(moved.data!.position, 5)
  const plain = await memberClient.from('invoice_lines').update({ unit_price: 6 }).eq('id', second.id).select('unit_price').single()
  assert.equal(plain.error, null)
  const removed = await memberClient.from('invoice_lines').delete().eq('id', lock.id).select('id')
  assert.equal(removed.error, null)
  assert.equal(removed.data!.length, 1)
})

test('the same lock holds on quote lines', async () => {
  const item = await rateItem('project.digital_presence')
  const quote = must(await admin.from('quotes').insert({ organization_id: orgA, client_name: 'Lock Client', status: 'Draft' }).select('id').single())
  const lock = must(await admin.from('quote_lines').insert({
    organization_id: orgA, quote_id: quote.id, position: 1, title: item.title, quantity: 1, unit_price: 45000, vat_code: 'standard', price_list_item_id: item.id, rate_locked: true,
  }).select('id').single())
  refused((await memberClient.from('quote_lines').update({ unit_price: 1 }).eq('id', lock.id).select('id')).error, 'RATE_LINE_LOCKED')
  refused((await memberClient.from('quote_lines').insert({ organization_id: orgA, quote_id: quote.id, position: 2, title: 'x', quantity: 1, unit_price: 1, rate_locked: true })).error, 'RATE_LINE_LOCKED')
})
