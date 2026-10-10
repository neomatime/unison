import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string // has company settings
let orgB: string // none: a send there is refused for that reason
let member: U
let other: U // owner of B
let memberClient: SupabaseClient
let otherClient: SupabaseClient
let clientA: string
let clientB: string
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const draftQuote = async (over: Record<string, unknown> = {}, withLine = true) => {
  const quote = must(await memberClient.from('quotes').insert({ organization_id: orgA, client_id: clientA, client_name: 'Doc Client A', ...over }).select('id').single())
  if (withLine) {
    const line = await memberClient.from('quote_lines').insert({ organization_id: orgA, quote_id: quote.id, position: 1, title: 'Advisory', description: 'A day', quantity: 2, unit_price: 100 })
    assert.equal(line.error, null)
  }
  return quote.id as string
}
const draftInvoice = async (over: Record<string, unknown> = {}, withLine = true) => {
  const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Doc Client A', ...over }).select('id').single())
  if (withLine) {
    const line = await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 1, title: 'Advisory', quantity: 2, unit_price: 100 })
    assert.equal(line.error, null)
  }
  return invoice.id as string
}
const row = async (table: 'quotes' | 'invoices', id: string) => must(await admin.from(table).select('*').eq('id', id).single()) as Record<string, any>
const send = (id: string, client: SupabaseClient = memberClient) => client.rpc('send_quote', { p_id: id })
const issue = (id: string, client: SupabaseClient = memberClient) => client.rpc('issue_invoice', { p_id: id })
const refused = (error: { message: string } | null, token: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
}
const addDays = (isoDate: string, days: number) => new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)

before(async () => {
  orgA = await createFixtureOrg('docs-send-a')
  orgB = await createFixtureOrg('docs-send-b')
  member = await createFixtureUser(orgA, 'member')
  other = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  otherClient = await signedInClient(other.email, other.password)
  clientA = must(await admin.from('clients').insert({
    organization_id: orgA, name: 'Doc Client A', status: 'Active', address_line1: '1 Test Road', city: 'Testville', postal_code: '1234', country: 'Testland', vat_number: 'VAT-A',
  }).select('id').single()).id
  clientB = must(await admin.from('clients').insert({ organization_id: orgB, name: 'Doc Client B', status: 'Active' }).select('id').single()).id
  must(await admin.from('organization_settings').insert({
    organization_id: orgA, legal_name: 'Test Co (Pty) Ltd', document_prefix: 'TST', bank_name: 'Test Bank', bank_account_number: '000111',
    default_quote_terms: 'Term one\nTerm two', default_payment_terms: 'Pay within 30 days', vat_rate: 15,
  }).select('id').single())
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [member?.id, other?.id].filter(Boolean))
})

test('sending a quote numbers it, dates it, freezes it and writes the timeline entry', async () => {
  const id = await draftQuote()
  const { data, error } = await send(id)
  assert.equal(error, null)
  assert.match(data.number, /^TST-Q-\d{4}-\d{5}$/)
  const quote = await row('quotes', id)
  assert.equal(quote.status, 'Sent')
  assert.equal(quote.quote_number, data.number)
  assert.ok(quote.sent_at)
  assert.equal(quote.valid_until, addDays(quote.issue_date, 30), 'valid-until defaults to the settings (30 days)')
  assert.equal(quote.terms, 'Term one\nTerm two', 'the default terms are copied')
  assert.equal(quote.bill_to.name, 'Doc Client A')
  assert.equal(quote.bill_to.vat_number, 'VAT-A')
  assert.equal(quote.bill_to.address_line1, '1 Test Road')
  assert.equal(quote.issuer.legal_name, 'Test Co (Pty) Ltd')
  assert.equal(quote.issuer.bank_name, 'Test Bank')
  assert.equal(Number(quote.total_amount), 230)
  const entries = (await admin.from('activities').select('kind, subject, created_by').eq('quote_id', id).eq('kind', 'quote.sent')).data!
  assert.equal(entries.length, 1)
  assert.match(entries[0].subject, new RegExp(data.number))
  assert.equal(entries[0].created_by, member.id)
})

