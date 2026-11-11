import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test, { after, before } from 'node:test'

import { refused, setupBillingOrg, type BillingOrg } from './billing-fixtures.ts'
import { admin } from './helpers.ts'
import { anonymous, must } from './portal-fixtures.ts'

// Accept to invoice, stage 2, tasks 2 and 4: the system path's shared cores and the functions built on them.
//
// Task 2 is a refactor with no change in behaviour: public.issue_invoice and public.record_document_email now call a private core
// (private.issue_invoice_apply, private.record_document_email_core) that the runner's system path shares. These are the
// characterisation tests for it: what a member, another organisation's member, anon and the service role without a user could and
// could not do before, they still can and cannot. The fuller suites (documents-send-issue, documents-delivery, billing-approval,
// payments) are run before and after and must keep their pass counts.

let fx: BillingOrg
let other: BillingOrg

before(async () => {
  fx = await setupBillingOrg('billing-system-a')
  other = await setupBillingOrg('billing-system-b')
})

after(async () => {
  try {
    await fx?.teardown()
  } finally {
    await other?.teardown()
  }
})

/** A plain Draft invoice with one line, made by the service role (no plan, no quote). */
async function draftInvoice(org: BillingOrg): Promise<string> {
  const invoice = must(await admin.from('invoices').insert({ organization_id: org.orgId, client_id: org.clientId, client_name: 'Portal Client', status: 'Draft' }).select('id').single())
  const line = await admin.from('invoice_lines').insert({ organization_id: org.orgId, invoice_id: invoice.id, position: 1, title: 'Work', quantity: 1, unit_price: 1000 })
  assert.equal(line.error, null, line.error?.message)
  return invoice.id as string
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const record = (client: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> }, id: string, to = 'client@example.test') =>
  client.rpc('record_document_email', { p_kind: 'invoice', p_id: id, p_to: to, p_subject: 'Invoice', p_body: 'Body', p_sha256: hash(id), p_bytes: 1234 })

test('the refactored issue_invoice and record_document_email still refuse non-members, other organisations, anon and a caller with no user', async () => {
  const id = await draftInvoice(fx)

  refused((await other.sender.client.rpc('issue_invoice', { p_id: id })).error, 'INVOICE_NOT_FOUND', '42501')
  refused((await admin.rpc('issue_invoice', { p_id: id })).error, 'INVOICE_NOT_FOUND', '42501')
  assert.match((await anonymous.rpc('issue_invoice', { p_id: id })).error?.message ?? '', /permission denied for function issue_invoice/)
  assert.equal(must(await admin.from('invoices').select('status').eq('id', id).single()).status, 'Draft', 'the refused calls issued nothing')

  // A member of the organisation issues it, and the answer has the same shape as before.
  const issued = must(await fx.sender.client.rpc('issue_invoice', { p_id: id })) as Record<string, any>
  assert.deepEqual(Object.keys(issued).sort(), ['id', 'number'])
  assert.equal(issued.id, id)
  const row = must(await admin.from('invoices').select('status,invoice_number,issue_date,due_date,issuer,bill_to').eq('id', id).single())
  assert.equal(row.status, 'Issued')
  assert.equal(row.invoice_number, issued.number)
  assert.ok(row.due_date >= row.issue_date)
  const company = must(await admin.from('organization_settings').select('legal_name').eq('organization_id', fx.orgId).single())
  assert.equal(row.issuer.legal_name, company.legal_name, 'the company details are frozen on it')
  assert.equal(row.bill_to.name, 'Portal Client')
  refused((await fx.sender.client.rpc('issue_invoice', { p_id: id })).error, 'INVOICE_NOT_DRAFT')

  // Recording the email: refused for the same people, recorded for a member with the member as sender.
  refused((await record(other.sender.client, id)).error, 'INVOICE_NOT_FOUND', '42501')
  refused((await record(admin, id)).error, 'INVOICE_NOT_FOUND', '42501')
  assert.match((await record(anonymous, id)).error?.message ?? '', /permission denied for function record_document_email/)
  assert.equal(must(await admin.from('document_emails').select('id').eq('invoice_id', id)).length, 0, 'the refused calls recorded nothing')

  const recorded = await record(fx.sender.client, id)
  assert.equal(recorded.error, null, recorded.error?.message)
  const email = must(await admin.from('document_emails').select('sent_by,to_address').eq('id', recorded.data).single())
  assert.equal(email.sent_by, fx.sender.userId)
  assert.equal(email.to_address, 'client@example.test')
  const timeline = must(await admin.from('activities').select('kind').eq('client_id', fx.clientId).eq('kind', 'invoice.emailed'))
  assert.ok(timeline.length >= 1, 'the timeline entry is written')

  // The validation is unchanged.
  refused((await record(fx.sender.client, id, 'not an address')).error, 'EMAIL_ADDRESS_INVALID')
  refused((await fx.sender.client.rpc('record_document_email', { p_kind: 'invoice', p_id: id, p_to: 'a@b.test', p_subject: 'two\nlines', p_body: '', p_sha256: hash(id), p_bytes: 1 })).error, 'EMAIL_SUBJECT_INVALID')
  refused((await fx.sender.client.rpc('record_document_email', { p_kind: 'invoice', p_id: id, p_to: 'a@b.test', p_subject: 'S', p_body: '', p_sha256: 'short', p_bytes: 1 })).error, 'EMAIL_RECORD_INVALID')
  refused((await fx.sender.client.rpc('record_document_email', { p_kind: 'thing', p_id: id, p_to: 'a@b.test', p_subject: 'S', p_body: '', p_sha256: hash(id), p_bytes: 1 })).error, 'DOCUMENT_KIND_UNKNOWN', '22023')
})

test('a Draft cannot be recorded as emailed, as before', async () => {
  const id = await draftInvoice(fx)
  refused((await record(fx.sender.client, id)).error, 'DOCUMENT_IS_DRAFT')
})
