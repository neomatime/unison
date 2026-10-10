import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let member: U
let other: U
let adminUser: U
let outsider: U
let memberClient: SupabaseClient
let otherClient: SupabaseClient
let adminClient: SupabaseClient
let outsiderClient: SupabaseClient
let clientA: string
let clientA2: string
let clientB: string
let leadA: string
let oppA: string
let quoteA: string
const extraUsers: string[] = []
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function one(table: string, row: Record<string, unknown>) {
  const { data, error } = await admin.from(table).insert(row).select('id').single()
  if (error) throw new Error(`${table}: ${error.message}`)
  return data.id as string
}

const newOpp = (over: Record<string, unknown> = {}) =>
  one('sales_opportunities', { organization_id: orgA, name: 'Opp', client_name: 'Acme', stage: 'Discovery', ...over })

const logged = (over: Record<string, unknown> = {}) => ({
  organization_id: orgA, kind: 'note', subject: 'A note', created_by: member.id, lead_id: leadA, ...over,
})

before(async () => {
  orgA = await createFixtureOrg('crm-contacts')
  orgB = await createFixtureOrg('crm-contacts-other')
  member = await createFixtureUser(orgA, 'member')
  other = await createFixtureUser(orgA, 'member')
  adminUser = await createFixtureUser(orgA, 'admin')
  outsider = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  otherClient = await signedInClient(other.email, other.password)
  adminClient = await signedInClient(adminUser.email, adminUser.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  clientA = await one('clients', { organization_id: orgA, name: 'Client A', status: 'Active' })
  clientA2 = await one('clients', { organization_id: orgA, name: 'Client A2', status: 'Active' })
  clientB = await one('clients', { organization_id: orgB, name: 'Client B', status: 'Active' })
  leadA = await one('leads', { organization_id: orgA, company_name: 'Lead A', contact_name: 'Pat' })
  oppA = await newOpp()
  quoteA = await one('quotes', { organization_id: orgA, quote_number: 'CC-1', client_name: 'Acme' })
})

after(async () => {
  await cleanup([orgA, orgB], [member.id, other.id, adminUser.id, outsider.id, ...extraUsers])
})

// ------------------------------------------------------------------ contacts

test('contacts: exactly one parent', async () => {
  const both = await admin.from('contacts').insert({ organization_id: orgA, full_name: 'X', client_id: clientA, lead_id: leadA })
  assert.equal(both.error?.code, '23514')
  assert.match(both.error!.message, /contacts_one_parent/)
  const neither = await admin.from('contacts').insert({ organization_id: orgA, full_name: 'X' })
  assert.equal(neither.error?.code, '23514')
  assert.match(neither.error!.message, /contacts_one_parent/)
})

test('contacts: a blank name is refused', async () => {
  const { error } = await admin.from('contacts').insert({ organization_id: orgA, client_id: clientA, full_name: '   ' })
  assert.equal(error?.code, '23514')
})

test('contacts: a client from another organisation is unrepresentable', async () => {
  const { error } = await admin.from('contacts').insert({ organization_id: orgA, client_id: clientB, full_name: 'X' })
  assert.equal(error?.code, '23503')
  assert.match(error!.message, /contacts_client_id_organization_id_fkey/)
})

test('contacts: one primary per parent, and an archived primary does not block another', async () => {
  const first = await one('contacts', { organization_id: orgA, client_id: clientA2, full_name: 'First', is_primary: true })
  const second = await admin.from('contacts').insert({ organization_id: orgA, client_id: clientA2, full_name: 'Second', is_primary: true })
  assert.equal(second.error?.code, '23505')
  assert.match(second.error!.message, /contacts_one_primary_per_client/)
  await admin.from('contacts').update({ archived_at: new Date().toISOString() }).eq('id', first)
  const third = await admin.from('contacts').insert({ organization_id: orgA, client_id: clientA2, full_name: 'Third', is_primary: true })
  assert.equal(third.error, null)
  const onOther = await admin.from('contacts').insert({ organization_id: orgA, client_id: clientA, full_name: 'Elsewhere', is_primary: true })
  assert.equal(onOther.error, null, 'a different parent has its own primary')
})

test('contacts: a member reads, writes and updates but cannot delete; an outsider can do nothing', async () => {
  const created = await memberClient.from('contacts').insert({ organization_id: orgA, lead_id: leadA, full_name: 'Member made' }).select('id').single()
  assert.equal(created.error, null)
  const updated = await memberClient.from('contacts').update({ job_title: 'CFO' }).eq('id', created.data!.id).select('job_title').single()
  assert.equal(updated.data!.job_title, 'CFO')
  const removed = await memberClient.from('contacts').delete().eq('id', created.data!.id)
  assert.equal(removed.error?.code, '42501', 'there is no delete privilege: contacts are archived')
  assert.match(removed.error!.message, /permission denied for table contacts/)

  const read = await outsiderClient.from('contacts').select('id').eq('organization_id', orgA)
  assert.deepEqual(read.data, [])
  const write = await outsiderClient.from('contacts').insert({ organization_id: orgA, lead_id: leadA, full_name: 'Hijack' })
  assert.equal(write.error?.code, '42501')
  const change = await outsiderClient.from('contacts').update({ full_name: 'Hijacked' }).eq('id', created.data!.id).select('id')
  assert.deepEqual(change.data, [])
})

test('contacts: anon has no privileges', async () => {
  const read = await anonymous.from('contacts').select('id').limit(1)
  assert.match(read.error!.message, /permission denied for table contacts/)
  const write = await anonymous.from('contacts').insert({ organization_id: orgA, full_name: 'X', lead_id: leadA })
  assert.match(write.error!.message, /permission denied for table contacts/)
})

test('set_primary_contact moves the primary in one step and refuses a contact the caller cannot see', async () => {
  const a = await one('contacts', { organization_id: orgA, client_id: clientA2, full_name: 'Prim A' })
  const b = await one('contacts', { organization_id: orgA, client_id: clientA2, full_name: 'Prim B' })
  await memberClient.rpc('set_primary_contact', { p_contact_id: a })
  await memberClient.rpc('set_primary_contact', { p_contact_id: b })
  const { data } = await admin.from('contacts').select('id, is_primary').eq('client_id', clientA2).is('archived_at', null)
  assert.deepEqual(data!.filter((row) => row.is_primary).map((row) => row.id), [b], 'exactly one primary remains')

  const foreign = await outsiderClient.rpc('set_primary_contact', { p_contact_id: a })
  assert.equal(foreign.error?.code, 'P0002')
  assert.match(foreign.error!.message, /CONTACT_NOT_FOUND/)
  const signedOut = await anonymous.rpc('set_primary_contact', { p_contact_id: a })
  assert.match(signedOut.error!.message, /permission denied for function set_primary_contact/)
})

// ------------------------------------------------------------------ activities

test('activities: exactly one parent, and the kind must be known', async () => {
  const none = await admin.from('activities').insert({ organization_id: orgA, kind: 'note', subject: 'x' })
  assert.equal(none.error?.code, '23514')
  assert.match(none.error!.message, /activities_one_parent/)
  const two = await admin.from('activities').insert({ organization_id: orgA, kind: 'note', subject: 'x', lead_id: leadA, client_id: clientA })
  assert.match(two.error!.message, /activities_one_parent/)
  const bad = await admin.from('activities').insert({ organization_id: orgA, kind: 'gossip', subject: 'x', lead_id: leadA })
  assert.equal(bad.error?.code, '23514')
  assert.match(bad.error!.message, /activities_kind_check/)
})

test('activities: a parent from another organisation is unrepresentable', async () => {
  const { error } = await admin.from('activities').insert({ organization_id: orgA, kind: 'note', subject: 'x', client_id: clientB })
  assert.equal(error?.code, '23503')
  assert.match(error!.message, /activities_client_id_organization_id_fkey/)
})

test('activities: a member logs as themselves; forging an author, a system kind or a future time is refused', async () => {
  const ok = await memberClient.from('activities').insert(logged()).select('id').single()
  assert.equal(ok.error, null)

  const forged = await memberClient.from('activities').insert(logged({ created_by: other.id }))
  assert.equal(forged.error?.code, '42501', "a member cannot log as someone else")

  const system = await memberClient.from('activities').insert(logged({ kind: 'lead.converted' }))
  assert.equal(system.error?.code, '42501', 'a member cannot write a system entry')

  const future = await memberClient.from('activities').insert(logged({ occurred_at: new Date(Date.now() + 86_400_000).toISOString() }))
  assert.equal(future.error?.code, '42501', 'an entry cannot be in the future')

  const outsiderWrite = await outsiderClient.from('activities').insert(logged({ created_by: outsider.id }))
  assert.equal(outsiderWrite.error?.code, '42501')
})

test('activities: the author or an admin may edit and delete a logged entry; another member may not', async () => {
  const id = (await memberClient.from('activities').insert(logged({ subject: 'Mine' })).select('id').single()).data!.id

  const byOther = await otherClient.from('activities').update({ subject: 'Hijacked' }).eq('id', id).select('id')
  assert.deepEqual(byOther.data, [], 'another member matches nothing')
  const deleteByOther = await otherClient.from('activities').delete().eq('id', id).select('id')
  assert.deepEqual(deleteByOther.data, [])

  const byAuthor = await memberClient.from('activities').update({ subject: 'Edited' }).eq('id', id).select('subject').single()
  assert.equal(byAuthor.data!.subject, 'Edited')
  const byAdmin = await adminClient.from('activities').update({ body: 'Admin note' }).eq('id', id).select('body').single()
  assert.equal(byAdmin.data!.body, 'Admin note')
  const removed = await adminClient.from('activities').delete().eq('id', id).select('id')
  assert.equal(removed.data!.length, 1)
})

test('activities: system entries cannot be edited or deleted by anyone, even an admin', async () => {
  const id = await one('activities', { organization_id: orgA, kind: 'lead.converted', subject: 'System', lead_id: leadA })
  const edit = await adminClient.from('activities').update({ subject: 'Rewritten' }).eq('id', id).select('id')
  assert.deepEqual(edit.data, [])
  const remove = await adminClient.from('activities').delete().eq('id', id).select('id')
  assert.deepEqual(remove.data, [])
  const stored = await admin.from('activities').select('subject').eq('id', id).single()
  assert.equal(stored.data!.subject, 'System')
})

test('activities: the parent, author and details of an entry are frozen', async () => {
  const id = (await memberClient.from('activities').insert(logged()).select('id').single()).data!.id
  const move = await memberClient.from('activities').update({ lead_id: null, client_id: clientA }).eq('id', id)
  assert.equal(move.error?.code, '23514')
  assert.match(move.error!.message, /activities_frozen/)
  const reassign = await adminClient.from('activities').update({ created_by: adminUser.id }).eq('id', id)
  assert.match(reassign.error!.message, /activities_frozen/)
})

test('removing a member leaves their entries with no author and does not fail', async () => {
  const leaver = await createFixtureUser(orgA, 'member')
  extraUsers.push(leaver.id)
  const leaverClient = await signedInClient(leaver.email, leaver.password)
  const id = (await leaverClient.from('activities').insert(logged({ created_by: leaver.id, subject: 'From a leaver' })).select('id').single()).data!.id

  const removal = await admin.from('memberships').delete().eq('organization_id', orgA).eq('user_id', leaver.id)
  assert.equal(removal.error, null, 'the freeze trigger must allow created_by to become null')
  const after = await admin.from('activities').select('created_by, subject').eq('id', id).single()
  assert.equal(after.data!.created_by, null)
  assert.equal(after.data!.subject, 'From a leaver')
})

test('activities: anon has no privileges', async () => {
  const read = await anonymous.from('activities').select('id').limit(1)
  assert.match(read.error!.message, /permission denied for table activities/)
})

// ------------------------------------------------------------------ triggers

const entries = async (column: string, id: string, kind: string) => {
  const { data } = await admin.from('activities').select('*').eq(column, id).eq('kind', kind)
  return data ?? []
}

test('a stage change writes one entry with from and to, as the member who made it, and nothing else does', async () => {
  const id = await newOpp()
  await memberClient.from('sales_opportunities').update({ stage: 'Qualified' }).eq('id', id)
  const [entry, ...rest] = await entries('opportunity_id', id, 'opportunity.stage_changed')
  assert.equal(rest.length, 0)
  assert.deepEqual(entry.details, { from: 'Discovery', to: 'Qualified' })
  assert.equal(entry.created_by, member.id)
  assert.equal(entry.subject, 'Stage changed from Discovery to Qualified')

  await memberClient.from('sales_opportunities').update({ notes: 'no stage change' }).eq('id', id)
  assert.equal((await entries('opportunity_id', id, 'opportunity.stage_changed')).length, 1, 'an edit that keeps the stage writes nothing')

  await admin.from('sales_opportunities').update({ stage: 'Won' }).eq('id', id)
  const all = await entries('opportunity_id', id, 'opportunity.stage_changed')
  assert.equal(all.length, 2)
  assert.equal(all.find((row) => row.details.to === 'Won')!.created_by, null, 'a service-role change has no author')
})

test('a quote writes sent and accepted once each, from their own timestamps', async () => {
  const id = await one('quotes', { organization_id: orgA, quote_number: 'CQ-EVENTS', client_name: 'Acme', status: 'Sent' })
  assert.equal((await entries('quote_id', id, 'quote.sent')).length, 1, 'created already Sent')
  await admin.from('quotes').update({ notes: 'edit' }).eq('id', id)
  assert.equal((await entries('quote_id', id, 'quote.sent')).length, 1, 'an edit does not re-send')
  await admin.from('quotes').update({ status: 'Accepted' }).eq('id', id)
  assert.equal((await entries('quote_id', id, 'quote.accepted')).length, 1)
  assert.equal((await entries('quote_id', id, 'quote.sent')).length, 1, 'accepting does not add a sent entry')
})

test('the trigger functions cannot be called as RPCs', async () => {
  for (const name of ['log_opportunity_stage_change', 'log_quote_milestones']) {
    const { error } = await memberClient.rpc(name)
    assert.match(error!.message, new RegExp(`permission denied for function ${name}`), name)
  }
})

// ------------------------------------------------------------------ checks and links

test('a lead is Converted only through conversion, and an opportunity cannot be Lost without a reason', async () => {
  const converted = await admin.from('leads').update({ status: 'Converted' }).eq('id', leadA)
  assert.equal(converted.error?.code, '23514')
  assert.match(converted.error!.message, /leads_converted_status_check/)
  const stamped = await admin.from('leads').update({ converted_at: new Date().toISOString() }).eq('id', leadA)
  assert.match(stamped.error!.message, /leads_converted_status_check/, 'converted_at without the status is also refused')

  const lost = await admin.from('sales_opportunities').update({ stage: 'Lost' }).eq('id', oppA)
  assert.equal(lost.error?.code, '23514')
  assert.match(lost.error!.message, /sales_opportunities_lost_reason_check/)
  const blank = await admin.from('sales_opportunities').update({ stage: 'Lost', lost_reason: '   ' }).eq('id', oppA)
  assert.match(blank.error!.message, /sales_opportunities_lost_reason_check/)
  const fine = await admin.from('sales_opportunities').update({ stage: 'Lost', lost_reason: 'Budget' }).eq('id', oppA)
  assert.equal(fine.error, null)
  await admin.from('sales_opportunities').update({ stage: 'Discovery', lost_reason: null }).eq('id', oppA)
})

test('tasks can link to a lead and an opportunity in the same organisation only', async () => {
  const ok = await admin.from('tasks').insert({ organization_id: orgA, title: 'Call', lead_id: leadA, opportunity_id: oppA })
  assert.equal(ok.error, null)
  const foreignLead = await admin.from('leads').insert({ organization_id: orgB, company_name: 'B Lead', contact_name: 'x' }).select('id').single()
  const bad = await admin.from('tasks').insert({ organization_id: orgA, title: 'Bad', lead_id: foreignLead.data!.id })
  assert.equal(bad.error?.code, '23503')
  assert.match(bad.error!.message, /tasks_lead_id_organization_id_fkey/)
})

// ------------------------------------------------------------------ record_timeline

test('record_timeline shows each page what the spec says, newest first, and nothing from another organisation', async () => {
  const c = await one('clients', { organization_id: orgA, name: 'Timeline Co', status: 'Active' })
  const l = await one('leads', { organization_id: orgA, company_name: 'Timeline Co', contact_name: 'Pat' })
  await admin.from('leads').update({ status: 'Converted', converted_at: new Date().toISOString(), converted_client_id: c }).eq('id', l)
  const o = await newOpp({ client_id: c, client_name: 'Timeline Co', lead_id: l })
  const q = await one('quotes', { organization_id: orgA, quote_number: 'CQ-TL', client_name: 'Timeline Co', client_id: c, opportunity_id: o })
  const note = (parent: Record<string, string>, subject: string, at: string) =>
    one('activities', { organization_id: orgA, kind: 'note', subject, occurred_at: at, ...parent })
  await note({ lead_id: l }, 'on lead', '2026-01-01T10:00:00Z')
  await note({ client_id: c }, 'on client', '2026-01-02T10:00:00Z')
  await note({ opportunity_id: o }, 'on opportunity', '2026-01-03T10:00:00Z')
  await note({ quote_id: q }, 'on quote', '2026-01-04T10:00:00Z')

  const subjects = async (kind: string, id: string, client: SupabaseClient = memberClient) =>
    ((await client.rpc('record_timeline', { p_kind: kind, p_id: id })).data ?? []).map((row: any) => row.subject)

  assert.deepEqual(await subjects('lead', l), ['on lead'])
  assert.deepEqual(await subjects('quote', q), ['on quote'])
  assert.deepEqual(await subjects('opportunity', o), ['on quote', 'on opportunity'], 'an opportunity includes its quotes')
  assert.deepEqual(await subjects('client', c), ['on quote', 'on opportunity', 'on client', 'on lead'], 'a client includes its lead, opportunities and quotes')
  assert.deepEqual(await subjects('client', c, outsiderClient), [], 'another organisation sees nothing')
  assert.deepEqual(await subjects('mystery', c), [], 'an unknown kind matches nothing')
})

test('record_timeline pages by a cursor without repeating or skipping entries that share a time', async () => {
  const l = await one('leads', { organization_id: orgA, company_name: 'Paging Co', contact_name: 'Pat' })
  const at = '2026-02-02T10:00:00Z'
  for (let index = 0; index < 5; index += 1) {
    await one('activities', { organization_id: orgA, kind: 'note', subject: `n${index}`, occurred_at: at, lead_id: l })
  }
  const seen: string[] = []
  let cursor: { at: string | null; id: string | null } = { at: null, id: null }
  for (let page = 0; page < 5; page += 1) {
    const { data } = await memberClient.rpc('record_timeline', { p_kind: 'lead', p_id: l, p_limit: 2, p_before: cursor.at, p_before_id: cursor.id })
    if (!data?.length) break
    seen.push(...data.map((row: any) => row.id))
    const last = data[data.length - 1]
    cursor = { at: last.occurred_at, id: last.id }
  }
  assert.equal(seen.length, 5)
  assert.equal(new Set(seen).size, 5, 'no entry is repeated or skipped')
})

test('record_timeline is not callable signed out', async () => {
  const { error } = await anonymous.rpc('record_timeline', { p_kind: 'lead', p_id: leadA })
  assert.match(error!.message, /permission denied for function record_timeline/)
})
