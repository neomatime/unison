import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let member: U
let other: U
let memberClient: SupabaseClient
let otherClient: SupabaseClient
let clientA: string
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NIL = '00000000-0000-0000-0000-000000000000'
const sast = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const addDays = (isoDate: string, days: number) => new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const refused = (error: { message: string } | null, token: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
}
const row = async (table: string, id: string) => must(await admin.from(table).select('*').eq('id', id).single()) as Record<string, any>

/** An issued invoice of 230.00 (2 x 100 plus 15% VAT) for client A. */
async function issuedInvoice(over: Record<string, unknown> = {}) {
  const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Pay Client A', ...over }).select('id').single())
  assert.equal((await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 1, title: 'Advisory', quantity: 2, unit_price: 100 })).error, null)
  assert.equal((await memberClient.rpc('issue_invoice', { p_id: invoice.id })).error, null)
  return invoice.id as string
}
const pay = (invoice: string, over: Record<string, unknown> = {}, client: SupabaseClient = memberClient) =>
  client.rpc('record_payment', { p_invoice: invoice, p_amount: 100, p_received_on: sast(), p_method: 'Bank transfer', p_reference: 'REF-1', ...over })
const voidIt = (payment: string, reason = 'Entered in error', client: SupabaseClient = memberClient) => client.rpc('void_payment', { p_payment: payment, p_reason: reason })
const timeline = async (kind: string) => (await admin.from('activities').select('subject, details, created_by').eq('client_id', clientA).eq('kind', kind)).data!

before(async () => {
  orgA = await createFixtureOrg('payments-a')
  orgB = await createFixtureOrg('payments-b')
  member = await createFixtureUser(orgA, 'member')
  other = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  otherClient = await signedInClient(other.email, other.password)
  clientA = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Pay Client A', status: 'Active' }).select('id').single()).id
  must(await admin.from('organization_settings').insert({
    organization_id: orgA, legal_name: 'Test Co (Pty) Ltd', document_prefix: 'TST', vat_rate: 15, default_payment_terms: 'Pay within 30 days',
  }).select('id').single())
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [member?.id, other?.id].filter(Boolean))
})

// ---------------------------------------------------------------------------
// The table: nobody but the functions writes
// ---------------------------------------------------------------------------
test('a member reads payments but cannot insert, update or delete one; anon and other organisations see nothing; not even the service role can edit one', async () => {
  const invoice = await issuedInvoice()
  const id = must(await pay(invoice)).valueOf() as string
  assert.equal((await memberClient.from('payments').select('id').eq('id', id)).data!.length, 1)

  const insert = await memberClient.from('payments').insert({ organization_id: orgA, invoice_id: invoice, amount: 1, received_on: sast(), method: 'Cash' })
  assert.equal(insert.error?.code, '42501', 'a payment cannot be written by hand')
  assert.equal((await memberClient.from('payments').update({ amount: 1 }).eq('id', id)).error?.code, '42501')
  assert.equal((await memberClient.from('payments').delete().eq('id', id)).error?.code, '42501')

  const anon = await anonymous.from('payments').select('id').limit(1)
  assert.match(anon.error?.message ?? '', /permission denied for table payments/)
  assert.deepEqual((await otherClient.from('payments').select('id').eq('invoice_id', invoice)).data, [])

  refused((await admin.from('payments').update({ amount: 5 }).eq('id', id)).error, 'PAYMENT_IMMUTABLE')
  refused((await admin.from('payments').update({ received_on: addDays(sast(), -1) }).eq('id', id)).error, 'PAYMENT_IMMUTABLE')
  assert.equal(Number((await row('payments', id)).amount), 100)
})

// ---------------------------------------------------------------------------
// record_payment and the rule
// ---------------------------------------------------------------------------
test('a part payment makes the invoice Partially Paid with the right balance and writes the client timeline entry', async () => {
  const invoice = await issuedInvoice()
  const { data, error } = await pay(invoice, { p_amount: 100, p_reference: '  REF-9  ' })
  assert.equal(error, null)
  const payment = await row('payments', data as string)
  assert.equal(Number(payment.amount), 100)
  assert.equal(payment.reference, 'REF-9', 'the reference is trimmed')
  assert.equal(payment.method, 'Bank transfer')
  assert.equal(payment.recorded_by, member.id)
  assert.equal(payment.voided_at, null)
  const after = await row('invoices', invoice)
  assert.equal(after.status, 'Partially Paid')
  assert.equal(Number(after.balance_amount), 130)
  assert.equal(after.paid_at, null)
  const entries = (await timeline('payment.recorded')).filter((entry) => entry.details.payment_id === data)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].details.invoice_id, invoice)
  assert.equal(entries[0].created_by, member.id)
})