test('quotes and invoices count separately, in order, and a refused send leaves no gap', async () => {
  const firstQuote = await send(await draftQuote())
  const quoteNumber = (value: any) => Number(String(value.data.number).split('-').pop())
  const afterRefused = await draftQuote({}, false)
  refused((await send(afterRefused)).error, 'QUOTE_NEEDS_LINES')
  const next = await send(await draftQuote())
  assert.equal(quoteNumber(next), quoteNumber(firstQuote) + 1, 'the refused attempt used no number')

  const invoice = await issue(await draftInvoice())
  assert.equal(invoice.error, null)
  assert.match(invoice.data.number, /^TST-I-\d{4}-\d{5}$/)
  assert.match(invoice.data.number, /-00001$/, 'the invoice counter is independent of the quote counter')
  const invoiceNumber = Number(String(invoice.data.number).split('-').pop())
  const second = await issue(await draftInvoice())
  assert.equal(Number(String(second.data.number).split('-').pop()), invoiceNumber + 1)
})

test('send and issue refuse a missing client, no lines, a non-draft, an archived draft, a stale valid-until, and a non-member', async () => {
  const noClient = must(await memberClient.from('quotes').insert({ organization_id: orgA, client_name: 'Only a name' }).select('id').single()).id
  await memberClient.from('quote_lines').insert({ organization_id: orgA, quote_id: noClient, title: 'x', quantity: 1, unit_price: 1 })
  refused((await send(noClient)).error, 'QUOTE_NEEDS_CLIENT')
  refused((await send(await draftQuote({}, false))).error, 'QUOTE_NEEDS_LINES')

  const sent = await draftQuote()
  assert.equal((await send(sent)).error, null)
  refused((await send(sent)).error, 'QUOTE_NOT_DRAFT')

  const archived = await draftQuote({ archived_at: new Date().toISOString() })
  refused((await send(archived)).error, 'QUOTE_NOT_DRAFT')

  const stale = await draftQuote({ valid_until: '2020-01-01' })
  refused((await send(stale)).error, 'QUOTE_VALID_BEFORE_ISSUE')

  const quoteA = await draftQuote()
  const outsider = await send(quoteA, otherClient)
  assert.ok(outsider.error)
  assert.match(outsider.error.message, /QUOTE_NOT_FOUND/, 'a non-member is told it was not found, never that it exists')
  assert.equal((await row('quotes', quoteA)).status, 'Draft')

  refused((await issue(await draftInvoice({}, false))).error, 'INVOICE_NEEDS_LINES')
  const invoiceNoClient = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_name: 'Only a name' }).select('id').single()).id
  await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoiceNoClient, title: 'x', quantity: 1, unit_price: 1 })
  refused((await issue(invoiceNoClient)).error, 'INVOICE_NEEDS_CLIENT')
  const issued = await draftInvoice()
  assert.equal((await issue(issued)).error, null)
  refused((await issue(issued)).error, 'INVOICE_NOT_DRAFT')
  // No issue date is set, so it becomes today; a due date already in the past is then before it.
  refused((await issue(await draftInvoice({ due_date: '2020-01-01' }))).error, 'INVOICE_DUE_BEFORE_ISSUE')
})

test('without company details nothing can be sent or issued', async () => {
  const quote = must(await otherClient.from('quotes').insert({ organization_id: orgB, client_id: clientB, client_name: 'Doc Client B' }).select('id').single()).id
  await otherClient.from('quote_lines').insert({ organization_id: orgB, quote_id: quote, title: 'x', quantity: 1, unit_price: 1 })
  refused((await send(quote, otherClient)).error, 'COMPANY_DETAILS_MISSING')
  const invoice = must(await otherClient.from('invoices').insert({ organization_id: orgB, client_id: clientB, client_name: 'Doc Client B' }).select('id').single()).id
  await otherClient.from('invoice_lines').insert({ organization_id: orgB, invoice_id: invoice, title: 'x', quantity: 1, unit_price: 1 })
  refused((await issue(invoice, otherClient)).error, 'COMPANY_DETAILS_MISSING')
  assert.equal((await row('quotes', quote)).status, 'Draft')
})

