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
const iso = (date: Date) => date.toISOString().slice(0, 10)
const day = (offset = 0) => iso(new Date(Date.now() + offset * 86_400_000))
const monthStart = (date: string) => `${date.slice(0, 8)}01`
/** The first day of the month `offset` months from this one (UTC; the tests use explicit months so the clock does not matter). */
const monthOffset = (offset: number) => {
  const now = new Date()
  return iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)))
}
const monthEnd = (start: string) => iso(new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0)))

let counter = 0
async function newClient(org = orgA): Promise<string> {
  counter += 1
  return must(await admin.from('clients').insert({ organization_id: org, name: `Bill Client ${counter}`, status: 'Active' }).select('id').single()).id
}
async function packageFor(client: string, key: string, start: string = day()): Promise<string> {
  const result = await memberClient.rpc('set_client_package', { p_client: client, p_package_key: key, p_start_date: start })
  assert.equal(result.error, null, `package ${key}`)
  return result.data as string
}
const firstDoc = (engagement: string, kind: 'invoice' | 'quote' = 'invoice', db: SupabaseClient = memberClient) => db.rpc('create_first_document', { p_engagement: engagement, p_kind: kind })
const monthly = (client: string, month: string | null, db: SupabaseClient = memberClient) => db.rpc('create_monthly_invoice', { p_client: client, p_month: month })
const topUp = (engagement: string, credits: unknown, db: SupabaseClient = memberClient) => db.rpc('create_top_up_invoice', { p_engagement: engagement, p_credits: credits })
const invoice = async (id: string) => must(await admin.from('invoices').select('*').eq('id', id).single()) as Record<string, any>
const quote = async (id: string) => must(await admin.from('quotes').select('*').eq('id', id).single()) as Record<string, any>
const lines = async (table: 'invoice_lines' | 'quote_lines', column: 'invoice_id' | 'quote_id', id: string) =>
  must(await admin.from(table).select('*').eq(column, id).order('position')) as Record<string, any>[]
const invoiceLines = (id: string) => lines('invoice_lines', 'invoice_id', id)
let numberSeed = 0
/** Marks a draft as cancelled the way the issue flow would: a real number first, because a draft reference may only live on a draft. */
async function cancel(id: string) {
  numberSeed += 1
  const { error } = await admin.from('invoices').update({ invoice_number: `T-I-${Date.now()}-${numberSeed}`, status: 'Cancelled' }).eq('id', id)
  assert.equal(error, null)
}

before(async () => {
  orgA = await createFixtureOrg('bill-a')
  orgB = await createFixtureOrg('bill-b')
  owner = await createFixtureUser(orgA, 'owner')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  ownerClient = await signedInClient(owner.email, owner.password)
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  await seedRateCard(orgA)
  await seedRateCard(orgB)
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [owner?.id, member?.id, outsider?.id].filter(Boolean))
})

test('a retainer\'s first invoice has the monthly fee and the implementation fee, locked, and adds up to the workbook amount', async () => {
  for (const [tier, total] of [['signature', 230000], ['growth', 345000], ['private', 460000], ['reserve', 690000]] as const) {
    const client = await newClient()
    const engagementId = await packageFor(client, tier)
    const built = await firstDoc(engagementId)
    assert.equal(built.error, null, tier)
    const row = await invoice(built.data as string)
    assert.equal(row.status, 'Draft')
    assert.equal(row.billing_kind, 'first')
    assert.equal(row.engagement_id, engagementId)
    assert.equal(row.client_id, client)
    assert.equal(Number(row.total_amount), total, `${tier} first invoice including VAT`)
    assert.equal(Number(row.balance_amount), total)
    const built_lines = await invoiceLines(row.id)
    assert.equal(built_lines.length, 2)
    assert.deepEqual(built_lines.map((l) => l.rate_locked), [true, true])
    assert.match(built_lines[0].title, /monthly retainer/)
    assert.match(built_lines[1].title, /one-time implementation/)
    assert.ok(built_lines.every((l) => Number(l.quantity) === 1 && l.price_list_item_id))
    const timeline = must(await admin.from('activities').select('subject').eq('client_id', client).eq('kind', 'billing.document_built'))
    assert.equal(timeline.length, 1)
  }
})

test('a project\'s first invoice is its fee only, with its credits in the line text', async () => {
  const client = await newClient()
  const built = await firstDoc(await packageFor(client, 'operating_model'))
  assert.equal(built.error, null)
  const row = await invoice(built.data as string)
  assert.equal(Number(row.total_amount), 138000)
  const l = await invoiceLines(row.id)
  assert.equal(l.length, 1)
  assert.match(l[0].description, /40 implementation credits/)
})

