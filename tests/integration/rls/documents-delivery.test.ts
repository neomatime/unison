import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string // has company settings
let orgB: string
let member: U
let other: U // owner of B
let memberClient: SupabaseClient
let otherClient: SupabaseClient
let clientA: string
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NIL = '00000000-0000-0000-0000-000000000000'
const SHA = 'a'.repeat(64)

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const refused = (error: { message: string } | null, token: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
}
const row = async (table: string, id: string) => must(await admin.from(table).select('*').eq('id', id).single()) as Record<string, any>

/** A draft quote with two lines (one standard-rated, one zero-rated) and every header field filled. */
async function draftQuote(clientId: string | null = clientA, clientName = 'Doc Client A') {
  const quote = must(await memberClient.from('quotes').insert({
    organization_id: orgA, client_id: clientId, client_name: clientName,
    project_name: 'Project X', project_description: 'Scope text', project_ref: 'PX-1', client_ref: 'PO-77', notes: 'Internal only',
  }).select('id').single())
  assert.equal((await memberClient.from('quote_lines').insert([
    { organization_id: orgA, quote_id: quote.id, position: 1, title: 'Advisory', description: 'A day', quantity: 2, unit_price: 100, vat_code: 'standard' },
    { organization_id: orgA, quote_id: quote.id, position: 2, title: 'Licence', quantity: 1, unit_price: 50.5, vat_code: 'zero' },
  ])).error, null)
  return quote.id as string
}
async function sentQuote(clientId: string | null = clientA, clientName = 'Doc Client A') {
  const id = await draftQuote(clientId, clientName)
  const sent = await memberClient.rpc('send_quote', { p_id: id })
  assert.equal(sent.error, null)
  return id
}
async function acceptedQuote(clientId: string | null = clientA, clientName = 'Doc Client A') {
  const id = await sentQuote(clientId, clientName)
  assert.equal((await memberClient.from('quotes').update({ status: 'Accepted' }).eq('id', id)).error, null)
  return id
}
async function issuedInvoice() {
  const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Doc Client A' }).select('id').single())
  assert.equal((await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 1, title: 'Advisory', quantity: 1, unit_price: 100 })).error, null)
  assert.equal((await memberClient.rpc('issue_invoice', { p_id: invoice.id })).error, null)
  return invoice.id as string
}
const record = (kind: 'quote' | 'invoice', id: string, over: Record<string, unknown> = {}, client: SupabaseClient = memberClient) =>
  client.rpc('record_document_email', { p_kind: kind, p_id: id, p_to: 'client@example.com', p_subject: 'Your document', p_body: 'Hello', p_sha256: SHA, p_bytes: 1234, ...over })

before(async () => {
  orgA = await createFixtureOrg('docs-delivery-a')
  orgB = await createFixtureOrg('docs-delivery-b')
  member = await createFixtureUser(orgA, 'member')
  other = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  otherClient = await signedInClient(other.email, other.password)
  clientA = must(await admin.from('clients').insert({
    organization_id: orgA, name: 'Doc Client A', status: 'Active', address_line1: '1 Test Road', city: 'Testville', postal_code: '1234', country: 'Testland', vat_number: 'VAT-A',
  }).select('id').single()).id
  must(await admin.from('organization_settings').insert({
    organization_id: orgA, legal_name: 'Test Co (Pty) Ltd', document_prefix: 'TST', vat_rate: 15, default_quote_terms: 'Term one', default_payment_terms: 'Pay within 30 days',
  }).select('id').single())
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [member?.id, other?.id].filter(Boolean))
})