test('two simultaneous sends get different numbers, and the same draft is sent exactly once', async () => {
  const [a, b] = await Promise.all([draftQuote(), draftQuote()])
  const [first, second] = await Promise.all([send(a), send(b)])
  assert.equal(first.error, null)
  assert.equal(second.error, null)
  assert.notEqual(first.data.number, second.data.number)

  const same = await draftQuote()
  const results = await Promise.all([send(same), send(same), send(same)])
  assert.equal(results.filter((result) => !result.error).length, 1, 'exactly one succeeds')
  for (const result of results.filter((item) => item.error)) assert.match(result.error!.message, /QUOTE_NOT_DRAFT/)
})

test('a member cannot create a document as sent, write a number or snapshot, or skip the send step', async () => {
  const insertSent = await memberClient.from('quotes').insert({ organization_id: orgA, client_name: 'x', status: 'Sent' })
  refused(insertSent.error, 'QUOTE_USE_SEND')
  const insertNumber = await memberClient.from('quotes').insert({ organization_id: orgA, client_name: 'x', quote_number: 'FAKE-1' })
  refused(insertNumber.error, 'DOCUMENT_NUMBER_GENERATED')
  const invoiceSent = await memberClient.from('invoices').insert({ organization_id: orgA, client_name: 'x', status: 'Issued' })
  refused(invoiceSent.error, 'INVOICE_USE_ISSUE')
  const invoiceNumber = await memberClient.from('invoices').insert({ organization_id: orgA, client_name: 'x', invoice_number: 'FAKE-2' })
  refused(invoiceNumber.error, 'DOCUMENT_NUMBER_GENERATED')

  const id = await draftQuote()
  refused((await memberClient.from('quotes').update({ status: 'Sent' }).eq('id', id)).error, 'QUOTE_USE_SEND')
  refused((await memberClient.from('quotes').update({ status: 'Accepted' }).eq('id', id)).error, 'QUOTE_USE_SEND')
  refused((await memberClient.from('quotes').update({ quote_number: 'FAKE-3' }).eq('id', id)).error, 'DOCUMENT_NUMBER_GENERATED')
  refused((await memberClient.from('quotes').update({ bill_to: { name: 'x' } }).eq('id', id)).error, 'DOCUMENT_SNAPSHOT_GENERATED')
  refused((await memberClient.from('quotes').update({ issuer: { legal_name: 'x' } }).eq('id', id)).error, 'DOCUMENT_SNAPSHOT_GENERATED')
  const review = await memberClient.from('quotes').update({ status: 'Internal Review' }).eq('id', id)
  assert.equal(review.error, null, 'a draft may move to Internal Review and back')
  assert.equal((await memberClient.from('quotes').update({ status: 'Draft' }).eq('id', id)).error, null)

  const invoice = await draftInvoice()
  refused((await memberClient.from('invoices').update({ status: 'Issued' }).eq('id', invoice)).error, 'INVOICE_USE_ISSUE')
  refused((await memberClient.from('invoices').update({ status: 'Paid' }).eq('id', invoice)).error, 'INVOICE_USE_ISSUE')
})

