import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }
type Row = { bucket: string; month: string | null; currency: string; collected: number; invoices_due: number; pipeline: number }

let orgA: string
let orgB: string
let member: U
let other: U
let memberClient: SupabaseClient
let otherClient: SupabaseClient
let clientA: string

const sast = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const addDays = (isoDate: string, days: number) => new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
const firstOfMonth = (isoDate: string, plusMonths = 0) => {
  const [year, month] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + plusMonths, 1))
  return date.toISOString().slice(0, 10)
}
const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}

/** An issued invoice of 230.00 (or the given quantity x 100 plus 15% VAT) due on the given date, in the given currency. */
async function issued(dueDate: string, currency = 'ZAR', quantity = 2) {
  const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Fc Client A', currency }).select('id').single())
  assert.equal((await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 1, title: 'Advisory', quantity, unit_price: 100 })).error, null)
  assert.equal((await memberClient.rpc('issue_invoice', { p_id: invoice.id })).error, null)
  must(await admin.from('invoices').update({ issue_date: addDays(sast(), -60), due_date: dueDate }).eq('id', invoice.id).select('id'))
  return invoice.id as string
}
const opportunity = async (over: Record<string, unknown>) =>
  must(await memberClient.from('sales_opportunities').insert({ organization_id: orgA, name: `Opp ${Math.random()}`, client_name: 'Fc Client A', stage: 'Proposal', expected_value: 1000, probability_percent: 50, currency: 'ZAR', ...over }).select('id').single())
const forecast = async (client: SupabaseClient = memberClient, org: string = orgA) => {
  const result = await client.rpc('forecast_months', { p_org: org })
  assert.equal(result.error, null)
  return (result.data as Row[]).map((entry) => ({ ...entry, collected: Number(entry.collected), invoices_due: Number(entry.invoices_due), pipeline: Number(entry.pipeline) }))
}
const find = (rows: Row[], bucket: string, month: string | null, currency = 'ZAR') => rows.find((entry) => entry.bucket === bucket && entry.month === month && entry.currency === currency)

before(async () => {
  orgA = await createFixtureOrg('forecast-a')
  orgB = await createFixtureOrg('forecast-b')
  member = await createFixtureUser(orgA, 'member')
  other = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  otherClient = await signedInClient(other.email, other.password)
  clientA = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Fc Client A', status: 'Active' }).select('id').single()).id
  must(await admin.from('organization_settings').insert({ organization_id: orgA, legal_name: 'Test Co (Pty) Ltd', document_prefix: 'TST', vat_rate: 15 }).select('id').single())
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [member?.id, other?.id].filter(Boolean))
})

test('collected, due and pipeline are grouped by month and currency; overdue and past dates fold into the current month; later and undated stand apart', async () => {
  const today = sast()
  const thisMonth = firstOfMonth(today)
  const nextMonth = firstOfMonth(today, 1)

  // Invoices (balance 230 each unless said): overdue, due next month, due far away, USD, paid, cancelled, part-paid.
  const overdue = await issued(addDays(today, -20))
  await issued(addDays(nextMonth, 3))
  await issued(firstOfMonth(today, 9))
  await issued(addDays(nextMonth, 3), 'USD', 1)
  const paid = await issued(addDays(nextMonth, 3))
  assert.equal((await memberClient.rpc('record_payment', { p_invoice: paid, p_amount: 230, p_received_on: today, p_method: 'Cash', p_reference: null })).error, null)
  const cancelled = await issued(addDays(nextMonth, 3))
  assert.equal((await memberClient.rpc('cancel_invoice', { p_invoice: cancelled })).error, null)
  const voidedOne = must(await memberClient.rpc('record_payment', { p_invoice: overdue, p_amount: 30, p_received_on: today, p_method: 'Card', p_reference: null })).valueOf() as string
  assert.equal((await memberClient.rpc('void_payment', { p_payment: voidedOne, p_reason: 'Wrong invoice' })).error, null)
  assert.equal((await memberClient.rpc('record_payment', { p_invoice: overdue, p_amount: 50, p_received_on: today, p_method: 'Bank transfer', p_reference: null })).error, null)

  // Opportunities: open next month 1000 x 50% = 500; undated 2000 x 100%; past close 400 x 25% = 100; far future; Won, Lost, archived; USD.
  await opportunity({ expected_close: addDays(nextMonth, 5) })
  await opportunity({ expected_value: 2000, probability_percent: 100, expected_close: null })
  await opportunity({ expected_value: 400, probability_percent: 25, expected_close: addDays(today, -90) })
  await opportunity({ expected_value: 800, probability_percent: 50, expected_close: firstOfMonth(today, 12) })
  await opportunity({ stage: 'Won', expected_close: addDays(nextMonth, 5) })
  await opportunity({ stage: 'Lost', lost_reason: 'Went with a competitor', expected_close: addDays(nextMonth, 5) })
  await opportunity({ expected_close: addDays(nextMonth, 5), archived_at: new Date().toISOString() })
  await opportunity({ currency: 'USD', expected_value: 100, probability_percent: 10, expected_close: addDays(nextMonth, 5) })

  const rows = await forecast()

  // Collected: 230 (paid) + 50 (the unvoided payment on the overdue invoice) this month; the voided 30 is ignored.
  assert.equal(find(rows, 'month', thisMonth)!.collected, 280)
  // Due: the overdue invoice (230 - 50 = 180) folds into this month; the cancelled and the paid one are not counted.
  assert.equal(find(rows, 'month', thisMonth)!.invoices_due, 180)
  assert.equal(find(rows, 'month', nextMonth)!.invoices_due, 230)
  assert.equal(find(rows, 'later', null)!.invoices_due, 230)
  assert.equal(find(rows, 'month', nextMonth, 'USD')!.invoices_due, 115)
  // Pipeline: the past close (100) folds into this month; next month 500; the far one is 'later' (400); the undated one stands apart.
  assert.equal(find(rows, 'month', thisMonth)!.pipeline, 100)
  assert.equal(find(rows, 'month', nextMonth)!.pipeline, 500)
  assert.equal(find(rows, 'later', null)!.pipeline, 400)
  assert.equal(find(rows, 'undated', null)!.pipeline, 2000)
  assert.equal(find(rows, 'month', nextMonth, 'USD')!.pipeline, 10)
  assert.equal(rows.every((entry) => entry.bucket !== 'month' || entry.month !== null), true)
})

test('another organisation sees nothing, and a caller sees nothing for an organisation they do not belong to', async () => {
  assert.deepEqual(await forecast(otherClient, orgA), [])
  assert.deepEqual(await forecast(memberClient, orgB), [])
  assert.deepEqual(await forecast(otherClient, orgB), [])
})

test('an organisation with no data gets no rows', async () => {
  const quiet = await createFixtureOrg('forecast-quiet')
  const quietUser = await createFixtureUser(quiet, 'member')
  try {
    const client = await signedInClient(quietUser.email, quietUser.password)
    assert.deepEqual(await forecast(client, quiet), [])
  } finally {
    await cleanup([quiet], [quietUser.id])
  }
})
