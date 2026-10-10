import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let member: U
let outsider: U
let memberClient: SupabaseClient
let outsiderClient: SupabaseClient
let clientB: string
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const newLead = async (over: Record<string, unknown> = {}) => {
  const { data, error } = await admin.from('leads')
    .insert({ organization_id: orgA, company_name: 'Convert Co', contact_name: 'Pat Contact', contact_email: 'pat@convert.test', contact_phone: '012', contact_role: 'CFO', industry: 'Mining', estimated_value: 5000, currency: 'USD', notes: 'Lead notes', ...over })
    .select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}
const newClient = async (over: Record<string, unknown> = {}) => {
  const { data, error } = await admin.from('clients').insert({ organization_id: orgA, name: 'Existing Co', status: 'Active', ...over }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}
const convert = (leadId: string, clientId: string | null = null, client: SupabaseClient = memberClient) =>
  client.rpc('convert_lead', { p_lead_id: leadId, p_client_id: clientId })
const count = async (table: string, org = orgA) =>
  (await admin.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', org)).count ?? 0

before(async () => {
  orgA = await createFixtureOrg('crm-convert')
  orgB = await createFixtureOrg('crm-convert-other')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  const { data } = await admin.from('clients').insert({ organization_id: orgB, name: 'B Client', status: 'Active' }).select('id').single()
  clientB = data!.id
})

after(async () => {
  await cleanup([orgA, orgB], [member.id, outsider.id])
})

test('converting makes a client, a primary contact and an opportunity from the lead, and links the lead', async () => {
  const leadId = await newLead({ engagement_type: 'Retainer' })
  const { data, error } = await convert(leadId)
  assert.equal(error, null)
  assert.equal(data.created_client, true)

  const client = (await admin.from('clients').select('*').eq('id', data.client_id).single()).data!
  assert.equal(client.name, 'Convert Co')
  assert.equal(client.industry, 'Mining')
  assert.equal(client.contact_name, 'Pat Contact')
  assert.equal(client.status, 'Onboarding')
  assert.equal(client.engagement_type, 'Retainer')

  const contact = (await admin.from('contacts').select('*').eq('id', data.contact_id).single()).data!
  assert.equal(contact.client_id, data.client_id)
  assert.equal(contact.full_name, 'Pat Contact')
  assert.equal(contact.email, 'pat@convert.test')
  assert.equal(contact.job_title, 'CFO')
  assert.equal(contact.is_primary, true)

  const opp = (await admin.from('sales_opportunities').select('*').eq('id', data.opportunity_id).single()).data!
  assert.equal(opp.stage, 'Discovery')
  assert.equal(opp.client_id, data.client_id)
  assert.equal(opp.lead_id, leadId)
  assert.equal(Number(opp.expected_value), 5000)
  assert.equal(opp.currency, 'USD')
  assert.equal(opp.notes, 'Lead notes')

  const lead = (await admin.from('leads').select('*').eq('id', leadId).single()).data!
  assert.equal(lead.status, 'Converted')
  assert.ok(lead.converted_at)
  assert.equal(lead.converted_client_id, data.client_id)
  assert.equal(lead.converted_opportunity_id, data.opportunity_id)
})

test('a lead engagement type the client does not accept is left off, not copied', async () => {
  const { data } = await convert(await newLead({ company_name: 'Odd Engagement Co', engagement_type: 'Something else' }))
  const client = (await admin.from('clients').select('engagement_type').eq('id', data.client_id).single()).data!
  assert.equal(client.engagement_type, null)
})

test('each of the three records gets its own conversion entry, written as the member who converted', async () => {
  const leadId = await newLead({ company_name: 'Entries Co' })
  const { data } = await convert(leadId)
  const read = async (column: string, id: string) =>
    (await admin.from('activities').select('kind, created_by, subject').eq(column, id)).data!
  const onLead = await read('lead_id', leadId)
  assert.deepEqual(onLead.map((row) => row.kind), ['lead.converted'])
  assert.equal(onLead[0].created_by, member.id)
  assert.deepEqual((await read('client_id', data.client_id)).map((row) => row.kind), ['client.created_from_lead'])
  assert.deepEqual((await read('opportunity_id', data.opportunity_id)).map((row) => row.kind), ['opportunity.created_from_lead'])
})

test('converting into an existing client adds to it, reuses a contact with the same email, and writes no client entry', async () => {
  const clientId = await newClient({ name: 'Existing Reuse Co' })
  await admin.from('contacts').insert({ organization_id: orgA, client_id: clientId, full_name: 'Existing Person', email: 'PAT@Convert.test', is_primary: true })
  const leadId = await newLead({ company_name: 'Existing Reuse Co' })
  const before = await count('clients')
  const { data, error } = await convert(leadId, clientId)
  assert.equal(error, null)
  assert.equal(data.created_client, false)
  assert.equal(data.client_id, clientId)
  assert.equal(await count('clients'), before, 'no new client')

  const contacts = (await admin.from('contacts').select('id, full_name').eq('client_id', clientId)).data!
  assert.equal(contacts.length, 1, 'the contact with the same email is reused, whatever its capitals')
  assert.equal(data.contact_id, contacts[0].id)
  assert.equal((await admin.from('activities').select('id').eq('client_id', clientId).eq('kind', 'client.created_from_lead')).data!.length, 0)
  assert.equal((await admin.from('sales_opportunities').select('client_id').eq('id', data.opportunity_id).single()).data!.client_id, clientId)
})

test('a new person at an existing client is added but is not made primary over the existing primary', async () => {
  const clientId = await newClient({ name: 'Has Primary Co' })
  await admin.from('contacts').insert({ organization_id: orgA, client_id: clientId, full_name: 'Boss', email: 'boss@x.test', is_primary: true })
  const { data } = await convert(await newLead({ company_name: 'Has Primary Co', contact_email: 'new@x.test' }), clientId)
  const contact = (await admin.from('contacts').select('is_primary').eq('id', data.contact_id).single()).data!
  assert.equal(contact.is_primary, false)
  const primaries = (await admin.from('contacts').select('id').eq('client_id', clientId).eq('is_primary', true)).data!
  assert.equal(primaries.length, 1)
})

test('contacts and follow-ups already on the lead move to the client; archived contacts stay behind', async () => {
  const leadId = await newLead({ company_name: 'Moves Co', contact_email: null })
  const live = (await admin.from('contacts').insert({ organization_id: orgA, lead_id: leadId, full_name: 'On lead', is_primary: true }).select('id').single()).data!.id
  const archived = (await admin.from('contacts').insert({ organization_id: orgA, lead_id: leadId, full_name: 'Archived on lead', archived_at: new Date().toISOString() }).select('id').single()).data!.id
  const task = (await admin.from('tasks').insert({ organization_id: orgA, title: 'Follow up', lead_id: leadId }).select('id').single()).data!.id

  const { data } = await convert(leadId)
  const moved = (await admin.from('contacts').select('client_id, lead_id, is_primary').eq('id', live).single()).data!
  assert.equal(moved.client_id, data.client_id)
  assert.equal(moved.lead_id, null)
  assert.equal(moved.is_primary, true, 'the primary stays primary on a client with none')
  const stayed = (await admin.from('contacts').select('client_id, lead_id').eq('id', archived).single()).data!
  assert.equal(stayed.lead_id, leadId)
  assert.equal(stayed.client_id, null)

  const followUp = (await admin.from('tasks').select('client_id, lead_id').eq('id', task).single()).data!
  assert.equal(followUp.client_id, data.client_id)
  assert.equal(followUp.lead_id, leadId, 'the follow-up keeps its lead link')
})

test('a follow-up on the lead that already has its own client keeps it, and keeps its lead link', async () => {
  const otherClient = await newClient({ name: 'Follow-up Own Client Co' })
  const leadId = await newLead({ company_name: 'Own Client Follow-up Co' })
  const owned = (await admin.from('tasks').insert({ organization_id: orgA, title: 'Already tied', lead_id: leadId, client_id: otherClient }).select('id').single()).data!.id
  const free = (await admin.from('tasks').insert({ organization_id: orgA, title: 'Not yet tied', lead_id: leadId }).select('id').single()).data!.id

  const { data } = await convert(leadId)
  const keptTask = (await admin.from('tasks').select('client_id, lead_id').eq('id', owned).single()).data!
  assert.equal(keptTask.client_id, otherClient, 'a follow-up already tied to a client is not moved')
  assert.equal(keptTask.lead_id, leadId)
  const relinked = (await admin.from('tasks').select('client_id, lead_id').eq('id', free).single()).data!
  assert.equal(relinked.client_id, data.client_id)
  assert.equal(relinked.lead_id, leadId)
})

test('converting twice is refused and creates nothing more', async () => {
  const leadId = await newLead({ company_name: 'Twice Co' })
  await convert(leadId)
  const clients = await count('clients')
  const opps = await count('sales_opportunities')
  const again = await convert(leadId)
  assert.match(again.error!.message, /LEAD_ALREADY_CONVERTED/)
  assert.equal(await count('clients'), clients)
  assert.equal(await count('sales_opportunities'), opps)
})

test('two people converting the same lead at once: exactly one succeeds and exactly one client is made', async () => {
  const leadId = await newLead({ company_name: 'Race Co' })
  const before = await count('clients')
  const results = await Promise.all([convert(leadId), convert(leadId)])
  const wins = results.filter((result) => !result.error)
  const losses = results.filter((result) => result.error)
  assert.equal(wins.length, 1)
  assert.equal(losses.length, 1)
  assert.match(losses[0].error!.message, /LEAD_ALREADY_CONVERTED/)
  assert.equal(await count('clients'), before + 1)
})

test('a blank contact name fails after the client is created, and everything rolls back', async () => {
  const leadId = await newLead({ company_name: 'Rollback Co', contact_name: '   ', contact_email: null })
  const clients = await count('clients')
  const opps = await count('sales_opportunities')
  const { error } = await convert(leadId)
  assert.ok(error, 'the conversion must fail')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /contacts/)
  assert.equal(await count('clients'), clients, 'the client created before the failure is rolled back')
  assert.equal(await count('sales_opportunities'), opps)
  const lead = (await admin.from('leads').select('status, converted_at').eq('id', leadId).single()).data!
  assert.equal(lead.status, 'New')
  assert.equal(lead.converted_at, null)
})

test('an archived lead is refused', async () => {
  const leadId = await newLead({ company_name: 'Archived Lead Co', archived_at: new Date().toISOString() })
  const { error } = await convert(leadId)
  assert.match(error!.message, /LEAD_ARCHIVED/)
})

test('a client from another organisation, or an archived client, is refused and nothing is created', async () => {
  const leadId = await newLead({ company_name: 'Refusal Co' })
  const clients = await count('clients')
  const foreign = await convert(leadId, clientB)
  assert.match(foreign.error!.message, /CLIENT_NOT_FOUND/)
  const archivedClient = await newClient({ name: 'Archived Client Co', archived_at: new Date().toISOString() })
  const archived = await convert(leadId, archivedClient)
  assert.match(archived.error!.message, /CLIENT_NOT_FOUND/)
  assert.equal(await count('clients'), clients + 1, 'only the client the test itself made')
  assert.equal((await admin.from('leads').select('status').eq('id', leadId).single()).data!.status, 'New')
})

test('a non-member is told the lead was not found, the same as for a lead that does not exist', async () => {
  const leadId = await newLead({ company_name: 'Hidden Co' })
  const foreign = await convert(leadId, null, outsiderClient)
  assert.equal(foreign.error!.code, '42501')
  assert.match(foreign.error!.message, /LEAD_NOT_FOUND/)
  const missing = await convert('00000000-0000-4000-8000-0000000000aa', null, outsiderClient)
  assert.equal(missing.error!.message, foreign.error!.message)
  assert.equal((await admin.from('leads').select('status').eq('id', leadId).single()).data!.status, 'New')
})

test('a signed-out caller cannot execute it', async () => {
  const { error } = await anonymous.rpc('convert_lead', { p_lead_id: '00000000-0000-4000-8000-0000000000aa' })
  assert.match(error!.message, /permission denied for function convert_lead/)
})
