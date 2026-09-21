import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgId: string
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let frameworkA: string
let phaseA: string
let phaseB: string // belongs to frameworkB, same organisation
let outsiderFramework: string
let outsiderPhase: string
let projectId: string
let outsiderProjectId: string
let approvalId: string
let outsiderApprovalId: string
// Extra members created mid-test. Module scope so `after` always reaches them.
const extraUsers: string[] = []

before(async () => {
  orgId = await createFixtureOrg('governance-registers')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('governance-registers-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const fwA = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'GR Framework A', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (fwA.error) throw fwA.error
  frameworkA = fwA.data.id

  const fwB = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'GR Framework B', type: 'Operations', version: 'v1.0' })
    .select('id').single()
  if (fwB.error) throw fwB.error

  const pA = await admin.from('framework_phases')
    .insert({ organization_id: orgId, framework_id: frameworkA, name: 'Build', position: 1 })
    .select('id').single()
  if (pA.error) throw pA.error
  phaseA = pA.data.id

  const pB = await admin.from('framework_phases')
    .insert({ organization_id: orgId, framework_id: fwB.data.id, name: 'Elsewhere', position: 1 })
    .select('id').single()
  if (pB.error) throw pB.error
  phaseB = pB.data.id

  const project = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'GR Project', status: 'Active', health: 'On Track', framework_id: frameworkA })
    .select('id').single()
  if (project.error) throw project.error
  projectId = project.data.id

  const approval = await admin.from('approvals')
    .insert({ organization_id: orgId, project_id: projectId, title: 'GR Approval' })
    .select('id').single()
  if (approval.error) throw approval.error
  approvalId = approval.data.id

  const outFw = await admin.from('frameworks')
    .insert({ organization_id: outsiderOrg, name: 'GR Outsider Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (outFw.error) throw outFw.error
  outsiderFramework = outFw.data.id

  const outPhase = await admin.from('framework_phases')
    .insert({ organization_id: outsiderOrg, framework_id: outsiderFramework, name: 'Build', position: 1 })
    .select('id').single()
  if (outPhase.error) throw outPhase.error
  outsiderPhase = outPhase.data.id

  const outProject = await admin.from('projects')
    .insert({ organization_id: outsiderOrg, name: 'GR Outsider Project', status: 'Active', health: 'On Track', framework_id: outsiderFramework })
    .select('id').single()
  if (outProject.error) throw outProject.error
  outsiderProjectId = outProject.data.id

  const outApproval = await admin.from('approvals')
    .insert({ organization_id: outsiderOrg, project_id: outsiderProjectId, title: 'GR Outsider Approval' })
    .select('id').single()
  if (outApproval.error) throw outApproval.error
  outsiderApprovalId = outApproval.data.id
})

after(async () => { await cleanup([orgId, outsiderOrg], [member.id, outsider.id, ...extraUsers]) })

async function removableMember() {
  const user = await createFixtureUser(orgId, 'admin')
  extraUsers.push(user.id)
  return user
}

async function removeMembership(userId: string) {
  const { error } = await admin.from('memberships').delete().eq('organization_id', orgId).eq('user_id', userId)
  assert.equal(error, null)
}

// ---------------------------------------------------------------- project_decisions

function decision(over: Record<string, unknown> = {}) {
  return { organization_id: orgId, project_id: projectId, title: 'A decision', decision: 'Proceed', ...over }
}

test('decisions: a valid decision is accepted', async () => {
  const { data, error } = await admin.from('project_decisions').insert(decision()).select('id').single()
  assert.equal(error, null)
  await admin.from('project_decisions').delete().eq('id', data!.id)
})

test('decisions: a cross-tenant project is unrepresentable', async () => {
  const { error } = await admin.from('project_decisions')
    .insert(decision({ project_id: outsiderProjectId })).select('id').single()

  assert.ok(error)
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /project_decisions_project_id_organization_id_fkey/)
})

