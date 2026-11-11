import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { itemsOf, ok, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin, cleanup, createFixtureUser, signedInClient } from './helpers.ts'
import { anonymous, must } from './portal-fixtures.ts'

// Accept to invoice, stage 2, task 1: the schema. The switch for automatic sending (billing_auto_send_enabled and its stamp), the
// state a plan item carries while the runner works on it, and the outbox the notice emails wait in. Nothing here has a function
// behind it yet, so the service role writes and the signed-in roles are only asked what the privilege layer, the policies and the
// constraints let them do. Every refusal is checked by SQLSTATE and by the name of the constraint, so a row cannot be refused
// for the wrong reason.

let fx: BillingOrg
let ownerClient: SupabaseClient
let adminClient: SupabaseClient
const extraUsers: string[] = []

before(async () => {
  fx = await setupBillingOrg('billing-auto-schema', { billing: false })
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
    await cleanup([], extraUsers)
  }
})

const refused = (result: { error: { code?: string; message: string } | null }, code: string, message: RegExp, label: string) => {
  assert.equal(result.error?.code, code, `${label}: ${result.error?.message}`)
  assert.match(result.error?.message ?? '', message, label)
}
const MINUTES = 60_000
const ago = (value: string | null) => Math.abs(Date.now() - new Date(value as string).getTime())
const settings = async () =>
  must(await admin.from('organization_settings').select('billing_auto_send_enabled,billing_auto_send_enabled_at').eq('organization_id', fx.orgId).single())

test('billing_auto_send_enabled defaults to false, an owner or admin can switch it, a member cannot, and its time is stamped on, cleared off and cannot be typed', async () => {
  const TYPED = '2020-01-01T00:00:00+00:00'
  assert.deepEqual(await settings(), { billing_auto_send_enabled: false, billing_auto_send_enabled_at: null }, 'off by default, with no time')

  const refusedWrite = await fx.sender.client.from('organization_settings').update({ billing_auto_send_enabled: true, billing_auto_send_enabled_at: TYPED })
    .eq('organization_id', fx.orgId).select('billing_auto_send_enabled')
  ok(refusedWrite, 'the member update is filtered, not an error')
  assert.deepEqual(refusedWrite.data, [], 'the member update matched no row')
  assert.deepEqual(await settings(), { billing_auto_send_enabled: false, billing_auto_send_enabled_at: null }, 'a member changed nothing')

  const write = (client: SupabaseClient, change: Record<string, unknown>) =>
    client.from('organization_settings').update(change).eq('organization_id', fx.orgId).select('billing_auto_send_enabled,billing_auto_send_enabled_at').single()

  const on = must(await write(ownerClient, { billing_auto_send_enabled: true, billing_auto_send_enabled_at: TYPED }))
  assert.equal(on.billing_auto_send_enabled, true)
  assert.ok(ago(on.billing_auto_send_enabled_at) < 10 * MINUTES, `stamped now, not typed: ${on.billing_auto_send_enabled_at}`)

  const saved = must(await write(ownerClient, { tagline: 'Automatic sending fixture' }))
  assert.deepEqual(saved, on, 'saving another field keeps the time')
  const typed = must(await write(adminClient, { billing_auto_send_enabled_at: TYPED }))
  assert.deepEqual(typed, on, 'a time typed while on is overwritten by the one kept')

  const off = must(await write(adminClient, { billing_auto_send_enabled: false, billing_auto_send_enabled_at: TYPED }))
  assert.deepEqual(off, { billing_auto_send_enabled: false, billing_auto_send_enabled_at: null }, 'off clears the time, and a typed one with it')

  const again = must(await write(adminClient, { billing_auto_send_enabled: true }))
  assert.ok(new Date(again.billing_auto_send_enabled_at).getTime() > new Date(on.billing_auto_send_enabled_at).getTime(), 'a second switch on is stamped again')

  // The Stage 1 switch is untouched by this one.
  const stage1 = must(await admin.from('organization_settings').select('billing_plans_enabled,billing_plans_enabled_at').eq('organization_id', fx.orgId).single())
  assert.deepEqual(stage1, { billing_plans_enabled: false, billing_plans_enabled_at: null }, 'the plans switch is independent')
  must(await write(adminClient, { billing_auto_send_enabled: false }))
})