// ---------------------------------------------------------------------------
// document_emails: nobody but the record function writes
// ---------------------------------------------------------------------------
test('a member can read sent emails but cannot insert, update or delete one, and anon cannot touch the table', async () => {
  const quote = await sentQuote()
  const id = must(await record('quote', quote)).valueOf() as string
  const read = await memberClient.from('document_emails').select('id, to_address').eq('id', id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  const insert = await memberClient.from('document_emails').insert({
    organization_id: orgA, quote_id: quote, to_address: 'forged@example.com', subject: 'Forged', body: '', pdf_sha256: SHA, pdf_bytes: 1,
  })
  assert.ok(insert.error, 'a member cannot write a "sent" record by hand')
  assert.equal(insert.error!.code, '42501')
  const update = await memberClient.from('document_emails').update({ subject: 'Changed' }).eq('id', id)
  assert.ok(update.error, 'a record cannot be edited')
  assert.equal(update.error!.code, '42501')
  const remove = await memberClient.from('document_emails').delete().eq('id', id)
  assert.ok(remove.error, 'a record cannot be deleted')
  assert.equal(remove.error!.code, '42501')
  assert.equal((await row('document_emails', id)).subject, 'Your document')

  const anon = await anonymous.from('document_emails').select('id').limit(1)
  assert.ok(anon.error)
  assert.match(anon.error!.message, /permission denied for table document_emails/)
})

test('another organisation sees none of it', async () => {
  const quote = await sentQuote()
  await record('quote', quote)
  const seen = await otherClient.from('document_emails').select('id').eq('quote_id', quote)
  assert.equal(seen.error, null)
  assert.deepEqual(seen.data, [])
})

// ---------------------------------------------------------------------------
// record_document_email
// ---------------------------------------------------------------------------
test('recording a quote email writes the row and the quote timeline entry', async () => {
  const quote = await sentQuote()
  const number = (await row('quotes', quote)).quote_number
  const { data, error } = await record('quote', quote, { p_to: '  client@example.com ', p_subject: ' Quote for you ', p_body: 'Line one\n\nLine two', p_bytes: 4321 })
  assert.equal(error, null)
  const email = await row('document_emails', data as string)
  assert.equal(email.quote_id, quote)
  assert.equal(email.invoice_id, null)
  assert.equal(email.to_address, 'client@example.com', 'the address is trimmed')
  assert.equal(email.subject, 'Quote for you')
  assert.equal(email.body, 'Line one\n\nLine two')
  assert.equal(email.pdf_sha256, SHA)
  assert.equal(email.pdf_bytes, 4321)
  assert.equal(email.sent_by, member.id)
  assert.ok(email.sent_at)
  const entries = (await admin.from('activities').select('kind, subject, details, created_by').eq('quote_id', quote).eq('kind', 'quote.emailed')).data!
  assert.equal(entries.length, 1)
  assert.match(entries[0].subject, new RegExp(number))
  assert.equal(entries[0].details.document_id, quote)
  assert.equal(entries[0].details.to, 'client@example.com')
  assert.equal(entries[0].created_by, member.id)
})

test('the same document can be emailed more than once, and each send is recorded', async () => {
  const quote = await sentQuote()
  assert.equal((await record('quote', quote)).error, null)
  assert.equal((await record('quote', quote, { p_to: 'second@example.com' })).error, null)
  const rows = (await admin.from('document_emails').select('id').eq('quote_id', quote)).data!
  assert.equal(rows.length, 2)
})

test('recording an invoice email writes the entry on the invoice\'s client', async () => {
  const invoice = await issuedInvoice()
  const number = (await row('invoices', invoice)).invoice_number
  const { data, error } = await record('invoice', invoice)
  assert.equal(error, null)
  const email = await row('document_emails', data as string)
  assert.equal(email.invoice_id, invoice)
  assert.equal(email.quote_id, null)
  const entries = (await admin.from('activities').select('kind, subject, details').eq('client_id', clientA).eq('kind', 'invoice.emailed')).data!
  const mine = entries.filter((entry) => entry.details.document_id === invoice)
  assert.equal(mine.length, 1)
  assert.match(mine[0].subject, new RegExp(number))
})

test('a draft cannot be recorded as emailed, and neither can an unknown kind, an unknown id or another organisation\'s document', async () => {
  refused((await record('quote', await draftQuote())).error, 'DOCUMENT_IS_DRAFT')
  const draftInvoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Doc Client A' }).select('id').single()).id
  refused((await record('invoice', draftInvoice)).error, 'DOCUMENT_IS_DRAFT')
  refused((await record('quote', await sentQuote(), {}, otherClient)).error, 'QUOTE_NOT_FOUND')
  refused((await record('invoice', await issuedInvoice(), {}, otherClient)).error, 'INVOICE_NOT_FOUND')
  refused((await record('quote', NIL)).error, 'QUOTE_NOT_FOUND')
  refused((await record('invoice', NIL)).error, 'INVOICE_NOT_FOUND')
  refused((await memberClient.rpc('record_document_email', { p_kind: 'expense', p_id: NIL, p_to: 'a@example.com', p_subject: 's', p_body: '', p_sha256: SHA, p_bytes: 1 })).error, 'DOCUMENT_KIND_UNKNOWN')
  const anon = await record('quote', await sentQuote(), {}, anonymous)
  assert.ok(anon.error, 'anon cannot call it')
  assert.equal((await admin.from('document_emails').select('id').eq('organization_id', orgB)).data!.length, 0)
})

test('only one plain address is accepted', async () => {
  const quote = await sentQuote()
  const bad = [
    '', '   ', 'not-an-address', 'a@b', 'a@b.c', '@example.com', 'a@.example.com', 'a@example..com', 'a..b@example.com', '.a@example.com', 'a.@example.com',
    'a@b.com, c@d.com', 'a@b.com;c@d.com', 'Name <a@b.com>', '"Name" a@b.com', 'a b@example.com', 'a@exam ple.com',
    'a@b.com\r\nBcc: x@y.com', 'a@b.com\nBcc: x@y.com', 'a@b.com\t', 'ä@example.com', 'a@exämple.com', `${'a'.repeat(250)}@example.com`,
  ]
  for (const address of bad) refused((await record('quote', quote, { p_to: address })).error, 'EMAIL_ADDRESS_INVALID')
  for (const good of ['a@example.com', 'first.last+tag@sub.example.co.za', "o'neil@example.com", 'A_B-c@Example.COM']) {
    assert.equal((await record('quote', quote, { p_to: good })).error, null, good)
  }
})

test('the subject, the message and the record details are checked', async () => {
  const quote = await sentQuote()
  refused((await record('quote', quote, { p_subject: '' })).error, 'EMAIL_SUBJECT_INVALID')
  refused((await record('quote', quote, { p_subject: '   ' })).error, 'EMAIL_SUBJECT_INVALID')
  refused((await record('quote', quote, { p_subject: 'x'.repeat(301) })).error, 'EMAIL_SUBJECT_INVALID')
  refused((await record('quote', quote, { p_subject: 'two\nlines' })).error, 'EMAIL_SUBJECT_INVALID')
  assert.equal((await record('quote', quote, { p_subject: 'x'.repeat(300) })).error, null)
  refused((await record('quote', quote, { p_body: 'x'.repeat(10001) })).error, 'EMAIL_BODY_TOO_LONG')
  assert.equal((await record('quote', quote, { p_body: 'x'.repeat(10000) })).error, null)
  for (const sha of ['', 'xyz', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)]) refused((await record('quote', quote, { p_sha256: sha })).error, 'EMAIL_RECORD_INVALID')
  for (const bytes of [0, -1, 20000001]) refused((await record('quote', quote, { p_bytes: bytes })).error, 'EMAIL_RECORD_INVALID')
})