test('decisions: a decided_by outside the organisation is refused', async () => {
  const { error } = await admin.from('project_decisions')
    .insert(decision({ decided_by: outsider.id })).select('id').single()

  assert.ok(error)
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /project_decisions_organization_id_decided_by_fkey/)
})

test('decisions: an outsider can neither read, write, update nor delete', async () => {
  const seeded = await admin.from('project_decisions').insert(decision()).select('id').single()
  assert.equal(seeded.error, null)
  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('project_decisions').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [])

  const write = await client.from('project_decisions').insert(decision()).select('id').single()
  assert.ok(write.error)
  assert.equal(write.error!.code, '42501')

  const update = await client.from('project_decisions').update({ title: 'Hijacked' }).eq('id', seeded.data!.id).select('id')
  assert.equal(update.error, null)
  assert.deepEqual(update.data, [], "an outsider's update must match no rows")

  const remove = await client.from('project_decisions').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null)
  assert.deepEqual(remove.data, [])
  const stillThere = await admin.from('project_decisions').select('id, title').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1)
  assert.equal(stillThere.data![0].title, 'A decision', "the outsider's update must not have changed the row")

  await admin.from('project_decisions').delete().eq('id', seeded.data!.id)
})

test('decisions: a member can read, write, update and delete', async () => {
  const client = await signedInClient(member.email, member.password)
  const created = await client.from('project_decisions').insert(decision()).select('id').single()
  assert.equal(created.error, null)

  const updated = await client.from('project_decisions')
    .update({ rationale: 'Lowest risk' }).eq('id', created.data!.id).select('rationale').single()
  assert.equal(updated.error, null)
  assert.equal(updated.data!.rationale, 'Lowest risk')

  const removed = await client.from('project_decisions').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)
  const after = await client.from('project_decisions').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [])
})

test('decisions: removing a member sets decided_by null rather than orphaning the row', async () => {
  const user = await removableMember()
  const created = await admin.from('project_decisions')
    .insert(decision({ decided_by: user.id })).select('id, decided_by').single()
  assert.equal(created.error, null)
  assert.equal(created.data!.decided_by, user.id)

  await removeMembership(user.id)

  const after = await admin.from('project_decisions').select('decided_by').eq('id', created.data!.id).single()
  assert.equal(after.error, null)
  assert.equal(after.data!.decided_by, null)

  await admin.from('project_decisions').delete().eq('id', created.data!.id)
})

// --------------------------------------------------------------------- approvals

function approval(over: Record<string, unknown> = {}) {
  return { organization_id: orgId, project_id: projectId, title: 'An approval', ...over }
}

test('approvals: a valid approval is accepted and takes its documented defaults', async () => {
  const { data, error } = await admin.from('approvals').insert(approval()).select('id, status, priority').single()
  assert.equal(error, null)
  assert.equal(data!.status, 'Draft')
  assert.equal(data!.priority, 'Medium')
  await admin.from('approvals').delete().eq('id', data!.id)
})

test('approvals: an approval scoped to neither a project nor a framework is refused', async () => {
  const { error } = await admin.from('approvals')
    .insert(approval({ project_id: null })).select('id').single()

  assert.ok(error)
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /check constraint "approvals_check"/)
})

for (const [column, bad, constraint] of [
  ['status', 'Resolved', 'approvals_status_check'],
  ['priority', 'Urgent', 'approvals_priority_check'],
] as const) {
  test(`approvals: an invalid ${column} is refused`, async () => {
    const { error } = await admin.from('approvals')
      .insert(approval({ [column]: bad })).select('id').single()

    assert.ok(error)
    assert.equal(error!.code, '23514')
    assert.match(error!.message, new RegExp(constraint))
  })
}

test('approvals: a cross-tenant project is unrepresentable', async () => {
  const { error } = await admin.from('approvals')
    .insert(approval({ project_id: outsiderProjectId })).select('id').single()

  assert.ok(error)
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /approvals_project_id_organization_id_fkey/)
})