test('the new item columns default to null and zero, attention_code accepts only its three values and send_attempts is bounded', async () => {
  await fx.setBilling(true)
  const quote = await fx.sentBillingQuote()
  await fx.acceptedOnPortal(quote)
  const items = await itemsOf(quote)
  assert.ok(items.length > 1, 'the acceptance built the plan')
  const item = items[1]
  assert.equal(item.system_issued_at, null)
  assert.equal(item.send_lease_until, null)
  assert.equal(item.send_attempts, 0)
  assert.equal(item.attention_code, null)
  assert.equal(item.attention_detail, null)
  assert.equal(item.attention_notified_at, null)

  const set = (change: Record<string, unknown>) => admin.from('billing_plan_items').update(change).eq('id', item.id)
  for (const code of ['CHECKS_FAILED', 'CATCH_UP', 'EMAIL_FAILED']) ok(await set({ attention_code: code }), code)
  refused(await set({ attention_code: 'SOMETHING_ELSE' }), '23514', /billing_plan_items_attention_code_check/, 'an unknown code')
  refused(await set({ attention_detail: 'x'.repeat(201) }), '23514', /billing_plan_items_attention_detail_check/, 'a detail over 200 characters')
  refused(await set({ send_attempts: -1 }), '23514', /billing_plan_items_send_attempts_check/, 'negative attempts')
  refused(await set({ send_attempts: 101 }), '23514', /billing_plan_items_send_attempts_check/, 'attempts over 100')
  ok(await set({ send_attempts: 5, attention_code: null, attention_detail: null }), 'a normal value')
  await fx.setBilling(false)
})

test('billing_notice_emails is invisible to members and anon, and writable by the service role', async () => {
  const row = { organization_id: fx.orgId, user_id: fx.owner.userId, subject: 'A notice', body: 'Its body' }
  const written = must(await admin.from('billing_notice_emails').insert(row).select('id,attempts,sent_at,created_at').single())
  assert.equal(written.attempts, 0)
  assert.equal(written.sent_at, null)
  assert.ok(written.created_at)

  for (const [who, client] of [['a member', fx.sender.client], ['an owner', ownerClient], ['anon', anonymous]] as const) {
    const read = await client.from('billing_notice_emails').select('id')
    assert.ok(read.error || (read.data ?? []).length === 0, `${who} cannot read the outbox`)
    const insert = await client.from('billing_notice_emails').insert(row)
    assert.ok(insert.error, `${who} cannot insert into the outbox`)
    await client.from('billing_notice_emails').update({ sent_at: new Date().toISOString() }).eq('id', written.id)
  }
  assert.equal(must(await admin.from('billing_notice_emails').select('sent_at').eq('id', written.id).single()).sent_at, null, 'nothing a signed-in role did changed the row')

  refused(await admin.from('billing_notice_emails').insert({ ...row, subject: '' }), '23514', /billing_notice_emails_subject_check/, 'an empty subject')
  refused(await admin.from('billing_notice_emails').insert({ ...row, body: 'x'.repeat(4001) }), '23514', /billing_notice_emails_body_check/, 'a body over 4000 characters')
  assert.equal((await admin.from('billing_notice_emails').delete().eq('id', written.id)).error, null)
})

test('approvedPlan returns an approved first item whose invoice has an email record, and dueMonth brings a month forward', async () => {
  await fx.setBilling(true)
  const plan = await fx.approvedPlan()
  assert.equal(plan.items[0].monthNumber, 1)
  assert.ok(plan.items.length >= 2)
  const first = must(await admin.from('billing_plan_items').select('approved_at,approved_by').eq('id', plan.items[0].id).single())
  assert.ok(first.approved_at, 'item 1 is approved')
  const invoice = must(await admin.from('invoices').select('status,billing_plan_item_id').eq('id', plan.firstInvoiceId).single())
  assert.equal(invoice.status, 'Issued')
  assert.equal(invoice.billing_plan_item_id, plan.items[0].id)
  const emails = must(await admin.from('document_emails').select('sent_by,to_address').eq('invoice_id', plan.firstInvoiceId))
  assert.equal(emails.length, 1)
  assert.equal(emails[0].sent_by, null)

  await fx.dueMonth(plan.planId, 2)
  const second = must(await admin.from('billing_plan_items').select('bill_on').eq('plan_id', plan.planId).eq('month_number', 2).single())
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  assert.equal(second.bill_on, today)
  await fx.setBilling(false)
})