test('once a quote is sent, nothing printed on it can change, but its status and notes can', async () => {
  const id = await draftQuote({ project_name: 'Project X', client_ref: 'PO-1' })
  assert.equal((await send(id)).error, null)
  const frozenChanges: Array<Record<string, unknown>> = [
    { valid_until: '2099-01-01' }, { terms: 'new' }, { project_name: 'other' }, { project_description: 'other' }, { project_ref: 'other' },
    { client_ref: 'PO-2' }, { currency: 'USD' }, { client_name: 'Someone else' }, { client_id: null }, { issue_date: '2020-01-01' },
  ]
  for (const change of frozenChanges) {
    refused((await memberClient.from('quotes').update(change).eq('id', id)).error, 'QUOTE_FROZEN')
  }
  const lineInsert = await memberClient.from('quote_lines').insert({ organization_id: orgA, quote_id: id, position: 5, title: 'Late', quantity: 1, unit_price: 1 })
  refused(lineInsert.error, 'QUOTE_FROZEN')
  refused((await memberClient.from('quote_lines').update({ unit_price: 1 }).eq('quote_id', id)).error, 'QUOTE_FROZEN')
  refused((await memberClient.from('quote_lines').delete().eq('quote_id', id)).error, 'QUOTE_FROZEN')
  refused((await memberClient.from('quotes').update({ status: 'Draft' }).eq('id', id)).error, 'QUOTE_CANNOT_REOPEN')
  refused((await memberClient.from('quotes').update({ status: 'Internal Review' }).eq('id', id)).error, 'QUOTE_CANNOT_REOPEN')

  assert.equal((await memberClient.from('quotes').update({ notes: 'a note' }).eq('id', id)).error, null)
  assert.equal((await memberClient.from('quotes').update({ status: 'Accepted' }).eq('id', id)).error, null)
  assert.equal((await memberClient.from('quotes').update({ status: 'Declined' }).eq('id', id)).error, null)
  const final = await row('quotes', id)
  assert.equal(final.notes, 'a note')
  assert.equal(Number(final.total_amount), 230, 'the total never moved')
  assert.equal(Number((await admin.from('quote_lines').select('id', { count: 'exact', head: true }).eq('quote_id', id)).count), 1)
})

test('the snapshot does not change when the client or the company details change afterwards', async () => {
  const id = await draftQuote()
  assert.equal((await send(id)).error, null)
  try {
    assert.equal((await admin.from('clients').update({ name: 'Renamed Client', vat_number: 'VAT-CHANGED', address_line1: 'Moved' }).eq('id', clientA)).error, null)
    assert.equal((await admin.from('organization_settings').update({ legal_name: 'Renamed Co', bank_name: 'Other Bank' }).eq('organization_id', orgA)).error, null)
    const quote = await row('quotes', id)
    assert.equal(quote.bill_to.name, 'Doc Client A')
    assert.equal(quote.bill_to.vat_number, 'VAT-A')
    assert.equal(quote.issuer.legal_name, 'Test Co (Pty) Ltd')
    assert.equal(quote.issuer.bank_name, 'Test Bank')
    assert.equal(quote.client_name, 'Doc Client A')
  } finally {
    const restoredClient = await admin.from('clients').update({ name: 'Doc Client A', vat_number: 'VAT-A', address_line1: '1 Test Road' }).eq('id', clientA)
    const restoredSettings = await admin.from('organization_settings').update({ legal_name: 'Test Co (Pty) Ltd', bank_name: 'Test Bank' }).eq('organization_id', orgA)
    assert.equal(restoredClient.error, null, 'the client is restored')
    assert.equal(restoredSettings.error, null, 'the company details are restored')
  }
})

test('issuing an invoice numbers it, sets its dates, balance and terms, and freezes it', async () => {
  const id = await draftInvoice({ project_name: 'Project X' })
  const { data, error } = await issue(id)
  assert.equal(error, null)
  const invoice = await row('invoices', id)
  assert.equal(invoice.status, 'Issued')
  assert.equal(invoice.invoice_number, data.number)
  assert.equal(invoice.due_date, addDays(invoice.issue_date, 30))
  assert.equal(Number(invoice.balance_amount), Number(invoice.total_amount))
  assert.equal(Number(invoice.total_amount), 230)
  assert.equal(invoice.payment_terms, 'Pay within 30 days')
  assert.equal(invoice.bill_to.name, 'Doc Client A')
  assert.equal(invoice.issuer.legal_name, 'Test Co (Pty) Ltd')

  for (const change of [{ due_date: '2099-01-01' }, { payment_terms: 'x' }, { project_name: 'y' }, { client_ref: 'z' }, { currency: 'USD' }, { issue_date: '2020-01-01' }]) {
    refused((await memberClient.from('invoices').update(change).eq('id', id)).error, 'INVOICE_FROZEN')
  }
  refused((await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: id, position: 2, title: 'Late', quantity: 1, unit_price: 1 })).error, 'INVOICE_FROZEN')
  refused((await memberClient.from('invoice_lines').delete().eq('invoice_id', id)).error, 'INVOICE_FROZEN')
  refused((await memberClient.from('invoices').update({ status: 'Draft' }).eq('id', id)).error, 'INVOICE_CANNOT_REOPEN')
  assert.equal((await memberClient.from('invoices').update({ notes: 'chased' }).eq('id', id)).error, null)
  assert.equal((await memberClient.from('invoices').update({ status: 'Partially Paid', balance_amount: 100 }).eq('id', id)).error, null)
  assert.equal((await memberClient.from('invoices').update({ status: 'Cancelled' }).eq('id', id)).error, null)
})

