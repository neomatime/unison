import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { ok, saToday, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin, cleanup, createFixtureUser, signedInClient } from './helpers.ts'
import { anonymous, must } from './portal-fixtures.ts'

// Accept to invoice, stage 3, task 1: the schema for payment reminders. The switch (billing_reminders_enabled and its stamp), the
// pause state on a plan item, and the billing_reminders table whose unique key makes a reminder impossible to send twice. Nothing here
// has a function behind it yet, so the service role writes and the signed-in roles are only asked what the privilege layer, the
// policies and the constraints let them do. Every refusal is checked by SQLSTATE and by the name of the constraint.

let fx: BillingOrg
let other: BillingOrg
let ownerClient: SupabaseClient
let adminClient: SupabaseClient
const extraUsers: string[] = []

before(async () => {
  fx = await setupBillingOrg('billing-rem-schema-a', { billing: false })
  other = await setupBillingOrg('billing-rem-schema-b')
  for (const [role, assign] of [['owner', (client: SupabaseClient) => (ownerClient = client)], ['admin', (client: SupabaseClient) => (adminClient = client)]] as const) {
    const user = await createFixtureUser(fx.orgId, role)
    extraUsers.push(user.id)
    assign(await signedInClient(user.email, user.password))
  }
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    try {
      await other?.teardown()
    } finally {
      await cleanup([], extraUsers)
    }
  }
})

const refused = (result: { error: { code?: string; message: string } | null }, code: string, message: RegExp, label: string) => {
  assert.equal(result.error?.code, code, `${label}: ${result.error?.message}`)
  assert.match(result.error?.message ?? '', message, label)
}
const MINUTES = 60_000
const ago = (value: string | null) => Math.abs(Date.now() - new Date(value as string).getTime())
const settings = async () =>
  must(await admin.from('organization_settings').select('billing_reminders_enabled,billing_reminders_enabled_at').eq('organization_id', fx.orgId).single())

test('billing_reminders_enabled defaults to false, an owner or admin can switch it, a member cannot, and its time is stamped on, cleared off and cannot be typed', async () => {
  const TYPED = '2020-01-01T00:00:00+00:00'
  assert.deepEqual(await settings(), { billing_reminders_enabled: false, billing_reminders_enabled_at: null })

  const refusedWrite = await fx.sender.client.from('organization_settings').update({ billing_reminders_enabled: true, billing_reminders_enabled_at: TYPED })
    .eq('organization_id', fx.orgId).select('billing_reminders_enabled')
  ok(refusedWrite, 'the member update is filtered, not an error')
  assert.deepEqual(refusedWrite.data, [])
  assert.deepEqual(await settings(), { billing_reminders_enabled: false, billing_reminders_enabled_at: null })

  const write = (client: SupabaseClient, change: Record<string, unknown>) =>
    client.from('organization_settings').update(change).eq('organization_id', fx.orgId).select('billing_reminders_enabled,billing_reminders_enabled_at').single()

  const on = must(await write(ownerClient, { billing_reminders_enabled: true, billing_reminders_enabled_at: TYPED }))
  assert.equal(on.billing_reminders_enabled, true)
  assert.ok(ago(on.billing_reminders_enabled_at) < 10 * MINUTES, `stamped now, not typed: ${on.billing_reminders_enabled_at}`)
  assert.deepEqual(must(await write(ownerClient, { tagline: 'Reminders fixture' })), on, 'saving another field keeps the time')
  assert.deepEqual(must(await write(adminClient, { billing_reminders_enabled_at: TYPED })), on, 'a typed time is overwritten')

  assert.deepEqual(must(await write(adminClient, { billing_reminders_enabled: false, billing_reminders_enabled_at: TYPED })), { billing_reminders_enabled: false, billing_reminders_enabled_at: null })
  const again = must(await write(adminClient, { billing_reminders_enabled: true }))
  assert.ok(new Date(again.billing_reminders_enabled_at).getTime() > new Date(on.billing_reminders_enabled_at).getTime(), 'a second switch on is stamped again')

  const others = must(await admin.from('organization_settings').select('billing_plans_enabled,billing_plans_enabled_at,billing_auto_send_enabled,billing_auto_send_enabled_at').eq('organization_id', fx.orgId).single())
  assert.deepEqual(others, { billing_plans_enabled: false, billing_plans_enabled_at: null, billing_auto_send_enabled: false, billing_auto_send_enabled_at: null }, 'the other two switches are independent')
  must(await write(adminClient, { billing_reminders_enabled: false }))
})

test('the pause columns are both set or both null and the reason is at most 500 characters', async () => {
  await fx.setBilling(true)
  const quote = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(quote)
  const item = must(await admin.from('billing_plan_items').select('*').eq('quote_id', quote).eq('month_number', 2).single()) as Record<string, any>
  assert.equal(item.reminders_paused_at, null)
  assert.equal(item.reminders_paused_by, null)
  assert.equal(item.reminders_pause_reason, null)

  const set = (change: Record<string, unknown>) => admin.from('billing_plan_items').update(change).eq('id', item.id)
  const now = new Date().toISOString()
  refused(await set({ reminders_paused_at: now }), '23514', /billing_plan_items_reminders_pause_pair_check/, 'a time without a reason')
  refused(await set({ reminders_pause_reason: 'Waiting for the client' }), '23514', /billing_plan_items_reminders_pause_pair_check/, 'a reason without a time')
  refused(await set({ reminders_paused_at: now, reminders_pause_reason: 'x'.repeat(501) }), '23514', /billing_plan_items_reminders_pause_reason_check/, 'a reason over 500 characters')
  ok(await set({ reminders_paused_at: now, reminders_pause_reason: 'Waiting for the client' }), 'both')
  ok(await set({ reminders_paused_at: null, reminders_pause_reason: null, reminders_paused_by: null }), 'cleared')
  await fx.setBilling(false)
})