// ---------------------------------------------------------------------------
// create_invoice_from_quote
// ---------------------------------------------------------------------------
test('an accepted quote becomes a draft invoice with the same header and every line, and the quote is untouched', async () => {
  const quote = await acceptedQuote()
  const before = await row('quotes', quote)
  const { data, error } = await memberClient.rpc('create_invoice_from_quote', { p_quote_id: quote })
  assert.equal(error, null)
  const invoice = await row('invoices', data as string)
  assert.equal(invoice.status, 'Draft')
  assert.match(invoice.invoice_number, /^DRAFT-[0-9a-f]{8}$/)
  assert.equal(invoice.quote_id, quote)
  assert.equal(invoice.client_id, clientA)
  assert.equal(invoice.client_name, before.client_name)
  assert.equal(invoice.currency, before.currency)
  assert.equal(invoice.project_name, 'Project X')
  assert.equal(invoice.project_description, 'Scope text')
  assert.equal(invoice.project_ref, 'PX-1')
  assert.equal(invoice.client_ref, 'PO-77')
  assert.equal(invoice.notes, null, 'internal notes are not copied')
  assert.equal(invoice.payment_terms, null)
  assert.equal(invoice.issue_date, null)
  assert.equal(invoice.due_date, null)
  assert.equal(invoice.bill_to, null)
  assert.equal(invoice.issuer, null)

  const quoteLines = (await admin.from('quote_lines').select('position,title,description,quantity,unit_price,vat_code').eq('quote_id', quote).order('position')).data!
  const invoiceLines = (await admin.from('invoice_lines').select('position,title,description,quantity,unit_price,vat_code').eq('invoice_id', invoice.id).order('position')).data!
  assert.equal(invoiceLines.length, 2)
  assert.deepEqual(invoiceLines, quoteLines)
  assert.equal(invoiceLines[1].vat_code, 'zero')
  assert.equal(Number(invoice.subtotal), Number(before.subtotal))
  assert.equal(Number(invoice.tax_amount), Number(before.tax_amount))
  assert.equal(Number(invoice.total_amount), Number(before.total_amount))
  assert.equal(Number(invoice.total_amount), 280.5)

  const after = await row('quotes', quote)
  for (const column of ['status', 'quote_number', 'subtotal', 'tax_amount', 'total_amount', 'notes', 'accepted_at', 'sent_at', 'client_id', 'archived_at']) {
    assert.deepEqual(after[column], before[column], `${column} on the quote is unchanged`)
  }
  assert.equal((await admin.from('quote_lines').select('id').eq('quote_id', quote)).data!.length, 2)

  const entries = (await admin.from('activities').select('subject, details, created_by').eq('quote_id', quote).eq('kind', 'quote.invoiced')).data!
  assert.equal(entries.length, 1)
  assert.equal(entries[0].details.invoice_id, invoice.id)
  assert.equal(entries[0].created_by, member.id)
})

