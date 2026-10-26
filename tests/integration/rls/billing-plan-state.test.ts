import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  acceptQuote, activitiesOf, buildPlan, invoiceOf, itemsOf, linkedTo, makeDue, ok, planOf, refused, setupBillingOrg,
  type BillingOrg, type BillingQuoteOptions,
} from './billing-fixtures.ts'
import { admin, cleanup, createFixtureUser, signedInClient } from './helpers.ts'
import { anonymous, must, quoteRow } from './portal-fixtures.ts'

// Accept to invoice, stage 1, task 4: pausing, resuming and ending a billing plan, and the two triggers that pause a plan by
// themselves (its quote stops being Accepted or is archived; its client is archived). Plans are built the way staff build them
// (an Accepted quote that carries terms, with the switch on, through create_invoice_from_quote), either accepted by hand or on the
// portal (so there is an accepted response whose link was made by the sender). The private function billing_notice_users is
// reached through a notification count in a pause. Rows are read back, and settings, clients and team profiles are moved,
// through the service role; each such change is put back before the test goes on.

type Person = { id: string; client: SupabaseClient }
type Built = { quote: string; invoice: string; plan: Record<string, any>; items: Array<Record<string, any>> }

let fx: BillingOrg
let other: BillingOrg
let fxOwner: Person
let fxAdmin: Person
let otherOwner: Person
let lonerClient: SupabaseClient
const extraUsers: string[] = []

const person = async (orgId: string, role: 'owner' | 'admin'): Promise<Person> => {
  const user = await createFixtureUser(orgId, role)
  extraUsers.push(user.id)
  return { id: user.id, client: await signedInClient(user.email, user.password) }
}

