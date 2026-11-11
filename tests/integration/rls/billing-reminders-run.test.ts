import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test, { after, before } from 'node:test'

import { ok, refused, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin } from './helpers.ts'
import { anonymous, must } from './portal-fixtures.ts'

// Accept to invoice, stage 3, task 2: the database chooses, claims and records payment reminders. billing_reminder_candidates lists what
// the runner should work on, billing_reminder_claim locks an invoice and claims its next reminder for ten minutes, billing_reminder_record
// records what was sent (the fifth also tells the owner and makes one follow-up task), billing_reminder_release gives a claim back.
// All service role only. The optional p_on argument is the day to evaluate (a test seam: the runner passes none), so the schedule of 3,
// 10, 17, 24 and 31 days past due is tested by asking about those days instead of waiting for them.

let fx: BillingOrg
let other: BillingOrg

before(async () => {
  fx = await setupBillingOrg('billing-rem-run-a')
  other = await setupBillingOrg('billing-rem-run-b')
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    await other?.teardown()
  }
})

type Row = Record<string, any>
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const plusDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
const invoiceRow = async (id: string) => must(await admin.from('invoices').select('*').eq('id', id).single()) as Row
const dueOf = async (id: string) => (await invoiceRow(id)).due_date as string

/** The fixture's reminder candidates for one day, cut down to the given invoices (other fixtures may exist in the database). */
const candidates = async (invoices: string[], on: string) => {
  const rows = must(await admin.rpc('billing_reminder_candidates', { p_limit: 200, p_on: on })) as Array<{ invoice_id: string; sequence: number }>
  return rows.filter((row) => invoices.includes(row.invoice_id))
}
const claim = async (invoice: string, on: string) => must(await admin.rpc('billing_reminder_claim', { p_invoice_id: invoice, p_on: on })) as Row
const record = (invoice: string, sequence: number, overrides: Record<string, unknown> = {}) =>
  admin.rpc('billing_reminder_record', { p_invoice_id: invoice, p_sequence: sequence, p_to: 'accounts@portal-client.test', p_subject: 'Reminder: invoice X', p_sha256: hash(`${invoice}${sequence}`), p_bytes: 3000, ...overrides })
const release = (invoice: string, sequence: number, count = true) => admin.rpc('billing_reminder_release', { p_invoice_id: invoice, p_sequence: sequence, p_count_attempt: count })
const reminders = async (invoice: string) => must(await admin.from('billing_reminders').select('*').eq('invoice_id', invoice).order('sequence')) as Row[]
const sent = async (invoice: string) => (await reminders(invoice)).filter((row) => row.sent_at)

/** A plan invoice the runner issued (month 2 of a plan), with reminders switched on for the organisation. */
async function plan() {
  const made = await fx.issuedPlanInvoice()
  await fx.setReminders(true)
  return { ...made, due: await dueOf(made.invoiceId) }
}

test('the schedule: reminder 1 at 3 days past due, then 10, 17, 24 and 31; one per call however late; none after five', async () => {
  const p = await plan()
  const mine = [p.invoiceId]
  assert.deepEqual(await candidates(mine, plusDays(p.due, 2)), [], 'not before 3 days past due')
  assert.deepEqual(await candidates(mine, plusDays(p.due, 3)), [{ invoice_id: p.invoiceId, sequence: 1 }])

  const offsets = [3, 10, 17, 24, 31]
  for (const [index, offset] of offsets.entries()) {
    const sequence = index + 1
    const day = plusDays(p.due, offset)
    assert.deepEqual(await candidates(mine, plusDays(p.due, offset - 1)), [], `nothing the day before reminder ${sequence}`)
    assert.deepEqual(await candidates(mine, day), [{ invoice_id: p.invoiceId, sequence }], `reminder ${sequence} on day ${offset}`)
    const claimed = await claim(p.invoiceId, day)
    assert.equal(claimed.state, 'ready')
    assert.equal(claimed.sequence, sequence)
    const recorded = await record(p.invoiceId, sequence)
    assert.equal(recorded.error, null, recorded.error?.message)
    assert.deepEqual(await candidates(mine, day), [], `reminder ${sequence} is done for that day`)
  }
  assert.equal((await sent(p.invoiceId)).length, 5)
  assert.deepEqual(await candidates(mine, plusDays(p.due, 90)), [], 'none after five')

  // A late run sends the next one only, never several.
  const late = await plan()
  assert.deepEqual(await candidates([late.invoiceId], plusDays(late.due, 40)), [{ invoice_id: late.invoiceId, sequence: 1 }])
})

