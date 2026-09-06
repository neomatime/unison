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
let otherFrameworkPhaseId: string
let projectA: string
let projectB: string
let projectC: string
let outsiderProject: string

before(async () => {
  orgId = await createFixtureOrg('project-deps')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('project-deps-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const framework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'PD Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (framework.error) throw framework.error
  frameworkId = framework.data.id

  const otherFramework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'PD Other Framework', type: 'Operations', version: 'v1.0' })
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
  otherFrameworkPhaseId = otherPhase.data.id

  for (const [name, target] of [['PD A', 'a'], ['PD B', 'b'], ['PD C', 'c']] as const) {
    const project = await admin.from('projects')
      .insert({ organization_id: orgId, name, status: 'Active', health: 'On Track', framework_id: frameworkId })
      .select('id').single()
    if (project.error) throw project.error
    if (target === 'a') projectA = project.data.id
    else if (target === 'b') projectB = project.data.id
    else projectC = project.data.id
  }

  const outsiderFramework = await admin.from('frameworks')
    .insert({ organization_id: outsiderOrg, name: 'PD Outsider Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (outsiderFramework.error) throw outsiderFramework.error

  const foreign = await admin.from('projects')
    .insert({ organization_id: outsiderOrg, name: 'PD Foreign', status: 'Active', health: 'On Track', framework_id: outsiderFramework.data.id })
    .select('id').single()
  if (foreign.error) throw foreign.error
  outsiderProject = foreign.data.id
})

after(async () => { await cleanup([orgId, outsiderOrg], [member.id, outsider.id]) })

function edge(over: Record<string, unknown> = {}) {
  return {
    organization_id: orgId,
    dependent_project_id: projectA,
    prerequisite_project_id: projectB,
    prerequisite_framework_id: frameworkId,
    required_status: 'Complete',
    ...over,
  }
}

test('a valid prerequisite edge is accepted', async () => {
  const { data, error } = await admin.from('project_dependencies').insert(edge()).select('id').single()
  assert.equal(error, null)
  await admin.from('project_dependencies').delete().eq('id', data!.id)
})

test('a project cannot be its own prerequisite', async () => {
  const { error } = await admin.from('project_dependencies')
    .insert(edge({ prerequisite_project_id: projectA })).select('id').single()

  assert.ok(error, 'a self-edge must be refused')
  assert.equal(error!.code, '23514')
  // A self-edge is the degenerate one-node cycle, and the cycle guard is a
  // BEFORE ROW trigger, so it fires before the project_dependencies_no_self_check
  // constraint is ever evaluated: its recursive walk starts at the prerequisite
  // and finds the dependent at depth 1 when the two are equal. Still SQLSTATE
  // 23514, but via the trigger's message, not the constraint's name.
  assert.match(error!.message, /circular dependency/)
})

test('the no-self-prerequisite CHECK constraint independently rejects a self-edge', async () => {
  // The test above pins the real user-facing behaviour: the cycle-guard
  // trigger intercepts every self-edge before
  // project_dependencies_no_self_check (a plain CHECK constraint) is ever
  // reached, because BEFORE ROW triggers fire before CHECK constraints. That
  // means the assertion above passes whether or not the constraint still
  // exists -- it was the only test exercising it, so a dropped or broken
  // constraint would go unnoticed.
  //
  // This test proves the constraint independently by removing the trigger
  // that would otherwise shadow it, the same technique the Step 5 proof in
  // task-2-report.md used by hand. It goes through
  // rls_test_set_project_dependencies_cycle_guard() -- a SECURITY DEFINER
  // bridge restricted to service_role (migration
  // 20260907110000_rls_test_toggle_dependency_cycle_guard.sql) -- because
  // supabase-js talks to this project only through PostgREST, which has no
  // DDL surface for the admin client to drop or recreate a trigger directly.
  //
  // The trigger is restored in `finally` no matter what happens above it, so
  // a failing assertion here can never leave the live database unguarded,
  // and its restoration is itself verified with a real insert before the
  // test ends, so a botched recreation cannot pass silently.
  const disabled = await admin.rpc('rls_test_set_project_dependencies_cycle_guard', { enabled: false })
  assert.equal(disabled.error, null)

  try {
    const { error } = await admin.from('project_dependencies')
      .insert(edge({ prerequisite_project_id: projectA })).select('id').single()

    assert.ok(error, 'a self-edge must still be refused with the trigger gone')
    assert.equal(error!.code, '23514')
    assert.match(error!.message, /project_dependencies_no_self_check/)
  } finally {
    const restored = await admin.rpc('rls_test_set_project_dependencies_cycle_guard', { enabled: true })
    assert.equal(restored.error, null)
  }

  // The trigger must be back and actually working, not just recreated in
  // name -- prove it with the same two-hop cycle shape the dedicated test
  // below exercises, on a self-edge that only the trigger (not the
  // constraint) is positioned to catch this way.
  const first = await admin.from('project_dependencies').insert(edge()).select('id').single()
  assert.equal(first.error, null)

  const { error: reversedError } = await admin.from('project_dependencies')
    .insert(edge({ dependent_project_id: projectB, prerequisite_project_id: projectA }))
    .select('id').single()
  assert.ok(reversedError, 'the cycle guard trigger must be reinstated and working')
  assert.match(reversedError!.message, /circular dependency/)

  await admin.from('project_dependencies').delete().eq('id', first.data!.id)
})

test('a cross-tenant prerequisite is unrepresentable', async () => {
  const { error } = await admin.from('project_dependencies')
    .insert(edge({ prerequisite_project_id: outsiderProject })).select('id').single()

  assert.ok(error, "a prerequisite in another organisation must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /project_dependencies_prerequisite_fkey|project_dependencies_prerequisite_framework_fkey/)
})

test('a cross-tenant dependent is unrepresentable', async () => {
  const { error } = await admin.from('project_dependencies')
    .insert(edge({ dependent_project_id: outsiderProject })).select('id').single()

  assert.ok(error, 'a dependent in another organisation must be refused')
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /project_dependencies_dependent_fkey/)
})

test('a duplicate edge is refused', async () => {
  const first = await admin.from('project_dependencies').insert(edge()).select('id').single()
  assert.equal(first.error, null)

  const { error } = await admin.from('project_dependencies').insert(edge()).select('id').single()
  assert.ok(error, 'a duplicate edge must be refused')
  assert.equal(error!.code, '23505')
  assert.match(error!.message, /project_dependencies_unique/)

  await admin.from('project_dependencies').delete().eq('id', first.data!.id)
})

test('a required phase from another framework is refused', async () => {
  // The sharpest rule on this table: without it a dependency could require a
  // phase the prerequisite's framework does not contain, and could never be
  // satisfied by any state that project can reach.
  const { error } = await admin.from('project_dependencies')
    .insert(edge({ required_status: null, required_phase_id: otherFrameworkPhaseId })).select('id').single()

  assert.ok(error, "another framework's phase must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /project_dependencies_phase_fkey/)
})

test('a required phase of the prerequisite own framework is accepted', async () => {
  const { data, error } = await admin.from('project_dependencies')
    .insert(edge({ required_status: null, required_phase_id: phaseId })).select('id').single()

  assert.equal(error, null)
  await admin.from('project_dependencies').delete().eq('id', data!.id)
})

test('both required states set is refused', async () => {
  const { error } = await admin.from('project_dependencies')
    .insert(edge({ required_status: 'Complete', required_phase_id: phaseId })).select('id').single()

  assert.ok(error, 'both required states must be refused')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /project_dependencies_required_state_check/)
})

test('neither required state set is refused', async () => {
  const { error } = await admin.from('project_dependencies')
    .insert(edge({ required_status: null, required_phase_id: null })).select('id').single()

  assert.ok(error, 'a dependency with no required state must be refused')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /project_dependencies_required_state_check/)
})