before(async () => {
  fx = await setupBillingOrg('billing-state-a')
  other = await setupBillingOrg('billing-state-b')
  fxOwner = await person(fx.orgId, 'owner')
  fxAdmin = await person(fx.orgId, 'admin')
  otherOwner = await person(other.orgId, 'owner')
  const loner = await createFixtureUser(null)
  extraUsers.push(loner.id)
  lonerClient = await signedInClient(loner.email, loner.password)
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

const NOT_FOUND = 'BILLING_PLAN_NOT_FOUND'
const NOTHING_INVOICED = 'Nothing will be invoiced until an owner or admin resumes it.'

const setState = (plan: string, action: string, reason: string | null = null, client: SupabaseClient = fxOwner.client) =>
  client.rpc('billing_plan_set_state', { p_plan_id: plan, p_action: action, p_reason: reason })
const pause = (plan: string, reason: string | null = 'Client asked us to wait', client: SupabaseClient = fxOwner.client) => setState(plan, 'pause', reason, client)
const resume = (plan: string, reason: string | null = null, client: SupabaseClient = fxOwner.client) => setState(plan, 'resume', reason, client)
const end = (plan: string, reason: string | null = 'Client withdrew', client: SupabaseClient = fxOwner.client) => setState(plan, 'end', reason, client)
const create = (item: string, client: SupabaseClient = fx.sender.client) => client.rpc('create_plan_item_invoice', { p_item_id: item })
const approve = (item: string, client: SupabaseClient = fxOwner.client) => client.rpc('approve_first_invoice', { p_item_id: item })

/** A plan for an Accepted quote (accepted by hand, as staff can), with the first invoice made. */
const planned = async (options: BillingQuoteOptions = {}, org: BillingOrg = fx): Promise<Built> => {
  const built = await buildPlan(org, { startDate: '2031-05-01', termMonths: 4, ...options })
  assert.ok(built.plan, 'the plan was built')
  return built as Built
}

/**
 * A plan for a quote the client accepted on the portal: its owner is Olive (a login), the link was made by Sam (a login). The
 * acceptance is made with the switch off, so that it does only what it always did (an accepted response whose link Sam made) and
 * the plan is built here, by staff, as in the other tests; with the switch on, the acceptance builds the plan and tells the
 * people itself (billing-acceptance.test.ts).
 */
const portalPlanned = async (owner: string | null = fx.owner.teamMemberId, options: BillingQuoteOptions = {}): Promise<Built> => {
  const quote = await fx.sentBillingQuote({ startDate: '2031-05-01', termMonths: 4, ...options })
  ok(await admin.from('quotes').update({ owner_id: owner }).eq('id', quote), 'the quote has its owner')
  await fx.setBilling(false)
  try {
    await fx.acceptedOnPortal(quote)
  } finally {
    await fx.setBilling(true)
  }
  assert.equal((await quoteRow(quote)).status, 'Accepted', 'the client accepted on the portal')
  const invoice = must(await fx.sender.client.rpc('create_invoice_from_quote', { p_quote_id: quote })) as string
  const plan = await planOf(quote)
  assert.ok(plan, 'the plan was built')
  return { quote, invoice, plan, items: await itemsOf(quote) }
}

/** A plan for a hand-accepted quote whose owner is set (a team profile, or none). */
const ownedPlan = async (owner: string | null, options: BillingQuoteOptions = {}): Promise<Built> => {
  const quote = await acceptQuote(fx, { startDate: '2031-05-01', termMonths: 4, ...options })
  ok(await admin.from('quotes').update({ owner_id: owner }).eq('id', quote), 'the quote has its owner')
  const invoice = must(await fx.sender.client.rpc('create_invoice_from_quote', { p_quote_id: quote })) as string
  const plan = await planOf(quote)
  assert.ok(plan, 'the plan was built')
  return { quote, invoice, plan, items: await itemsOf(quote) }
}

const newClient = async (name = 'Second Client') =>
  must(await admin.from('clients').insert({
    organization_id: fx.orgId, name, status: 'Active', billing_email: 'accounts@second-client.test', address_line1: '3 Other Road', city: 'Pretoria', postal_code: '0001',
  }).select('id').single()).id as string

/** A plan for a hand-accepted quote that belongs to the given client. */
const planForClient = async (client: string, options: BillingQuoteOptions = {}): Promise<Built> => {
  const quote = await acceptQuote(fx, { startDate: '2031-05-01', termMonths: 4, ...options })
  ok(await admin.from('quotes').update({ client_id: client, owner_id: fx.owner.teamMemberId }).eq('id', quote), 'the quote belongs to the client')
  const invoice = must(await fx.sender.client.rpc('create_invoice_from_quote', { p_quote_id: quote })) as string
  const plan = await planOf(quote)
  assert.ok(plan, 'the plan was built')
  assert.equal(plan.client_id, client, 'the plan follows the quote to its client')
  return { quote, invoice, plan, items: await itemsOf(quote) }
}

const now = () => new Date().toISOString()
const noticesOf = async (quote: string, org: BillingOrg = fx) =>
  must(await admin.from('notifications').select('*').eq('organization_id', org.orgId).eq('category', 'Finance').eq('href', `/commercial/quotes/${quote}`).order('created_at')) as Array<Record<string, any>>
const noticeUsers = async (quote: string) => (await noticesOf(quote)).map((row) => row.user_id as string).sort()
const changesOf = (quote: string) => activitiesOf(quote, 'billing.plan_changed')
const itemRow = async (id: string) => must(await admin.from('billing_plan_items').select('*').eq('id', id).single()) as Record<string, any>
const archivedProfile = async <T>(profile: string, run: () => Promise<T>): Promise<T> => {
  ok(await admin.from('team_members').update({ archived_at: now() }).eq('id', profile), 'the profile is archived')
  try {
    return await run()
  } finally {
    ok(await admin.from('team_members').update({ archived_at: null }).eq('id', profile), 'the profile is put back')
  }
}

/** Nothing about the plan changed: still active, no reason, every item open, no timeline entry and no notice. */
const untouched = async (built: Built) => {
  const plan = await planOf(built.quote)
  assert.equal(plan?.status, 'active')
  assert.equal(plan?.status_reason, null)
  assert.ok((await itemsOf(built.quote)).every((item) => item.status === 'open' && item.cancelled_reason === null), 'every item is open')
  assert.equal((await changesOf(built.quote)).length, 0, 'no timeline entry')
  assert.equal((await noticesOf(built.quote)).length, 0, 'no notice')
}

test("only an owner or admin can pause, resume or end; a member cannot; another organisation's plan is not found", async () => {
  const built = await planned()
  const { plan } = built

  // A member of the plan's organisation: refused whatever the action (the role is asked before the action), and nothing changes.
  for (const action of ['pause', 'resume', 'end', 'bogus']) {
    refused((await setState(plan.id, action, 'Because', fx.sender.client)).error, 'BILLING_PLAN_ADMIN_ONLY')
  }
  refused((await pause(plan.id, 'Because', fx.owner.client)).error, 'BILLING_PLAN_ADMIN_ONLY')
  await untouched(built)

  // Not found, and the same answer each time: another organisation's owner, a member of another organisation, a login with no
  // organisation, an unknown id. Nothing tells them the plan exists.
  const unknown = '00000000-0000-4000-8000-0000000000aa'
  refused((await pause(plan.id, 'Because', otherOwner.client)).error, NOT_FOUND, '42501')
  refused((await pause(plan.id, 'Because', other.sender.client)).error, NOT_FOUND, '42501')
  refused((await pause(plan.id, 'Because', lonerClient)).error, NOT_FOUND, '42501')
  refused((await resume(unknown)).error, NOT_FOUND, '42501')
  refused((await setState(plan.id, 'bogus', null, otherOwner.client)).error, NOT_FOUND, '42501')
  const signedOut = await anonymous.rpc('billing_plan_set_state', { p_plan_id: plan.id, p_action: 'pause', p_reason: 'Because' })
  assert.ok(signedOut.error, 'a signed-out caller is refused')
  assert.equal(signedOut.error.code, '42501')
  await untouched(built)

  // An owner or admin of the plan's organisation, with an action that does not exist.
  for (const action of ['stop', 'Pause', 'PAUSE', '', ' pause']) refused((await setState(plan.id, action, 'Because')).error, 'BILLING_PLAN_ACTION_INVALID')
  refused((await setState(plan.id, null as unknown as string, 'Because')).error, 'BILLING_PLAN_ACTION_INVALID')
  await untouched(built)

  // An owner pauses, an admin resumes, an owner ends.
  ok(await pause(plan.id, 'Because', fxOwner.client), 'the owner pauses')
  assert.equal((await planOf(built.quote))?.status, 'paused')
  ok(await resume(plan.id, null, fxAdmin.client), 'the admin resumes')
  assert.equal((await planOf(built.quote))?.status, 'active')
  ok(await end(plan.id, 'Because', fxAdmin.client), 'the admin ends')
  assert.equal((await planOf(built.quote))?.status, 'ended')
})

test('pause and end need a reason; resume does not', async () => {
  const built = await planned()
  const { plan } = built

  // No reason, a blank one, one of only spaces, tabs or line breaks, and one over 500 characters once trimmed.
  for (const reason of [null, '', '   ', ' \t\r\n ', 'x'.repeat(501), ` ${'y'.repeat(501)} `]) {
    refused((await pause(plan.id, reason)).error, 'BILLING_REASON_REQUIRED')
    refused((await end(plan.id, reason)).error, 'BILLING_REASON_REQUIRED')
  }
  await untouched(built)

  // 500 characters is the most; the spaces around it do not count, and the reason is kept trimmed.
  const longest = 'z'.repeat(500)
  ok(await pause(plan.id, `  ${longest}  `), 'a reason of 500 characters')
  assert.equal((await planOf(built.quote))?.status_reason, longest)

  // Resume asks for no reason at all: none, an empty one, or one that is given.
  ok(await resume(plan.id, null), 'resumed with no reason')
  assert.equal((await planOf(built.quote))?.status, 'active')
  ok(await pause(plan.id, 'Once more'), 'paused again')
  ok(await resume(plan.id, ''), 'resumed with an empty reason')
  ok(await pause(plan.id, 'And again'), 'paused a third time')
  ok(await resume(plan.id, '  Client confirmed in writing  '), 'resumed with a reason')
  const entries = await changesOf(built.quote)
  assert.equal(entries.length, 6)
  assert.equal(entries[3].details.reason, null, 'an empty reason is no reason')
  assert.equal(entries[5].details.reason, 'Client confirmed in writing', 'the optional reason is kept, trimmed, on the timeline')
  assert.equal(entries[5].subject, 'Billing plan resumed', 'and is not part of the subject')

  // A reason that is given is still held to 500 characters.
  ok(await pause(plan.id, 'A fourth time'), 'paused for the last time')
  refused((await resume(plan.id, 'q'.repeat(501))).error, 'BILLING_REASON_REQUIRED')
  assert.equal((await planOf(built.quote))?.status, 'paused', 'the refused resume changed nothing')
})

test('moving the quote from Accepted to Sent, Declined or Expired, or archiving it, pauses an active plan and tells the owner and the sender once each; archiving the client does the same; a plan already paused or ended is left alone', async () => {
  const recipients = [fx.owner.userId, fx.sender.userId].sort()

  // The quote leaves Accepted, by a member, as staff can on the quote page.
  for (const status of ['Sent', 'Declined', 'Expired']) {
    const built = await portalPlanned()
    await fx.setStatus(built.quote, status)
    const paused = await planOf(built.quote)
    assert.equal(paused?.status, 'paused', `${status}: the plan is paused`)
    assert.equal(paused?.status_reason, `Quote moved to ${status}`)
    assert.ok((await itemsOf(built.quote)).every((item) => item.status === 'open'), `${status}: nothing else changed on the items`)
    assert.equal((await invoiceOf(built.invoice)).status, 'Draft', `${status}: the first invoice is as it was`)
    assert.deepEqual((await linkedTo(built.items[0].id)).map((row) => row.id), [built.invoice])

    // The owner (Olive) and the sender of the accepted link (Sam), once each.
    const notices = await noticesOf(built.quote)
    assert.deepEqual(notices.map((row) => row.user_id).sort(), recipients, `${status}: the owner and the sender are told, once each`)
    for (const notice of notices) {
      assert.equal(notice.organization_id, fx.orgId)
      assert.equal(notice.title, 'Billing plan paused for Portal Client')
      assert.equal(notice.body, `Quote moved to ${status}. ${NOTHING_INVOICED}`)
      assert.equal(notice.category, 'Finance')
      assert.equal(notice.href, `/commercial/quotes/${built.quote}`)
      assert.equal(notice.read_at, null)
    }

    // One timeline entry, written by the member who moved the quote.
    const entries = await changesOf(built.quote)
    assert.equal(entries.length, 1, `${status}: one timeline entry`)
    assert.equal(entries[0].subject, `Billing plan paused: Quote moved to ${status}`)
    assert.equal(entries[0].created_by, fx.sender.userId)
    assert.equal(entries[0].details.plan_id, built.plan.id)

    // Already paused: moving the quote again, or back to Accepted, changes nothing and tells nobody again. Resuming is manual.
    await fx.setStatus(built.quote, status === 'Sent' ? 'Declined' : 'Sent')
    await fx.setStatus(built.quote, 'Accepted')
    const still = await planOf(built.quote)
    assert.equal(still?.status, 'paused', `${status}: the plan stays paused when the quote is Accepted again`)
    assert.equal(still?.status_reason, `Quote moved to ${status}`, `${status}: with the reason it had`)
    assert.equal((await noticesOf(built.quote)).length, 2, `${status}: nobody is told again`)
    assert.equal((await changesOf(built.quote)).length, 1, `${status}: and nothing more is written`)
  }

  // The quote is archived (by a member): the plan is paused, with its own reason, and the same two are told.
  const archived = await portalPlanned()
  ok(await fx.sender.client.from('quotes').update({ archived_at: now() }).eq('id', archived.quote), 'the quote is archived')
  assert.equal((await planOf(archived.quote))?.status, 'paused')
  assert.equal((await planOf(archived.quote))?.status_reason, 'Quote archived')
  assert.deepEqual(await noticeUsers(archived.quote), recipients)
  assert.equal((await noticesOf(archived.quote))[0].body, `Quote archived. ${NOTHING_INVOICED}`)
  assert.equal((await changesOf(archived.quote))[0].subject, 'Billing plan paused: Quote archived')

  // A change that is neither leaves an active plan exactly as it was.
  const edited = await portalPlanned()
  ok(await fx.sender.client.from('quotes').update({ notes: 'Spoke to the client today' }).eq('id', edited.quote), 'a note is added')
  ok(await admin.from('quotes').update({ status: 'Accepted' }).eq('id', edited.quote), 'the status is set to what it is')
  await untouched(edited)

  // The client is archived (by a member): every active plan of that client is paused, the plans of other clients are not.
  const second = await newClient()
  const one = await planForClient(second)
  const two = await planForClient(second)
  const aside = await planned()
  const ended = await planForClient(second)
  ok(await end(ended.plan.id, 'Finished early'), 'one plan of the client is ended already')
  const manual = await planForClient(second)
  ok(await pause(manual.plan.id, 'Paused by a person'), 'one plan of the client is paused already')
  ok(await fx.sender.client.from('clients').update({ archived_at: now() }).eq('id', second), 'the client is archived')
  for (const built of [one, two]) {
    const paused = await planOf(built.quote)
    assert.equal(paused?.status, 'paused')
    assert.equal(paused?.status_reason, 'Client archived')
    const notices = await noticesOf(built.quote)
    assert.deepEqual(notices.map((row) => row.user_id), [fx.owner.userId], 'the owner is told (the quote was accepted by hand: there is no sender)')
    assert.equal(notices[0].title, 'Billing plan paused for Portal Client', "the quote's client name")
    assert.equal(notices[0].body, `Client archived. ${NOTHING_INVOICED}`)
    assert.equal(notices[0].category, 'Finance')
    assert.equal(notices[0].href, `/commercial/quotes/${built.quote}`)
    const entries = await changesOf(built.quote)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].subject, 'Billing plan paused: Client archived')
    assert.equal(entries[0].created_by, fx.sender.userId)
  }
  await untouched(aside)
  // A plan already ended or paused is left alone.
  assert.equal((await planOf(ended.quote))?.status, 'ended')
  assert.equal((await planOf(ended.quote))?.status_reason, 'Finished early')
  assert.equal((await noticesOf(ended.quote)).length, 0)
  assert.equal((await planOf(manual.quote))?.status, 'paused')
  assert.equal((await planOf(manual.quote))?.status_reason, 'Paused by a person')
  assert.equal((await noticesOf(manual.quote)).length, 0)
  assert.equal((await changesOf(manual.quote)).length, 1, 'only the person is on its timeline')

  // Archiving the client again, or bringing it back, writes nothing more.
  ok(await admin.from('clients').update({ archived_at: now() }).eq('id', second), 'archived again')
  ok(await admin.from('clients').update({ archived_at: null }).eq('id', second), 'the client is brought back')
  assert.equal((await planOf(one.quote))?.status, 'paused', 'the plan stays paused: resuming is manual')
  assert.equal((await noticesOf(one.quote)).length, 1)
  assert.equal((await changesOf(one.quote)).length, 1)

  // An ended plan is left alone by the quote moving, too.
  ok(await fx.sender.client.from('quotes').update({ status: 'Sent' }).eq('id', ended.quote), 'the ended plan quote is moved')
  assert.equal((await planOf(ended.quote))?.status, 'ended')
  assert.equal((await noticesOf(ended.quote)).length, 0)
  assert.equal((await changesOf(ended.quote)).length, 1, 'only the ending is on its timeline')

  // A quote with no plan at all: the triggers do nothing and never raise (the switch off is the same: no plan exists).
  const bare = await acceptQuote(fx, { startDate: null, termMonths: null, lines: [{ title: 'Once only', unitPrice: 500, chargeKind: 'once_off' }] })
  await fx.setStatus(bare, 'Sent')
  ok(await fx.sender.client.from('quotes').update({ archived_at: now() }).eq('id', bare), 'the quote with no plan is archived')
  assert.equal((await noticesOf(bare)).length, 0)
  assert.equal((await changesOf(bare)).length, 0)
  await fx.setBilling(false)
  try {
    const offQuote = await acceptQuote(fx, { startDate: null, termMonths: null, lines: [{ title: 'Once only', unitPrice: 500, chargeKind: 'once_off' }] })
    await fx.setStatus(offQuote, 'Declined')
    assert.equal((await noticesOf(offQuote)).length, 0)
    assert.equal((await changesOf(offQuote)).length, 0)
  } finally {
    await fx.setBilling(true)
  }
  const unplanned = await newClient('Third Client')
  ok(await fx.sender.client.from('clients').update({ archived_at: now() }).eq('id', unplanned), 'a client with no plan is archived')
})