test('a part payment keeps reminders going and the record carries the balance; a payment in full ends them; a cancelled invoice and a paused one get none', async () => {
  const p = await plan()
  const day = plusDays(p.due, 3)
  await fx.payInvoice(p.invoiceId, 100)
  const total = Number((await invoiceRow(p.invoiceId)).total_amount)
  assert.deepEqual(await candidates([p.invoiceId], day), [{ invoice_id: p.invoiceId, sequence: 1 }], 'a part payment keeps reminders going')
  assert.equal(Number((await claim(p.invoiceId, day)).balance), total - 100, 'the claim carries the balance still owing')
  assert.equal((await record(p.invoiceId, 1)).error, null)
  assert.equal(Number((await sent(p.invoiceId))[0].balance_at_send), total - 100, 'the record keeps the balance it reminded about')

  await fx.payInvoice(p.invoiceId, total - 100)
  assert.equal((await invoiceRow(p.invoiceId)).status, 'Paid')
  assert.deepEqual(await candidates([p.invoiceId], plusDays(p.due, 10)), [], 'a payment in full ends them at once')
  assert.equal((await claim(p.invoiceId, plusDays(p.due, 10))).state, 'skipped')

  const c = await plan()
  assert.equal((await fx.sender.client.rpc('cancel_invoice', { p_invoice: c.invoiceId })).error, null)
  assert.deepEqual(await candidates([c.invoiceId], plusDays(c.due, 3)), [], 'a cancelled invoice gets none')

  const q = await plan()
  ok(await admin.from('billing_plan_items').update({ reminders_paused_at: new Date().toISOString(), reminders_pause_reason: 'Client promised payment' }).eq('id', q.itemId), 'pause')
  assert.deepEqual(await candidates([q.invoiceId], plusDays(q.due, 3)), [], 'a paused invoice gets none')
  assert.equal((await claim(q.invoiceId, plusDays(q.due, 3))).state, 'skipped')
  ok(await admin.from('billing_plan_items').update({ reminders_paused_at: null, reminders_pause_reason: null }).eq('id', q.itemId), 'resume')
  assert.equal((await candidates([q.invoiceId], plusDays(q.due, 3))).length, 1, 'resumed, it is back')
})