test('paying the rest makes it Paid with the date of the last payment, and nothing more can be paid', async () => {
  const invoice = await issuedInvoice()
  assert.equal((await pay(invoice, { p_amount: 100 })).error, null)
  const earlier = addDays(sast(), 0)
  assert.equal((await pay(invoice, { p_amount: 130, p_received_on: earlier })).error, null)
  const paid = await row('invoices', invoice)
  assert.equal(paid.status, 'Paid')
  assert.equal(Number(paid.balance_amount), 0)
  assert.equal(String(paid.paid_at).slice(0, 10) === earlier || String(paid.paid_at).slice(0, 10) === addDays(earlier, -1), true, 'paid_at is the payment date at South African midnight')
  refused((await pay(invoice, { p_amount: 1 })).error, 'INVOICE_NOT_PAYABLE')
})

test('a payment is refused for a bad amount, date, method or reference, an invoice that cannot take one, or another organisation', async () => {
  const invoice = await issuedInvoice()
  for (const amount of [0, -1, 1.234, null]) refused((await pay(invoice, { p_amount: amount })).error, 'PAYMENT_AMOUNT_INVALID')
  refused((await pay(invoice, { p_amount: 230.01 })).error, 'PAYMENT_EXCEEDS_BALANCE')
  refused((await pay(invoice, { p_received_on: addDays(sast(), 1) })).error, 'PAYMENT_DATE_FUTURE')
  refused((await pay(invoice, { p_received_on: '2000-01-01' })).error, 'PAYMENT_DATE_BEFORE_ISSUE')
  refused((await pay(invoice, { p_method: 'Cheque' })).error, 'PAYMENT_METHOD_INVALID')
  refused((await pay(invoice, { p_method: null })).error, 'PAYMENT_METHOD_INVALID')
  refused((await pay(invoice, { p_reference: 'x'.repeat(121) })).error, 'PAYMENT_REFERENCE_TOO_LONG')
  assert.equal((await pay(invoice, { p_reference: 'x'.repeat(120), p_amount: 10 })).error, null)
  assert.equal((await pay(invoice, { p_reference: '   ', p_amount: 10 })).error, null, 'a blank reference is stored as none')

  const draft = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Pay Client A' }).select('id').single()).id
  refused((await pay(draft)).error, 'INVOICE_NOT_PAYABLE')
  const cancelled = await issuedInvoice()
  assert.equal((await memberClient.rpc('cancel_invoice', { p_invoice: cancelled })).error, null)
  refused((await pay(cancelled)).error, 'INVOICE_NOT_PAYABLE')

  refused((await pay(invoice, {}, otherClient)).error, 'INVOICE_NOT_FOUND')
  refused((await pay(NIL)).error, 'INVOICE_NOT_FOUND')
  assert.ok((await pay(invoice, {}, anonymous)).error, 'anon cannot call it')
  assert.equal((await admin.from('payments').select('id').eq('organization_id', orgB)).data!.length, 0)
})

test('parallel payments can never overspend the balance', async () => {
  const invoice = await issuedInvoice()
  const results = await Promise.all(Array.from({ length: 5 }, () => pay(invoice, { p_amount: 100 })))
  const accepted = results.filter((result) => !result.error)
  assert.equal(accepted.length, 2, 'only two payments of 100 fit in 230')
  for (const result of results.filter((entry) => entry.error)) refused(result.error, 'PAYMENT_EXCEEDS_BALANCE')
  const after = await row('invoices', invoice)
  assert.equal(Number(after.balance_amount), 30)
  assert.equal(after.status, 'Partially Paid')
  const total = (await admin.from('payments').select('amount').eq('invoice_id', invoice)).data!.reduce((sum, entry) => sum + Number(entry.amount), 0)
  assert.equal(total, 200)
})