test('resume works only when the quote is Accepted and unarchived, the client is not archived and the switch is on', async () => {
  const client = await newClient('Resume Client')
  const built = await planForClient(client)
  const { plan, quote } = built
  const refusedResume = async (label: string) => {
    refused((await resume(plan.id)).error, 'BILLING_PLAN_CANNOT_RESUME')
    assert.equal((await planOf(quote))?.status, 'paused', `${label}: the plan is still paused`)
  }

  // An active plan has nothing to resume.
  refused((await resume(plan.id)).error, 'BILLING_PLAN_CANNOT_RESUME')
  // Pausing a plan that is paused is refused with the plan-is-not-active answer.
  ok(await pause(plan.id, 'Waiting'), 'paused by a person')
  refused((await pause(plan.id, 'Again')).error, 'BILLING_PLAN_NOT_ACTIVE')
  assert.equal((await planOf(quote))?.status_reason, 'Waiting', 'the first reason stays')

  // The switch is off.
  await fx.setBilling(false)
  try {
    await refusedResume('switch off')
  } finally {
    await fx.setBilling(true)
  }

  // The quote is not Accepted.
  await fx.setStatus(quote, 'Sent')
  await refusedResume('quote Sent')
  assert.equal((await planOf(quote))?.status_reason, 'Waiting', 'the plan was already paused: left alone')
  await fx.setStatus(quote, 'Accepted')

  // The quote is archived.
  ok(await fx.sender.client.from('quotes').update({ archived_at: now() }).eq('id', quote), 'the quote is archived')
  await refusedResume('quote archived')
  ok(await admin.from('quotes').update({ archived_at: null }).eq('id', quote), 'the quote is brought back')

  // The client is archived.
  ok(await fx.sender.client.from('clients').update({ archived_at: now() }).eq('id', client), 'the client is archived')
  await refusedResume('client archived')
  ok(await admin.from('clients').update({ archived_at: null }).eq('id', client), 'the client is brought back')

  // Everything holds: an owner or admin resumes. The plan is active and its reason is cleared.
  ok(await resume(plan.id, null, fxAdmin.client), 'resumed')
  const active = await planOf(quote)
  assert.equal(active?.status, 'active')
  assert.equal(active?.status_reason, null)
  // The month can be invoiced again.
  await makeDue(built.items[1].id)
  ok(await create(built.items[1].id), 'a due month is invoiced again')

  // The client is gone altogether (deleted): the plan has no client and cannot resume.
  const gone = await newClient('Deleted Client')
  const orphan = await planForClient(gone)
  ok(await pause(orphan.plan.id, 'Before the client left'), 'paused')
  ok(await admin.from('clients').delete().eq('id', gone), 'the client is deleted')
  assert.equal((await planOf(orphan.quote))?.client_id, null)
  refused((await resume(orphan.plan.id)).error, 'BILLING_PLAN_CANNOT_RESUME')

  // An ended plan can never resume, whatever else holds, whatever the switch says.
  const endedBuilt = await planned()
  ok(await end(endedBuilt.plan.id, 'Done'), 'ended')
  refused((await resume(endedBuilt.plan.id)).error, 'BILLING_PLAN_ENDED')
  await fx.setBilling(false)
  try {
    refused((await resume(endedBuilt.plan.id)).error, 'BILLING_PLAN_ENDED')
  } finally {
    await fx.setBilling(true)
  }
  assert.equal((await planOf(endedBuilt.quote))?.status, 'ended')
})