test('nothing retroactive: an invoice due before the switch was turned on, a hand-made invoice, and an organisation with the switch off or billing plans off get none', async () => {
  const p = await plan()
  const day = plusDays(p.due, 3)
  assert.equal((await candidates([p.invoiceId], day)).length, 1)

  await fx.agePast(p.invoiceId, 5)
  assert.deepEqual(await candidates([p.invoiceId], plusDays(await dueOf(p.invoiceId), 3)), [], 'it fell due before the switch was turned on')
  assert.deepEqual(await candidates([p.invoiceId], plusDays(await dueOf(p.invoiceId), 40)), [], 'and later days do not change that')

  const q = await plan()
  await fx.setReminders(false)
  assert.deepEqual(await candidates([q.invoiceId], plusDays(q.due, 3)), [], 'reminders switched off')
  await fx.setReminders(true)
  await fx.setBilling(false)
  assert.deepEqual(await candidates([q.invoiceId], plusDays(q.due, 3)), [], 'billing plans switched off')
  await fx.setBilling(true)
  assert.equal((await candidates([q.invoiceId], plusDays(q.due, 3))).length, 1, 'both on again')

  // An invoice made and issued by hand has no plan item: never reminded.
  const hand = must(await admin.from('invoices').insert({ organization_id: fx.orgId, client_id: fx.clientId, client_name: 'Portal Client', status: 'Draft' }).select('id').single())
  ok(await admin.from('invoice_lines').insert({ organization_id: fx.orgId, invoice_id: hand.id, position: 1, title: 'Hand made', quantity: 1, unit_price: 500 }), 'a line')
  assert.equal((await fx.sender.client.rpc('issue_invoice', { p_id: hand.id })).error, null)
  assert.deepEqual(await candidates([hand.id], plusDays(await dueOf(hand.id), 3)), [], 'a hand-made invoice is never reminded')
  assert.equal((await claim(hand.id, plusDays(await dueOf(hand.id), 3))).state, 'skipped')
})

test('claim and record: ready, busy while leased, a lease in the past is taken over, the record writes the row, the timeline entry and clears the lease, and cannot be repeated', async () => {
  const p = await plan()
  const day = plusDays(p.due, 3)
  const quote = must(await admin.from('quotes').select('owner_id').eq('id', p.quoteId).single())
  const owner = quote.owner_id ? (await admin.from('team_members').select('email,full_name').eq('id', quote.owner_id).maybeSingle()).data : null
  const company = must(await admin.from('organization_settings').select('legal_name').eq('organization_id', fx.orgId).single())

  const ready = await claim(p.invoiceId, day)
  assert.equal(ready.state, 'ready')
  assert.equal(ready.invoice_id, p.invoiceId)
  assert.equal(ready.sequence, 1)
  assert.equal(ready.to, 'accounts@portal-client.test')
  assert.equal(ready.reply_to, owner?.email ?? null)
  assert.equal(ready.sender_name, owner?.full_name?.trim() ? owner.full_name : company.legal_name)
  assert.equal(ready.number, (await invoiceRow(p.invoiceId)).invoice_number)
  assert.equal(ready.currency, 'ZAR')
  assert.equal(ready.due_date, p.due)
  assert.equal(ready.month_number, 2)

  const claimRow = (await reminders(p.invoiceId))[0]
  assert.equal(claimRow.sent_at, null)
  assert.ok(new Date(claimRow.claimed_until).getTime() > Date.now() + 5 * 60_000, 'a lease of about ten minutes')
  assert.equal((await claim(p.invoiceId, day)).state, 'busy', 'while leased')

  ok(await admin.from('billing_reminders').update({ claimed_until: new Date(Date.now() - 1000).toISOString() }).eq('id', claimRow.id), 'let the lease run out')
  assert.equal((await claim(p.invoiceId, day)).state, 'ready', 'a lease in the past is taken over')
  assert.equal((await reminders(p.invoiceId)).length, 1, 'still one row for the sequence')

  const recorded = await record(p.invoiceId, 1)
  assert.equal(recorded.error, null, recorded.error?.message)
  const row = (await reminders(p.invoiceId))[0]
  assert.ok(row.sent_at)
  assert.equal(row.to_address, 'accounts@portal-client.test')
  assert.equal(row.claimed_until, null)
  assert.match(row.pdf_sha256, /^[0-9a-f]{64}$/)
  const timeline = must(await admin.from('activities').select('subject,details').eq('client_id', fx.clientId).eq('kind', 'invoice.reminder_sent')) as Row[]
  assert.ok(timeline.some((entry) => entry.subject.includes(`Reminder 1 of 5 sent for invoice ${ready.number} to accounts@portal-client.test`)), 'the timeline says so')

  refused((await record(p.invoiceId, 1)).error, 'BILLING_REMINDER_NOT_FOUND', '42501')
  assert.equal((await sent(p.invoiceId)).length, 1, 'one reminder')
  assert.equal((await claim(p.invoiceId, day)).state, 'skipped', 'reminder 2 is not due on day 3')
})

