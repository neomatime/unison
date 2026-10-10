import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string // never gets a settings row: the default 15% VAT applies
let orgB: string // its owner manages the settings
let member: U // a plain member of A
let outsider: U // the owner of B
let memberClient: SupabaseClient
let outsiderClient: SupabaseClient
let clientA: string
let clientB: string
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const newQuote = async (over: Record<string, unknown> = {}) =>
  must(await memberClient.from('quotes').insert({ organization_id: orgA, client_id: clientA, client_name: 'Doc Client A', ...over }).select('*').single())
const quoteLine = (quoteId: string, over: Record<string, unknown> = {}) =>
  memberClient.from('quote_lines').insert({ organization_id: orgA, quote_id: quoteId, position: 1, title: 'Work', quantity: 1, unit_price: 100, ...over }).select('*').single()
const read = async (table: 'quotes' | 'invoices', id: string) => {
  const result = await admin.from(table).select('*').eq('id', id).single()
  if (result.error) throw new Error(result.error.message)
  return result.data as Record<string, unknown>
}

before(async () => {
  orgA = await createFixtureOrg('docs-a')
  orgB = await createFixtureOrg('docs-b')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  clientA = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Doc Client A', status: 'Active' }).select('id').single()).id
  clientB = must(await admin.from('clients').insert({ organization_id: orgB, name: 'Doc Client B', status: 'Active' }).select('id').single()).id
})

after(async () => {
  // A failed setup leaves some of these undefined; delete only what exists.
  await cleanup([orgA, orgB].filter(Boolean), [member?.id, outsider?.id].filter(Boolean))
})

test('totals come from the lines: amounts round to cents and VAT is on the standard lines only', async () => {
  const quote = await newQuote()
  for (const line of [
    { position: 1, title: 'A', quantity: 2, unit_price: 100, vat_code: 'standard' },
    { position: 2, title: 'B', quantity: 1, unit_price: 50.5, vat_code: 'zero' },
    { position: 3, title: 'C', quantity: 3, unit_price: 0.1, vat_code: 'standard' },
  ]) {
    const result = await quoteLine(quote.id, line)
    assert.equal(result.error, null)
  }
  const row = await read('quotes', quote.id)
  assert.equal(Number(row.subtotal), 250.8, '200 + 50.50 + 0.30')
  assert.equal(Number(row.tax_amount), 30.05, '15% of 200.30 is 30.045, rounded up')
  assert.equal(Number(row.total_amount), 280.85)
  assert.equal(Number(row.vat_rate), 15, 'no settings row: the default rate')
})

test('a line amount rounds half a cent up', async () => {
  const quote = await newQuote()
  const made = must(await quoteLine(quote.id, { quantity: 1.5, unit_price: 0.15, vat_code: 'zero' }))
  assert.equal(Number(made.line_amount), 0.23)
})

test('typed totals are ignored, on insert and on update', async () => {
  const quote = await newQuote({ subtotal: 999, tax_amount: 9, total_amount: 1008 })
  assert.deepEqual([quote.subtotal, quote.tax_amount, quote.total_amount].map(Number), [0, 0, 0])
  await memberClient.from('quotes').update({ subtotal: 5000, tax_amount: 1, total_amount: 5001 }).eq('id', quote.id)
  const typed = await read('quotes', quote.id)
  assert.deepEqual([typed.subtotal, typed.tax_amount, typed.total_amount].map(Number), [0, 0, 0])
  await quoteLine(quote.id, { unit_price: 200 })
  await memberClient.from('quotes').update({ subtotal: 1 }).eq('id', quote.id)
  const row = await read('quotes', quote.id)
  assert.equal(Number(row.subtotal), 200)
  assert.equal(Number(row.total_amount), 230)
})

