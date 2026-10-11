import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let orgBig: string
let member: U
let other: U
let bigMember: U
let memberClient: SupabaseClient
let otherClient: SupabaseClient
let bigClient: SupabaseClient
let clientA: string
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const summary = async (kind: string, client: SupabaseClient = memberClient, org: string = orgA) => {
  const result = await client.rpc('register_summary', { p_org: org, p_kind: kind })
  assert.equal(result.error, null, `${kind}: ${result.error?.message}`)
  return result.data as Record<string, any>
}
const now = () => new Date().toISOString()
/** Today's South African date: the database checks payment dates against it, never against the UTC date. */
const sast = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

before(async () => {
  orgA = await createFixtureOrg('register-a')
  orgB = await createFixtureOrg('register-b')
  orgBig = await createFixtureOrg('register-big')
  member = await createFixtureUser(orgA, 'member')
  other = await createFixtureUser(orgB, 'owner')
  bigMember = await createFixtureUser(orgBig, 'member')
  memberClient = await signedInClient(member.email, member.password)
  otherClient = await signedInClient(other.email, other.password)
  bigClient = await signedInClient(bigMember.email, bigMember.password)
  clientA = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Reg Client A', status: 'Active' }).select('id').single()).id
  must(await admin.from('organization_settings').insert({ organization_id: orgA, legal_name: 'Test Co (Pty) Ltd', document_prefix: 'TST', vat_rate: 15 }).select('id').single())
})

after(async () => {
  await cleanup([orgA, orgB, orgBig].filter(Boolean), [member?.id, other?.id, bigMember?.id].filter(Boolean))
})

test('lead cards count active and qualified leads and sum the estimated value per currency; archived leads are left out', async () => {
  must(await admin.from('leads').insert([
    { organization_id: orgA, company_name: 'L1', contact_name: 'c', status: 'New', estimated_value: 100 },
    { organization_id: orgA, company_name: 'L2', contact_name: 'c', status: 'Qualified', estimated_value: 200 },
    { organization_id: orgA, company_name: 'L3', contact_name: 'c', status: 'Qualified', estimated_value: 50, currency: 'USD' },
    { organization_id: orgA, company_name: 'L4', contact_name: 'c', status: 'Qualified', estimated_value: 999, archived_at: now() },
  ]).select('id'))
  assert.deepEqual(await summary('lead'), { count: 3, qualified: 2, value: { ZAR: 300, USD: 50 } })
})

test('quote cards count active and accepted quotes and sum the totals', async () => {
  const quote = must(await memberClient.from('quotes').insert({ organization_id: orgA, client_id: clientA, client_name: 'Reg Client A' }).select('id').single())
  assert.equal((await memberClient.from('quote_lines').insert({ organization_id: orgA, quote_id: quote.id, position: 1, title: 'Advisory', quantity: 2, unit_price: 100 })).error, null)
  must(await admin.from('quotes').insert([
    { organization_id: orgA, quote_number: 'REG-Q-1', client_name: 'x', status: 'Accepted' },
    { organization_id: orgA, quote_number: 'REG-Q-2', client_name: 'x', status: 'Sent', archived_at: now() },
  ]).select('id'))
  const result = await summary('quote')
  assert.equal(result.count, 2)
  assert.equal(result.accepted, 1)
  assert.deepEqual(result.value, { ZAR: 230 })
})

test('sales cards count open opportunities and weight their value by probability; Won and Lost are not open', async () => {
  must(await admin.from('sales_opportunities').insert([
    { organization_id: orgA, name: 'O1', client_name: 'x', stage: 'Proposal', expected_value: 1000, probability_percent: 50 },
    { organization_id: orgA, name: 'O2', client_name: 'x', stage: 'Negotiation', expected_value: 400, probability_percent: 25, currency: 'USD' },
    { organization_id: orgA, name: 'O3', client_name: 'x', stage: 'Won', expected_value: 5000, probability_percent: 100 },
    { organization_id: orgA, name: 'O4', client_name: 'x', stage: 'Lost', expected_value: 7000, probability_percent: 0, lost_reason: 'Went with a competitor' },
    { organization_id: orgA, name: 'O5', client_name: 'x', stage: 'Proposal', expected_value: 900, probability_percent: 90, archived_at: now() },
  ]).select('id'))
  assert.deepEqual(await summary('opportunity'), { open: 2, pipeline: { ZAR: 1000, USD: 400 }, weighted: { ZAR: 500, USD: 100 } })
})

