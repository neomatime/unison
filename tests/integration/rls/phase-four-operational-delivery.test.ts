import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

const operationalTables = [
  'team_members',
  'project_assignments',
  'client_onboardings',
  'vendors',
  'tasks',
  'calendar_events',
] as const

let orgA: string
let orgB: string
let ownerA: { id: string; email: string; password: string }
let memberA: { id: string; email: string; password: string }
let projectA: string

before(async () => {
  orgA = await createFixtureOrg('phase-four-a')
  orgB = await createFixtureOrg('phase-four-b')
  ownerA = await createFixtureUser(orgA, 'owner')
  memberA = await createFixtureUser(orgA, 'member')

  const { data: framework, error: frameworkError } = await admin
    .from('frameworks')
    .insert({ organization_id: orgA, name: 'Phase Four Framework' })
    .select('id')
    .single()
  if (frameworkError) throw frameworkError

  const { data: project, error: projectError } = await admin
    .from('projects')
    .insert({ organization_id: orgA, framework_id: framework.id, name: 'Phase Four Project' })
    .select('id')
    .single()
  if (projectError) throw projectError
  projectA = project.id

  const { data: otherMember, error: otherMemberError } = await admin
    .from('team_members')
    .insert({ organization_id: orgB, full_name: 'Other Tenant Member', email: 'other-tenant@unison.test' })
    .select('id')
    .single()
  if (otherMemberError) throw otherMemberError

  const { data: otherFramework, error: otherFrameworkError } = await admin
    .from('frameworks')
    .insert({ organization_id: orgB, name: 'Other Tenant Framework' })
    .select('id')
    .single()
  if (otherFrameworkError) throw otherFrameworkError

  const { data: otherProject, error: otherProjectError } = await admin
    .from('projects')
    .insert({ organization_id: orgB, framework_id: otherFramework.id, name: 'Other Tenant Project' })
    .select('id')
    .single()
  if (otherProjectError) throw otherProjectError

  const { data: otherOnboarding, error: otherOnboardingError } = await admin
    .from('client_onboardings')
    .insert({ organization_id: orgB, client_name: 'Other Tenant Client' })
    .select('id')
    .single()
  if (otherOnboardingError) throw otherOnboardingError

  const fixtureWrites = [
    admin.from('project_assignments').insert({
      organization_id: orgB,
      project_id: otherProject.id,
      team_member_id: otherMember.id,
      delivery_role: 'Lead',
      start_date: '2026-09-10',
    }),
    admin.from('vendors').insert({ organization_id: orgB, name: 'Other Tenant Vendor' }),
    admin.from('tasks').insert({ organization_id: orgB, title: 'Other Tenant Task' }),
    admin.from('calendar_events').insert({
      organization_id: orgB,
      title: 'Other Tenant Event',
      start_at: '2026-09-10T08:00:00Z',
      end_at: '2026-09-10T09:00:00Z',
      onboarding_id: otherOnboarding.id,
    }),
  ]
  for (const write of fixtureWrites) {
    const { error } = await write
    if (error) throw error
  }
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [ownerA?.id, memberA?.id].filter(Boolean))
})

test('an owner can persist all six operational record types', async () => {
  const client = await signedInClient(ownerA.email, ownerA.password)
  const { data: teamMember, error: teamError } = await client
    .from('team_members')
    .insert({
      organization_id: orgA,
      user_id: ownerA.id,
      full_name: 'Phase Four Owner',
      email: ownerA.email,
      capacity_percent: 80,
    })
    .select('id')
    .single()
  assert.equal(teamError, null)
  assert.ok(teamMember)

  const { data: onboarding, error: onboardingError } = await client
    .from('client_onboardings')
    .insert({ organization_id: orgA, client_name: 'Persistent Client', owner_id: teamMember!.id })
    .select('id')
    .single()
  assert.equal(onboardingError, null)
  assert.ok(onboarding)

  const writes = [
    client.from('project_assignments').insert({
      organization_id: orgA,
      project_id: projectA,
      team_member_id: teamMember!.id,
      delivery_role: 'Delivery Lead',
      start_date: '2026-09-10',
    }),
    client.from('vendors').insert({
      organization_id: orgA,
      name: 'Persistent Vendor',
      owner_id: teamMember!.id,
    }),
    client.from('tasks').insert({
      organization_id: orgA,
      title: 'Persistent Task',
      onboarding_id: onboarding!.id,
      assignee_id: teamMember!.id,
      created_by: ownerA.id,
    }),
    client.from('calendar_events').insert({
      organization_id: orgA,
      title: 'Persistent Event',
      start_at: '2026-09-10T10:00:00Z',
      end_at: '2026-09-10T11:00:00Z',
      onboarding_id: onboarding!.id,
      owner_id: teamMember!.id,
      created_by: ownerA.id,
    }),
  ]
  for (const write of writes) {
    const { error } = await write
    assert.equal(error, null)
  }

  for (const table of operationalTables) {
    const { data, error } = await client.from(table).select('id').eq('organization_id', orgA)
    assert.equal(error, null)
    assert.ok((data?.length ?? 0) > 0, `${table} should contain the persisted fixture`)
  }
})

test('ordinary members cannot administer the team directory', async () => {
  const client = await signedInClient(memberA.email, memberA.password)
  const { error } = await client.from('team_members').insert({
    organization_id: orgA,
    full_name: 'Unauthorized Member',
    email: 'unauthorized@unison.test',
  })
  assert.ok(error, 'team member creation must require owner or admin')
  assert.match(error.message, /row-level security|policy|permission/i)
})

test('all Phase 4 records from another organization remain invisible', async () => {
  const client = await signedInClient(ownerA.email, ownerA.password)
  for (const table of operationalTables) {
    const { data, error } = await client.from(table).select('id').eq('organization_id', orgB)
    assert.equal(error, null)
    assert.deepEqual(data, [], `${table} must not expose another tenant's records`)
  }
})

test('operational writes cannot be smuggled into another organization', async () => {
  const client = await signedInClient(ownerA.email, ownerA.password)
  const { error } = await client.from('vendors').insert({
    organization_id: orgB,
    name: 'Cross-tenant Vendor',
  })
  assert.ok(error, 'cross-tenant inserts must be refused')
  assert.match(error.message, /row-level security|policy|permission/i)
})