test('changing and removing a line recalculates the document', async () => {
  const quote = await newQuote()
  const first = must(await quoteLine(quote.id, { position: 1, quantity: 1, unit_price: 100 }))
  const second = must(await quoteLine(quote.id, { position: 2, title: 'Second', quantity: 1, unit_price: 50, vat_code: 'zero' }))
  assert.equal(Number((await read('quotes', quote.id)).total_amount), 165)
  const update = await memberClient.from('quote_lines').update({ quantity: 3 }).eq('id', first.id)
  assert.equal(update.error, null)
  assert.equal(Number((await read('quotes', quote.id)).total_amount), 395, '300 + 45 VAT + 50')
  const removed = await memberClient.from('quote_lines').delete().eq('id', second.id)
  assert.equal(removed.error, null)
  assert.equal(Number((await read('quotes', quote.id)).total_amount), 345)
})

test('a line must have a title, a positive quantity, a price within range and a known VAT code', async () => {
  const quote = await newQuote()
  for (const bad of [
    { title: '   ' },
    { quantity: 0 },
    { quantity: -1 },
    { quantity: 100000 },
    { unit_price: -1 },
    { unit_price: 10000000 },
    { vat_code: 'exempt' },
  ]) {
    const result = await quoteLine(quote.id, bad)
    assert.ok(result.error, `must refuse ${JSON.stringify(bad)}`)
  }
})

test('a line cannot point at another organisation’s document or price list item', async () => {
  const quoteB = must(await admin.from('quotes').insert({ organization_id: orgB, client_name: 'B' }).select('id').single())
  const crossQuote = await memberClient.from('quote_lines').insert({ organization_id: orgB, quote_id: quoteB.id, title: 'x', quantity: 1, unit_price: 1 })
  assert.ok(crossQuote.error, 'a member of A cannot write into B')
  const mixed = await memberClient.from('quote_lines').insert({ organization_id: orgA, quote_id: quoteB.id, title: 'x', quantity: 1, unit_price: 1 })
  assert.ok(mixed.error, 'an A line cannot hang off a B quote')

  const itemB = must(await admin.from('price_list_items').insert({ organization_id: orgB, title: 'B item', unit_price: 5 }).select('id').single())
  const quote = await newQuote()
  const crossItem = await quoteLine(quote.id, { price_list_item_id: itemB.id })
  assert.ok(crossItem.error, 'a line cannot reference another organisation’s price list item')
})

test('a document without a number gets a draft reference, and a real number is required once it is not a draft', async () => {
  const one = await newQuote()
  const two = await newQuote()
  assert.match(one.quote_number, /^DRAFT-[0-9a-f]{8}$/)
  assert.notEqual(one.quote_number, two.quote_number)
  const sentWithDraftReference = await admin.from('quotes').insert({ organization_id: orgA, client_name: 'x', status: 'Sent', quote_number: 'DRAFT-abcd1234' })
  assert.ok(sentWithDraftReference.error, 'a sent quote cannot carry a draft reference')
  const sentWithNumber = await admin.from('quotes').insert({ organization_id: orgA, client_name: 'x', status: 'Sent', quote_number: 'FIXTURE-1' })
  assert.equal(sentWithNumber.error, null)

  const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Doc Client A' }).select('invoice_number').single())
  assert.match(invoice.invoice_number, /^DRAFT-[0-9a-f]{8}$/)
  const issuedWithDraftReference = await admin.from('invoices').insert({ organization_id: orgA, client_name: 'x', status: 'Issued', invoice_number: 'DRAFT-abcd1234' })
  assert.ok(issuedWithDraftReference.error)
})

test('an invoice calculates its totals from its lines and a draft’s balance follows its total', async () => {
  const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Doc Client A', balance_amount: 77 }).select('id, balance_amount').single())
  assert.equal(Number(invoice.balance_amount), 0, 'a typed balance is ignored on a draft')
  const line = await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 1, title: 'Work', quantity: 2, unit_price: 100 })
  assert.equal(line.error, null)
  const row = await read('invoices', invoice.id)
  assert.deepEqual([row.subtotal, row.tax_amount, row.total_amount, row.balance_amount].map(Number), [200, 30, 230, 230])
  await memberClient.from('invoices').update({ balance_amount: 5, total_amount: 1 }).eq('id', invoice.id)
  const after = await read('invoices', invoice.id)
  assert.deepEqual([after.total_amount, after.balance_amount].map(Number), [230, 230])
})

