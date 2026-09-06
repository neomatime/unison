import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgId: string
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let frameworkId: string
let otherFrameworkId: string
let phaseId: string
let otherPhaseId: string
let projectId: string
let otherProjectId: string

before(async () => {
  orgId = await createFixtureOrg('delivery-items')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('delivery-items-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const framework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'DI Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (framework.error) throw framework.error
  frameworkId = framework.data.id

  const otherFramework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'DI Other Framework', type: 'Operations', version: 'v1.0' })
    .select('id').single()
  if (otherFramework.error) throw otherFramework.error
  otherFrameworkId = otherFramework.data.id

  const phase = await admin.from('framework_phases')
    .insert({ organization_id: orgId, framework_id: frameworkId, name: 'Build', position: 1 })
    .select('id').single()
  if (phase.error) throw phase.error
  phaseId = phase.data.id

  const otherPhase = await admin.from('framework_phases')
    .insert({ organization_id: orgId, framework_id: otherFrameworkId, name: 'Elsewhere', position: 1 })
    .select('id').single()
  if (otherPhase.error) throw otherPhase.error
  otherPhaseId = otherPhase.data.id

  const project = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'DI Project', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (project.error) throw project.error
  projectId = project.data.id

  const otherProject = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'DI Other Project', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (otherProject.error) throw otherProject.error
  otherProjectId = otherProject.data.id
})

after(async () => { await cleanup([orgId, outsiderOrg], [member.id, outsider.id]) })

async function insertItem(client: Awaited<ReturnType<typeof signedInClient>>, row: Record<string, unknown>) {
  return client.from('delivery_items').insert({
    organization_id: orgId, project_id: projectId, framework_id: frameworkId,
    name: 'Item', status: 'Not Started', health: 'Healthy', ...row,
  }).select('id')
}

test('a member creates a level 1 item and a level 2 item beneath it', async () => {
  const client = await signedInClient(member.email, member.password)

  // current_phase_id: phaseId exercises the "Build" phase fixture created in
  // before() -- otherwise it is assigned and never read.
  const parent = await insertItem(client, { level: 1, name: 'Parent', current_phase_id: phaseId })
  assert.equal(parent.error, null)

  const child = await insertItem(client, { level: 2, name: 'Child', parent_id: parent.data![0].id })
  assert.equal(child.error, null)
})

test('a third level is unrepresentable', async () => {
  const client = await signedInClient(member.email, member.password)
  const { error } = await insertItem(client, { level: 3, name: 'Too deep' })
  assert.ok(error, 'level 3 must be refused')
  assert.equal(error!.code, '23514')
})

test('a level 2 item cannot be parented to another level 2 item', async () => {
  const client = await signedInClient(member.email, member.password)
  const parent = await insertItem(client, { level: 1, name: 'L1 for nesting' })
  const child = await insertItem(client, { level: 2, name: 'L2', parent_id: parent.data![0].id })

  const grandchild = await insertItem(client, { level: 2, name: 'L3 by the back door', parent_id: child.data![0].id })
  assert.ok(grandchild.error, 'a level 2 parent must be refused')
  assert.equal(grandchild.error!.code, '23503')
})

test('a level 1 item may not have a parent, and a level 2 item must', async () => {
  const client = await signedInClient(member.email, member.password)
  const parent = await insertItem(client, { level: 1, name: 'L1 shape' })

  const rootedChild = await insertItem(client, { level: 1, name: 'L1 with parent', parent_id: parent.data![0].id })
  assert.equal(rootedChild.error?.code, '23514')

  const orphan = await insertItem(client, { level: 2, name: 'L2 with no parent' })
  assert.equal(orphan.error?.code, '23514')
})

test('a parent in a different project is refused', async () => {
  const client = await signedInClient(member.email, member.password)
  const parent = await insertItem(client, { level: 1, name: 'L1 elsewhere' })

  const { error } = await client.from('delivery_items').insert({
    organization_id: orgId, project_id: otherProjectId, framework_id: frameworkId,
    name: 'Cross-project child', status: 'Not Started', health: 'Healthy',
    level: 2, parent_id: parent.data![0].id,
  }).select('id')
  assert.ok(error, 'a parent from another project must be refused')
  assert.equal(error!.code, '23503')
})

test("a phase from another framework is refused", async () => {
  const client = await signedInClient(member.email, member.password)
  const { error } = await insertItem(client, { level: 1, name: 'Wrong phase', current_phase_id: otherPhaseId })
  assert.ok(error, "another framework's phase must be refused")
  assert.equal(error!.code, '23503')
})

test('deleting a phase nulls current_phase_id and leaves framework_id intact', async () => {
  const client = await signedInClient(member.email, member.password)
  const doomedPhase = await admin.from('framework_phases')
    .insert({ organization_id: orgId, framework_id: frameworkId, name: 'Doomed', position: 99 })
    .select('id').single()
  if (doomedPhase.error) throw doomedPhase.error

  const item = await insertItem(client, { level: 1, name: 'Phase holder', current_phase_id: doomedPhase.data.id })
  assert.equal(item.error, null)

  const { error: deleteError } = await admin.from('framework_phases').delete().eq('id', doomedPhase.data.id)
  assert.equal(deleteError, null)

  // This is the assertion that would catch a missing (current_phase_id) column
  // list on `on delete set null`: without it Postgres nulls framework_id too,
  // which is `not null`, and the delete fails outright.
  const { data: after, error: readError } = await admin
    .from('delivery_items').select('current_phase_id, framework_id').eq('id', item.data![0].id).single()
  assert.equal(readError, null)
  assert.equal(after!.current_phase_id, null)
  assert.equal(after!.framework_id, frameworkId)
})