test('end cancels open items without an invoice, keeps items that have an invoice, and cannot be undone', async () => {
  const built = await planned({ startDate: '2031-05-01', termMonths: 6 })
  const { quote, plan, items } = built
  assert.equal(items.length, 6)

  // Month 1 has its draft, month 2 a draft, month 3 had one that was discarded (archived: the month is free again), month 4 one
  // that was issued and then cancelled (a cancelled invoice keeps its month) and month 5 an issued invoice. Month 6 never had one.
  for (const index of [1, 2, 3, 4]) await makeDue(items[index].id)
  const second = must(await create(items[1].id)) as string
  const third = must(await create(items[2].id)) as string
  ok(await fx.sender.client.from('invoices').update({ archived_at: now() }).eq('id', third), 'month 3 is discarded')
  const fourth = must(await create(items[3].id)) as string
  ok(await fx.sender.client.rpc('issue_invoice', { p_id: fourth }), 'month 4 is issued')
  ok(await fx.sender.client.rpc('cancel_invoice', { p_invoice: fourth }), 'and cancelled')
  const fifth = must(await create(items[4].id)) as string
  ok(await fx.sender.client.rpc('issue_invoice', { p_id: fifth }), 'month 5 is issued')

  ok(await end(plan.id, '  Client withdrew  ', fxAdmin.client), 'the plan is ended')
  const ended = await planOf(quote)
  assert.equal(ended?.status, 'ended')
  assert.equal(ended?.status_reason, 'Client withdrew')

  const after = await itemsOf(quote)
  for (const index of [0, 1, 3, 4]) {
    assert.equal(after[index].status, 'open', `month ${index + 1} holds an invoice and stays as it is`)
    assert.equal(after[index].cancelled_reason, null)
  }
  for (const index of [2, 5]) {
    assert.equal(after[index].status, 'cancelled', `month ${index + 1} has no invoice and is cancelled`)
    assert.equal(after[index].cancelled_reason, 'Client withdrew')
  }
  // The invoices are as they were: nothing is cancelled, archived, unlinked or issued by the ending.
  assert.equal((await invoiceOf(built.invoice)).status, 'Draft')
  assert.equal((await invoiceOf(second)).status, 'Draft')
  assert.equal((await invoiceOf(third)).archived_at !== null, true)
  assert.equal((await invoiceOf(fourth)).status, 'Cancelled')
  assert.equal((await invoiceOf(fifth)).status, 'Issued')
  for (const [index, invoice] of [[0, built.invoice], [1, second], [3, fourth], [4, fifth]] as const) {
    assert.deepEqual((await linkedTo(items[index].id)).map((row) => row.id), [invoice], `month ${index + 1} is still linked`)
  }

  // It cannot be undone, and nothing more can be done to it.
  refused((await resume(plan.id)).error, 'BILLING_PLAN_ENDED')
  refused((await pause(plan.id, 'Why not')).error, 'BILLING_PLAN_NOT_ACTIVE')
  refused((await end(plan.id, 'Again')).error, 'BILLING_PLAN_NOT_ACTIVE')
  refused((await create(items[5].id)).error, 'BILLING_ITEM_CANCELLED')
  refused((await create(items[2].id)).error, 'BILLING_ITEM_CANCELLED')
  refused((await approve(items[0].id)).error, 'BILLING_PLAN_NOT_ACTIVE')
  assert.equal((await planOf(quote))?.status_reason, 'Client withdrew', 'the refused calls changed nothing')
  assert.equal((await changesOf(quote)).length, 1, 'and wrote nothing')
  // The quote moving afterwards does not touch an ended plan.
  await fx.setStatus(quote, 'Sent')
  assert.equal((await planOf(quote))?.status, 'ended')
  assert.equal((await planOf(quote))?.status_reason, 'Client withdrew')

  // A paused plan can be ended too: the reason it is ended for replaces the reason it was paused for.
  const paused = await planned()
  ok(await pause(paused.plan.id, 'Waiting'), 'paused')
  ok(await end(paused.plan.id, 'No longer needed'), 'then ended')
  const done = await planOf(paused.quote)
  assert.equal(done?.status, 'ended')
  assert.equal(done?.status_reason, 'No longer needed')
  const left = await itemsOf(paused.quote)
  assert.equal(left[0].status, 'open', 'the first month has its draft')
  assert.ok(left.slice(1).every((item) => item.status === 'cancelled' && item.cancelled_reason === 'No longer needed'))

  // A plan with a single item (a once-off quote) and a draft: the draft keeps the item open, nothing is cancelled.
  const single = await planned({ lines: [{ title: 'Once only', unitPrice: 500, chargeKind: 'once_off' }] })
  assert.equal(single.items.length, 1)
  ok(await end(single.plan.id, 'Changed our minds'), 'a one-item plan is ended')
  assert.equal((await itemsOf(single.quote))[0].status, 'open')
  assert.equal((await planOf(single.quote))?.status, 'ended')
})

