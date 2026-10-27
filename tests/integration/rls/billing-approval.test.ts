import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  acceptQuote, activitiesOf, buildPlan, invoiceOf, itemsOf, linkedTo, makeDue, ok, refused, saToday, setupBillingOrg,
  type BillingOrg, type BillingQuoteOptions,
} from './billing-fixtures.ts'
import { isValidEmailAddress } from '../../../features/documents/email.ts'
import { admin, cleanup, createFixtureUser, signedInClient } from './helpers.ts'
import { anonymous, must } from './portal-fixtures.ts'

// Accept to invoice, stage 1, task 3: the locks on a plan's invoices and the approval of the first one. Plans are built the way
// staff build them (an Accepted quote that carries terms, with the switch on, through create_invoice_from_quote), so the first
// invoice is a Draft linked to item 1. The private function billing_invoice_blockers is reached through the public
// billing_invoice_readiness, which returns what it returns. Rows are read back, and settings and clients are moved, through the
// service role; each such change is put back before the test goes on.

type Person = { id: string; client: SupabaseClient }

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
  fx = await setupBillingOrg('billing-approval-a')
  other = await setupBillingOrg('billing-approval-b')
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

/** The member (a plain role, not an owner or admin) of the main organisation. */
const member = () => fx.sender.client

const plan = (options: BillingQuoteOptions = {}, org: BillingOrg = fx) => buildPlan(org, { startDate: '2031-05-01', termMonths: 4, ...options })
const create = (item: string, client: SupabaseClient = member()) => client.rpc('create_plan_item_invoice', { p_item_id: item })
const approve = (item: string, client: SupabaseClient = fxOwner.client) => client.rpc('approve_first_invoice', { p_item_id: item })
const issue = (invoice: string, client: SupabaseClient = member()) => client.rpc('issue_invoice', { p_id: invoice })
const readiness = (invoice: string, client: SupabaseClient = member()) => client.rpc('billing_invoice_readiness', { p_invoice_id: invoice })

const addDays = (isoDate: string, days: number) => new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
const invoiceLines = async (invoice: string) => must(await admin.from('invoice_lines').select('*').eq('invoice_id', invoice).order('position')) as Array<Record<string, any>>
const itemRow = async (id: string) => must(await admin.from('billing_plan_items').select('*').eq('id', id).single()) as Record<string, any>
/** The invoices issued so far in an organisation: the total of its invoice counter (a refused approval must leave it alone). */
const invoiceCounter = async (org: BillingOrg = fx) =>
  (must(await admin.from('document_counters').select('last_number').eq('organization_id', org.orgId).eq('kind', 'invoice')) as Array<{ last_number: number }>)
    .reduce((sum, row) => sum + row.last_number, 0)

type PlainLine = { title?: string; quantity?: number; unit_price?: number; vat_code?: 'standard' | 'zero' }
/** A plain Draft invoice (no plan link) written by a signed-in member, with its lines. */
const plainDraft = async (over: Record<string, unknown> = {}, lines: PlainLine[] = [{ quantity: 2, unit_price: 100 }, { title: 'Second', quantity: 1, unit_price: 50 }], org: BillingOrg = fx) => {
  const invoice = must(await org.sender.client.from('invoices').insert({ organization_id: org.orgId, client_id: org.clientId, client_name: 'Portal Client', ...over }).select('id').single())
  for (const [index, line] of lines.entries()) {
    const written = await org.sender.client.from('invoice_lines').insert({
      organization_id: org.orgId, invoice_id: invoice.id, position: index + 1, title: line.title ?? 'Advisory', quantity: line.quantity ?? 1, unit_price: line.unit_price ?? 100, vat_code: line.vat_code ?? 'standard',
    })
    assert.equal(written.error, null, `line ${index + 1}: ${written.error?.message}`)
  }
  return invoice.id as string
}

/** Changes the company's settings for the length of `run`, then puts them back. */
const withSettings = async <T>(change: Record<string, unknown>, run: () => Promise<T>, org: BillingOrg = fx): Promise<T> => {
  const saved = must(await admin.from('organization_settings').select(Object.keys(change).join(',')).eq('organization_id', org.orgId).single()) as unknown as Record<string, unknown>
  ok(await admin.from('organization_settings').update(change).eq('organization_id', org.orgId), 'the settings are changed')
  try {
    return await run()
  } finally {
    ok(await admin.from('organization_settings').update(saved).eq('organization_id', org.orgId), 'the settings are put back')
  }
}
/** The same for the main organisation's client. */
const withClient = async <T>(change: Record<string, unknown>, run: () => Promise<T>): Promise<T> => {
  const saved = must(await admin.from('clients').select(Object.keys(change).join(',')).eq('id', fx.clientId).single()) as unknown as Record<string, unknown>
  ok(await admin.from('clients').update(change).eq('id', fx.clientId), 'the client is changed')
  try {
    return await run()
  } finally {
    ok(await admin.from('clients').update(saved).eq('id', fx.clientId), 'the client is put back')
  }
}

test("a member cannot set or change an invoice's billing link", async () => {
  const { invoice, items } = await plan({ startDate: '2031-03-01', termMonths: 3 })

  // Not on insert, not on a plain draft, not by moving a plan draft to another month, not by clearing it, and not for an owner or admin.
  const inserted = await member().from('invoices').insert({ organization_id: fx.orgId, client_id: fx.clientId, client_name: 'Portal Client', billing_plan_item_id: items[1].id }).select('id').single()
  refused(inserted.error, 'BILLING_COLUMNS_GENERATED')
  assert.deepEqual(await linkedTo(items[1].id), [], 'nothing was made')

  const plain = await plainDraft()
  refused((await member().from('invoices').update({ billing_plan_item_id: items[1].id }).eq('id', plain)).error, 'BILLING_COLUMNS_GENERATED')
  assert.equal((await invoiceOf(plain)).billing_plan_item_id, null, 'a plain draft stays plain')

  refused((await member().from('invoices').update({ billing_plan_item_id: items[1].id }).eq('id', invoice)).error, 'BILLING_COLUMNS_GENERATED')
  refused((await member().from('invoices').update({ billing_plan_item_id: null }).eq('id', invoice)).error, 'BILLING_COLUMNS_GENERATED')
  refused((await fxAdmin.client.from('invoices').update({ billing_plan_item_id: null }).eq('id', invoice)).error, 'BILLING_COLUMNS_GENERATED')
  refused((await fxOwner.client.from('invoices').update({ billing_plan_item_id: items[2].id }).eq('id', invoice)).error, 'BILLING_COLUMNS_GENERATED')
  assert.deepEqual((await linkedTo(items[0].id)).map((row) => row.id), [invoice], 'the draft still bills month 1')
  assert.deepEqual(await linkedTo(items[1].id), [])
  assert.deepEqual(await linkedTo(items[2].id), [])

  // An issued monthly invoice: the link is just as fixed, and the answer is about the link, not the freeze.
  await makeDue(items[1].id)
  const monthly = must(await create(items[1].id)) as string
  ok(await issue(monthly), 'the monthly invoice is issued')
  refused((await member().from('invoices').update({ billing_plan_item_id: null }).eq('id', monthly)).error, 'BILLING_COLUMNS_GENERATED')
  assert.equal((await invoiceOf(monthly)).billing_plan_item_id, items[1].id)

  // An explicit null on insert is the ordinary insert.
  ok(await member().from('invoices').insert({ organization_id: fx.orgId, client_id: fx.clientId, client_name: 'Portal Client', billing_plan_item_id: null }), 'a plain invoice with no link')
})

