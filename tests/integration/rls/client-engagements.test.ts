import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'
import { seedRateCard } from './rate-card-fixture.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let owner: U
let member: U
let outsider: U
let ownerClient: SupabaseClient
let memberClient: SupabaseClient
let outsiderClient: SupabaseClient

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const refused = (error: { message: string } | null, token: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
}
const day = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

let counter = 0
async function newClient(org = orgA): Promise<string> {
  counter += 1
  return must(await admin.from('clients').insert({ organization_id: org, name: `Eng Client ${counter}`, status: 'Active' }).select('id').single()).id
}
const setPackage = (client: string, key: string, start: string | null = null, db: SupabaseClient = memberClient) =>
  db.rpc('set_client_package', { p_client: client, p_package_key: key, p_start_date: start })
const engagement = async (id: string) => must(await admin.from('client_engagements').select('*').eq('id', id).single()) as Record<string, any>

before(async () => {
  orgA = await createFixtureOrg('eng-a')
  orgB = await createFixtureOrg('eng-b')
  owner = await createFixtureUser(orgA, 'owner')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  ownerClient = await signedInClient(owner.email, owner.password)
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  await seedRateCard(orgA)
  await seedRateCard(orgB)
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [owner?.id, member?.id, outsider?.id].filter(Boolean))
})

test('recording a retainer creates the engagement, sets the client type and writes a timeline entry', async () => {
  const client = await newClient()
  const result = await setPackage(client, 'growth', day())
  assert.equal(result.error, null)
  const row = await engagement(result.data as string)
  assert.equal(row.kind, 'retainer')
  assert.equal(row.package_key, 'growth')
  assert.equal(row.root_id, row.id)
  assert.equal(row.replaces_id, null)
  assert.equal(must(await admin.from('clients').select('engagement_type').eq('id', client).single()).engagement_type, 'Retainer')
  const timeline = must(await admin.from('activities').select('kind, subject').eq('client_id', client).eq('kind', 'billing.package_set'))
  assert.equal(timeline.length, 1)
  assert.match(timeline[0].subject, /Growth Partner/)
})

test('a second active retainer is refused, and an unknown package, a bad date and another organisation\'s client are refused', async () => {
  const client = await newClient()
  assert.equal((await setPackage(client, 'signature')).error, null)
  refused((await setPackage(client, 'growth')).error, 'CLIENT_HAS_RETAINER')
  refused((await setPackage(client, 'platinum')).error, 'PACKAGE_UNKNOWN')
  refused((await setPackage(client, 'support.website_care')).error, 'PACKAGE_UNKNOWN')
  refused((await setPackage(await newClient(), 'growth', day(-4000))).error, 'PACKAGE_START_INVALID')
  const foreign = await newClient(orgB)
  refused((await setPackage(foreign, 'growth')).error, 'CLIENT_NOT_FOUND')
  refused((await setPackage(client, 'growth', null, outsiderClient)).error, 'CLIENT_NOT_FOUND')
  assert.equal(must(await admin.from('client_engagements').select('id').eq('client_id', foreign)).length, 0)
})

test('members cannot write engagements or support rows directly and cannot see another organisation\'s', async () => {
  const client = await newClient()
  const id = (await setPackage(client, 'growth')).data as string
  assert.ok((await memberClient.from('client_engagements').insert({ organization_id: orgA, client_id: client, kind: 'project', package_key: 'digital_presence', start_date: day(), root_id: id })).error)
  assert.ok((await memberClient.from('client_engagements').update({ ended_on: day() }).eq('id', id).select('id')).error)
  assert.equal(must(await memberClient.from('client_engagements').select('id').eq('id', id)).length, 1)
  assert.equal(must(await outsiderClient.from('client_engagements').select('id').eq('id', id)).length, 0)
  assert.ok((await memberClient.from('engagement_support').insert({ organization_id: orgA, engagement_id: id, service_key: 'support.website_care', start_date: day() })).error)
})