test('duplicating a quote makes a new draft with the same lines and project details', async () => {
  const id = await draftQuote({ project_name: 'Project X', project_ref: 'REF-1', client_ref: 'PO-9', terms: 'Custom terms' })
  assert.equal((await send(id)).error, null)
  const { data, error } = await memberClient.rpc('duplicate_quote', { p_id: id })
  assert.equal(error, null)
  const copy = await row('quotes', data)
  assert.equal(copy.status, 'Draft')
  assert.match(copy.quote_number, /^DRAFT-[0-9a-f]{8}$/)
  assert.equal(copy.project_name, 'Project X')
  assert.equal(copy.client_ref, 'PO-9')
  assert.equal(copy.terms, 'Custom terms')
  assert.equal(copy.bill_to, null, 'the snapshot is not copied')
  assert.equal(Number(copy.total_amount), 230)
  const lines = (await admin.from('quote_lines').select('title, quantity').eq('quote_id', data)).data!
  assert.equal(lines.length, 1)
  assert.equal(lines[0].title, 'Advisory')
  assert.equal((await send(data)).error, null, 'the copy can be sent as a new quote')

  const crossOrg = await otherClient.rpc('duplicate_quote', { p_id: id })
  assert.ok(crossOrg.error, 'another organisation cannot duplicate it')
})

test('a document in an organisation with no company details still gets the default VAT rate, never a typed one', async () => {
  const quote = must(await otherClient.from('quotes').insert({ organization_id: orgB, client_id: clientB, client_name: 'Doc Client B', vat_rate: 0 }).select('vat_rate').single())
  assert.equal(Number(quote.vat_rate), 15)
  const invoice = must(await otherClient.from('invoices').insert({ organization_id: orgB, client_id: clientB, client_name: 'Doc Client B', vat_rate: 0 }).select('vat_rate').single())
  assert.equal(Number(invoice.vat_rate), 15)
})

test('a plain member of the organisation cannot change its company details', async () => {
  const changed = await memberClient.from('organization_settings').update({ legal_name: 'Hacked', bank_account_number: '999' }).eq('organization_id', orgA).select('id')
  assert.deepEqual(changed.data, [], 'row level security hides the row from an update')
  const stored = must(await admin.from('organization_settings').select('legal_name, bank_account_number').eq('organization_id', orgA).single())
  assert.equal(stored.legal_name, 'Test Co (Pty) Ltd')
  assert.equal(stored.bank_account_number, '000111')
})

test('the numbering function is not callable and the new functions are not open to anon', async () => {
  const numbering = await memberClient.rpc('next_document_number', { p_org: orgA, p_kind: 'quote' })
  assert.ok(numbering.error, 'members cannot call the numbering function')
  for (const [name, args] of [
    ['send_quote', { p_id: '00000000-0000-0000-0000-000000000000' }],
    ['issue_invoice', { p_id: '00000000-0000-0000-0000-000000000000' }],
    ['duplicate_quote', { p_id: '00000000-0000-0000-0000-000000000000' }],
    ['next_document_number', { p_org: orgA, p_kind: 'quote' }],
  ] as const) {
    const result = await anonymous.rpc(name, args)
    assert.ok(result.error, `anon cannot call ${name}`)
    assert.match(result.error.message, /permission denied/i, `anon is refused ${name} on privilege, not on the argument`)
  }
})