test('approvals: an approver outside the organisation is refused', async () => {
  const { error } = await admin.from('approvals')
    .insert(approval({ approver_id: outsider.id })).select('id').single()

  assert.ok(error)
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /approvals_organization_id_approver_id_fkey/)
})

test('approvals: an outsider can neither read, write, update nor delete', async () => {
  const seeded = await admin.from('approvals').insert(approval()).select('id').single()
  assert.equal(seeded.error, null)
  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('approvals').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [])

  const write = await client.from('approvals').insert(approval()).select('id').single()
  assert.ok(write.error)
  assert.equal(write.error!.code, '42501')

  const update = await client.from('approvals').update({ title: 'Hijacked' }).eq('id', seeded.data!.id).select('id')
  assert.equal(update.error, null)
  assert.deepEqual(update.data, [], "an outsider's update must match no rows")

  const remove = await client.from('approvals').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null)
  assert.deepEqual(remove.data, [])
  const stillThere = await admin.from('approvals').select('id, title').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1)
  assert.equal(stillThere.data![0].title, 'An approval', "the outsider's update must not have changed the row")

  await admin.from('approvals').delete().eq('id', seeded.data!.id)
})

test('approvals: a member can read, write, update and delete', async () => {
  const client = await signedInClient(member.email, member.password)
  const created = await client.from('approvals').insert(approval()).select('id').single()
  assert.equal(created.error, null)

  try {
    const updated = await client.from('approvals')
      .update({ title: 'Renamed approval' }).eq('id', created.data!.id).select('title').single()
    assert.equal(updated.error, null)
    assert.equal(updated.data!.title, 'Renamed approval')

    // Still a Draft, so the delete policy lets it through.
    const removed = await client.from('approvals').delete().eq('id', created.data!.id).select('id')
    assert.equal(removed.error, null)
    assert.equal(removed.data!.length, 1)
    const after = await client.from('approvals').select('id').eq('id', created.data!.id)
    assert.deepEqual(after.data, [])
    const gone = await admin.from('approvals').select('id').eq('id', created.data!.id)
    assert.deepEqual(gone.data, [])
  } finally {
    await admin.from('approvals').delete().eq('id', created.data!.id)
  }
})

test('approvals: a member cannot delete an approval once submitted', async () => {
  const seeded = await admin.from('approvals').insert(approval({ status: 'Pending' })).select('id').single()
  assert.equal(seeded.error, null)
  try {
    const client = await signedInClient(member.email, member.password)
    const remove = await client.from('approvals').delete().eq('id', seeded.data!.id).select('id')
    assert.equal(remove.error, null)
    assert.deepEqual(remove.data, [], 'the delete policy must filter a non-Draft approval out')

    const stillThere = await admin.from('approvals').select('id').eq('id', seeded.data!.id)
    assert.equal(stillThere.data!.length, 1)
  } finally {
    await admin.from('approvals').delete().eq('id', seeded.data!.id)
  }
})

const lockedEdits = [
  ['title', 'Changed'],
  ['description', 'Changed'],
  ['priority', 'High'], // the seeded approval is Medium
  ['due_date', '2030-01-01'],
] as const

for (const [column, value] of lockedEdits) {
  test(`approvals: a submitted approval's ${column} is locked`, async () => {
    const seeded = await admin.from('approvals').insert(approval({ status: 'Pending' })).select('id').single()
    assert.equal(seeded.error, null)
    try {
      const client = await signedInClient(member.email, member.password)
      const update = await client.from('approvals')
        .update({ [column]: value }).eq('id', seeded.data!.id).select('id')
      assert.ok(update.error, `a member must not change ${column} of a submitted approval`)
      assert.equal(update.error!.code, '23514')
      assert.match(update.error!.message, /approvals_content_locked/)

      const unchanged = await admin.from('approvals')
        .select('title, description, priority, due_date').eq('id', seeded.data!.id).single()
      assert.equal(unchanged.error, null)
      assert.equal(unchanged.data!.title, 'An approval')
      assert.equal(unchanged.data!.description, null)
      assert.equal(unchanged.data!.priority, 'Medium')
      assert.equal(unchanged.data!.due_date, null)
    } finally {
      await admin.from('approvals').delete().eq('id', seeded.data!.id)
    }
  })
}