test('two claims at once give one ready and one busy; two full runs at once record one reminder', async () => {
  const p = await plan()
  const day = plusDays(p.due, 3)
  const answers = await Promise.all([claim(p.invoiceId, day), claim(p.invoiceId, day)])
  assert.deepEqual(answers.map((answer) => answer.state).sort(), ['busy', 'ready'])

  const q = await plan()
  const qDay = plusDays(q.due, 3)
  const run = async () => {
    const claimed = await claim(q.invoiceId, qDay)
    if (claimed.state !== 'ready') return claimed.state
    return (await record(q.invoiceId, claimed.sequence)).error ? 'failed' : 'recorded'
  }
  const results = await Promise.all([run(), run()])
  assert.equal(results.filter((result) => result === 'recorded').length, 1, `results: ${results}`)
  assert.equal((await sent(q.invoiceId)).length, 1)
})

test('release counts an attempt, five attempts stop the candidate, log-mode releases count none, and a sent row is untouched', async () => {
  const p = await plan()
  const day = plusDays(p.due, 3)
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal((await claim(p.invoiceId, day)).state, 'ready', `attempt ${attempt}`)
    assert.equal((await release(p.invoiceId, 1)).error, null)
    assert.equal((await reminders(p.invoiceId))[0].attempts, attempt)
    assert.equal((await reminders(p.invoiceId))[0].claimed_until, null)
  }
  assert.deepEqual(await candidates([p.invoiceId], day), [], 'five failed attempts stop it')
  assert.equal((await claim(p.invoiceId, day)).state, 'skipped')

  const q = await plan()
  const qDay = plusDays(q.due, 3)
  assert.equal((await claim(q.invoiceId, qDay)).state, 'ready')
  assert.equal((await release(q.invoiceId, 1, false)).error, null)
  assert.equal((await reminders(q.invoiceId))[0].attempts, 0, 'log mode counts no attempt')
  assert.equal((await claim(q.invoiceId, qDay)).state, 'ready')
  assert.equal((await record(q.invoiceId, 1)).error, null)
  assert.equal((await release(q.invoiceId, 1)).error, null)
  const after = (await reminders(q.invoiceId))[0]
  assert.ok(after.sent_at, 'a sent row is untouched by a release')
  assert.equal(after.attempts, 0)
})

test('after the fifth reminder: one notice per person, exactly one follow-up task for the owner, and recording again is refused so nothing doubles', async () => {
  const p = await plan()
  const number = (await invoiceRow(p.invoiceId)).invoice_number
  const title = `Portal Client has not paid invoice ${number} after five reminders`
  const taskTitle = `Follow up: Portal Client has not paid invoice ${number}`
  for (const [index, offset] of [3, 10, 17, 24].entries()) {
    assert.equal((await claim(p.invoiceId, plusDays(p.due, offset))).state, 'ready')
    assert.equal((await record(p.invoiceId, index + 1)).error, null)
  }
  const before = must(await admin.from('notifications').select('user_id').eq('organization_id', fx.orgId).eq('title', title)).length
  assert.equal(before, 0, 'nothing is said before the fifth')
  assert.equal(must(await admin.from('tasks').select('id').eq('organization_id', fx.orgId).eq('title', taskTitle)).length, 0)

  assert.equal((await claim(p.invoiceId, plusDays(p.due, 31))).state, 'ready')
  assert.equal((await record(p.invoiceId, 5)).error, null)
  const told = must(await admin.from('notifications').select('user_id').eq('organization_id', fx.orgId).eq('title', title)) as Row[]
  assert.ok(told.length >= 1, 'the owner is told')
  assert.equal(new Set(told.map((row) => row.user_id)).size, told.length, 'each person once')
  const tasks = must(await admin.from('tasks').select('*').eq('organization_id', fx.orgId).eq('title', taskTitle)) as Row[]
  assert.equal(tasks.length, 1, 'exactly one follow-up task')
  const quote = must(await admin.from('quotes').select('owner_id').eq('id', p.quoteId).single())
  assert.equal(tasks[0].assignee_id, quote.owner_id)
  assert.equal(tasks[0].client_id, fx.clientId)
  assert.equal(tasks[0].priority, 'High')

  refused((await record(p.invoiceId, 5)).error, 'BILLING_REMINDER_NOT_FOUND', '42501')
  assert.equal((await claim(p.invoiceId, plusDays(p.due, 60))).state, 'skipped')
  assert.equal(must(await admin.from('tasks').select('id').eq('organization_id', fx.orgId).eq('title', taskTitle)).length, 1, 'still one task')
})