test("every change writes billing.plan_changed on the quote's timeline", async () => {
  const built = await planned()
  const { plan, quote } = built

  // Refused calls write nothing.
  refused((await pause(plan.id, 'Because', fx.sender.client)).error, 'BILLING_PLAN_ADMIN_ONLY')
  refused((await pause(plan.id, '')).error, 'BILLING_REASON_REQUIRED')
  refused((await resume(plan.id)).error, 'BILLING_PLAN_CANNOT_RESUME')
  assert.equal((await changesOf(quote)).length, 0)

  ok(await pause(plan.id, '  Waiting for the client  ', fxOwner.client), 'paused by the owner')
  ok(await resume(plan.id, null, fxAdmin.client), 'resumed by the admin')
  ok(await pause(plan.id, 'Second look', fxAdmin.client), 'paused by the admin')
  ok(await resume(plan.id, 'Client confirmed', fxOwner.client), 'resumed by the owner')
  ok(await end(plan.id, 'Client withdrew', fxOwner.client), 'ended by the owner')

  const entries = await changesOf(quote)
  assert.deepEqual(entries.map((entry) => entry.subject), [
    'Billing plan paused: Waiting for the client',
    'Billing plan resumed',
    'Billing plan paused: Second look',
    'Billing plan resumed',
    'Billing plan ended: Client withdrew',
  ])
  assert.deepEqual(entries.map((entry) => entry.created_by), [fxOwner.id, fxAdmin.id, fxAdmin.id, fxOwner.id, fxOwner.id], 'each entry names the person who made the change')
  assert.deepEqual(entries.map((entry) => entry.details.action), ['pause', 'resume', 'pause', 'resume', 'end'])
  assert.deepEqual(entries.map((entry) => entry.details.reason), ['Waiting for the client', null, 'Second look', 'Client confirmed', 'Client withdrew'])
  assert.deepEqual(entries.map((entry) => entry.details.status), ['paused', 'active', 'paused', 'active', 'ended'])
  for (const entry of entries) {
    assert.equal(entry.organization_id, fx.orgId)
    assert.equal(entry.quote_id, quote)
    assert.equal(entry.details.plan_id, plan.id)
    assert.equal(entry.details.quote_id, quote)
    assert.equal(entry.details.automatic, false, 'a person made it')
  }

  // A pause the database makes by itself is on the timeline the same way. By the service role there is no person.
  const system = await planned()
  ok(await admin.from('quotes').update({ status: 'Sent' }).eq('id', system.quote), 'the service role moves the quote')
  const [entry] = await changesOf(system.quote)
  assert.equal(entry.subject, 'Billing plan paused: Quote moved to Sent')
  assert.equal(entry.created_by, null)
  assert.equal(entry.details.automatic, true)
  assert.equal(entry.details.action, 'pause')
  assert.equal(entry.details.reason, 'Quote moved to Sent')
  assert.equal(entry.details.status, 'paused')
  assert.equal(entry.details.plan_id, system.plan.id)
})