// A status-only update touches no locked column, so without its own rule a member
// could reopen a submitted approval as Draft and then edit and delete it.
for (const from of ['Pending', 'Approved', 'Changes Requested', 'Rejected', 'Withdrawn']) {
  test(`approvals: a ${from} approval cannot return to Draft`, async () => {
    const seeded = await admin.from('approvals').insert(approval({ status: from })).select('id').single()
    assert.equal(seeded.error, null)
    try {
      const client = await signedInClient(member.email, member.password)
      const update = await client.from('approvals')
        .update({ status: 'Draft' }).eq('id', seeded.data!.id).select('id')
      assert.ok(update.error, `a member must not reopen a ${from} approval as Draft`)
      assert.equal(update.error!.code, '23514')
      assert.match(update.error!.message, /approvals_content_locked/)

      const unchanged = await admin.from('approvals').select('status').eq('id', seeded.data!.id).single()
      assert.equal(unchanged.data!.status, from)
    } finally {
      await admin.from('approvals').delete().eq('id', seeded.data!.id)
    }
  })
}

test('approvals: the decide flow can still change status of a submitted approval', async () => {
  const seeded = await admin.from('approvals').insert(approval({ status: 'Pending' })).select('id').single()
  assert.equal(seeded.error, null)
  try {
    const client = await signedInClient(member.email, member.password)
    const decided = await client.from('approvals')
      .update({ status: 'Approved', decided_at: new Date().toISOString() })
      .eq('id', seeded.data!.id).select('status')
    assert.equal(decided.error, null)
    assert.equal(decided.data!.length, 1)
    assert.equal(decided.data![0].status, 'Approved')
  } finally {
    await admin.from('approvals').delete().eq('id', seeded.data!.id)
  }
})

test('approvals: a Draft can be edited and submitted in one update', async () => {
  const seeded = await admin.from('approvals').insert(approval()).select('id').single()
  assert.equal(seeded.error, null)
  try {
    const client = await signedInClient(member.email, member.password)
    const submitted = await client.from('approvals')
      .update({ title: 'Edited', status: 'Pending', submitted_at: new Date().toISOString() })
      .eq('id', seeded.data!.id).select('title, status')
    assert.equal(submitted.error, null)
    assert.equal(submitted.data!.length, 1)
    assert.equal(submitted.data![0].title, 'Edited')
    assert.equal(submitted.data![0].status, 'Pending')
  } finally {
    await admin.from('approvals').delete().eq('id', seeded.data!.id)
  }
})

test('approvals: removing a member sets approver_id null rather than orphaning the row', async () => {
  const user = await removableMember()
  const created = await admin.from('approvals')
    .insert(approval({ approver_id: user.id })).select('id, approver_id').single()
  assert.equal(created.error, null)
  assert.equal(created.data!.approver_id, user.id)

  await removeMembership(user.id)

  const after = await admin.from('approvals').select('approver_id').eq('id', created.data!.id).single()
  assert.equal(after.error, null)
  assert.equal(after.data!.approver_id, null)

  await admin.from('approvals').delete().eq('id', created.data!.id)
})

// ------------------------------------------------------------- approval_decisions

function approvalDecision(over: Record<string, unknown> = {}) {
  return { organization_id: orgId, approval_id: approvalId, action: 'Submitted', ...over }
}

test('approval history: a valid entry is accepted', async () => {
  const { data, error } = await admin.from('approval_decisions').insert(approvalDecision()).select('id').single()
  assert.equal(error, null)
  await admin.from('approval_decisions').delete().eq('id', data!.id)
})

test('approval history: an action outside the vocabulary is refused', async () => {
  const { error } = await admin.from('approval_decisions')
    .insert(approvalDecision({ action: 'Rubber-stamped' })).select('id').single()

  assert.ok(error)
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /approval_decisions_action_check/)
})