test('a sent_at typed on a draft is cleared, so the send stamps the real time and writes the timeline entry', async () => {
  const id = await draftQuote({ sent_at: '2020-01-01T00:00:00Z' })
  assert.equal((await row('quotes', id)).sent_at, null, 'a typed sent_at is cleared on a draft')
  assert.equal((await send(id)).error, null)
  const quote = await row('quotes', id)
  assert.ok(quote.sent_at)
  assert.ok(Math.abs(Date.now() - new Date(quote.sent_at).getTime()) < 2 * 60_000, 'sent_at is the real time of the send')
  const entries = (await admin.from('activities').select('kind').eq('quote_id', id).eq('kind', 'quote.sent')).data!
  assert.equal(entries.length, 1)
})

test('an invoice is dated the day it is issued, whatever date was typed on the draft', async () => {
  const id = await draftInvoice({ issue_date: '2020-01-01' })
  const { data, error } = await issue(id)
  assert.equal(error, null)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' })
  const invoice = await row('invoices', id)
  assert.equal(invoice.issue_date, today)
  assert.equal(String(data.number).split('-')[2], today.slice(0, 4), 'the year in the number is the year of the date')
})

test('the VAT rate is taken from the company details at the moment of sending or issuing', async () => {
  const setRate = async (rate: number) => {
    const result = await admin.from('organization_settings').update({ vat_rate: rate }).eq('organization_id', orgA)
    assert.equal(result.error, null)
  }
  try {
    const quoteId = await draftQuote({}, false)
    const invoiceId = await draftInvoice({}, false)
    assert.equal((await memberClient.from('quote_lines').insert({ organization_id: orgA, quote_id: quoteId, position: 1, title: 'Rate', quantity: 1, unit_price: 100 })).error, null)
    assert.equal((await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoiceId, position: 1, title: 'Rate', quantity: 1, unit_price: 100 })).error, null)

    // A member cannot change the rate of a draft.
    assert.equal(Number((await row('quotes', quoteId)).vat_rate), 15)
    await memberClient.from('quotes').update({ vat_rate: 5 }).eq('id', quoteId)
    await memberClient.from('invoices').update({ vat_rate: 5 }).eq('id', invoiceId)
    assert.equal(Number((await row('quotes', quoteId)).vat_rate), 15, 'a member cannot change the rate on a draft quote')
    assert.equal(Number((await row('invoices', invoiceId)).vat_rate), 15, 'a member cannot change the rate on a draft invoice')

    await setRate(20)
    assert.equal((await send(quoteId)).error, null)
    const quote = await row('quotes', quoteId)
    assert.equal(Number(quote.vat_rate), 20)
    assert.equal(Number(quote.tax_amount), 20)
    assert.equal(Number(quote.total_amount), 120)

    assert.equal((await issue(invoiceId)).error, null)
    const invoice = await row('invoices', invoiceId)
    assert.equal(Number(invoice.vat_rate), 20)
    assert.equal(Number(invoice.tax_amount), 20)
    assert.equal(Number(invoice.total_amount), 120)
    assert.equal(Number(invoice.balance_amount), 120, 'the balance follows the total at the rate in force when it was issued')
  } finally {
    await setRate(15)
  }
})

test('a cancelled invoice stays cancelled', async () => {
  const id = await draftInvoice()
  assert.equal((await issue(id)).error, null)
  assert.equal((await memberClient.from('invoices').update({ status: 'Cancelled' }).eq('id', id)).error, null)
  refused((await memberClient.from('invoices').update({ status: 'Issued' }).eq('id', id)).error, 'INVOICE_CANCELLED')
  refused((await memberClient.from('invoices').update({ status: 'Paid' }).eq('id', id)).error, 'INVOICE_CANCELLED')
  refused((await memberClient.from('invoices').update({ status: 'Draft' }).eq('id', id)).error, 'INVOICE_CANNOT_REOPEN')
  assert.equal((await row('invoices', id)).status, 'Cancelled')
})