test('billing_notice_users ignores an archived owner and falls back to the quote owner when there is no accepted response', async () => {
  const sam = fx.sender.userId
  const olive = fx.owner.userId

  // Accepted on the portal, the link made by Sam: Olive (the owner) and Sam (the sender) are told.
  const both = await portalPlanned()
  await fx.setStatus(both.quote, 'Sent')
  assert.deepEqual(await noticeUsers(both.quote), [olive, sam].sort())

  // The owner's profile is archived: only the sender is told.
  const ownerArchived = await portalPlanned()
  await archivedProfile(fx.owner.teamMemberId, () => fx.setStatus(ownerArchived.quote, 'Sent'))
  assert.deepEqual(await noticeUsers(ownerArchived.quote), [sam], 'an archived owner is passed over')

  // The sender's profile is archived: only the owner is told.
  const senderArchived = await portalPlanned()
  await archivedProfile(fx.sender.teamMemberId, () => fx.setStatus(senderArchived.quote, 'Sent'))
  assert.deepEqual(await noticeUsers(senderArchived.quote), [olive], 'an archived sender is passed over')

  // Both archived: nobody is told, and the pause still happens and is on the timeline.
  const bothArchived = await portalPlanned()
  await archivedProfile(fx.owner.teamMemberId, () => archivedProfile(fx.sender.teamMemberId, () => fx.setStatus(bothArchived.quote, 'Sent')))
  assert.deepEqual(await noticeUsers(bothArchived.quote), [])
  assert.equal((await planOf(bothArchived.quote))?.status, 'paused')
  assert.equal((await changesOf(bothArchived.quote)).length, 1)

  // The owner is also the sender: told once.
  const same = await portalPlanned(fx.sender.teamMemberId)
  await fx.setStatus(same.quote, 'Sent')
  assert.deepEqual(await noticeUsers(same.quote), [sam], 'one person is told once')

  // No accepted response (accepted by hand): the quote owner's login only.
  const byHand = await ownedPlan(fx.owner.teamMemberId)
  await fx.setStatus(byHand.quote, 'Sent')
  assert.deepEqual(await noticeUsers(byHand.quote), [olive], 'the owner alone')
  const byHandArchived = await ownedPlan(fx.owner.teamMemberId)
  await archivedProfile(fx.owner.teamMemberId, () => fx.setStatus(byHandArchived.quote, 'Sent'))
  assert.deepEqual(await noticeUsers(byHandArchived.quote), [], 'with no response and an archived owner, nobody')
  assert.equal((await planOf(byHandArchived.quote))?.status, 'paused')

  // An owner with no login, and no owner at all: nobody is told; the plan is paused all the same.
  const noLogin = await ownedPlan(fx.ownerWithoutLogin.teamMemberId)
  await fx.setStatus(noLogin.quote, 'Sent')
  assert.deepEqual(await noticeUsers(noLogin.quote), [])
  assert.equal((await planOf(noLogin.quote))?.status, 'paused')
  const noOwner = await ownedPlan(null)
  ok(await fx.sender.client.from('quotes').update({ archived_at: now() }).eq('id', noOwner.quote), 'the quote with no owner is archived')
  assert.deepEqual(await noticeUsers(noOwner.quote), [])
  assert.equal((await planOf(noOwner.quote))?.status, 'paused')
  assert.equal((await changesOf(noOwner.quote)).length, 1)

  // Only an accepted response counts: the client declined on a link Olive made, and the quote was then accepted by hand. Olive
  // owns nothing here and made the declined link, so nobody is told.
  const declinedFirst = await fx.sentBillingQuote({ startDate: '2031-05-01', termMonths: 4 })
  ok(await admin.from('quotes').update({ owner_id: null }).eq('id', declinedFirst), 'the quote has no owner')
  const link = await fx.newLink(declinedFirst, { email: 'billing.client@example.test', name: 'Pat Client', by: fx.owner })
  const page = must(await admin.rpc('portal_get_quote', { p_token: link.token })) as Record<string, any>
  const issued = must(await admin.rpc('portal_issue_code', { p_token: link.token })) as Record<string, any>
  const declined = must(await admin.rpc('portal_decide', {
    p_token: link.token, p_code: issued.code, p_decision: 'declined', p_signatory_name: 'Pat Client', p_signatory_position: 'Managing Director',
    p_signatory_organisation: 'Portal Client (Pty) Ltd', p_consent_text: 'I confirm that I am authorised to decline this quotation on behalf of the organisation.',
    p_consent: true, p_snapshot_hash: page.snapshot_hash, p_decline_reason: 'Other', p_decline_comments: null, p_ip: '203.0.113.7', p_user_agent: 'Mozilla/5.0 (billing fixture)',
  })) as Record<string, any>
  assert.equal(declined.ok, true, `the decline is recorded: ${JSON.stringify(declined)}`)
  await fx.setStatus(declinedFirst, 'Accepted')
  must(await fx.sender.client.rpc('create_invoice_from_quote', { p_quote_id: declinedFirst }))
  await fx.setStatus(declinedFirst, 'Sent')
  assert.equal((await planOf(declinedFirst))?.status, 'paused')
  assert.deepEqual(await noticeUsers(declinedFirst), [], 'the maker of a declined link is not told')

  // The old notices are not disturbed: the portal's own notices of the acceptance (category Commercial) are still there.
  const acceptance = must(await admin.from('notifications').select('user_id').eq('organization_id', fx.orgId).eq('category', 'Commercial').eq('href', `/commercial/quotes/${both.quote}`)) as Array<{ user_id: string }>
  assert.deepEqual(acceptance.map((row) => row.user_id).sort(), [olive, sam].sort())
})