test('billing_reminders is readable by members of its organisation only and unwritable by every signed-in role', async () => {
  await fx.setBilling(true)
  const quote = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(quote)
  const invoice = must(await admin.from('invoices').select('id').eq('quote_id', quote).single())
  const row = must(await admin.from('billing_reminders').insert({ organization_id: fx.orgId, invoice_id: invoice.id, sequence: 1 }).select('*').single()) as Record<string, any>
  assert.equal(row.attempts, 0)
  assert.equal(row.sent_at, null)
  assert.equal(row.claimed_until, null)

  const seen = must(await fx.sender.client.from('billing_reminders').select('id').eq('id', row.id))
  assert.equal(seen.length, 1, 'a member of the organisation reads it')
  for (const [who, client] of [['another organisation', other.sender.client], ['anon', anonymous]] as const) {
    const read = await client.from('billing_reminders').select('id').eq('id', row.id)
    assert.ok(read.error || (read.data ?? []).length === 0, `${who} cannot read it`)
  }
  for (const [who, client] of [['a member', fx.sender.client], ['an owner', ownerClient], ['an admin', adminClient]] as const) {
    assert.ok((await client.from('billing_reminders').insert({ organization_id: fx.orgId, invoice_id: invoice.id, sequence: 2 })).error, `${who} cannot insert`)
    await client.from('billing_reminders').update({ sent_at: new Date().toISOString(), to_address: 'a@b.test' }).eq('id', row.id)
    await client.from('billing_reminders').delete().eq('id', row.id)
  }
  const after = must(await admin.from('billing_reminders').select('sent_at').eq('id', row.id).single())
  assert.equal(after.sent_at, null, 'nothing a signed-in role did changed the row')
  await fx.setBilling(false)
})

test('one reminder per invoice and sequence, sequence 1 to 5 only, a sent row needs an address, and it goes with its invoice', async () => {
  await fx.setBilling(true)
  const quote = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(quote)
  const invoice = must(await admin.from('invoices').select('id').eq('quote_id', quote).single())
  const insert = (fields: Record<string, unknown>) => admin.from('billing_reminders').insert({ organization_id: fx.orgId, invoice_id: invoice.id, ...fields })

  ok(await insert({ sequence: 1 }), 'reminder 1')
  refused(await insert({ sequence: 1 }), '23505', /billing_reminders_invoice_sequence_key/, 'the same sequence twice')
  refused(await insert({ sequence: 0 }), '23514', /billing_reminders_sequence_check/, 'sequence 0')
  refused(await insert({ sequence: 6 }), '23514', /billing_reminders_sequence_check/, 'sequence 6')
  refused(await insert({ sequence: 2, sent_at: new Date().toISOString() }), '23514', /billing_reminders_sent_needs_address_check/, 'sent with no address')
  ok(await insert({ sequence: 2, sent_at: new Date().toISOString(), to_address: 'client@example.test' }), 'a sent reminder with an address')
  refused(await admin.from('billing_reminders').insert({ organization_id: other.orgId, invoice_id: invoice.id, sequence: 3 }), '23503', /billing_reminders_invoice_fkey/, 'another organisation')

  ok(await admin.from('invoices').delete().eq('id', invoice.id), 'delete the invoice')
  assert.equal(must(await admin.from('billing_reminders').select('id').eq('invoice_id', invoice.id)).length, 0, 'its reminders went with it')
  await fx.setBilling(false)
})

test('the fixtures make an issued plan invoice, age it so today is the given number of days past due, and pay it', async () => {
  const plan = await fx.issuedPlanInvoice()
  assert.equal(must(await admin.from('invoices').select('status').eq('id', plan.invoiceId).single()).status, 'Issued')
  await fx.agePast(plan.invoiceId, 3)
  const aged = must(await admin.from('invoices').select('issue_date,due_date').eq('id', plan.invoiceId).single())
  const days = (Date.parse(`${saToday()}T00:00:00Z`) - Date.parse(`${aged.due_date}T00:00:00Z`)) / 86_400_000
  assert.equal(days, 3)
  assert.ok(aged.issue_date <= aged.due_date)
  await fx.payInvoice(plan.invoiceId, 100)
  const part = must(await admin.from('invoices').select('status,balance_amount,total_amount').eq('id', plan.invoiceId).single())
  assert.equal(Number(part.balance_amount), Number(part.total_amount) - 100)
  await fx.payInvoice(plan.invoiceId, Number(part.balance_amount))
  const paid = must(await admin.from('invoices').select('status,balance_amount').eq('id', plan.invoiceId).single())
  assert.equal(paid.status, 'Paid')
  assert.equal(Number(paid.balance_amount), 0)
})