test('a second first invoice is refused, a cancelled one frees the slot, and two simultaneous presses leave exactly one', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'growth')
  const first = await firstDoc(engagementId)
  assert.equal(first.error, null)
  refused((await firstDoc(engagementId)).error, 'FIRST_INVOICE_EXISTS')
  await cancel(first.data as string)
  const again = await firstDoc(engagementId)
  assert.equal(again.error, null)

  const other = await newClient()
  const otherEngagement = await packageFor(other, 'signature')
  const results = await Promise.all([firstDoc(otherEngagement), firstDoc(otherEngagement, 'invoice', ownerClient)])
  assert.equal(results.filter((r) => r.error === null).length, 1)
  refused(results.find((r) => r.error)!.error, 'FIRST_INVOICE_EXISTS')
  assert.equal(must(await admin.from('invoices').select('id').eq('engagement_id', otherEngagement).eq('billing_kind', 'first')).length, 1)
})

test('a first quote can be built any number of times; converting an accepted one carries the lock and the link and takes the slot', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'private')
  const q1 = await firstDoc(engagementId, 'quote')
  const q2 = await firstDoc(engagementId, 'quote')
  assert.equal(q1.error, null)
  assert.equal(q2.error, null)
  const qrow = await quote(q1.data as string)
  assert.equal(qrow.billing_kind, 'first')
  assert.equal(qrow.engagement_id, engagementId)
  assert.equal(Number(qrow.total_amount), 460000)
  const ql = await lines('quote_lines', 'quote_id', qrow.id)
  assert.deepEqual(ql.map((l) => l.rate_locked), [true, true])

  numberSeed += 1
  assert.equal((await admin.from('quotes').update({ quote_number: `T-Q-${Date.now()}-${numberSeed}`, status: 'Accepted' }).eq('id', q1.data as string)).error, null)
  numberSeed += 1
  assert.equal((await admin.from('quotes').update({ quote_number: `T-Q-${Date.now()}-${numberSeed}`, status: 'Accepted' }).eq('id', q2.data as string)).error, null)
  const converted = await memberClient.rpc('create_invoice_from_quote', { p_quote_id: q1.data as string })
  assert.equal(converted.error, null)
  const inv = await invoice(converted.data as string)
  assert.equal(inv.engagement_id, engagementId)
  assert.equal(inv.billing_kind, 'first')
  assert.deepEqual((await invoiceLines(inv.id)).map((l) => l.rate_locked), [true, true])
  refused((await memberClient.rpc('create_invoice_from_quote', { p_quote_id: q2.data as string })).error, 'FIRST_INVOICE_EXISTS')
  refused((await firstDoc(engagementId)).error, 'FIRST_INVOICE_EXISTS')
})

test('duplicating a locked quote keeps the lock and the link', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'growth')
  const q = await firstDoc(engagementId, 'quote')
  const copy = await memberClient.rpc('duplicate_quote', { p_id: q.data as string })
  assert.equal(copy.error, null)
  const row = await quote(copy.data as string)
  assert.equal(row.engagement_id, engagementId)
  assert.equal(row.billing_kind, 'first')
  assert.deepEqual((await lines('quote_lines', 'quote_id', row.id)).map((l) => l.rate_locked), [true, true])
  refused((await outsiderClient.rpc('duplicate_quote', { p_id: q.data as string })).error, 'QUOTE_NOT_FOUND')
})

test('a retainer that replaced an earlier tier is never billed an implementation fee, but the chain can be billed monthly', async () => {
  const client = await newClient()
  const original = await packageFor(client, 'growth', day(-100))
  assert.equal((await firstDoc(original)).error, null)
  const changed = await memberClient.rpc('change_retainer_tier', { p_engagement: original, p_new_package_key: 'private', p_start_date: day(-5) })
  assert.equal(changed.error, null)
  refused((await firstDoc(changed.data as string)).error, 'IMPLEMENTATION_ALREADY_BILLED')
  const month = monthOffset(0)
  const built = await monthly(client, month)
  assert.equal(built.error, null)
  const row = await invoice(built.data as string)
  assert.equal(Number(row.total_amount), 230000, 'the tier in force at the end of the month (Private) is billed for the whole month')
  assert.match((await invoiceLines(row.id))[0].title, /Private Partner/)
})

