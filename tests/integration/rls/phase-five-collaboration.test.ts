import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgA: string
let orgB: string
let memberA: { id: string; email: string; password: string }

before(async () => {
  orgA = await createFixtureOrg('phase-five-a')
  orgB = await createFixtureOrg('phase-five-b')
  memberA = await createFixtureUser(orgA, 'member')
  const { error: ticketError } = await admin.from('support_tickets').insert({ organization_id: orgB, submitted_by: memberA.id, subject: 'Other tenant support item', description: 'This belongs to another organization.' })
  if (ticketError) throw ticketError
  const { error: documentError } = await admin.from('documents').insert({ organization_id: orgB, uploaded_by: memberA.id, display_name: 'other-tenant.pdf', storage_path: `${orgB}/other-tenant.pdf`, mime_type: 'application/pdf', file_size: 100 })
  if (documentError) throw documentError
  const { error: notificationError } = await admin.from('notifications').insert({ organization_id: orgB, user_id: memberA.id, title: 'Other tenant notification' })
  if (notificationError) throw notificationError
})

after(async () => {
  if (orgA) await admin.storage.from('documents').remove([`${orgA}/rls-phase-five.pdf`])
  await cleanup([orgA, orgB].filter(Boolean), [memberA?.id].filter(Boolean))
})

test('members can create persistent collaboration records in their organization', async () => {
  const client = await signedInClient(memberA.email, memberA.password)
  const { data: ticket, error: ticketError } = await client.from('support_tickets').insert({ organization_id: orgA, submitted_by: memberA.id, subject: 'Phase five support request', description: 'Please investigate this persistent collaboration test.' }).select('id').single()
  assert.equal(ticketError, null)
  assert.ok(ticket)
  const { data: document, error: documentError } = await client.from('documents').insert({ organization_id: orgA, uploaded_by: memberA.id, display_name: 'phase-five-evidence.pdf', storage_path: `${orgA}/phase-five-evidence.pdf`, mime_type: 'application/pdf', file_size: 128 }).select('id').single()
  assert.equal(documentError, null)
  assert.ok(document)
  const { data: notification, error: notificationError } = await client.from('notifications').insert({ organization_id: orgA, user_id: memberA.id, category: 'Support', title: 'Phase five notification' }).select('id').single()
  assert.equal(notificationError, null)
  assert.ok(notification)
  const { error: jobError } = await client.from('data_import_jobs').insert({ organization_id: orgA, created_by: memberA.id, collection: 'clients', file_name: 'clients.csv', file_type: 'csv', status: 'Completed', row_count: 1, imported_count: 1, skipped_count: 0 })
  assert.equal(jobError, null)

  const { error: readError } = await client.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notification!.id)
  assert.equal(readError, null)
})

test('search returns indexed records only from the requested member organization', async () => {
  const client = await signedInClient(memberA.email, memberA.password)
  const { data, error } = await client.rpc('search_organization_records', { target_organization: orgA, search_query: 'phase five', result_limit: 20 })
  assert.equal(error, null)
  assert.ok((data?.length ?? 0) >= 1)
  assert.ok(data?.every((item: { title: string }) => !item.title.includes('Other tenant')))

  const { data: other, error: otherError } = await client.rpc('search_organization_records', { target_organization: orgB, search_query: 'other tenant', result_limit: 20 })
  assert.equal(otherError, null)
  assert.deepEqual(other, [])
})

test('another organization remains invisible and cannot receive writes', async () => {
  const client = await signedInClient(memberA.email, memberA.password)
  for (const table of ['documents', 'notifications', 'support_tickets', 'data_import_jobs', 'record_index', 'record_change_events'] as const) {
    const { data, error } = await client.from(table).select('*').eq('organization_id', orgB)
    assert.equal(error, null)
    assert.deepEqual(data, [], `${table} must not expose another tenant`)
  }
  const { error } = await client.from('support_tickets').insert({ organization_id: orgB, submitted_by: memberA.id, subject: 'Cross tenant request', description: 'This write must be blocked by row level security.' })
  assert.ok(error)
  assert.match(error.message, /row-level security|policy|permission/i)
})

test('private document storage accepts only the member organization prefix', async () => {
  const client = await signedInClient(memberA.email, memberA.password)
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55])
  const { error: ownError } = await client.storage.from('documents').upload(`${orgA}/rls-phase-five.pdf`, bytes, { contentType: 'application/pdf' })
  assert.equal(ownError, null)
  const { data: ownDownload, error: ownDownloadError } = await client.storage.from('documents').download(`${orgA}/rls-phase-five.pdf`)
  assert.equal(ownDownloadError, null)
  assert.ok(ownDownload)
  const { error: foreignError } = await client.storage.from('documents').upload(`${orgB}/rls-phase-five.pdf`, bytes, { contentType: 'application/pdf' })
  assert.ok(foreignError)
  assert.match(foreignError.message, /row-level security|policy|permission|unauthorized/i)
})