test('the issuer snapshot holds exactly what is printed', async () => {
  const id = await draftQuote()
  assert.equal((await send(id)).error, null)
  const quote = await row('quotes', id)
  const printed = [
    'legal_name', 'tagline', 'address_line1', 'address_line2', 'city', 'postal_code', 'country', 'vat_number', 'email', 'phone', 'website',
    'bank_name', 'bank_account_name', 'bank_account_number', 'bank_branch_code', 'bank_account_type', 'quote_closing_text',
    'invoice_closing_text', 'logo_path', 'header_image_path',
  ]
  assert.deepEqual(Object.keys(quote.issuer).sort(), [...printed].sort())
})

test("lines cannot be moved into or out of a sent quote, and an issued invoice's lines cannot be edited", async () => {
  const draft = await draftQuote()
  const sentQuote = await draftQuote()
  assert.equal((await send(sentQuote)).error, null)
  const draftLine = must(await admin.from('quote_lines').select('id').eq('quote_id', draft).single()).id
  const sentLine = must(await admin.from('quote_lines').select('id').eq('quote_id', sentQuote).single()).id
  refused((await memberClient.from('quote_lines').update({ quote_id: sentQuote }).eq('id', draftLine)).error, 'QUOTE_FROZEN')
  refused((await memberClient.from('quote_lines').update({ quote_id: draft }).eq('id', sentLine)).error, 'QUOTE_FROZEN')

  const invoice = await draftInvoice()
  assert.equal((await issue(invoice)).error, null)
  refused((await memberClient.from('invoice_lines').update({ unit_price: 1 }).eq('invoice_id', invoice)).error, 'INVOICE_FROZEN')
})

test("a sent quote's rate and organisation cannot be changed", async () => {
  const id = await draftQuote()
  assert.equal((await send(id)).error, null)
  await memberClient.from('quotes').update({ vat_rate: 5 }).eq('id', id)
  assert.equal(Number((await row('quotes', id)).vat_rate), 15, 'the rate does not move')
  const moved = await memberClient.from('quotes').update({ organization_id: orgB }).eq('id', id)
  assert.ok(moved.error, 'a quote cannot be moved to another organisation')
  assert.equal((await row('quotes', id)).organization_id, orgA)
  assert.equal((await memberClient.from('quotes').update({ status: 'Expired' }).eq('id', id)).error, null, 'a sent quote may expire')
})

test('issuing an invoice from another organisation is told it was not found', async () => {
  const id = await draftInvoice()
  const outsider = await issue(id, otherClient)
  assert.ok(outsider.error)
  assert.match(outsider.error.message, /INVOICE_NOT_FOUND/)
  assert.equal((await row('invoices', id)).status, 'Draft')
})

test("a member cannot attach another organisation's client to a quote or invoice", async () => {
  // Inserting: the composite foreign key (client_id, organization_id) refuses a client of another organisation.
  const quoteInsert = await memberClient.from('quotes').insert({ organization_id: orgA, client_id: clientB, client_name: 'Doc Client B' })
  assert.ok(quoteInsert.error, "a quote cannot be created for another organisation's client")
  const invoiceInsert = await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientB, client_name: 'Doc Client B' })
  assert.ok(invoiceInsert.error, "an invoice cannot be created for another organisation's client")

  // Updating: the stored client stays the one it had.
  const quote = await draftQuote()
  const quoteUpdate = await memberClient.from('quotes').update({ client_id: clientB }).eq('id', quote)
  assert.ok(quoteUpdate.error, "a draft quote cannot be moved to another organisation's client")
  assert.equal((await row('quotes', quote)).client_id, clientA, 'the quote keeps its client')

  const invoice = await draftInvoice()
  const invoiceUpdate = await memberClient.from('invoices').update({ client_id: clientB }).eq('id', invoice)
  assert.ok(invoiceUpdate.error, "a draft invoice cannot be moved to another organisation's client")
  assert.equal((await row('invoices', invoice)).client_id, clientA, 'the invoice keeps its client')
})