test('the monthly invoice: needs the first invoice, one per month, no future months, and nothing to bill in the first month', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'growth', day(-100))
  refused((await monthly(client, monthOffset(0))).error, 'FIRST_INVOICE_MISSING')
  assert.equal((await firstDoc(engagementId)).error, null)
  const built = await monthly(client, monthOffset(0))
  assert.equal(built.error, null)
  const row = await invoice(built.data as string)
  assert.equal(row.billing_kind, 'monthly')
  assert.equal(row.engagement_id, null)
  assert.equal(row.billing_month, monthOffset(0))
  assert.equal(Number(row.total_amount), 172500)
  assert.equal((await invoiceLines(row.id)).length, 1)
  refused((await monthly(client, monthOffset(0))).error, 'MONTH_ALREADY_BILLED')
  // Two months ahead, not one: in the last two hours of a month the South African date is already in the next month.
  refused((await monthly(client, monthOffset(2))).error, 'BILLING_MONTH_INVALID')
  refused((await monthly(client, '2019-05-01')).error, 'BILLING_MONTH_INVALID')
  await cancel(built.data as string)
  assert.equal((await monthly(client, monthOffset(0))).error, null, 'a cancelled monthly invoice frees the month')

  const fresh = await newClient()
  const start = day()
  const freshEngagement = await packageFor(fresh, 'signature', start)
  assert.equal((await firstDoc(freshEngagement)).error, null)
  refused((await monthly(fresh, monthStart(start))).error, 'NOTHING_TO_BILL')
  refused((await monthly(await newClient(), monthOffset(0))).error, 'NOTHING_TO_BILL')
  refused((await monthly(client, monthOffset(0), outsiderClient)).error, 'CLIENT_NOT_FOUND')
})