test('company settings: owners and admins write, members read, nobody reads another organisation’s', async () => {
  const created = await outsiderClient.from('organization_settings').insert({ organization_id: orgB, legal_name: 'Org B Co', document_prefix: 'BBB', vat_rate: 20, bank_name: 'Test Bank' }).select('id')
  assert.equal(created.error, null, 'an owner can create the settings')
  const second = await outsiderClient.from('organization_settings').insert({ organization_id: orgB, legal_name: 'Again' })
  assert.ok(second.error, 'one row per organisation')

  const memberWrite = await memberClient.from('organization_settings').insert({ organization_id: orgA, legal_name: 'Nope' })
  assert.ok(memberWrite.error, 'a plain member cannot create settings')
  const forged = await memberClient.from('organization_settings').update({ legal_name: 'Hacked' }).eq('organization_id', orgB).select('id')
  assert.deepEqual(forged.data, [], 'a member of another organisation changes nothing')
  assert.equal(must(await admin.from('organization_settings').select('legal_name').eq('organization_id', orgB).single()).legal_name, 'Org B Co')

  const crossRead = await memberClient.from('organization_settings').select('id').eq('organization_id', orgB)
  assert.deepEqual(crossRead.data, [], 'another organisation’s settings are invisible')
  const ownRead = await outsiderClient.from('organization_settings').select('bank_name').eq('organization_id', orgB).single()
  assert.equal(ownRead.data?.bank_name, 'Test Bank')

  const anon = await anonymous.from('organization_settings').select('id')
  assert.ok(anon.error, 'anon has no privilege on the settings, so the read is an error')
})

test('company settings constraints: prefix, VAT rate, days and image paths', async () => {
  for (const bad of [
    { document_prefix: 'DRAFT' },
    { document_prefix: 'abc' },
    { document_prefix: 'A' },
    { document_prefix: 'TOOLONGPFX' },
    { vat_rate: 101 },
    { vat_rate: -1 },
    { default_quote_valid_days: 0 },
    { default_payment_days: 366 },
    { logo_path: 'https://evil.test/logo.png' },
    { logo_path: '/brand/../secret.png' },
    { header_image_path: '/other/banner.png' },
    { header_image_path: '/brand/.hidden.png' },
  ]) {
    const result = await outsiderClient.from('organization_settings').update(bad).eq('organization_id', orgB)
    assert.ok(result.error, `must refuse ${JSON.stringify(bad)}`)
  }
  const good = await outsiderClient.from('organization_settings').update({ logo_path: '/brand/himark-wordmark.png', header_image_path: '/brand/banner.png' }).eq('organization_id', orgB)
  assert.equal(good.error, null)
})

test('a document takes its VAT rate from the settings when it is created and keeps it', async () => {
  const quote = must(await outsiderClient.from('quotes').insert({ organization_id: orgB, client_id: clientB, client_name: 'Doc Client B', vat_rate: 5 }).select('id, vat_rate').single())
  assert.equal(Number(quote.vat_rate), 20, 'the settings rate, not the typed one')
  await outsiderClient.from('organization_settings').update({ vat_rate: 25 }).eq('organization_id', orgB)
  await outsiderClient.from('quotes').update({ vat_rate: 1 }).eq('id', quote.id)
  assert.equal(Number((await read('quotes', quote.id)).vat_rate), 20, 'a later settings change or a direct update does not move it')
  await outsiderClient.from('quote_lines').insert({ organization_id: orgB, quote_id: quote.id, title: 'W', quantity: 1, unit_price: 100 })
  assert.equal(Number((await read('quotes', quote.id)).total_amount), 120)
})