test("a plan draft's lines cannot be added, changed or removed by a member, its due date and notes can be changed, a member can archive (discard) it, and every other header field is refused", async () => {
  const { invoice, items } = await plan({ startDate: '2031-06-01', termMonths: 3 })
  const lines = await invoiceLines(invoice)
  assert.equal(lines.length, 2, 'Setup and Retainer')
  const header = await invoiceOf(invoice)
  assert.equal(header.status, 'Draft')

  // Lines: nobody signed in adds, changes, removes or moves one.
  for (const client of [member(), fxOwner.client]) {
    refused((await client.from('invoice_lines').insert({ organization_id: fx.orgId, invoice_id: invoice, position: 3, title: 'Extra', quantity: 1, unit_price: 5 })).error, 'INVOICE_PLAN_LOCKED')
    refused((await client.from('invoice_lines').update({ unit_price: 1 }).eq('id', lines[0].id)).error, 'INVOICE_PLAN_LOCKED')
    refused((await client.from('invoice_lines').delete().eq('id', lines[1].id)).error, 'INVOICE_PLAN_LOCKED')
  }
  refused((await member().from('invoice_lines').update({ title: 'Renamed' }).eq('id', lines[0].id)).error, 'INVOICE_PLAN_LOCKED')
  refused((await member().from('invoice_lines').update({ quantity: 9 }).eq('id', lines[1].id)).error, 'INVOICE_PLAN_LOCKED')
  refused((await member().from('invoice_lines').delete().eq('invoice_id', invoice)).error, 'INVOICE_PLAN_LOCKED')
  const plain = await plainDraft()
  const [plainLine] = await invoiceLines(plain)
  refused((await member().from('invoice_lines').update({ invoice_id: plain }).eq('id', lines[0].id)).error, 'INVOICE_PLAN_LOCKED')
  refused((await member().from('invoice_lines').update({ invoice_id: invoice, position: 9 }).eq('id', plainLine.id)).error, 'INVOICE_PLAN_LOCKED')
  assert.deepEqual(await invoiceLines(invoice), lines, 'the lines are exactly as they were built')
  assert.equal((await invoiceLines(plain)).length, 2, 'and the plain draft kept its own')
  const untouched = await invoiceOf(invoice)
  assert.equal(Number(untouched.total_amount), Number(header.total_amount))

  // The due date and the notes can be changed. Sending a locked column with the value it already has is not a change.
  const due = addDays(saToday(), 14)
  ok(await member().from('invoices').update({ due_date: due, notes: 'Client asked for 14 days', client_name: header.client_name, currency: header.currency }).eq('id', invoice), 'due date and notes')
  const edited = await invoiceOf(invoice)
  assert.equal(edited.due_date, due)
  assert.equal(edited.notes, 'Client asked for 14 days')
  assert.equal(edited.status, 'Draft')
  assert.equal(edited.billing_plan_item_id, items[0].id)
  assert.equal(Number(edited.total_amount), Number(header.total_amount))
  ok(await fxAdmin.client.from('invoices').update({ notes: 'Checked by an admin' }).eq('id', invoice), 'an admin may too')

  // Every other header field is refused, one at a time and in a mix with an allowed one; nothing changes.
  const secondClient = must(await admin.from('clients').insert({ organization_id: fx.orgId, name: 'Second Client', status: 'Active' }).select('id').single()).id as string
  const spareQuote = await acceptQuote(fx, { startDate: null, termMonths: null, lines: [{ title: 'Spare', unitPrice: 10, chargeKind: 'once_off' }] })
  const refusals: Array<[string, Record<string, unknown>]> = [
    ['client_name', { client_name: 'Someone Else' }],
    ['client_id', { client_id: secondClient }],
    ['currency', { currency: 'USD' }],
    ['payment_terms', { payment_terms: 'Pay on sight' }],
    ['project_name', { project_name: 'Another project' }],
    ['project_description', { project_description: 'Another description' }],
    ['project_ref', { project_ref: 'PRJ-1' }],
    ['client_ref', { client_ref: 'PO-1' }],
    ['contact_name', { contact_name: 'Pat Contact' }],
    ['issue_date', { issue_date: saToday() }],
    ['owner_id', { owner_id: fx.sender.teamMemberId }],
    ['vat_rate', { vat_rate: 5 }],
    ['quote_id', { quote_id: spareQuote }],
    ['a mix with the due date', { due_date: addDays(saToday(), 30), client_ref: 'PO-2' }],
  ]
  const before = await invoiceOf(invoice)
  for (const [label, change] of refusals) {
    refused((await member().from('invoices').update(change).eq('id', invoice)).error, 'INVOICE_PLAN_LOCKED')
    assert.deepEqual(await invoiceOf(invoice), before, `${label}: nothing changed`)
  }
  // The send step stays closed to a member, ahead of the lock.
  refused((await member().from('invoices').update({ status: 'Issued' }).eq('id', invoice)).error, 'INVOICE_USE_ISSUE')

  // A member can discard the draft by archiving it. The item is freed when the month is built again.
  const discarded = await plan({ startDate: '2031-06-01', termMonths: 3 })
  ok(await member().from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', discarded.invoice), 'a member archives the plan draft')
  const archived = await invoiceOf(discarded.invoice)
  assert.ok(archived.archived_at, 'archived')
  assert.equal(archived.status, 'Draft')
  const rebuilt = must(await create(discarded.items[0].id)) as string
  assert.notEqual(rebuilt, discarded.invoice, 'a new draft')
  assert.deepEqual(must(await admin.from('invoices').select('id').eq('id', discarded.invoice)), [], 'the archived draft let go of the month: it was deleted (restoring it is tested below)')
  assert.deepEqual((await linkedTo(discarded.items[0].id)).map((row) => row.id), [rebuilt])
  refused((await member().from('invoice_lines').insert({ organization_id: fx.orgId, invoice_id: rebuilt, position: 3, title: 'Extra', quantity: 1, unit_price: 5 })).error, 'INVOICE_PLAN_LOCKED')
  // A draft archived and then restored before the month is built again is just a draft again.
  const restored = await plan({ startDate: '2031-06-01', termMonths: 3 })
  ok(await member().from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', restored.invoice), 'archived')
  ok(await member().from('invoices').update({ archived_at: null }).eq('id', restored.invoice), 'and restored')
  assert.equal((await invoiceOf(restored.invoice)).archived_at, null)
  assert.equal((await invoiceOf(restored.invoice)).billing_plan_item_id, restored.items[0].id)
})

test('a discarded plan draft cannot come back as an issuable draft: building the month again deletes it, so a restore finds nothing and the item keeps exactly one live invoice (first and monthly)', async () => {
  const invoicesOfQuote = async (quote: string) => must(await admin.from('invoices').select('id,status,archived_at,billing_plan_item_id,invoice_number').eq('quote_id', quote).order('created_at')) as Array<Record<string, any>>
  const live = (rows: Array<Record<string, any>>) => rows.filter((row) => row.status !== 'Cancelled' && row.archived_at === null)
  const exists = async (id: string) => (must(await admin.from('invoices').select('id').eq('id', id)) as unknown[]).length === 1
  const counter = await invoiceCounter()

  // The first invoice. A member discards the draft (archives it); the month is built again.
  const { quote, invoice: discarded, items } = await plan({ startDate: '2031-07-01', termMonths: 3 })
  ok(await member().from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', discarded), 'a member archives the first draft')
  assert.equal(await exists(discarded), true, 'until the month is built again it is only archived, as before')
  const rebuilt = must(await create(items[0].id)) as string
  assert.notEqual(rebuilt, discarded)
  assert.equal(await exists(discarded), false, 'the discarded draft is gone: it was never numbered, so no number is lost')
  assert.deepEqual(must(await admin.from('invoice_lines').select('id').eq('invoice_id', discarded)), [], 'and so are its lines')
  assert.deepEqual((await linkedTo(items[0].id)).map((row) => row.id), [rebuilt], 'the month points at the new draft')

  // The member presses Restore on it, as the Invoices register does (archived_at cleared): there is nothing to restore, so no
  // ordinary unlinked Draft can come back, and nobody can issue it.
  const restored = await member().from('invoices').update({ archived_at: null }).eq('id', discarded).select('id')
  assert.equal(restored.error, null)
  assert.deepEqual(restored.data, [], 'no row was restored')
  for (const client of [member(), fxOwner.client, fxAdmin.client]) {
    refused((await issue(discarded, client)).error, 'INVOICE_NOT_FOUND', '42501')
  }
  assert.equal(await invoiceCounter(), counter, 'no invoice number was used')

  // The item has exactly one live invoice (not Cancelled, not archived), and it is the rebuilt one: only that one can be approved.
  assert.deepEqual(live(await invoicesOfQuote(quote)).map((row) => row.id), [rebuilt])
  ok(await approve(items[0].id), 'the rebuilt first invoice is approved')
  assert.equal((await invoiceOf(rebuilt)).status, 'Issued')
  assert.equal((await invoicesOfQuote(quote)).filter((row) => row.status === 'Issued').length, 1, 'one first invoice issued, not two')
  assert.equal((await invoicesOfQuote(quote)).length, 1, 'and no other invoice of the quote exists')

  // A monthly invoice, the same way. (The plan's first draft stays a draft.)
  const monthly = await plan({ startDate: '2031-07-01', termMonths: 3 })
  await makeDue(monthly.items[1].id)
  const month = must(await create(monthly.items[1].id)) as string
  ok(await member().from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', month), 'a member archives the month draft')
  const again = must(await create(monthly.items[1].id)) as string
  assert.notEqual(again, month)
  assert.equal(await exists(month), false, 'the discarded month draft is gone')
  const restoredMonth = await member().from('invoices').update({ archived_at: null }).eq('id', month).select('id')
  assert.equal(restoredMonth.error, null)
  assert.deepEqual(restoredMonth.data, [], 'nothing to restore')
  refused((await issue(month)).error, 'INVOICE_NOT_FOUND', '42501')
  assert.deepEqual((await linkedTo(monthly.items[1].id)).map((row) => row.id), [again], 'the month has one invoice')
  assert.deepEqual(live(await invoicesOfQuote(monthly.quote)).map((row) => row.id).sort(), [monthly.invoice, again].sort(), 'the first draft and the one live month draft: nothing else exists')
  ok(await issue(again), 'the live month draft is issued as before')
  assert.equal((await invoiceOf(again)).status, 'Issued')
})

test('an invoice with no plan link is edited exactly as before', async () => {
  const run = async (org: BillingOrg, label: string, draft: string) => {
    const sender = org.sender.client
    // The header, field by field.
    const changes: Array<Record<string, unknown>> = [
      { client_name: 'Renamed Client' }, { currency: 'USD' }, { payment_terms: 'Pay within 14 days' }, { project_name: 'Project X' }, { project_description: 'A description' },
      { project_ref: 'PRJ-9' }, { client_ref: 'PO-9' }, { contact_name: 'Pat Contact' }, { due_date: addDays(saToday(), 21), notes: 'A note' },
    ]
    for (const change of changes) ok(await sender.from('invoices').update(change).eq('id', draft), `${label}: ${Object.keys(change).join(',')}`)
    const header = await invoiceOf(draft)
    assert.equal(header.project_name, 'Project X')
    assert.equal(header.client_name, 'Renamed Client')
    assert.equal(header.billing_plan_item_id, null)
    // The lines: add, change, remove.
    const added = must(await sender.from('invoice_lines').insert({ organization_id: org.orgId, invoice_id: draft, position: 9, title: 'Late extra', quantity: 1, unit_price: 25 }).select('id').single()).id as string
    ok(await sender.from('invoice_lines').update({ unit_price: 30 }).eq('id', added), `${label}: a line is changed`)
    ok(await sender.from('invoice_lines').delete().eq('id', added), `${label}: a line is removed`)
    // Archive and restore.
    ok(await sender.from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', draft), `${label}: archived`)
    ok(await sender.from('invoices').update({ archived_at: null }).eq('id', draft), `${label}: restored`)
    // And it is issued by the person who wrote it, as ever.
    const issued = must(await sender.rpc('issue_invoice', { p_id: draft })) as { id: string; number: string }
    const row = await invoiceOf(draft)
    assert.equal(row.status, 'Issued', label)
    assert.equal(row.invoice_number, issued.number)
    assert.match(row.invoice_number, /^PFX-I-\d{4}-\d{5}$/)
    assert.equal(row.due_date, header.due_date, 'the due date typed on the draft is kept')
  }

  // A draft written by hand, with the switch on.
  await run(fx, 'switch on, by hand', await plainDraft())
  // A draft made from a quote that has no terms, so no plan: the quote's lines, then edited freely.
  const noTerms = await acceptQuote(fx, { startDate: null, termMonths: null, lines: [{ title: 'Setup', unitPrice: 4000, chargeKind: 'once_off' }, { title: 'Review', unitPrice: 600, chargeKind: 'once_off' }] })
  const fromQuote = must(await member().rpc('create_invoice_from_quote', { p_quote_id: noTerms })) as string
  assert.equal((await invoiceOf(fromQuote)).billing_plan_item_id, null)
  await run(fx, 'switch on, from a quote without terms', fromQuote)

  // The switch off: a quote that carries terms makes a plain draft, and everything is as it was before any of this existed.
  await other.setBilling(false)
  try {
    await run(other, 'switch off, by hand', await plainDraft({}, undefined, other))
    const quote = await acceptQuote(other)
    const legacy = must(await other.sender.client.rpc('create_invoice_from_quote', { p_quote_id: quote })) as string
    assert.equal((await invoiceOf(legacy)).billing_plan_item_id, null)
    assert.deepEqual(await itemsOf(quote), [], 'no plan')
    await run(other, 'switch off, from a quote with terms', legacy)
  } finally {
    await other.setBilling(true)
  }
})

test('issue_invoice on a first-invoice draft is refused for a member, an admin and an owner; on a monthly draft it works as before', async () => {
  const first = await plan({ startDate: '2031-07-01', termMonths: 4 })
  const counter = await invoiceCounter()
  for (const [label, client] of [['member', member()], ['admin', fxAdmin.client], ['owner', fxOwner.client]] as const) {
    const result = await issue(first.invoice, client)
    refused(result.error, 'INVOICE_USE_APPROVAL')
    assert.equal(result.data, null, label)
  }
  const draft = await invoiceOf(first.invoice)
  assert.equal(draft.status, 'Draft')
  assert.match(draft.invoice_number, /^DRAFT-/)
  assert.equal(await invoiceCounter(), counter, 'no number was used')
  assert.equal((await itemRow(first.items[0].id)).approved_at, null)

  // A signed-in role has no way to arrange the approval for itself: the setting cannot be reached through the API.
  const spoof = await member().rpc('set_config', { setting_name: 'unison.billing_approval', new_value: first.items[0].id, is_local: false })
  assert.ok(spoof.error, 'set_config is not callable')
  refused((await issue(first.invoice)).error, 'INVOICE_USE_APPROVAL')

  // The draft check comes first: an archived first draft is "not a draft", not "use the approval".
  const archived = await plan({ startDate: '2031-07-01', termMonths: 4 })
  ok(await admin.from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', archived.invoice), 'archived by the service role')
  refused((await issue(archived.invoice, fxOwner.client)).error, 'INVOICE_NOT_DRAFT')

  // A monthly draft is issued by whoever writes it, as before.
  await makeDue(first.items[1].id)
  await makeDue(first.items[2].id)
  const second = must(await create(first.items[1].id)) as string
  const issuedByMember = must(await issue(second)) as { id: string; number: string }
  const monthly = await invoiceOf(second)
  assert.equal(monthly.status, 'Issued')
  assert.equal(monthly.invoice_number, issuedByMember.number)
  assert.match(monthly.invoice_number, /^PFX-I-\d{4}-\d{5}$/)
  assert.equal(monthly.billing_plan_item_id, first.items[1].id, 'still the invoice of month 2')
  const third = must(await create(first.items[2].id)) as string
  ok(await issue(third, fxAdmin.client), 'an admin issues a monthly draft too')
  assert.equal((await invoiceOf(third)).status, 'Issued')
  assert.equal(await invoiceCounter(), counter + 2, 'two numbers, one for each monthly invoice')
  assert.equal((await invoiceOf(first.invoice)).status, 'Draft', 'the first invoice is still waiting for its approval')
})

test("billing_invoice_blockers names each missing item, asks for the VAT number only when a standard-VAT line exists, accepts a primary contact's email when the client has no billing email, and is empty when everything is set", async () => {
  const blockers = async (invoice: string) => must(await readiness(invoice)) as string[]
  const complete = await plainDraft()
  assert.deepEqual(await blockers(complete), [], 'everything is set')
  const zeroOnly = await plainDraft({}, [{ title: 'Export', quantity: 1, unit_price: 500, vat_code: 'zero' }])
  const mixed = await plainDraft({}, [{ title: 'Export', quantity: 1, unit_price: 500, vat_code: 'zero' }, { title: 'Local', quantity: 1, unit_price: 100, vat_code: 'standard' }])

  // The company, one thing at a time.
  for (const [label, change, expected] of [
    ['a blank legal name', { legal_name: '   ' }, ['COMPANY_NAME_MISSING']],
    ['no legal name', { legal_name: null }, ['COMPANY_NAME_MISSING']],
    ['no document prefix', { document_prefix: null }, ['COMPANY_PREFIX_MISSING']],
    ['no VAT number', { vat_number: null }, ['COMPANY_VAT_NUMBER_MISSING']],
    ['a blank VAT number', { vat_number: '  ' }, ['COMPANY_VAT_NUMBER_MISSING']],
    ['no bank name', { bank_name: null }, ['BANK_DETAILS_MISSING']],
    ['no account name', { bank_account_name: '' }, ['BANK_DETAILS_MISSING']],
    ['no account number', { bank_account_number: null }, ['BANK_DETAILS_MISSING']],
    ['no branch code', { bank_branch_code: ' ' }, ['BANK_DETAILS_MISSING']],
    ['two bank details missing', { bank_name: null, bank_branch_code: null }, ['BANK_DETAILS_MISSING']],
    ['no account type (not asked for)', { bank_account_type: null }, []],
  ] as Array<[string, Record<string, unknown>, string[]]>) {
    await withSettings(change, async () => assert.deepEqual(await blockers(complete), expected, label))
  }
  // The VAT number is asked for only when a line carries standard VAT.
  await withSettings({ vat_number: null }, async () => {
    assert.deepEqual(await blockers(zeroOnly), [], 'a zero-rated invoice does not need the number')
    assert.deepEqual(await blockers(mixed), ['COMPANY_VAT_NUMBER_MISSING'], 'one standard line does')
  })
  // All four company codes, in order.
  await withSettings({ legal_name: null, document_prefix: null, vat_number: null, bank_name: null }, async () => {
    assert.deepEqual(await blockers(complete), ['COMPANY_NAME_MISSING', 'COMPANY_PREFIX_MISSING', 'COMPANY_VAT_NUMBER_MISSING', 'BANK_DETAILS_MISSING'])
  })

  // The client.
  const clientWith = async (fields: Record<string, unknown>) =>
    must(await admin.from('clients').insert({ organization_id: fx.orgId, name: 'Blockers Client', status: 'Active', address_line1: '3 Test Lane', ...fields }).select('id').single()).id as string
  const draftFor = (clientId: string | null) => plainDraft({ client_id: clientId, client_name: 'Blockers Client' })
  const contact = async (clientId: string, fields: Record<string, unknown>) =>
    ok(await admin.from('contacts').insert({ organization_id: fx.orgId, client_id: clientId, full_name: 'Casey Contact', ...fields }), `a contact ${JSON.stringify(fields)}`)

  assert.deepEqual(await blockers(await draftFor(null)), ['CLIENT_MISSING'], 'no client says so once, and does not go on to ask for its email and address')

  const noEmail = await clientWith({})
  assert.deepEqual(await blockers(await draftFor(noEmail)), ['CLIENT_EMAIL_MISSING'], 'no billing email and no contact')
  const blankEmail = await clientWith({ billing_email: '   ' })
  assert.deepEqual(await blockers(await draftFor(blankEmail)), ['CLIENT_EMAIL_MISSING'])
  const badEmail = await clientWith({ billing_email: 'accounts-at-client' })
  assert.deepEqual(await blockers(await draftFor(badEmail)), ['CLIENT_EMAIL_MISSING'], 'an email that is not an email')
  const goodEmail = await clientWith({ billing_email: 'accounts@client.test' })
  assert.deepEqual(await blockers(await draftFor(goodEmail)), [], 'a billing email is enough')

  // A primary, unarchived contact with a valid email stands in when there is no billing email.
  const viaContact = await clientWith({})
  await contact(viaContact, { email: 'pat@client.test', is_primary: true })
  assert.deepEqual(await blockers(await draftFor(viaContact)), [], "the primary contact's email is accepted")
  const withBadBilling = await clientWith({ billing_email: 'nonsense' })
  await contact(withBadBilling, { email: 'pat@client.test', is_primary: true })
  assert.deepEqual(await blockers(await draftFor(withBadBilling)), [], 'an invalid billing email falls back to the contact')
  const withGoodBilling = await clientWith({ billing_email: 'accounts@client.test' })
  await contact(withGoodBilling, { email: 'not an email', is_primary: true })
  assert.deepEqual(await blockers(await draftFor(withGoodBilling)), [], 'a valid billing email is checked first')
  // Contacts that do not count.
  const notPrimary = await clientWith({})
  await contact(notPrimary, { email: 'pat@client.test', is_primary: false })
  assert.deepEqual(await blockers(await draftFor(notPrimary)), ['CLIENT_EMAIL_MISSING'], 'a contact that is not the primary one')
  const archivedPrimary = await clientWith({})
  await contact(archivedPrimary, { email: 'pat@client.test', is_primary: true, archived_at: new Date().toISOString() })
  assert.deepEqual(await blockers(await draftFor(archivedPrimary)), ['CLIENT_EMAIL_MISSING'], 'an archived primary contact')
  const badContact = await clientWith({})
  await contact(badContact, { email: 'pat-at-client', is_primary: true })
  assert.deepEqual(await blockers(await draftFor(badContact)), ['CLIENT_EMAIL_MISSING'], "a primary contact whose email is not one")
  const noContactEmail = await clientWith({})
  await contact(noContactEmail, { email: null, is_primary: true })
  assert.deepEqual(await blockers(await draftFor(noContactEmail)), ['CLIENT_EMAIL_MISSING'], 'a primary contact with no email')
  const elsewhere = await clientWith({})
  await contact(await clientWith({}), { email: 'pat@client.test', is_primary: true })
  assert.deepEqual(await blockers(await draftFor(elsewhere)), ['CLIENT_EMAIL_MISSING'], "another client's contact does not count")

  // The address.
  const noAddress = await clientWith({ billing_email: 'accounts@client.test', address_line1: null })
  assert.deepEqual(await blockers(await draftFor(noAddress)), ['CLIENT_ADDRESS_MISSING'])
  const blankAddress = await clientWith({ billing_email: 'accounts@client.test', address_line1: '  ' })
  assert.deepEqual(await blockers(await draftFor(blankAddress)), ['CLIENT_ADDRESS_MISSING'])
  const neither = await clientWith({ address_line1: null })
  assert.deepEqual(await blockers(await draftFor(neither)), ['CLIENT_EMAIL_MISSING', 'CLIENT_ADDRESS_MISSING'], 'the email comes before the address')

  // The lines and the total.
  const noLines = must(await member().from('invoices').insert({ organization_id: fx.orgId, client_id: fx.clientId, client_name: 'Portal Client' }).select('id').single()).id as string
  assert.deepEqual(await blockers(noLines), ['NO_LINES', 'TOTAL_NOT_POSITIVE'])
  const free = await plainDraft({}, [{ title: 'Goodwill', quantity: 1, unit_price: 0 }])
  assert.deepEqual(await blockers(free), ['TOTAL_NOT_POSITIVE'], 'a line that adds up to nothing')

  // Everything wrong at once, in the order the page lists them.
  await withSettings({ legal_name: null, document_prefix: null, vat_number: null, bank_name: null }, async () => {
    const freeToAnOddClient = await plainDraft({ client_id: neither, client_name: 'Blockers Client' }, [{ title: 'Goodwill', quantity: 1, unit_price: 0 }])
    assert.deepEqual(await blockers(freeToAnOddClient), [
      'COMPANY_NAME_MISSING', 'COMPANY_PREFIX_MISSING', 'COMPANY_VAT_NUMBER_MISSING', 'BANK_DETAILS_MISSING', 'CLIENT_EMAIL_MISSING', 'CLIENT_ADDRESS_MISSING', 'TOTAL_NOT_POSITIVE',
    ])
    const nothing = must(await member().from('invoices').insert({ organization_id: fx.orgId, client_id: null, client_name: 'Prospect' }).select('id').single()).id as string
    assert.deepEqual(await blockers(nothing), ['COMPANY_NAME_MISSING', 'COMPANY_PREFIX_MISSING', 'BANK_DETAILS_MISSING', 'CLIENT_MISSING', 'NO_LINES', 'TOTAL_NOT_POSITIVE'])
  })

  // It follows a plan draft the same way, and the private function is not part of the API.
  const { invoice } = await plan()
  assert.deepEqual(await blockers(invoice), [], 'the first invoice of a plan, as built')
  assert.ok((await member().rpc('billing_invoice_blockers', { p_invoice_id: invoice })).error, 'not callable by a member')
  assert.ok((await admin.rpc('billing_invoice_blockers', { p_invoice_id: invoice })).error, 'nor by the service role')
})

test("billing_invoice_readiness counts an address as an email only when the app can send to it: the pattern and rules of isValidEmailAddress and record_document_email", async () => {
  const nbsp = String.fromCharCode(0xa0)
  const accent = String.fromCharCode(0xf1)
  /** A valid address of 254 characters (255 with extra = 1): a 64-character name and labels no longer than 63. */
  const longest = (extra: number) => `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57 + extra)}.com`
  assert.equal(longest(0).length, 254)
  assert.equal(longest(1).length, 255)
  const cases: Array<[label: string, address: string, valid: boolean]> = [
    ['two dots in a row in the name', 'a..b@client.test', false],
    ['a leading dot', '.a@client.test', false],
    ['a dot before the @', 'a.@client.test', false],
    ['two dots in a row in the domain', 'a@client..test', false],
    ['a one-letter top level', 'a@client.c', false],
    ['no top level', 'a@client', false],
    ['an accented letter in the name', `${accent}@client.test`, false],
    ['a trailing dot', 'a@client.test.', false],
    ['a space inside', 'a b@client.test', false],
    ['a label that starts with a hyphen', 'a@-client.test', false],
    ['two @', 'a@@client.test', false],
    ['a display name', 'Pat <a@client.test>', false],
    ['two addresses', 'a@client.test, b@client.test', false],
    ['255 characters', longest(1), false],
    ['a plain address', 'a@client.test', true],
    ['plus tag and subdomains', 'first.last+tag@sub.client.test', true],
    ['an apostrophe in the name', "o'brien@client.test", true],
    ['254 characters', longest(0), true],
    ['spaces, a tab, a newline and non-breaking spaces round it, which the app trims', ` \t${nbsp}a@client.test${nbsp}\n `, true],
  ]
  // The table is the app's own answer first, so it cannot drift from isValidEmailAddress.
  for (const [label, address, valid] of cases) assert.equal(isValidEmailAddress(address), valid, `the app: ${label}`)

  const client = must(await admin.from('clients').insert({ organization_id: fx.orgId, name: 'Email Client', status: 'Active', address_line1: '5 Mail Street' }).select('id').single()).id as string
  const contact = must(await admin.from('contacts').insert({ organization_id: fx.orgId, client_id: client, full_name: 'Casey Contact', is_primary: true }).select('id').single()).id as string
  const invoice = await plainDraft({ client_id: client, client_name: 'Email Client' })
  const readinessWith = async (billing: string | null, contactEmail: string | null) => {
    ok(await admin.from('clients').update({ billing_email: billing }).eq('id', client), 'the billing email is set')
    ok(await admin.from('contacts').update({ email: contactEmail }).eq('id', contact), "the primary contact's email is set")
    return must(await readiness(invoice)) as string[]
  }
  const missing = ['CLIENT_EMAIL_MISSING']
  assert.deepEqual(await readinessWith(null, null), missing, 'no address anywhere')

  for (const [label, address, valid] of cases) {
    const expected = valid ? [] : missing
    assert.deepEqual(await readinessWith(address, null), expected, `as the billing email: ${label}`)
    assert.deepEqual(await readinessWith(null, address), expected, `as the primary contact's email: ${label}`)
  }

  // As in getEmailDefaults: the billing email is used when it is valid, otherwise the primary contact's.
  assert.deepEqual(await readinessWith('a..b@client.test', 'pat@client.test'), [], 'an unusable billing email falls back to a good contact')
  assert.deepEqual(await readinessWith('accounts@client.test', '.a@client.test'), [], 'a good billing email needs no contact')
  assert.deepEqual(await readinessWith('a..b@client.test', '.a@client.test'), missing, 'neither is usable')
  assert.deepEqual(await readinessWith(' \t ', ` ${nbsp}pat@client.test `), [], 'a blank billing email and a good contact, with spaces round it')
  // The old test was only "x@y.z": none of these is an address the app sends to.
  for (const address of ['a..b@client.test', '.a@client.test', 'a@client.c', `${accent}@client.test`, 'a@client.test.']) {
    assert.equal(isValidEmailAddress(address), false, address)
    assert.deepEqual(await readinessWith(address, null), missing, `the five addresses that used to pass: ${address}`)
  }
})

test('billing_invoice_readiness is readable by a member, refused to another organisation and to anon', async () => {
  const draft = await plainDraft()
  for (const client of [member(), fxAdmin.client, fxOwner.client]) assert.deepEqual(must(await readiness(draft, client)), [])
  refused((await readiness(draft, other.sender.client)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await readiness(draft, otherOwner.client)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await readiness(draft, lonerClient)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await readiness('00000000-0000-0000-0000-000000000000')).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  const signedOut = await anonymous.rpc('billing_invoice_readiness', { p_invoice_id: draft })
  assert.match(signedOut.error?.message ?? '', /permission denied for function billing_invoice_readiness/)
})

test('a member cannot approve (BILLING_APPROVAL_ADMIN_ONLY); an owner and an admin can', async () => {
  const one = await plan()
  const two = await plan()
  const three = await plan()
  const counter = await invoiceCounter()

  const refusal = await approve(one.items[0].id, member())
  refused(refusal.error, 'BILLING_APPROVAL_ADMIN_ONLY', '42501')
  assert.equal((await invoiceOf(one.invoice)).status, 'Draft')
  assert.equal((await itemRow(one.items[0].id)).approved_at, null)
  assert.equal(await invoiceCounter(), counter)

  const byAdmin = must(await approve(one.items[0].id, fxAdmin.client)) as { invoice_id: string; number: string }
  assert.deepEqual(Object.keys(byAdmin).sort(), ['invoice_id', 'number'])
  assert.equal(byAdmin.invoice_id, one.invoice)
  assert.equal((await invoiceOf(one.invoice)).status, 'Issued')
  assert.equal((await invoiceOf(one.invoice)).invoice_number, byAdmin.number)

  const byOwner = must(await approve(two.items[0].id, fxOwner.client)) as { invoice_id: string; number: string }
  assert.equal(byOwner.invoice_id, two.invoice)
  assert.notEqual(byOwner.number, byAdmin.number)
  assert.equal(await invoiceCounter(), counter + 2)

  // The member is still refused after an admin and an owner have approved other plans.
  refused((await approve(three.items[0].id, member())).error, 'BILLING_APPROVAL_ADMIN_ONLY', '42501')
  assert.equal((await invoiceOf(three.invoice)).status, 'Draft')
})

test('a failed check raises BILLING_CHECKS_FAILED naming the codes, leaves the invoice a Draft and consumes no invoice number', async () => {
  const { quote, invoice, items } = await plan()
  const counter = await invoiceCounter()
  const stillWaiting = async (label: string) => {
    const row = await invoiceOf(invoice)
    assert.equal(row.status, 'Draft', label)
    assert.match(row.invoice_number, /^DRAFT-/, label)
    assert.equal((await itemRow(items[0].id)).approved_at, null, label)
    assert.equal(await invoiceCounter(), counter, `${label}: no number was consumed`)
    assert.deepEqual(await activitiesOf(quote, 'billing.invoice_approved'), [], `${label}: nothing on the timeline`)
  }
  const failsWith = async (label: string, codes: string[], run: () => Promise<unknown> = async () => undefined) => {
    const result = await approve(items[0].id)
    refused(result.error, 'BILLING_CHECKS_FAILED')
    assert.match(result.error!.message, new RegExp(`BILLING_CHECKS_FAILED: ${codes.join(',')}$`), `${label}: ${result.error!.message}`)
    await stillWaiting(label)
    await run()
  }

  // Bank details are not something issue_invoice looks at: without the check the invoice would have gone out without them.
  await withSettings({ bank_account_number: null }, () => failsWith('no account number', ['BANK_DETAILS_MISSING']))
  await withSettings({ legal_name: '', vat_number: null, bank_name: null }, () => failsWith('company details', ['COMPANY_NAME_MISSING', 'COMPANY_VAT_NUMBER_MISSING', 'BANK_DETAILS_MISSING']))
  await withClient({ billing_email: null }, () => failsWith('no client email', ['CLIENT_EMAIL_MISSING']))
  await withClient({ billing_email: null, address_line1: null }, () => failsWith('no client email or address', ['CLIENT_EMAIL_MISSING', 'CLIENT_ADDRESS_MISSING']))
  // The readiness list says the same thing the refusal did.
  await withSettings({ bank_branch_code: null }, async () => assert.deepEqual(must(await readiness(invoice)), ['BANK_DETAILS_MISSING']))
  // An invoice with no lines: a service role (a member could not) takes them away.
  ok(await admin.from('invoice_lines').delete().eq('invoice_id', invoice), 'the lines are taken away')
  await failsWith('no lines', ['NO_LINES', 'TOTAL_NOT_POSITIVE'])
  // Its lines are not here to put back, so a fresh plan shows the approval working once everything is in order again.
  const next = await plan()
  const before = await invoiceCounter()
  ok(await approve(next.items[0].id), 'with everything in order the approval goes through')
  assert.equal(await invoiceCounter(), before + 1)
})

test("approval issues the invoice: Issued, numbered, dated today, due today plus the company's payment days, or the due date typed on the draft; approved_at and approved_by are stamped and billing.invoice_approved is on the quote's timeline", async () => {
  const settings = must(await admin.from('organization_settings').select('default_payment_days').eq('organization_id', fx.orgId).single())
  const paymentDays = settings.default_payment_days as number

  // No due date typed.
  const a = await plan()
  const counter = await invoiceCounter()
  const lines = await invoiceLines(a.invoice)
  const days = [saToday()]
  const result = must(await approve(a.items[0].id, fxAdmin.client)) as { invoice_id: string; number: string }
  days.push(saToday())
  assert.equal(result.invoice_id, a.invoice)
  const issued = await invoiceOf(a.invoice)
  assert.equal(issued.status, 'Issued')
  assert.equal(issued.invoice_number, result.number)
  assert.match(result.number, /^PFX-I-\d{4}-\d{5}$/)
  assert.ok(days.includes(issued.issue_date), `dated the South African day it was approved (${issued.issue_date} not in ${days})`)
  assert.equal(issued.due_date, addDays(issued.issue_date, paymentDays), `due ${paymentDays} days later`)
  assert.equal(Number(issued.balance_amount), Number(issued.total_amount))
  assert.ok(Number(issued.total_amount) > 0)
  assert.equal(issued.bill_to.name, 'Portal Client')
  assert.equal(issued.issuer.legal_name, 'Portal Fixture (Pty) Ltd')
  assert.equal(issued.billing_plan_item_id, a.items[0].id, 'still the invoice of month 1')
  assert.equal(issued.archived_at, null)
  assert.deepEqual(await invoiceLines(a.invoice), lines, 'the lines are those of the quote, as they were')
  assert.equal(await invoiceCounter(), counter + 1)

  const item = await itemRow(a.items[0].id)
  assert.ok(item.approved_at, 'approved_at is stamped')
  assert.ok(Math.abs(Date.now() - new Date(item.approved_at).getTime()) < 300_000, 'with the time of the approval')
  assert.equal(item.approved_by, fxAdmin.id, 'by the person who approved')
  assert.equal(item.status, 'open')
  const entries = await activitiesOf(a.quote, 'billing.invoice_approved')
  assert.equal(entries.length, 1)
  assert.equal(entries[0].subject, `Invoice ${result.number} approved`)
  assert.equal(entries[0].organization_id, fx.orgId)
  assert.equal(entries[0].created_by, fxAdmin.id)
  assert.equal(entries[0].quote_id, a.quote)
  assert.equal(entries[0].details.invoice_id, a.invoice)
  assert.equal(entries[0].details.billing_plan_item_id, a.items[0].id)

  // It is an issued invoice from now on: the existing freeze applies, not the plan lock.
  refused((await member().from('invoices').update({ client_ref: 'late' }).eq('id', a.invoice)).error, 'INVOICE_FROZEN')
  refused((await member().from('invoice_lines').insert({ organization_id: fx.orgId, invoice_id: a.invoice, position: 9, title: 'Late', quantity: 1, unit_price: 1 })).error, 'INVOICE_FROZEN')

  // A due date typed on the draft is kept (a member may type it, and so may the approver).
  const b = await plan()
  const typed = addDays(saToday(), 45)
  ok(await member().from('invoices').update({ due_date: typed }).eq('id', b.invoice), 'the due date is typed')
  const byOwner = must(await approve(b.items[0].id, fxOwner.client)) as { invoice_id: string; number: string }
  const typedInvoice = await invoiceOf(b.invoice)
  assert.equal(typedInvoice.status, 'Issued')
  assert.equal(typedInvoice.due_date, typed)
  assert.equal(typedInvoice.invoice_number, byOwner.number)
  assert.equal((await itemRow(b.items[0].id)).approved_by, fxOwner.id)
  assert.notEqual(byOwner.number, result.number)

  // A due date in the past is the existing rule: the whole approval is undone.
  const c = await plan()
  ok(await member().from('invoices').update({ due_date: '2020-01-01' }).eq('id', c.invoice), 'a past due date is typed')
  const before = await invoiceCounter()
  refused((await approve(c.items[0].id)).error, 'INVOICE_DUE_BEFORE_ISSUE')
  assert.equal((await invoiceOf(c.invoice)).status, 'Draft')
  assert.equal((await itemRow(c.items[0].id)).approved_at, null)
  assert.equal(await invoiceCounter(), before, 'no number was used')
  assert.deepEqual(await activitiesOf(c.quote, 'billing.invoice_approved'), [])
  ok(await member().from('invoices').update({ due_date: null }).eq('id', c.invoice), 'the date is cleared')
  ok(await approve(c.items[0].id), 'and then it goes through')
})

test('approving twice, or two approvals at once, issues once', async () => {
  // Twice, one after the other.
  const a = await plan()
  const counter = await invoiceCounter()
  const first = must(await approve(a.items[0].id, fxOwner.client)) as { invoice_id: string; number: string }
  const again = await approve(a.items[0].id, fxAdmin.client)
  refused(again.error, 'BILLING_ALREADY_APPROVED')
  assert.equal(again.data, null)
  assert.equal(await invoiceCounter(), counter + 1)
  assert.equal((await invoiceOf(a.invoice)).invoice_number, first.number)
  assert.equal((await activitiesOf(a.quote, 'billing.invoice_approved')).length, 1)
  assert.equal((await itemRow(a.items[0].id)).approved_by, fxOwner.id, 'the first approver stays on the record')

  // The approval does not leave the permission behind: another first draft still cannot be issued directly.
  const b = await plan()
  refused((await issue(b.invoice, fxOwner.client)).error, 'INVOICE_USE_APPROVAL')
  refused((await issue(b.invoice, fxAdmin.client)).error, 'INVOICE_USE_APPROVAL')
  refused((await issue(b.invoice)).error, 'INVOICE_USE_APPROVAL')

  // At once: exactly one wins, the other is told it is done.
  for (let round = 1; round <= 2; round += 1) {
    const c = await plan()
    const before = await invoiceCounter()
    const people: Person[] = [fxOwner, fxAdmin]
    const race = await Promise.all(people.map((who) => approve(c.items[0].id, who.client)))
    const winners = race.filter((result) => !result.error)
    const losers = race.filter((result) => result.error)
    assert.equal(winners.length, 1, `round ${round}: exactly one approval went through`)
    assert.equal(losers.length, 1)
    assert.match(losers[0].error!.message, /\b(BILLING_ALREADY_APPROVED|INVOICE_NOT_DRAFT)\b/, `round ${round}: ${losers[0].error!.message}`)
    assert.equal(await invoiceCounter(), before + 1, `round ${round}: the invoice was numbered once`)
    const row = await invoiceOf(c.invoice)
    assert.equal(row.status, 'Issued')
    assert.equal(row.invoice_number, (winners[0].data as { number: string }).number)
    assert.equal((await activitiesOf(c.quote, 'billing.invoice_approved')).length, 1, `round ${round}: one timeline entry`)
    const winner = people[race.indexOf(winners[0])]
    assert.equal((await itemRow(c.items[0].id)).approved_by, winner.id, `round ${round}: the winner is on the record`)
  }
})

test("approval is refused for a monthly item, a paused or ended plan, a switched-off organisation and another organisation's item", async () => {
  const p = await plan({ startDate: '2031-09-01', termMonths: 4 })
  const counter = await invoiceCounter()
  const untouched = async (label: string) => {
    const row = await invoiceOf(p.invoice)
    assert.equal(row.status, 'Draft', label)
    assert.match(row.invoice_number, /^DRAFT-/, label)
    assert.equal((await itemRow(p.items[0].id)).approved_at, null, label)
    assert.equal(await invoiceCounter(), counter, `${label}: no number was used`)
    assert.deepEqual(await activitiesOf(p.quote, 'billing.invoice_approved'), [], label)
  }

  // A monthly item is not approved: its invoice is issued by whoever writes it.
  await makeDue(p.items[1].id)
  const monthly = must(await create(p.items[1].id)) as string
  refused((await approve(p.items[1].id)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  assert.equal((await invoiceOf(monthly)).status, 'Draft', 'the monthly draft was not issued')
  assert.equal((await itemRow(p.items[1].id)).approved_at, null)

  // Paused and ended plans.
  for (const status of ['paused', 'ended']) {
    ok(await admin.from('billing_plans').update({ status, status_reason: `Set to ${status}` }).eq('quote_id', p.quote), `the plan is ${status}`)
    refused((await approve(p.items[0].id)).error, 'BILLING_PLAN_NOT_ACTIVE')
    await untouched(`a ${status} plan`)
  }
  ok(await admin.from('billing_plans').update({ status: 'active', status_reason: null }).eq('quote_id', p.quote), 'the plan is active again')

  // A cancelled item.
  ok(await admin.from('billing_plan_items').update({ status: 'cancelled', cancelled_reason: 'The client changed the term' }).eq('id', p.items[0].id), 'item 1 is cancelled')
  refused((await approve(p.items[0].id)).error, 'BILLING_ITEM_CANCELLED')
  await untouched('a cancelled item')
  ok(await admin.from('billing_plan_items').update({ status: 'open', cancelled_reason: null }).eq('id', p.items[0].id), 'item 1 is open again')

  // A draft that is archived, or that is no longer the item's.
  ok(await admin.from('invoices').update({ archived_at: new Date().toISOString() }).eq('id', p.invoice), 'the draft is archived')
  refused((await approve(p.items[0].id)).error, 'INVOICE_NOT_DRAFT')
  await untouched('an archived draft')
  ok(await admin.from('invoices').update({ archived_at: null }).eq('id', p.invoice), 'the draft is back')
  ok(await admin.from('invoices').update({ billing_plan_item_id: null }).eq('id', p.invoice), 'the draft is detached from the item')
  refused((await approve(p.items[0].id)).error, 'INVOICE_NOT_DRAFT')
  await untouched('an item with no invoice')
  ok(await admin.from('invoices').update({ billing_plan_item_id: p.items[0].id }).eq('id', p.invoice), 'the draft is attached again')

  // Another organisation's item, an item that does not exist, a login with no organisation, and anon.
  const foreign = await plan({ startDate: '2031-09-01', termMonths: 3 }, other)
  refused((await approve(foreign.items[0].id)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await approve(foreign.items[0].id, fxAdmin.client)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await approve(p.items[0].id, otherOwner.client)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await approve(p.items[0].id, other.sender.client)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await approve(p.items[0].id, lonerClient)).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  refused((await approve('00000000-0000-0000-0000-000000000000')).error, 'BILLING_ITEM_NOT_FOUND', '42501')
  const signedOut = await anonymous.rpc('approve_first_invoice', { p_item_id: p.items[0].id })
  assert.match(signedOut.error?.message ?? '', /permission denied for function approve_first_invoice/)
  assert.equal((await invoiceOf(foreign.invoice)).status, 'Draft', "A could not approve B's invoice")
  await untouched("another organisation's people")

  // A switched-off organisation: its own owner is refused, plan or not, and it works again with the switch on.
  await other.setBilling(false)
  try {
    refused((await approve(foreign.items[0].id, otherOwner.client)).error, 'BILLING_NOT_ENABLED')
    assert.equal((await invoiceOf(foreign.invoice)).status, 'Draft')
  } finally {
    await other.setBilling(true)
  }
  ok(await approve(foreign.items[0].id, otherOwner.client), "with the switch back on, the other organisation's owner approves")
  assert.equal((await invoiceOf(foreign.invoice)).status, 'Issued')

  // After all of that, the plan in the first organisation is as it was and can still be approved.
  await untouched('after every refusal')
  ok(await approve(p.items[0].id), 'the first invoice is approved at last')
  assert.equal((await invoiceOf(p.invoice)).status, 'Issued')
  assert.deepEqual((await linkedTo(p.items[0].id)).map((row) => row.id), [p.invoice])
})