test('the initiative limit: Signature 2, Growth 4, Private 6; the next project is refused; ending one frees a place', async () => {
  for (const [tier, limit] of [['signature', 2], ['growth', 4], ['private', 6]] as const) {
    const client = await newClient()
    assert.equal((await setPackage(client, tier)).error, null)
    const ids: string[] = []
    for (let i = 0; i < limit; i += 1) {
      const added = await setPackage(client, 'digital_presence')
      assert.equal(added.error, null, `${tier} project ${i + 1}`)
      ids.push(added.data as string)
    }
    refused((await setPackage(client, 'digital_presence')).error, 'INITIATIVE_LIMIT_REACHED')
    assert.equal((await memberClient.rpc('end_engagement', { p_engagement: ids[0], p_ended_on: null })).error, null)
    assert.equal((await setPackage(client, 'operating_model')).error, null, `${tier}: a place was freed`)
    refused((await setPackage(client, 'operating_model')).error, 'INITIATIVE_LIMIT_REACHED')
  }
})

test('HIMARK Reserve has no limit until an owner or admin sets one; a client with no retainer has none', async () => {
  const reserve = await newClient()
  assert.equal((await setPackage(reserve, 'reserve')).error, null)
  for (let i = 0; i < 7; i += 1) assert.equal((await setPackage(reserve, 'digital_presence')).error, null)
  const standalone = await newClient()
  for (let i = 0; i < 7; i += 1) assert.equal((await setPackage(standalone, 'digital_experience')).error, null)

  // The reserve client now has 7 active projects. A limit of 7 is full; a limit of 8 leaves one place.
  const item = must(await admin.from('price_list_items').select('id').eq('organization_id', orgA).eq('rate_key', 'retainer.reserve.monthly').single())
  assert.equal((await ownerClient.from('price_list_items').update({ initiative_limit: 7 }).eq('id', item.id)).error, null)
  refused((await setPackage(reserve, 'digital_presence')).error, 'INITIATIVE_LIMIT_REACHED')
  assert.equal((await ownerClient.from('price_list_items').update({ initiative_limit: 8 }).eq('id', item.id)).error, null)
  assert.equal((await setPackage(reserve, 'digital_presence')).error, null)
  assert.equal((await ownerClient.from('price_list_items').update({ initiative_limit: null }).eq('id', item.id)).error, null)
})

test('recording a retainer for a client who already has more projects than its tier allows is refused', async () => {
  const client = await newClient()
  for (let i = 0; i < 3; i += 1) assert.equal((await setPackage(client, 'digital_presence')).error, null)
  refused((await setPackage(client, 'signature')).error, 'INITIATIVE_LIMIT_REACHED')
  assert.equal((await setPackage(client, 'growth')).error, null)
})

test('changing tier ends the old retainer the day before, links the new one back and keeps the chain\'s root', async () => {
  const client = await newClient()
  const first = (await setPackage(client, 'growth', day(-30))).data as string
  const result = await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'private', p_start_date: day(-5) })
  assert.equal(result.error, null)
  const old = await engagement(first)
  const next = await engagement(result.data as string)
  assert.equal(old.ended_on, day(-6))
  assert.equal(next.package_key, 'private')
  assert.equal(next.replaces_id, first)
  assert.equal(next.root_id, first)
  assert.equal(next.start_date, day(-5))
  assert.equal(next.ended_on, null)
  assert.equal(must(await admin.from('activities').select('id').eq('client_id', client).eq('kind', 'billing.tier_changed')).length, 1)
})

test('changing tier: refusals (same tier, ended retainer, bad date, a project, over the new limit, another organisation)', async () => {
  const client = await newClient()
  const first = (await setPackage(client, 'growth', day(-10))).data as string
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'growth', p_start_date: day() })).error, 'PACKAGE_UNCHANGED')
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'private', p_start_date: day(-10) })).error, 'PACKAGE_START_INVALID')
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'private', p_start_date: null })).error, 'PACKAGE_START_INVALID')
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'unknown', p_start_date: day() })).error, 'PACKAGE_UNKNOWN')
  refused((await outsiderClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'private', p_start_date: day() })).error, 'ENGAGEMENT_NOT_FOUND')
  for (let i = 0; i < 3; i += 1) assert.equal((await setPackage(client, 'digital_presence')).error, null)
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'signature', p_start_date: day() })).error, 'INITIATIVE_LIMIT_REACHED')
  const project = (await setPackage(await newClient(), 'digital_presence')).data as string
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: project, p_new_package_key: 'private', p_start_date: day() })).error, 'ENGAGEMENT_NOT_RETAINER')
  assert.equal((await memberClient.rpc('end_engagement', { p_engagement: first, p_ended_on: day() })).error, null)
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: first, p_new_package_key: 'private', p_start_date: day(1) })).error, 'ENGAGEMENT_ENDED')
})

