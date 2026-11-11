import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { ok, refused, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin, cleanup, createFixtureUser, signedInClient } from './helpers.ts'
import { anonymous, must } from './portal-fixtures.ts'

// Accept to invoice, stage 3, task 3: pausing and resuming reminders on one invoice (billing_reminders_set_paused), a person's
// recorded decision with a reason, and who may read the reminders. Plans come from fx.issuedPlanInvoice with reminders switched on.

let fx: BillingOrg
let other: BillingOrg
let owner: { id: string; client: SupabaseClient }
let adminUser: { id: string; client: SupabaseClient }
let otherOwner: { id: string; client: SupabaseClient }
const extraUsers: string[] = []

before(async () => {
  fx = await setupBillingOrg('billing-rem-pause-a')
  other = await setupBillingOrg('billing-rem-pause-b')
  for (const [org, role, assign] of [
    [fx.orgId, 'owner', (value: typeof owner) => (owner = value)],
    [fx.orgId, 'admin', (value: typeof owner) => (adminUser = value)],
    [other.orgId, 'owner', (value: typeof owner) => (otherOwner = value)],
  ] as const) {
    const user = await createFixtureUser(org, role)
    extraUsers.push(user.id)
    assign({ id: user.id, client: await signedInClient(user.email, user.password) })
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

type Row = Record<string, any>
const plusDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
const pause = (client: SupabaseClient, invoice: string, paused: boolean, reason: string | null = 'Client promised payment on Friday') =>
  client.rpc('billing_reminders_set_paused', { p_invoice_id: invoice, p_paused: paused, p_reason: reason })
const itemRow = async (id: string) => must(await admin.from('billing_plan_items').select('*').eq('id', id).single()) as Row
const candidates = async (invoice: string, on: string) =>
  (must(await admin.rpc('billing_reminder_candidates', { p_limit: 200, p_on: on })) as Array<{ invoice_id: string; sequence: number }>).filter((row) => row.invoice_id === invoice)
const changes = async () => must(await admin.from('activities').select('subject,created_by').eq('client_id', fx.clientId).eq('kind', 'billing.reminders_changed').order('created_at')) as Row[]

async function plan() {
  const made = await fx.issuedPlanInvoice()
  await fx.setReminders(true)
  const due = (must(await admin.from('invoices').select('due_date').eq('id', made.invoiceId).single()) as Row).due_date as string
  return { ...made, due }
}

test('an owner and an admin can pause with a reason and resume; a member cannot; another organisation and an invoice with no plan are not found', async () => {
  const p = await plan()
  refused((await pause(fx.sender.client, p.invoiceId, true)).error, 'BILLING_PLAN_ADMIN_ONLY')
  refused((await pause(other.sender.client, p.invoiceId, true)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await pause(otherOwner.client, p.invoiceId, true)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  assert.match((await pause(anonymous, p.invoiceId, true)).error?.message ?? '', /permission denied for function billing_reminders_set_paused/)
  assert.equal((await itemRow(p.itemId)).reminders_paused_at, null, 'the refused calls paused nothing')

  assert.equal((await pause(owner.client, p.invoiceId, true)).error, null)
  const paused = await itemRow(p.itemId)
  assert.ok(paused.reminders_paused_at)
  assert.equal(paused.reminders_pause_reason, 'Client promised payment on Friday')
  assert.equal(paused.reminders_paused_by, owner.id)

  assert.equal((await pause(adminUser.client, p.invoiceId, false, null)).error, null, 'an admin resumes, with no reason')
  const resumed = await itemRow(p.itemId)
  assert.equal(resumed.reminders_paused_at, null)
  assert.equal(resumed.reminders_pause_reason, null)
  assert.equal(resumed.reminders_paused_by, null)
  assert.equal((await pause(adminUser.client, p.invoiceId, true, 'Disputed')).error, null, 'an admin can pause too')
  assert.equal((await itemRow(p.itemId)).reminders_paused_by, adminUser.id)
  assert.equal((await pause(adminUser.client, p.invoiceId, false, null)).error, null)

  const hand = must(await admin.from('invoices').insert({ organization_id: fx.orgId, client_id: fx.clientId, client_name: 'Portal Client', status: 'Draft' }).select('id').single())
  refused((await pause(owner.client, hand.id as string, true)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await pause(owner.client, '00000000-0000-4000-8000-0000000000aa', true)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
})

test('pausing needs a reason of 1 to 500 characters; resuming does not', async () => {
  const p = await plan()
  for (const reason of [null, '', '   ', 'x'.repeat(501)]) {
    refused((await pause(owner.client, p.invoiceId, true, reason)).error, 'BILLING_REASON_REQUIRED')
  }
  refused((await pause(owner.client, p.invoiceId, false, 'x'.repeat(501))).error, 'BILLING_REASON_REQUIRED')
  assert.equal((await itemRow(p.itemId)).reminders_paused_at, null, 'nothing was paused')
  assert.equal((await pause(owner.client, p.invoiceId, true, 'x'.repeat(500))).error, null, '500 characters is allowed')
  assert.equal((await pause(owner.client, p.invoiceId, true, '  Padded  ')).error, null, 'pausing twice is harmless')
  assert.equal((await itemRow(p.itemId)).reminders_pause_reason, 'x'.repeat(500), 'the first reason stands')
  assert.equal((await pause(owner.client, p.invoiceId, false, null)).error, null)
})

test('a paused invoice is not a candidate, and resuming brings it back at its next unsent reminder', async () => {
  const p = await plan()
  const day = (offset: number) => plusDays(p.due, offset)
  assert.equal((await candidates(p.invoiceId, day(3))).length, 1)
  assert.equal((await admin.rpc('billing_reminder_claim', { p_invoice_id: p.invoiceId, p_on: day(3) })).error, null)
  assert.equal((await admin.rpc('billing_reminder_record', { p_invoice_id: p.invoiceId, p_sequence: 1, p_to: 'accounts@portal-client.test', p_subject: 'Reminder', p_sha256: 'a'.repeat(64), p_bytes: 100 })).error, null)

  assert.equal((await pause(owner.client, p.invoiceId, true)).error, null)
  assert.deepEqual(await candidates(p.invoiceId, day(10)), [], 'paused: reminder 2 does not go')
  assert.deepEqual(await candidates(p.invoiceId, day(40)), [], 'and later days do not change that')

  assert.equal((await pause(owner.client, p.invoiceId, false, null)).error, null)
  assert.deepEqual(await candidates(p.invoiceId, day(40)), [{ invoice_id: p.invoiceId, sequence: 2 }], 'resumed: the next unsent one, not a repeat of the first')
})

test('pausing twice is harmless and each real change writes one timeline entry by the member who made it', async () => {
  const p = await plan()
  const before = (await changes()).length
  assert.equal((await pause(owner.client, p.invoiceId, true, 'Waiting for the client')).error, null)
  assert.equal((await pause(owner.client, p.invoiceId, true, 'Waiting again')).error, null)
  assert.equal((await pause(adminUser.client, p.invoiceId, false, 'Paid by cash')).error, null)
  assert.equal((await pause(adminUser.client, p.invoiceId, false, null)).error, null, 'resuming what is not paused changes nothing')
  const written = (await changes()).slice(before)
  assert.equal(written.length, 2, 'one for the pause and one for the resume')
  assert.match(written[0].subject, /^Reminders paused for invoice .+: Waiting for the client$/)
  assert.equal(written[0].created_by, owner.id)
  assert.match(written[1].subject, /^Reminders resumed for invoice .+: Paid by cash$/)
  assert.equal(written[1].created_by, adminUser.id)
})

test('members read their organisation\'s reminders and not another organisation\'s', async () => {
  const p = await plan()
  const claimed = await admin.rpc('billing_reminder_claim', { p_invoice_id: p.invoiceId, p_on: plusDays(p.due, 3) })
  assert.equal(claimed.error, null)
  const seen = must(await fx.sender.client.from('billing_reminders').select('id').eq('invoice_id', p.invoiceId))
  assert.equal(seen.length, 1)
  assert.equal(must(await other.sender.client.from('billing_reminders').select('id').eq('invoice_id', p.invoiceId)).length, 0, 'another organisation sees none')
  ok(await admin.from('billing_reminders').delete().eq('invoice_id', p.invoiceId), 'tidy')
})