test('billing_reminder_record validates like record_document_email', async () => {
  const p = await plan()
  assert.equal((await claim(p.invoiceId, plusDays(p.due, 3))).state, 'ready')
  refused((await record(p.invoiceId, 1, { p_to: 'not an address' })).error, 'EMAIL_ADDRESS_INVALID')
  refused((await record(p.invoiceId, 1, { p_subject: 'two\nlines' })).error, 'EMAIL_SUBJECT_INVALID')
  refused((await record(p.invoiceId, 1, { p_subject: '' })).error, 'EMAIL_SUBJECT_INVALID')
  refused((await record(p.invoiceId, 1, { p_sha256: 'short' })).error, 'EMAIL_RECORD_INVALID')
  refused((await record(p.invoiceId, 1, { p_bytes: 0 })).error, 'EMAIL_RECORD_INVALID')
  refused((await record(p.invoiceId, 2)).error, 'BILLING_REMINDER_NOT_FOUND', '42501')
  refused((await record('00000000-0000-4000-8000-0000000000aa', 1)).error, 'BILLING_REMINDER_NOT_FOUND', '42501')
  assert.equal((await sent(p.invoiceId)).length, 0, 'the refused calls recorded nothing')
  assert.equal((await record(p.invoiceId, 1)).error, null, 'a valid one still works')
})

test('the limit is checked, and the date is South African: no function reads the server date', async () => {
  for (const limit of [0, -1, 201, null]) {
    assert.equal((await admin.rpc('billing_reminder_candidates', { p_limit: limit })).error?.code, '22023', `a limit of ${limit}`)
  }
  const source = readFileSync(join(process.cwd(), 'supabase/migrations/20261112101000_billing_reminders_run.sql'), 'utf8')
  assert.doesNotMatch(source, /current_date|localtimestamp|\bnow\(\)::date/i)
  assert.match(source, /Africa\/Johannesburg/)
})

test('none of the reminder functions is callable by a member, another organisation or anon', async () => {
  const p = await plan()
  const calls: Array<[string, Record<string, unknown>]> = [
    ['billing_reminder_candidates', { p_limit: 5 }],
    ['billing_reminder_claim', { p_invoice_id: p.invoiceId }],
    ['billing_reminder_record', { p_invoice_id: p.invoiceId, p_sequence: 1, p_to: 'a@b.test', p_subject: 'S', p_sha256: hash('x'), p_bytes: 1 }],
    ['billing_reminder_release', { p_invoice_id: p.invoiceId, p_sequence: 1 }],
  ]
  for (const [who, client] of [['a member', fx.sender.client], ['another organisation', other.sender.client], ['anon', anonymous]] as const) {
    for (const [name, args] of calls) {
      assert.match((await client.rpc(name, args)).error?.message ?? '', new RegExp(`permission denied for function ${name}`), `${who} calling ${name}`)
    }
  }
  assert.equal((await reminders(p.invoiceId)).length, 0, 'nothing was written')
})