test('invoice cards count the register, the collectible balance and the overdue invoices; drafts, paid and archived are not collectible', async () => {
  const issue = async () => {
    const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Reg Client A' }).select('id').single())
    assert.equal((await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 1, title: 'Advisory', quantity: 2, unit_price: 100 })).error, null)
    assert.equal((await memberClient.rpc('issue_invoice', { p_id: invoice.id })).error, null)
    return invoice.id as string
  }
  await issue() // Issued, 230 owing
  const overdue = await issue()
  must(await admin.from('invoices').update({ status: 'Overdue' }).eq('id', overdue).select('id'))
  const paid = await issue()
  assert.equal((await memberClient.rpc('record_payment', { p_invoice: paid, p_amount: 230, p_received_on: sast(), p_method: 'Cash', p_reference: null })).error, null)
  const archived = await issue()
  must(await admin.from('invoices').update({ archived_at: now() }).eq('id', archived).select('id'))
  must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Reg Client A' }).select('id').single()) // a draft
  const result = await summary('invoice')
  assert.equal(result.count, 4, 'issued, overdue, paid and the draft; the archived one is not counted')
  assert.deepEqual(result.outstanding, { ZAR: 460 })
  assert.equal(result.overdue, 1)
})

test('expense cards sum the spend and the approved spend and count those awaiting approval', async () => {
  const date = new Date().toISOString().slice(0, 10)
  must(await admin.from('expenses').insert([
    { organization_id: orgA, description: 'E1', amount: 100, expense_date: date, status: 'Approved' },
    { organization_id: orgA, description: 'E2', amount: 50, expense_date: date, status: 'Submitted' },
    { organization_id: orgA, description: 'E3', amount: 25, expense_date: date, status: 'Awaiting Approval' },
    { organization_id: orgA, description: 'E4', amount: 10, expense_date: date, status: 'Draft', currency: 'USD' },
    { organization_id: orgA, description: 'E5', amount: 999, expense_date: date, status: 'Approved', archived_at: now() },
  ]).select('id'))
  assert.deepEqual(await summary('expense'), { spend: { ZAR: 175, USD: 10 }, awaiting: 2, approved: { ZAR: 100 } })
})

test('an unknown register is refused, another organisation sees nothing, a non-member gets nothing, and anon cannot call it', async () => {
  const unknown = await memberClient.rpc('register_summary', { p_org: orgA, p_kind: 'expenses; drop table' })
  assert.ok(unknown.error)
  assert.match(unknown.error!.message, /REGISTER_KIND_UNKNOWN/)
  assert.deepEqual(await summary('lead', otherClient, orgA), { count: 0, qualified: 0, value: {} })
  assert.deepEqual(await summary('invoice', memberClient, orgB), { count: 0, outstanding: {}, overdue: 0 })
  assert.ok((await anonymous.rpc('register_summary', { p_org: orgA, p_kind: 'lead' })).error)
})

test('a register with more than 1,000 rows pages to its last row with the exact total', async () => {
  const rows = Array.from({ length: 1100 }, () => ({ organization_id: orgBig, client_name: 'Bulk Client' }))
  for (let start = 0; start < rows.length; start += 500) {
    must(await admin.from('invoices').insert(rows.slice(start, start + 500)).select('id'))
  }
  assert.equal((await summary('invoice', bigClient, orgBig)).count, 1100)
  const pageOne = await bigClient.from('invoices').select('id', { count: 'exact' }).eq('organization_id', orgBig).is('archived_at', null).order('created_at', { ascending: false }).order('id', { ascending: true }).range(0, 24)
  assert.equal(pageOne.error, null)
  assert.equal(pageOne.count, 1100, 'the exact total, not the first 1,000')
  assert.equal(pageOne.data!.length, 25)
  const lastPage = await bigClient.from('invoices').select('id', { count: 'exact' }).eq('organization_id', orgBig).is('archived_at', null).order('created_at', { ascending: false }).order('id', { ascending: true }).range(1075, 1099)
  assert.equal(lastPage.error, null)
  assert.equal(lastPage.data!.length, 25, 'the 1,076th to the 1,100th row are all there')
  const pastEnd = await bigClient.from('invoices').select('id', { count: 'exact' }).eq('organization_id', orgBig).range(1100, 1124)
  // PostgREST answers a range that starts past the last row with PGRST103 (not an empty page); queryRegister handles that code.
  assert.ok(pastEnd.error?.code === 'PGRST103' || (pastEnd.data ?? []).length === 0, 'past the end is an error or an empty page, never more rows')
  const ids = new Set([...pageOne.data!, ...lastPage.data!].map((row) => row.id))
  assert.equal(ids.size, 50, 'no row appears on both pages')
})

test('the forecast no longer counts an archived invoice as money still due', async () => {
  const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Reg Client A' }).select('id').single())
  assert.equal((await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 1, title: 'Advisory', quantity: 10, unit_price: 100 })).error, null)
  assert.equal((await memberClient.rpc('issue_invoice', { p_id: invoice.id })).error, null)
  const due = async () => ((await memberClient.rpc('forecast_months', { p_org: orgA })).data as Array<{ bucket: string; currency: string; invoices_due: number }>)
    .filter((row) => row.currency === 'ZAR').reduce((sum, row) => sum + Number(row.invoices_due), 0)
  const before = await due()
  must(await admin.from('invoices').update({ archived_at: now() }).eq('id', invoice.id).select('id'))
  assert.equal(before - (await due()), 1150, 'the archived invoice (10 x 100 plus VAT) is gone from the forecast')
})