test('a mismatched prerequisite framework is refused', async () => {
  const { error } = await admin.from('project_dependencies')
    .insert(edge({ prerequisite_framework_id: otherFrameworkId })).select('id').single()

  assert.ok(error, "a framework the prerequisite does not use must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /project_dependencies_prerequisite_framework_fkey/)
})

test('an outsider can neither read nor write these rows', async () => {
  const seeded = await admin.from('project_dependencies').insert(edge()).select('id').single()
  assert.equal(seeded.error, null)

  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('project_dependencies').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [], "another organisation's dependencies must not be visible")

  const write = await client.from('project_dependencies').insert(edge()).select('id').single()
  assert.ok(write.error, 'an outsider must not be able to write')
  assert.equal(write.error!.code, '42501')

  await admin.from('project_dependencies').delete().eq('id', seeded.data!.id)
})

test('a member of the organisation can read, write and delete', async () => {
  const client = await signedInClient(member.email, member.password)

  const created = await client.from('project_dependencies').insert(edge()).select('id').single()
  assert.equal(created.error, null)

  const read = await client.from('project_dependencies').select('id').eq('id', created.data!.id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  // Unlike projects and delivery items, this table has a delete policy.
  const removed = await client.from('project_dependencies').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)

  const after = await client.from('project_dependencies').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [], 'the deleted edge must be gone')
})