test('support services: only a service of that project, once at a time, only on an active project; ending the engagement ends them', async () => {
  const client = await newClient()
  const project = (await setPackage(client, 'visual_communication', day(-20))).data as string
  const added = await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.communication_asset_care', p_start_date: day(-10) })
  assert.equal(added.error, null)
  refused((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.communication_asset_care', p_start_date: day() })).error, 'SUPPORT_ALREADY_ACTIVE')
  refused((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.website_care', p_start_date: day() })).error, 'SUPPORT_NOT_FOR_PROJECT')
  refused((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'retainer.growth.monthly', p_start_date: day() })).error, 'SUPPORT_NOT_FOR_PROJECT')
  refused((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.nonsense', p_start_date: day() })).error, 'RATE_ITEM_UNAVAILABLE')
  refused((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.social_media_content', p_start_date: day(-30) })).error, 'PACKAGE_START_INVALID')
  const retainer = (await setPackage(client, 'growth')).data as string
  refused((await memberClient.rpc('add_support_service', { p_engagement: retainer, p_service_key: 'support.social_media_content', p_start_date: day() })).error, 'ENGAGEMENT_NOT_PROJECT')

  assert.equal((await memberClient.rpc('end_support_service', { p_support: added.data as string, p_ended_on: day(-2) })).error, null)
  assert.equal((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.communication_asset_care', p_start_date: day(-1) })).error, null)
  assert.equal((await memberClient.rpc('end_engagement', { p_engagement: project, p_ended_on: day() })).error, null)
  const open = must(await admin.from('engagement_support').select('id').eq('engagement_id', project).is('ended_on', null))
  assert.equal(open.length, 0)
  refused((await memberClient.rpc('end_support_service', { p_support: added.data as string, p_ended_on: day() })).error, 'SUPPORT_ALREADY_ENDED')
  refused((await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.communication_asset_care', p_start_date: day() })).error, 'ENGAGEMENT_ENDED')
  refused((await outsiderClient.rpc('end_support_service', { p_support: added.data as string, p_ended_on: day() })).error, 'SUPPORT_NOT_FOUND')
})

test('two people recording a retainer for the same client at once: exactly one succeeds', async () => {
  const client = await newClient()
  const results = await Promise.all([setPackage(client, 'signature'), setPackage(client, 'growth', null, ownerClient)])
  assert.equal(results.filter((r) => r.error === null).length, 1)
  assert.equal(results.filter((r) => r.error !== null).length, 1)
  assert.equal(must(await admin.from('client_engagements').select('id').eq('client_id', client).eq('kind', 'retainer').is('ended_on', null)).length, 1)
})

test('an engagement or a support service cannot be ended in the future or before it started', async () => {
  const client = await newClient()
  const project = (await setPackage(client, 'visual_communication', day(-20))).data as string
  const support = (await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.communication_asset_care', p_start_date: day(-10) })).data as string
  refused((await memberClient.rpc('end_support_service', { p_support: support, p_ended_on: day(3) })).error, 'PACKAGE_END_INVALID')
  refused((await memberClient.rpc('end_support_service', { p_support: support, p_ended_on: day(-11) })).error, 'PACKAGE_END_INVALID')
  refused((await memberClient.rpc('end_engagement', { p_engagement: project, p_ended_on: day(3) })).error, 'PACKAGE_END_INVALID')
  refused((await memberClient.rpc('end_engagement', { p_engagement: project, p_ended_on: day(-21) })).error, 'PACKAGE_END_INVALID')
  // Nothing was ended by the refused attempts, and a valid date still works.
  assert.equal((await engagement(project)).ended_on, null)
  assert.equal(must(await admin.from('engagement_support').select('ended_on').eq('id', support).single()).ended_on, null)
  assert.equal((await memberClient.rpc('end_support_service', { p_support: support, p_ended_on: day(-10) })).error, null)
  assert.equal((await memberClient.rpc('end_engagement', { p_engagement: project, p_ended_on: day(-20) })).error, null)
  assert.equal((await engagement(project)).ended_on, day(-20))
})

test('a new retainer may not start on or before the end of an earlier one; the day after is allowed', async () => {
  const client = await newClient()
  const first = (await setPackage(client, 'growth', day(-30))).data as string
  assert.equal((await memberClient.rpc('end_engagement', { p_engagement: first, p_ended_on: day(-10) })).error, null)
  refused((await setPackage(client, 'signature', day(-10))).error, 'PACKAGE_OVERLAP')
  refused((await setPackage(client, 'signature', day(-20))).error, 'PACKAGE_OVERLAP')
  assert.equal(must(await admin.from('client_engagements').select('id').eq('client_id', client).eq('kind', 'retainer')).length, 1)
  const next = await setPackage(client, 'signature', day(-9))
  assert.equal(next.error, null)
  assert.equal((await engagement(next.data as string)).start_date, day(-9))
  // While that retainer is active, the active-retainer refusal still comes first.
  refused((await setPackage(client, 'growth', day())).error, 'CLIENT_HAS_RETAINER')
})

test('the new refusal tokens: not a retainer, not a project, support already ended, archived client', async () => {
  const client = await newClient()
  const project = (await setPackage(client, 'visual_communication', day(-20))).data as string
  const retainer = (await setPackage(client, 'growth', day(-20))).data as string
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: project, p_new_package_key: 'private', p_start_date: day() })).error, 'ENGAGEMENT_NOT_RETAINER')
  refused((await memberClient.rpc('add_support_service', { p_engagement: retainer, p_service_key: 'support.podcast_content', p_start_date: day() })).error, 'ENGAGEMENT_NOT_PROJECT')
  const support = (await memberClient.rpc('add_support_service', { p_engagement: project, p_service_key: 'support.podcast_content', p_start_date: day(-5) })).data as string
  assert.equal((await memberClient.rpc('end_support_service', { p_support: support, p_ended_on: day(-4) })).error, null)
  refused((await memberClient.rpc('end_support_service', { p_support: support, p_ended_on: day(-3) })).error, 'SUPPORT_ALREADY_ENDED')

  const archived = await newClient()
  const archivedRetainer = (await setPackage(archived, 'growth', day(-20))).data as string
  const archivedProject = (await setPackage(archived, 'visual_communication', day(-20))).data as string
  assert.equal((await admin.from('clients').update({ archived_at: new Date().toISOString() }).eq('id', archived)).error, null)
  refused((await memberClient.rpc('change_retainer_tier', { p_engagement: archivedRetainer, p_new_package_key: 'private', p_start_date: day() })).error, 'CLIENT_NOT_FOUND')
  refused((await memberClient.rpc('add_support_service', { p_engagement: archivedProject, p_service_key: 'support.podcast_content', p_start_date: day() })).error, 'CLIENT_NOT_FOUND')
})

test('two projects recorded at the same moment when one place is left: exactly one is accepted', async () => {
  const client = await newClient()
  assert.equal((await setPackage(client, 'signature')).error, null)
  assert.equal((await setPackage(client, 'digital_presence')).error, null)
  const results = await Promise.all([setPackage(client, 'operating_model'), setPackage(client, 'digital_experience', null, ownerClient)])
  assert.equal(results.filter((r) => r.error === null).length, 1)
  refused(results.find((r) => r.error !== null)!.error, 'INITIATIVE_LIMIT_REACHED')
  assert.equal(must(await admin.from('client_engagements').select('id').eq('client_id', client).eq('kind', 'project').is('ended_on', null)).length, 2)
})

test('a tier change that lands exactly on the new tier\'s limit is allowed; the client type follows the first package', async () => {
  const client = await newClient()
  assert.equal(must(await admin.from('clients').select('engagement_type').eq('id', client).single()).engagement_type, null)
  assert.equal((await setPackage(client, 'digital_presence')).error, null)
  assert.equal(must(await admin.from('clients').select('engagement_type').eq('id', client).single()).engagement_type, 'Project')
  const retainer = (await setPackage(client, 'growth', day(-10))).data as string
  assert.equal(must(await admin.from('clients').select('engagement_type').eq('id', client).single()).engagement_type, 'Retainer')
  assert.equal((await setPackage(client, 'operating_model')).error, null)
  // Growth with 2 active projects changed to Signature (limit 2): exactly at the limit, allowed.
  const changed = await memberClient.rpc('change_retainer_tier', { p_engagement: retainer, p_new_package_key: 'signature', p_start_date: day(-5) })
  assert.equal(changed.error, null)
  // The new tier is full: a third project is refused.
  refused((await setPackage(client, 'digital_experience')).error, 'INITIATIVE_LIMIT_REACHED')
})