// ---------------------------------------------------------------------------
// void_payment
// ---------------------------------------------------------------------------
test('voiding keeps the payment, restores the balance and status, and writes a timeline entry', async () => {
  const invoice = await issuedInvoice()
  const first = must(await pay(invoice, { p_amount: 100 })).valueOf() as string
  const second = must(await pay(invoice, { p_amount: 130 })).valueOf() as string
  assert.equal((await row('invoices', invoice)).status, 'Paid')

  assert.equal((await voidIt(second, '  Wrong client  ')).error, null)
  const voided = await row('payments', second)
  assert.ok(voided.voided_at)
  assert.equal(voided.void_reason, 'Wrong client')
  assert.equal(voided.voided_by, member.id)
  assert.equal(Number(voided.amount), 130, 'the row is kept as it was')
  let invoiceRow = await row('invoices', invoice)
  assert.equal(invoiceRow.status, 'Partially Paid')
  assert.equal(Number(invoiceRow.balance_amount), 130)
  assert.equal(invoiceRow.paid_at, null)
  assert.equal((await timeline('payment.voided')).filter((entry) => entry.details.payment_id === second).length, 1)

  assert.equal((await voidIt(first)).error, null)
  invoiceRow = await row('invoices', invoice)
  assert.equal(invoiceRow.status, 'Issued')
  assert.equal(Number(invoiceRow.balance_amount), 230)
})

test('a void is refused without a reason, twice, for another organisation, or for an unknown payment', async () => {
  const invoice = await issuedInvoice()
  const id = must(await pay(invoice)).valueOf() as string
  for (const reason of ['', '   ']) refused((await voidIt(id, reason)).error, 'PAYMENT_VOID_REASON_REQUIRED')
  refused((await voidIt(id, 'x'.repeat(501))).error, 'PAYMENT_VOID_REASON_TOO_LONG')
  refused((await voidIt(id, 'Entered in error', otherClient)).error, 'PAYMENT_NOT_FOUND')
  refused((await voidIt(NIL)).error, 'PAYMENT_NOT_FOUND')
  assert.ok((await voidIt(id, 'x', anonymous)).error)
  assert.equal((await voidIt(id, 'x'.repeat(500))).error, null)
  refused((await voidIt(id)).error, 'PAYMENT_ALREADY_VOIDED')
  refused((await admin.from('payments').update({ void_reason: 'changed' }).eq('id', id)).error, 'PAYMENT_IMMUTABLE')
})

test('voiding the only payment on an invoice that has since gone past its due date returns it to Overdue', async () => {
  const invoice = await issuedInvoice()
  const id = must(await pay(invoice, { p_amount: 230 })).valueOf() as string
  assert.equal((await row('invoices', invoice)).status, 'Paid')
  must(await admin.from('invoices').update({ issue_date: addDays(sast(), -40), due_date: addDays(sast(), -10) }).eq('id', invoice).select('id'))
  assert.equal((await voidIt(id)).error, null)
  const after = await row('invoices', invoice)
  assert.equal(after.status, 'Overdue')
  assert.equal(Number(after.balance_amount), 230)
})

// ---------------------------------------------------------------------------
// cancel_invoice and the guard
// ---------------------------------------------------------------------------
test('cancel_invoice cancels an issued invoice with no unvoided payment, and only that', async () => {
  const draft = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Pay Client A' }).select('id').single()).id
  refused((await memberClient.rpc('cancel_invoice', { p_invoice: draft })).error, 'INVOICE_NOT_ISSUED')

  const invoice = await issuedInvoice()
  const id = must(await pay(invoice, { p_amount: 50 })).valueOf() as string
  refused((await memberClient.rpc('cancel_invoice', { p_invoice: invoice })).error, 'INVOICE_HAS_PAYMENTS')
  assert.equal((await voidIt(id)).error, null)
  assert.equal((await memberClient.rpc('cancel_invoice', { p_invoice: invoice })).error, null)
  const cancelled = await row('invoices', invoice)
  assert.equal(cancelled.status, 'Cancelled')
  assert.equal(Number(cancelled.balance_amount), 0)
  refused((await memberClient.rpc('cancel_invoice', { p_invoice: invoice })).error, 'INVOICE_ALREADY_CANCELLED')
  refused((await voidIt(id)).error, 'INVOICE_CANCELLED')

  refused((await otherClient.rpc('cancel_invoice', { p_invoice: await issuedInvoice() })).error, 'INVOICE_NOT_FOUND')
  refused((await memberClient.rpc('cancel_invoice', { p_invoice: NIL })).error, 'INVOICE_NOT_FOUND')
  assert.ok((await anonymous.rpc('cancel_invoice', { p_invoice: invoice })).error)
})