test('a two-hop cycle is rejected', async () => {
  // A depends on B. B may not then depend on A.
  const first = await admin.from('project_dependencies').insert(edge()).select('id').single()
  assert.equal(first.error, null)

  const { error } = await admin.from('project_dependencies')
    .insert(edge({ dependent_project_id: projectB, prerequisite_project_id: projectA }))
    .select('id').single()

  assert.ok(error, 'a two-hop cycle must be refused')
  assert.match(error!.message, /circular dependency/)

  await admin.from('project_dependencies').delete().eq('id', first.data!.id)
})

test('a three-hop cycle is rejected', async () => {
  // A -> B, B -> C, then C -> A closes the loop.
  const ab = await admin.from('project_dependencies').insert(edge()).select('id').single()
  assert.equal(ab.error, null)

  const bc = await admin.from('project_dependencies')
    .insert(edge({ dependent_project_id: projectB, prerequisite_project_id: projectC }))
    .select('id').single()
  assert.equal(bc.error, null)

  const { error } = await admin.from('project_dependencies')
    .insert(edge({ dependent_project_id: projectC, prerequisite_project_id: projectA }))
    .select('id').single()

  assert.ok(error, 'a three-hop cycle must be refused')
  assert.match(error!.message, /circular dependency/)

  await admin.from('project_dependencies').delete().in('id', [ab.data!.id, bc.data!.id])
})

test('a shared prerequisite is not a cycle', async () => {
  // A -> C and B -> C is a diamond, not a loop. A guard that rejects this is
  // over-broad and would refuse ordinary portfolios.
  const ac = await admin.from('project_dependencies')
    .insert(edge({ dependent_project_id: projectA, prerequisite_project_id: projectC }))
    .select('id').single()
  assert.equal(ac.error, null)

  const bc = await admin.from('project_dependencies')
    .insert(edge({ dependent_project_id: projectB, prerequisite_project_id: projectC }))
    .select('id').single()
  assert.equal(bc.error, null, 'two projects may share one prerequisite')

  await admin.from('project_dependencies').delete().in('id', [ac.data!.id, bc.data!.id])
})

test('a long acyclic chain is accepted', async () => {
  // A -> B -> C. The walk must terminate and permit this.
  const ab = await admin.from('project_dependencies').insert(edge()).select('id').single()
  assert.equal(ab.error, null)

  const bc = await admin.from('project_dependencies')
    .insert(edge({ dependent_project_id: projectB, prerequisite_project_id: projectC }))
    .select('id').single()
  assert.equal(bc.error, null, 'a three-project chain is legitimate')

  await admin.from('project_dependencies').delete().in('id', [ab.data!.id, bc.data!.id])
})