test('approval history: a cross-tenant approval is unrepresentable', async () => {
  const { error } = await admin.from('approval_decisions')
    .insert(approvalDecision({ approval_id: outsiderApprovalId })).select('id').single()

  assert.ok(error)
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /approval_decisions_approval_id_organization_id_fkey/)
})

test('approval history: an assignee outside the organisation is refused', async () => {
  const { error } = await admin.from('approval_decisions')
    .insert(approvalDecision({ assignee_id: outsider.id })).select('id').single()

  assert.ok(error)
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /approval_decisions_organization_id_assignee_id_fkey/)
})

test('approval history: an outsider can neither read, write, update nor delete', async () => {
  const seeded = await admin.from('approval_decisions').insert(approvalDecision()).select('id').single()
  assert.equal(seeded.error, null)
  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('approval_decisions').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [])

  const write = await client.from('approval_decisions').insert(approvalDecision()).select('id').single()
  assert.ok(write.error)
  assert.equal(write.error!.code, '42501')

  const update = await client.from('approval_decisions').update({ comment: 'Hijacked' }).eq('id', seeded.data!.id).select('id')
  // UPDATE and DELETE are revoked from authenticated on this table, so an
  // outsider is refused at the privilege layer rather than filtered by RLS.
  assert.ok(update.error, "an outsider's update must be refused")
  assert.equal(update.error!.code, '42501')
  assert.match(update.error!.message, /permission denied for table approval_decisions/)

  const remove = await client.from('approval_decisions').delete().eq('id', seeded.data!.id).select('id')
  assert.ok(remove.error, "an outsider's delete must be refused")
  assert.equal(remove.error!.code, '42501')
  assert.match(remove.error!.message, /permission denied for table approval_decisions/)
  const stillThere = await admin.from('approval_decisions').select('id, comment').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1)
  assert.equal(stillThere.data![0].comment, null, "the outsider's update must not have changed the row")

  await admin.from('approval_decisions').delete().eq('id', seeded.data!.id)
})