test('the price list: any member manages it, items are archived not deleted, and it is private to the organisation', async () => {
  const made = must(await memberClient.from('price_list_items').insert({ organization_id: orgA, title: 'Advisory day', description: 'One day', unit_price: 1500, vat_code: 'standard' }).select('id').single())
  const renamed = await memberClient.from('price_list_items').update({ unit_price: 1600, archived_at: new Date().toISOString() }).eq('id', made.id).select('id')
  assert.equal(renamed.error, null)
  assert.equal(renamed.data?.length, 1)
  const removal = await memberClient.from('price_list_items').delete().eq('id', made.id)
  assert.ok(removal.error, 'there is no delete privilege')
  assert.equal((await admin.from('price_list_items').select('id').eq('id', made.id)).data?.length, 1)

  const crossRead = await outsiderClient.from('price_list_items').select('id').eq('organization_id', orgA)
  assert.deepEqual(crossRead.data, [])
  const crossWrite = await outsiderClient.from('price_list_items').insert({ organization_id: orgA, title: 'x', unit_price: 1 })
  assert.ok(crossWrite.error)
  for (const bad of [{ title: ' ' }, { unit_price: -1 }, { unit_price: 10000000 }, { vat_code: 'exempt' }]) {
    const result = await memberClient.from('price_list_items').insert({ organization_id: orgA, title: 'T', unit_price: 1, ...bad })
    assert.ok(result.error, `must refuse ${JSON.stringify(bad)}`)
  }
})

test('number counters are not readable or writable by members or anon', async () => {
  const read = await memberClient.from('document_counters').select('*')
  assert.ok(read.error, 'a member cannot read counters')
  const write = await memberClient.from('document_counters').insert({ organization_id: orgA, kind: 'quote', year: 2026, last_number: 99 })
  assert.ok(write.error)
  const anon = await anonymous.from('document_counters').select('*')
  assert.ok(anon.error)
})

test('a client’s billing address and VAT number can be saved by a member', async () => {
  const result = await memberClient.from('clients')
    .update({ address_line1: '1 Test Road', city: 'Johannesburg', postal_code: '2076', country: 'South Africa', vat_number: 'VAT-FIXTURE' })
    .eq('id', clientA).select('vat_number')
  assert.equal(result.error, null)
  assert.equal(result.data?.[0].vat_number, 'VAT-FIXTURE')
})

test('anon has no access to the new tables', async () => {
  for (const table of ['price_list_items', 'quote_lines', 'invoice_lines', 'organization_settings']) {
    const result = await anonymous.from(table).select('id')
    assert.ok(result.error, `${table}: anon has no privilege, so a read is an error and not an empty list`)
  }
  const quote = await newQuote()
  const insert = await anonymous.from('quote_lines').insert({ organization_id: orgA, quote_id: quote.id, title: 'x', quantity: 1, unit_price: 1 })
  assert.ok(insert.error, 'anon cannot insert a line')
})

test('an oversized document is refused cleanly and leaves the totals as they were', async () => {
  const max = { quantity: 99999.999, unit_price: 9999999.99, vat_code: 'zero' }
  const lineCount = async (quoteId: string) => {
    const result = await admin.from('quote_lines').select('id', { count: 'exact', head: true }).eq('quote_id', quoteId)
    if (result.error) throw new Error(result.error.message)
    return result.count
  }

  const quote = await newQuote()
  const first = await quoteLine(quote.id, { ...max, position: 1 })
  assert.equal(first.error, null, 'one maximum zero-rated line fits')
  const before = await read('quotes', quote.id)
  assert.equal(await lineCount(quote.id), 1)

  const second = await quoteLine(quote.id, { ...max, position: 2 })
  assert.ok(second.error, 'a second maximum line overflows the subtotal and is refused')
  const after = await read('quotes', quote.id)
  assert.deepEqual([after.subtotal, after.tax_amount, after.total_amount].map(Number), [before.subtotal, before.tax_amount, before.total_amount].map(Number))
  assert.equal(await lineCount(quote.id), 1, 'the refused line was not kept')

  const fresh = await newQuote()
  const standard = await quoteLine(fresh.id, { ...max, vat_code: 'standard' })
  assert.ok(standard.error, 'VAT pushes the total over the limit, so the line is refused')
  const untouched = await read('quotes', fresh.id)
  assert.deepEqual([untouched.subtotal, untouched.tax_amount, untouched.total_amount].map(Number), [0, 0, 0])
  assert.equal(await lineCount(fresh.id), 0)
})