test('the trigger functions are not callable by anyone signed in', async () => {
  for (const name of ['billing_plans_watch_quote', 'billing_plans_watch_client']) {
    for (const client of [fx.sender.client, fxOwner.client, anonymous]) {
      const result = await client.rpc(name)
      assert.ok(result.error, `${name} is refused`)
    }
  }
})

test('two clicks make one change, and a pause racing a month, an approval, an ending or the quote leaves one consistent state without a deadlock', async () => {
  // Two owners pause at once: one pauses, the other is told the plan is not active; one entry on the timeline.
  const twice = await planned()
  const clicks = await Promise.all([pause(twice.plan.id, 'First click'), pause(twice.plan.id, 'Second click', fxAdmin.client)])
  assert.equal(clicks.filter((result) => !result.error).length, 1, 'exactly one pause worked')
  refused(clicks.find((result) => result.error)?.error ?? null, 'BILLING_PLAN_NOT_ACTIVE')
  assert.equal((await changesOf(twice.quote)).length, 1)
  assert.equal((await planOf(twice.quote))?.status, 'paused')
  // The same for ending.
  const endTwice = await planned()
  const ends = await Promise.all([end(endTwice.plan.id, 'First click'), end(endTwice.plan.id, 'Second click', fxAdmin.client)])
  assert.equal(ends.filter((result) => !result.error).length, 1, 'exactly one ending worked')
  refused(ends.find((result) => result.error)?.error ?? null, 'BILLING_PLAN_NOT_ACTIVE')
  assert.equal((await changesOf(endTwice.quote)).length, 1)

  for (let round = 1; round <= 3; round += 1) {
    // A member creates a due month while an owner pauses: the invoice exists and the plan is paused, or the create was refused
    // because the plan was already paused. Never an error of another kind, never a plan left active.
    const month = await planned()
    await makeDue(month.items[1].id)
    const [made, paused] = await Promise.all([create(month.items[1].id), pause(month.plan.id, 'Race')])
    ok(paused, `round ${round}: the pause worked`)
    assert.equal((await planOf(month.quote))?.status, 'paused', `round ${round}: the plan is paused`)
    const linked = await linkedTo(month.items[1].id)
    if (made.error) {
      refused(made.error, 'BILLING_PLAN_NOT_ACTIVE')
      assert.equal(linked.length, 0, `round ${round}: refused means no invoice`)
    } else {
      assert.deepEqual(linked.map((row) => row.id), [made.data], `round ${round}: made means exactly that invoice`)
    }

    // An owner approves the first invoice while another pauses.
    const approval = await planned()
    const [approved, stopped] = await Promise.all([approve(approval.items[0].id), pause(approval.plan.id, 'Race', fxAdmin.client)])
    ok(stopped, `round ${round}: the pause worked`)
    assert.equal((await planOf(approval.quote))?.status, 'paused')
    const invoice = await invoiceOf(approval.invoice)
    if (approved.error) {
      refused(approved.error, 'BILLING_PLAN_NOT_ACTIVE')
      assert.equal(invoice.status, 'Draft', `round ${round}: refused means still a draft`)
      assert.equal((await itemRow(approval.items[0].id)).approved_at, null)
    } else {
      assert.equal(invoice.status, 'Issued', `round ${round}: approved means issued`)
      assert.notEqual((await itemRow(approval.items[0].id)).approved_at, null)
    }

    // A member creates a due month while an owner ends the plan.
    const ending = await planned()
    await makeDue(ending.items[1].id)
    const [built, finished] = await Promise.all([create(ending.items[1].id), end(ending.plan.id, 'Race')])
    ok(finished, `round ${round}: the ending worked`)
    const items = await itemsOf(ending.quote)
    assert.equal((await planOf(ending.quote))?.status, 'ended')
    if (built.error) {
      assert.match(built.error.message, /\b(BILLING_ITEM_CANCELLED|BILLING_PLAN_NOT_ACTIVE)\b/, `round ${round}: ${built.error.message}`)
      assert.equal((await linkedTo(ending.items[1].id)).length, 0)
      assert.equal(items[1].status, 'cancelled')
    } else {
      assert.equal(items[1].status, 'open', `round ${round}: an item with an invoice is kept`)
      assert.deepEqual((await linkedTo(ending.items[1].id)).map((row) => row.id), [built.data])
    }
    assert.ok(items.slice(2).every((item) => item.status === 'cancelled'), `round ${round}: the later months are cancelled`)

    // A member creates a due month while the quote is moved away from Accepted (the trigger pauses the plan).
    const moving = await planned()
    await makeDue(moving.items[1].id)
    const [seen, moved] = await Promise.all([create(moving.items[1].id), fx.owner.client.from('quotes').update({ status: 'Sent' }).eq('id', moving.quote)])
    ok(moved, `round ${round}: the quote moved`)
    assert.equal((await planOf(moving.quote))?.status, 'paused', `round ${round}: the trigger paused the plan`)
    assert.equal((await planOf(moving.quote))?.status_reason, 'Quote moved to Sent')
    if (seen.error) {
      refused(seen.error, 'QUOTE_NOT_ACCEPTED')
      assert.equal((await linkedTo(moving.items[1].id)).length, 0)
    } else {
      assert.deepEqual((await linkedTo(moving.items[1].id)).map((row) => row.id), [seen.data])
    }
    assert.equal((await changesOf(moving.quote)).length, 1, `round ${round}: one entry`)
  }
})