test('approval history: a member can record and read entries', async () => {
  const client = await signedInClient(member.email, member.password)
  const created = await client.from('approval_decisions').insert(approvalDecision({ actor_id: member.id })).select('id').single()
  assert.equal(created.error, null)

  const read = await client.from('approval_decisions').select('id').eq('id', created.data!.id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  await admin.from('approval_decisions').delete().eq('id', created.data!.id)
})

test('approval history: removing a member sets assignee_id null rather than orphaning the row', async () => {
  const user = await removableMember()
  const created = await admin.from('approval_decisions')
    .insert(approvalDecision({ action: 'Reassigned', assignee_id: user.id })).select('id, assignee_id').single()
  assert.equal(created.error, null)
  assert.equal(created.data!.assignee_id, user.id)

  await removeMembership(user.id)

  const after = await admin.from('approval_decisions').select('assignee_id').eq('id', created.data!.id).single()
  assert.equal(after.error, null)
  assert.equal(after.data!.assignee_id, null)

  await admin.from('approval_decisions').delete().eq('id', created.data!.id)
})

// UPDATE, DELETE and TRUNCATE are revoked from authenticated on this table, so
// a member is refused at the privilege layer rather than filtered by RLS.
test('approval history is append-only', async () => {
  const seeded = await admin.from('approval_decisions').insert(approvalDecision()).select('id').single()
  assert.equal(seeded.error, null)
  try {
    const client = await signedInClient(member.email, member.password)

    const update = await client.from('approval_decisions')
      .update({ comment: 'rewritten' }).eq('id', seeded.data!.id).select('id')
    assert.ok(update.error, 'a member must not be able to rewrite approval history')
    assert.equal(update.error!.code, '42501')
    assert.match(update.error!.message, /permission denied for table approval_decisions/)

    const remove = await client.from('approval_decisions').delete().eq('id', seeded.data!.id).select('id')
    assert.ok(remove.error, 'a member must not be able to delete approval history')
    assert.equal(remove.error!.code, '42501')
    assert.match(remove.error!.message, /permission denied for table approval_decisions/)

    const row = await admin.from('approval_decisions').select('id, comment').eq('id', seeded.data!.id)
    assert.equal(row.error, null)
    assert.equal(row.data!.length, 1, 'the history row must still exist')
    assert.equal(row.data![0].comment, null, 'the history row must be unchanged')
  } finally {
    await admin.from('approval_decisions').delete().eq('id', seeded.data!.id)
  }
})

test('approval history: deleting a Draft approval still cascades its history', async () => {
  const seeded = await admin.from('approvals').insert(approval()).select('id').single()
  assert.equal(seeded.error, null)
  try {
    const entry = await admin.from('approval_decisions')
      .insert(approvalDecision({ approval_id: seeded.data!.id })).select('id').single()
    assert.equal(entry.error, null)

    const client = await signedInClient(member.email, member.password)
    const remove = await client.from('approvals').delete().eq('id', seeded.data!.id).select('id')
    assert.equal(remove.error, null)
    assert.equal(remove.data!.length, 1)

    const history = await admin.from('approval_decisions').select('id').eq('approval_id', seeded.data!.id)
    assert.equal(history.error, null)
    assert.deepEqual(history.data, [], 'the approval history must cascade with its Draft approval')
  } finally {
    await admin.from('approval_decisions').delete().eq('approval_id', seeded.data!.id)
    await admin.from('approvals').delete().eq('id', seeded.data!.id)
  }
})

// ------------------------------------------------------------- governance_gates

function gate(over: Record<string, unknown> = {}) {
  return { organization_id: orgId, framework_id: frameworkA, phase_id: phaseA, name: 'Design review', ...over }
}

test('gates: a valid gate is accepted', async () => {
  const { data, error } = await admin.from('governance_gates').insert(gate()).select('id').single()
  assert.equal(error, null)
  await admin.from('governance_gates').delete().eq('id', data!.id)
})

test('gates: a phase from another framework is refused', async () => {
  const { error } = await admin.from('governance_gates')
    .insert(gate({ phase_id: phaseB })).select('id').single()

  assert.ok(error)
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /governance_gates_framework_id_phase_id_fkey/)
})

test('gates: a cross-tenant framework is unrepresentable', async () => {
  const { error } = await admin.from('governance_gates')
    .insert(gate({ framework_id: outsiderFramework, phase_id: outsiderPhase })).select('id').single()

  assert.ok(error)
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /governance_gates_framework_id_organization_id_fkey/)
})

test('gates: an outsider can neither read, write, update nor delete', async () => {
  const seeded = await admin.from('governance_gates').insert(gate()).select('id').single()
  assert.equal(seeded.error, null)
  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('governance_gates').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [])

  const write = await client.from('governance_gates').insert(gate()).select('id').single()
  assert.ok(write.error)
  assert.equal(write.error!.code, '42501')

  const update = await client.from('governance_gates').update({ description: 'Hijacked' }).eq('id', seeded.data!.id).select('id')
  assert.equal(update.error, null)
  assert.deepEqual(update.data, [], "an outsider's update must match no rows")

  const remove = await client.from('governance_gates').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null)
  assert.deepEqual(remove.data, [])
  const stillThere = await admin.from('governance_gates').select('id, description').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1)
  assert.equal(stillThere.data![0].description, null, "the outsider's update must not have changed the row")

  await admin.from('governance_gates').delete().eq('id', seeded.data!.id)
})

test('gates: a member can read, write, update and delete', async () => {
  const client = await signedInClient(member.email, member.password)
  const created = await client.from('governance_gates').insert(gate()).select('id').single()
  assert.equal(created.error, null)

  const updated = await client.from('governance_gates')
    .update({ description: 'Sign-off before build' }).eq('id', created.data!.id).select('description').single()
  assert.equal(updated.error, null)
  assert.equal(updated.data!.description, 'Sign-off before build')

  const removed = await client.from('governance_gates').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)
  const after = await client.from('governance_gates').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [])
})