test('an owner from another organisation is refused', async () => {
  const client = await signedInClient(member.email, member.password)
  const { error } = await insertItem(client, { level: 1, name: 'Foreign owner', owner_id: outsider.id })
  assert.ok(error, 'an owner outside the organisation must be refused')
  assert.equal(error!.code, '23503')
})

test('a member of another organisation can neither read nor write these rows', async () => {
  const client = await signedInClient(member.email, member.password)
  await insertItem(client, { level: 1, name: 'Private' })

  const stranger = await signedInClient(outsider.email, outsider.password)
  const { data, error } = await stranger.from('delivery_items').select('id').eq('project_id', projectId)
  assert.equal(error, null)
  assert.deepEqual(data, [], "another organisation's items must not be visible")

  const write = await stranger.from('delivery_items').insert({
    organization_id: orgId, project_id: projectId, framework_id: frameworkId,
    name: 'Intrusion', status: 'Not Started', health: 'Healthy', level: 1,
  }).select('id')
  assert.ok(write.error, 'an outsider must not be able to write')
  // 42501: the with-check clause rejects the row because the stranger fails
  // is_member_of(orgId) -- an RLS policy violation, not a generic failure.
  assert.equal(write.error!.code, '42501')
})

test("changing a project's framework is refused once a delivery item references it, and allowed once none do", async () => {
  // delivery_items_project_framework_fkey has no `on update cascade`
  // (documented on the constraint itself as of migration
  // 20260906160000_delivery_items_fix_round_1.sql): a delivery item's
  // current_phase_id belongs to its framework's phases, so re-pointing the
  // project at a different framework would leave those phases meaningless.
  // The refusal is pinned here; a later task teaches updateProjectAction to
  // explain it to users instead of surfacing the raw 23503.
  const client = await signedInClient(member.email, member.password)

  const withItem = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'DI Framework Change - With Item', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (withItem.error) throw withItem.error

  const withoutItem = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'DI Framework Change - Without Item', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (withoutItem.error) throw withoutItem.error

  const anchor = await insertItem(client, { level: 1, name: 'Anchor', project_id: withItem.data.id })
  assert.equal(anchor.error, null)

  const blocked = await client.from('projects')
    .update({ framework_id: otherFrameworkId }).eq('id', withItem.data.id).select('id')
  assert.ok(blocked.error, 'a project with a delivery item referencing its framework must refuse the change')
  assert.equal(blocked.error!.code, '23503')

  const allowed = await client.from('projects')
    .update({ framework_id: otherFrameworkId }).eq('id', withoutItem.data.id).select('id')
  assert.equal(allowed.error, null, 'a project with no delivery items must allow the same change')
  assert.equal(allowed.data?.length, 1)
})

test('a level-1 item with live children cannot be promoted to level 2', async () => {
  // Reparenting an item into level 2 while it still has children breaks the
  // children's own foreign key: delivery_items_parent_fkey resolves a child's
  // (parent_id, parent_level, project_id) against its parent's (id, level,
  // project_id), and once the parent's level becomes 2 that tuple no longer
  // exists at level 1. This is the UPDATE side of the depth cap that every
  // other spec in this file only exercises via INSERT.
  const client = await signedInClient(member.email, member.password)

  const parent = await insertItem(client, { level: 1, name: 'Has Children' })
  assert.equal(parent.error, null)
  const child = await insertItem(client, { level: 2, name: 'Depends On Parent Staying Level 1', parent_id: parent.data![0].id })
  assert.equal(child.error, null)
  const otherParent = await insertItem(client, { level: 1, name: 'Would-Be New Parent' })
  assert.equal(otherParent.error, null)

  const { error } = await client.from('delivery_items')
    .update({ level: 2, parent_id: otherParent.data![0].id })
    .eq('id', parent.data![0].id)
  assert.ok(error, 'a parent with live children must not be promoted to level 2')
  assert.equal(error!.code, '23503')
})

test('parent_level cannot be written directly, because it is generated', async () => {
  // parent_level is `generated always ... stored`. Postgres refuses any write
  // to it regardless of RLS or application code -- this pins that the depth
  // cap's load-bearing column is enforced by the column definition itself,
  // not by convention.
  const client = await signedInClient(member.email, member.password)
  const item = await insertItem(client, { level: 1, name: 'Generated Column Guard' })
  assert.equal(item.error, null)

  const { error } = await client.from('delivery_items')
    .update({ parent_level: 1 })
    .eq('id', item.data![0].id)
  assert.ok(error, 'a direct write to parent_level must be refused')
  assert.equal(error!.code, '428C9')
})