test('support services are billed for every month they run in, whole, and not for months they did not run in', async () => {
  const client = await newClient()
  const retainer = await packageFor(client, 'growth', day(-200))
  assert.equal((await firstDoc(retainer)).error, null)
  const project = await packageFor(client, 'digital_presence', day(-200))
  const careStart = day(-40)
  const mgmtStart = day(-150)
  const mgmtEnd = day(-45)
  assert.equal((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.website_care', p_start_date: careStart })).error, null)
  const mgmt = await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.digital_presence_management', p_start_date: mgmtStart })
  assert.equal(mgmt.error, null)
  assert.equal((await memberClient.rpc('end_support_service', { p_support: mgmt.data as string, p_ended_on: mgmtEnd })).error, null)

  const services = [
    { title: /Website Care/, start: careStart, end: null as string | null, price: 5000 },
    { title: /Digital Presence Management/, start: mgmtStart, end: mgmtEnd, price: 20000 },
  ]
  for (const month of [monthOffset(0), monthStart(mgmtEnd), monthStart(day(-120))]) {
    const built = await monthly(client, month)
    assert.equal(built.error, null, month)
    const l = await invoiceLines(built.data as string)
    let expected = 150000
    assert.match(l[0].title, /Growth Partner/)
    for (const service of services) {
      const active = service.start <= monthEnd(month) && (service.end === null || service.end >= month)
      assert.equal(l.some((line) => service.title.test(line.title)), active, `${service.title} in ${month}`)
      if (active) expected += service.price
    }
    assert.equal(Number((await invoice(built.data as string)).subtotal), expected, `subtotal for ${month}`)
  }
})

test('a client with only support, and no retainer, is billed just the support', async () => {
  const client = await newClient()
  const project = await packageFor(client, 'visual_communication', day(-60))
  assert.equal((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.communication_asset_care', p_start_date: day(-50) })).error, null)
  const built = await monthly(client, monthOffset(0))
  assert.equal(built.error, null)
  assert.equal(Number((await invoice(built.data as string)).total_amount), 5750)
  const noSupport = await newClient()
  await packageFor(noSupport, 'digital_presence')
  refused((await monthly(noSupport, monthOffset(0))).error, 'NOTHING_TO_BILL')
})

test('a top-up is credits times the tier rate, or the project rate, locked, and any number of times', async () => {
  const client = await newClient()
  const retainer = await packageFor(client, 'signature')
  const built = await topUp(retainer, 15)
  assert.equal(built.error, null)
  const row = await invoice(built.data as string)
  assert.equal(row.billing_kind, 'top_up')
  assert.equal(row.engagement_id, retainer)
  assert.equal(Number(row.total_amount), 43125)
  const l = await invoiceLines(row.id)
  assert.equal(l.length, 1)
  assert.equal(Number(l[0].quantity), 15)
  assert.equal(Number(l[0].unit_price), 2500)
  assert.equal(l[0].rate_locked, true)
  assert.match(l[0].description, /Proposed rate, not yet agreed\./)
  assert.equal((await topUp(retainer, 1)).error, null)
  assert.equal((await topUp(retainer, 10000)).error, null)

  const project = await packageFor(client, 'digital_experience')
  const projectBuilt = await topUp(project, 2)
  assert.equal(projectBuilt.error, null)
  assert.equal(Number((await invoice(projectBuilt.data as string)).total_amount), 6900)

  for (const bad of [0, -1, 1.5, 10001, null, 'x']) refused((await topUp(retainer, bad)).error, bad === 'x' ? 'invalid input syntax|TOP_UP_CREDITS_INVALID' : 'TOP_UP_CREDITS_INVALID')
  refused((await topUp(retainer, 3, outsiderClient)).error, 'ENGAGEMENT_NOT_FOUND')
  assert.equal((await memberClient.rpc('end_engagement', { p_engagement: project, p_ended_on: null })).error, null)
  refused((await topUp(project, 2)).error, 'ENGAGEMENT_ENDED')
})

test('an archived rate card item stops the build with a clear refusal and leaves no draft behind', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'digital_experience')
  const item = must(await admin.from('price_list_items').select('id').eq('organization_id', orgA).eq('rate_key', 'project.digital_experience').single())
  assert.equal((await ownerClient.from('price_list_items').update({ archived_at: new Date().toISOString() }).eq('id', item.id)).error, null)
  try {
    refused((await firstDoc(engagementId)).error, 'RATE_ITEM_UNAVAILABLE')
    assert.equal(must(await admin.from('invoices').select('id').eq('client_id', client)).length, 0)
  } finally {
    await admin.from('price_list_items').update({ archived_at: null }).eq('id', item.id)
  }
  assert.equal((await firstDoc(engagementId)).error, null)
})

test('built lines cannot be edited by a member, a later rate card change leaves the draft alone, and the link columns are not settable', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'signature')
  const built = await firstDoc(engagementId)
  const id = built.data as string
  const l = await invoiceLines(id)
  refused((await memberClient.from('invoice_lines').update({ unit_price: 1 }).eq('id', l[0].id).select('id')).error, 'RATE_LINE_LOCKED')
  refused((await memberClient.from('invoice_lines').update({ quantity: 3 }).eq('id', l[0].id).select('id')).error, 'RATE_LINE_LOCKED')
  assert.equal((await memberClient.from('invoice_lines').update({ position: 9 }).eq('id', l[0].id)).error, null)

  const item = must(await admin.from('price_list_items').select('id').eq('organization_id', orgA).eq('rate_key', 'retainer.signature.monthly').single())
  assert.equal((await ownerClient.from('price_list_items').update({ unit_price: 111111 }).eq('id', item.id)).error, null)
  try {
    assert.equal(Number((await invoiceLines(id)).find((x) => x.id === l[0].id)!.unit_price), 100000)
  } finally {
    await admin.from('price_list_items').update({ unit_price: 100000 }).eq('id', item.id)
  }

  refused((await memberClient.from('invoices').update({ billing_kind: 'monthly', engagement_id: null }).eq('id', id).select('id')).error, 'BILLING_COLUMNS_GENERATED')
  refused((await memberClient.from('invoices').update({ engagement_id: null }).eq('id', id).select('id')).error, 'BILLING_COLUMNS_GENERATED|invoices_billing_shape')
  const hand = await memberClient.from('invoices').insert({ organization_id: orgA, client_id: client, client_name: 'x', engagement_id: engagementId, billing_kind: 'first' })
  refused(hand.error, 'BILLING_COLUMNS_GENERATED')
  const handQuote = await memberClient.from('quotes').insert({ organization_id: orgA, client_id: client, client_name: 'x', engagement_id: engagementId, billing_kind: 'first' })
  refused(handQuote.error, 'BILLING_COLUMNS_GENERATED')

  const removed = await memberClient.from('invoice_lines').delete().eq('id', l[1].id).select('id')
  assert.equal(removed.error, null)
  assert.equal(removed.data!.length, 1)
})

test('nothing crosses organisations', async () => {
  const client = await newClient()
  const engagementId = await packageFor(client, 'growth')
  const built = await firstDoc(engagementId)
  assert.equal(must(await outsiderClient.from('invoices').select('id').eq('id', built.data as string)).length, 0)
  refused((await firstDoc(engagementId, 'invoice', outsiderClient)).error, 'ENGAGEMENT_NOT_FOUND')
  refused((await outsiderClient.rpc('create_invoice_from_quote', { p_quote_id: (await firstDoc(engagementId, 'quote')).data as string })).error, 'QUOTE_NOT_FOUND')
})