test('a member cannot type a status, a balance or a paid date on an issued invoice, but can change the notes; nobody can delete an invoice', async () => {
  const invoice = await issuedInvoice()
  for (const change of [{ status: 'Paid' }, { status: 'Overdue' }, { status: 'Cancelled' }, { balance_amount: 0 }, { paid_at: new Date().toISOString() }]) {
    refused((await memberClient.from('invoices').update(change).eq('id', invoice)).error, 'INVOICE_STATUS_AUTOMATIC')
  }
  assert.equal((await memberClient.from('invoices').update({ notes: 'chased on the phone' }).eq('id', invoice)).error, null)
  const after = await row('invoices', invoice)
  assert.equal(after.status, 'Issued')
  assert.equal(Number(after.balance_amount), 230)

  const draft = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Pay Client A' }).select('id').single()).id
  assert.equal((await memberClient.from('invoices').update({ notes: 'draft note' }).eq('id', draft)).error, null, 'a draft is untouched by the guard')
  const removed = await memberClient.from('invoices').delete().eq('id', invoice).select('id')
  assert.equal(removed.error, null, "no delete policy on invoices: a member's delete removes nothing")
  assert.deepEqual(removed.data, [], "no delete policy on invoices: a member's delete removes nothing")
  assert.equal((await row('invoices', invoice)).status, 'Issued')
})

// ---------------------------------------------------------------------------
// The nightly job
// ---------------------------------------------------------------------------
test('the nightly function sets Overdue once, writes one entry, and leaves everything else alone', async () => {
  const past = { issue_date: addDays(sast(), -40), due_date: addDays(sast(), -10) }
  const late = await issuedInvoice()
  const lateButPartlyPaid = await issuedInvoice()
  assert.equal((await pay(lateButPartlyPaid, { p_amount: 100 })).error, null)
  const notYetDue = await issuedInvoice()
  const paid = await issuedInvoice()
  assert.equal((await pay(paid, { p_amount: 230 })).error, null)
  const cancelled = await issuedInvoice()
  assert.equal((await memberClient.rpc('cancel_invoice', { p_invoice: cancelled })).error, null)
  const draft = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Pay Client A' }).select('id').single()).id
  for (const id of [late, lateButPartlyPaid, paid, cancelled]) must(await admin.from('invoices').update(past).eq('id', id).select('id'))

  const first = await admin.rpc('mark_overdue_invoices')
  assert.equal(first.error, null)
  assert.ok(Number(first.data) >= 2, 'at least the two late invoices changed')
  assert.equal((await row('invoices', late)).status, 'Overdue')
  assert.equal((await row('invoices', lateButPartlyPaid)).status, 'Overdue')
  assert.equal(Number((await row('invoices', lateButPartlyPaid)).balance_amount), 130)
  assert.equal((await row('invoices', notYetDue)).status, 'Issued')
  assert.equal((await row('invoices', paid)).status, 'Paid')
  assert.equal((await row('invoices', cancelled)).status, 'Cancelled')
  assert.equal((await row('invoices', draft)).status, 'Draft')

  const entries = async (id: string) => (await timeline('invoice.overdue')).filter((entry) => entry.details.invoice_id === id)
  assert.equal((await entries(late)).length, 1)
  assert.equal((await entries(lateButPartlyPaid)).length, 1)
  assert.equal((await entries(notYetDue)).length, 0)

  const second = await admin.rpc('mark_overdue_invoices')
  assert.equal(second.error, null)
  assert.equal((await entries(late)).length, 1, 'a second run writes nothing more')

  assert.equal((await pay(lateButPartlyPaid, { p_amount: 130 })).error, null)
  assert.equal((await row('invoices', lateButPartlyPaid)).status, 'Paid', 'paying an overdue invoice in full makes it Paid')
})

test('only the service role can run the nightly function', async () => {
  assert.ok((await memberClient.rpc('mark_overdue_invoices')).error, 'a member cannot run it')
  assert.ok((await anonymous.rpc('mark_overdue_invoices')).error, 'anon cannot run it')
})