test('the draft can be issued like any other, and two calls make two invoices', async () => {
  const quote = await acceptedQuote()
  const first = must(await memberClient.rpc('create_invoice_from_quote', { p_quote_id: quote }))
  const second = must(await memberClient.rpc('create_invoice_from_quote', { p_quote_id: quote }))
  assert.notEqual(first, second)
  assert.equal((await admin.from('invoices').select('id').eq('quote_id', quote)).data!.length, 2)
  const issued = await memberClient.rpc('issue_invoice', { p_id: first })
  assert.equal(issued.error, null)
  assert.match(issued.data.number, /^TST-I-\d{4}-\d{5}$/)
})

test('only an accepted, unarchived quote of your own organisation can be invoiced', async () => {
  refused((await memberClient.rpc('create_invoice_from_quote', { p_quote_id: await draftQuote() })).error, 'QUOTE_NOT_ACCEPTED')
  refused((await memberClient.rpc('create_invoice_from_quote', { p_quote_id: await sentQuote() })).error, 'QUOTE_NOT_ACCEPTED')
  const declined = await sentQuote()
  assert.equal((await memberClient.from('quotes').update({ status: 'Declined' }).eq('id', declined)).error, null)
  refused((await memberClient.rpc('create_invoice_from_quote', { p_quote_id: declined })).error, 'QUOTE_NOT_ACCEPTED')

  const archived = await acceptedQuote()
  assert.equal((await memberClient.from('quotes').update({ archived_at: new Date().toISOString() }).eq('id', archived)).error, null)
  refused((await memberClient.rpc('create_invoice_from_quote', { p_quote_id: archived })).error, 'QUOTE_ARCHIVED')

  refused((await memberClient.rpc('create_invoice_from_quote', { p_quote_id: NIL })).error, 'QUOTE_NOT_FOUND')
  refused((await otherClient.rpc('create_invoice_from_quote', { p_quote_id: await acceptedQuote() })).error, 'QUOTE_NOT_FOUND')
  const anon = await anonymous.rpc('create_invoice_from_quote', { p_quote_id: await acceptedQuote() })
  assert.ok(anon.error, 'anon cannot call it')
  assert.equal((await admin.from('invoices').select('id').eq('organization_id', orgB)).data!.length, 0)
})

test('an accepted quote whose client has since been removed still makes a draft invoice, without a client', async () => {
  const gone = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Gone Client', status: 'Active', address_line1: '3 Test Lane' }).select('id').single()).id
  const quote = await acceptedQuote(gone, 'Gone Client')
  must(await admin.from('clients').delete().eq('id', gone).select('id'))
  const { data, error } = await memberClient.rpc('create_invoice_from_quote', { p_quote_id: quote })
  assert.equal(error, null)
  const invoice = await row('invoices', data as string)
  assert.equal(invoice.client_id, null)
  assert.equal(invoice.client_name, 'Gone Client')
  refused((await memberClient.rpc('issue_invoice', { p_id: invoice.id })).error, 'INVOICE_NEEDS_CLIENT')
})