// ---------------------------------------------------------------------------------------------------------------------------
// Fix round 1 (20261026103500_billing_issue_guard_paused_plan.sql): nothing is invoiced while a plan is paused or ended.
// ---------------------------------------------------------------------------------------------------------------------------

const issue = (invoice: string, client: SupabaseClient = fx.sender.client) => client.rpc('issue_invoice', { p_id: invoice })
/** The invoices issued so far in the organisation: the total of its invoice counter (a refused issue must leave it alone). */
const invoiceCounter = async () =>
  (must(await admin.from('document_counters').select('last_number').eq('organization_id', fx.orgId).eq('kind', 'invoice')) as Array<{ last_number: number }>)
    .reduce((sum, row) => sum + row.last_number, 0)
/** A plain Draft invoice (no plan link) written by a member, with one line. */
const plainDraft = async () => {
  const invoice = must(await fx.sender.client.from('invoices').insert({ organization_id: fx.orgId, client_id: fx.clientId, client_name: 'Portal Client' }).select('id').single())
  ok(await fx.sender.client.from('invoice_lines').insert({ organization_id: fx.orgId, invoice_id: invoice.id, position: 1, title: 'Advisory', quantity: 1, unit_price: 100, vat_code: 'standard' }), 'the plain draft has a line')
  return invoice.id as string
}

test('a paused or ended plan cannot be billed through the ordinary Issue button; an active plan and an unlinked invoice still issue', async () => {
  const built = await planned({ startDate: '2031-05-01', termMonths: 4 })
  const { plan, items } = built
  for (const index of [1, 2, 3]) await makeDue(items[index].id)
  const second = must(await create(items[1].id)) as string
  const third = must(await create(items[2].id)) as string
  const fourth = must(await create(items[3].id)) as string

  // Active: a monthly Draft issues with the ordinary button, and takes a number.
  let counter = await invoiceCounter()
  ok(await issue(second), 'the monthly draft of an active plan is issued')
  assert.equal((await invoiceOf(second)).status, 'Issued')
  assert.equal(await invoiceCounter(), counter + 1, 'and is numbered')
  counter += 1

  // Paused: refused for a member and for an owner, nothing is numbered, the draft is as it was.
  ok(await pause(plan.id, 'Waiting for the client'), 'the plan is paused')
  refused((await issue(third)).error, 'BILLING_PLAN_NOT_ACTIVE')
  refused((await issue(third, fxOwner.client)).error, 'BILLING_PLAN_NOT_ACTIVE')
  const draft = await invoiceOf(third)
  assert.equal(draft.status, 'Draft')
  assert.match(draft.invoice_number, /^DRAFT-/, 'still a draft reference, not a number')
  assert.equal(await invoiceCounter(), counter, 'nothing was numbered')
  // The first invoice: the ordinary button still says approval, and the approval of a paused plan is refused as before.
  refused((await issue(built.invoice)).error, 'INVOICE_USE_APPROVAL')
  refused((await approve(items[0].id)).error, 'BILLING_PLAN_NOT_ACTIVE')
  assert.equal((await invoiceOf(built.invoice)).status, 'Draft')
  assert.equal(await invoiceCounter(), counter, 'still nothing numbered')
  // An invoice with no billing link is not part of any plan: it issues while the plan is paused.
  ok(await issue(await plainDraft()), 'a plain invoice is issued')
  counter += 1
  assert.equal(await invoiceCounter(), counter)

  // Resumed: the same draft issues.
  ok(await resume(plan.id), 'the plan is resumed')
  ok(await issue(third), 'the monthly draft is issued after the resume')
  assert.equal((await invoiceOf(third)).status, 'Issued')
  counter += 1
  assert.equal(await invoiceCounter(), counter)

  // Ended: the draft that ending kept (its item has an invoice) is refused because the plan is ended.
  ok(await end(plan.id, 'Client withdrew'), 'the plan is ended')
  assert.equal((await itemRow(items[3].id)).status, 'open', 'the item with a draft was kept by the ending')
  refused((await issue(fourth)).error, 'BILLING_PLAN_NOT_ACTIVE')
  assert.equal((await invoiceOf(fourth)).status, 'Draft')
  assert.equal(await invoiceCounter(), counter, 'nothing was numbered')

  // A draft linked to a cancelled item: the ending cancels the item of a discarded (archived) draft; if that draft is brought
  // back by the service role it is refused as a cancelled month, the more specific answer, though the plan is ended too.
  const other = await planned({ startDate: '2031-05-01', termMonths: 4 })
  for (const index of [1, 2]) await makeDue(other.items[index].id)
  const kept = must(await create(other.items[1].id)) as string
  const discarded = must(await create(other.items[2].id)) as string
  ok(await fx.sender.client.from('invoices').update({ archived_at: now() }).eq('id', discarded), 'a draft is discarded')
  ok(await end(other.plan.id, 'Finished early'), 'the plan is ended')
  assert.equal((await itemRow(other.items[1].id)).status, 'open')
  assert.equal((await itemRow(other.items[2].id)).status, 'cancelled', 'the item of the discarded draft was cancelled')
  ok(await admin.from('invoices').update({ archived_at: null }).eq('id', discarded), 'the discarded draft is brought back by the service role')
  refused((await issue(discarded)).error, 'BILLING_ITEM_CANCELLED')
  refused((await issue(kept)).error, 'BILLING_PLAN_NOT_ACTIVE')
  assert.equal(await invoiceCounter(), counter, 'nothing was numbered')

  // The cancelled-item check on its own, with the plan still active.
  const single = await planned({ startDate: '2031-05-01', termMonths: 4 })
  await makeDue(single.items[1].id)
  const month = must(await create(single.items[1].id)) as string
  ok(await admin.from('billing_plan_items').update({ status: 'cancelled', cancelled_reason: 'Cancelled by hand' }).eq('id', single.items[1].id), 'the item is cancelled')
  assert.equal((await planOf(single.quote))?.status, 'active')
  refused((await issue(month)).error, 'BILLING_ITEM_CANCELLED')
  assert.equal(await invoiceCounter(), counter, 'nothing was numbered')
})
