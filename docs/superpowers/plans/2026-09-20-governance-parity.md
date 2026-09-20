# Governance Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the project Governance tab's Risks and Evidence registers full CRUD (Risks also gets an owner picker with removed-owner retention and a status that can move), and put an RLS test suite behind every Governance table.

**Architecture:** RLS tests come first and characterise the six existing Governance tables. A small pure vocabulary module plus pure field readers give the server actions testable validation. `getProjectGovernance` resolves a risk owner's name; new update/delete actions follow the Requirements pattern. Risks and Evidence get their own self-contained tables with an inline edit row, replacing their read-only `Register` usage in `project-governance-panel.tsx`. Approvals and Decisions are untouched.

**Tech Stack:** Next.js 16 App Router, React 19 Server Actions (`useActionState`), Supabase Postgres 17 with RLS, Node's built-in test runner.

## Global Constraints

- A field or control in the UI is a claim the product supports that capability; this slice claims exactly the eight risk fields and three evidence fields.
- The picker-retention rule applies to the risk owner picker from day one, and the raw member list is never pre-filtered on its way there.
- Integrity rules are enforced structurally, not only in the UI.
- `unison-uat` is production: there is no separate database. Any test row must be deleted, and test fixtures must be cleaned up by `cleanup()` including their audit events.
- Migrations are append-only; never edit one that has been applied. This plan adds none.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- `features/product-ui/components/record-collection-workspace.tsx` must not be modified.
- Do not modify `features/delivery/components/project-requirements-panel.tsx`, `features/delivery/risk-severity.ts`, or the Approvals and Decisions registers.
- Full spec: `docs/superpowers/specs/2026-09-20-governance-parity-design.md`.

**Run long commands in the foreground.** `pnpm test:rls` takes minutes. Never background it.

---

### Task 1: RLS coverage for risks and evidence, and the audit-event sweep

**Files:**
- Modify: `tests/integration/rls/helpers.ts`
- Create: `tests/integration/rls/project-risks.test.ts`
- Create: `tests/integration/rls/governance-artefacts.test.ts`

**Interfaces:**
- Produces: the audit-event cleanup sweep in `helpers.ts` covers all six Governance resource names, which Task 2's file also depends on.

These are characterisation tests of tables that already exist and are already live, so they are expected to pass on first run. **If any test fails, do not edit its assertion to match.** Work out whether the test is wrong (fix the test) or the database is wrong (stop: report `DONE_WITH_CONCERNS` with the failing output and do not change the database in this task).

- [ ] **Step 1: Extend the audit-event sweep**

In `tests/integration/rls/helpers.ts`, the resource array passed to `.in('resource', [...])` in the `deliveryEvents` query currently ends:

```ts
        'requirements',
        'requirement_delivery_items',
        'requirement_evidence',
      ])
```

Change it to:

```ts
        'requirements',
        'requirement_delivery_items',
        'requirement_evidence',
        'project_risks',
        'project_decisions',
        'approvals',
        'approval_decisions',
        'governance_artefacts',
        'governance_gates',
      ])
```

All six tables carry `record_audit_event` triggers. Without this, every fixture row leaves an orphaned `audit_events` row in production (Requirements leaked 24 this way).

- [ ] **Step 2: Write the risks test**

Create `tests/integration/rls/project-risks.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgId: string
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let projectId: string
let outsiderProjectId: string
// Module scope so `after` can always reach it for cleanup, even if the test that
// creates it fails before its own teardown runs.
let removable: { id: string; email: string; password: string } | undefined

before(async () => {
  orgId = await createFixtureOrg('project-risks')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('project-risks-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const framework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'RSK Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (framework.error) throw framework.error

  const project = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'RSK Project', status: 'Active', health: 'On Track', framework_id: framework.data.id })
    .select('id').single()
  if (project.error) throw project.error
  projectId = project.data.id

  const outsiderFramework = await admin.from('frameworks')
    .insert({ organization_id: outsiderOrg, name: 'RSK Outsider Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (outsiderFramework.error) throw outsiderFramework.error

  const outsiderProject = await admin.from('projects')
    .insert({ organization_id: outsiderOrg, name: 'RSK Outsider Project', status: 'Active', health: 'On Track', framework_id: outsiderFramework.data.id })
    .select('id').single()
  if (outsiderProject.error) throw outsiderProject.error
  outsiderProjectId = outsiderProject.data.id
})

after(async () => {
  await cleanup([orgId, outsiderOrg], [member.id, outsider.id, removable?.id].filter(Boolean) as string[])
})

function risk(over: Record<string, unknown> = {}) {
  return { organization_id: orgId, project_id: projectId, title: 'A risk', ...over }
}

test('a valid risk is accepted and takes its documented defaults', async () => {
  const { data, error } = await admin.from('project_risks').insert(risk()).select('id, probability, impact, status, owner_id').single()
  assert.equal(error, null)
  assert.equal(data!.probability, 'Possible')
  assert.equal(data!.impact, 'Moderate')
  assert.equal(data!.status, 'Open')
  assert.equal(data!.owner_id, null)
  await admin.from('project_risks').delete().eq('id', data!.id)
})

test('a cross-tenant project is unrepresentable', async () => {
  const { error } = await admin.from('project_risks')
    .insert(risk({ project_id: outsiderProjectId })).select('id').single()

  assert.ok(error, "a risk on another organisation's project must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /project_risks_project_id_organization_id_fkey/)
})

test('an owner outside the organisation is refused', async () => {
  const { error } = await admin.from('project_risks')
    .insert(risk({ owner_id: outsider.id })).select('id').single()

  assert.ok(error, 'an owner from another organisation must be refused')
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /project_risks_organization_id_owner_id_fkey/)
})

for (const [column, bad, constraint] of [
  ['probability', 'Certain', 'project_risks_probability_check'],
  ['impact', 'Catastrophic', 'project_risks_impact_check'],
  ['status', 'Resolved', 'project_risks_status_check'],
] as const) {
  test(`an invalid ${column} is refused`, async () => {
    const { error } = await admin.from('project_risks')
      .insert(risk({ [column]: bad })).select('id').single()

    assert.ok(error, `a ${column} outside the fixed vocabulary must be refused`)
    assert.equal(error!.code, '23514')
    assert.match(error!.message, new RegExp(constraint))
  })
}

test('a member can move a risk through every status in the vocabulary', async () => {
  const client = await signedInClient(member.email, member.password)
  const created = await client.from('project_risks').insert(risk()).select('id').single()
  assert.equal(created.error, null)

  for (const status of ['Mitigating', 'Accepted', 'Closed', 'Open']) {
    const moved = await client.from('project_risks')
      .update({ status }).eq('id', created.data!.id).select('status').single()
    assert.equal(moved.error, null, `status ${status} must be reachable`)
    assert.equal(moved.data!.status, status)
  }

  await admin.from('project_risks').delete().eq('id', created.data!.id)
})

test('an outsider can neither read, write nor delete', async () => {
  const seeded = await admin.from('project_risks').insert(risk()).select('id').single()
  assert.equal(seeded.error, null)

  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('project_risks').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [], "another organisation's risks must not be visible")

  const write = await client.from('project_risks').insert(risk()).select('id').single()
  assert.ok(write.error, 'an outsider must not be able to write')
  assert.equal(write.error!.code, '42501')

  const update = await client.from('project_risks').update({ title: 'Hijacked' }).eq('id', seeded.data!.id).select('id')
  assert.equal(update.error, null)
  assert.deepEqual(update.data, [], "an outsider's update must match no rows")

  const remove = await client.from('project_risks').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null, 'RLS silently deletes zero rows rather than erroring')
  assert.deepEqual(remove.data, [])
  const stillThere = await admin.from('project_risks').select('id, title').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1, "the outsider's delete must not have removed the row")
  assert.equal(stillThere.data![0].title, 'A risk', "the outsider's update must not have changed the row")

  await admin.from('project_risks').delete().eq('id', seeded.data!.id)
})

test('a member of the organisation can read, write, update and delete', async () => {
  const client = await signedInClient(member.email, member.password)

  const created = await client.from('project_risks').insert(risk()).select('id').single()
  assert.equal(created.error, null)

  const read = await client.from('project_risks').select('id').eq('id', created.data!.id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  const updated = await client.from('project_risks')
    .update({ mitigation: 'Add a fallback supplier' }).eq('id', created.data!.id).select('mitigation').single()
  assert.equal(updated.error, null)
  assert.equal(updated.data!.mitigation, 'Add a fallback supplier')

  const removed = await client.from('project_risks').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)

  const after = await client.from('project_risks').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [], 'the deleted risk must be gone')
})

test('removing a member sets owner_id null rather than orphaning the row', async () => {
  removable = await createFixtureUser(orgId, 'admin')
  const created = await admin.from('project_risks')
    .insert(risk({ owner_id: removable.id })).select('id, owner_id').single()
  assert.equal(created.error, null)
  assert.equal(created.data!.owner_id, removable.id)

  const { error: deleteError } = await admin.from('memberships')
    .delete().eq('organization_id', orgId).eq('user_id', removable.id)
  assert.equal(deleteError, null)

  const after = await admin.from('project_risks').select('owner_id').eq('id', created.data!.id).single()
  assert.equal(after.error, null)
  assert.equal(after.data!.owner_id, null, 'the risk must survive with ownership cleared, not orphaned or deleted')

  await admin.from('project_risks').delete().eq('id', created.data!.id)
})
```

- [ ] **Step 3: Write the evidence test**

Create `tests/integration/rls/governance-artefacts.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgId: string
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let frameworkId: string
let projectId: string
let approvalId: string
let outsiderFrameworkId: string
let outsiderProjectId: string

before(async () => {
  orgId = await createFixtureOrg('governance-artefacts')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('governance-artefacts-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const framework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'GA Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (framework.error) throw framework.error
  frameworkId = framework.data.id

  const project = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'GA Project', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (project.error) throw project.error
  projectId = project.data.id

  const approval = await admin.from('approvals')
    .insert({ organization_id: orgId, project_id: projectId, title: 'GA Approval' })
    .select('id').single()
  if (approval.error) throw approval.error
  approvalId = approval.data.id

  const outsiderFramework = await admin.from('frameworks')
    .insert({ organization_id: outsiderOrg, name: 'GA Outsider Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (outsiderFramework.error) throw outsiderFramework.error
  outsiderFrameworkId = outsiderFramework.data.id

  const outsiderProject = await admin.from('projects')
    .insert({ organization_id: outsiderOrg, name: 'GA Outsider Project', status: 'Active', health: 'On Track', framework_id: outsiderFrameworkId })
    .select('id').single()
  if (outsiderProject.error) throw outsiderProject.error
  outsiderProjectId = outsiderProject.data.id
})

after(async () => { await cleanup([orgId, outsiderOrg], [member.id, outsider.id]) })

function artefact(over: Record<string, unknown> = {}) {
  return {
    organization_id: orgId,
    project_id: projectId,
    name: 'Test report',
    external_url: 'https://example.com/report',
    ...over,
  }
}

test('a project-scoped artefact with an external url is accepted', async () => {
  const { data, error } = await admin.from('governance_artefacts').insert(artefact()).select('id').single()
  assert.equal(error, null)
  await admin.from('governance_artefacts').delete().eq('id', data!.id)
})

test('a framework-scoped artefact is accepted', async () => {
  const { data, error } = await admin.from('governance_artefacts')
    .insert(artefact({ project_id: null, framework_id: frameworkId })).select('id').single()
  assert.equal(error, null)
  await admin.from('governance_artefacts').delete().eq('id', data!.id)
})

test('an approval-scoped artefact is accepted', async () => {
  const { data, error } = await admin.from('governance_artefacts')
    .insert(artefact({ project_id: null, approval_id: approvalId })).select('id').single()
  assert.equal(error, null)
  await admin.from('governance_artefacts').delete().eq('id', data!.id)
})

test('an artefact needs a stored file or an external url', async () => {
  const { error } = await admin.from('governance_artefacts')
    .insert(artefact({ external_url: null })).select('id').single()

  assert.ok(error, 'an artefact with neither storage_path nor external_url must be refused')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /check constraint "governance_artefacts_check"/)
})

test('an artefact needs a project, framework or approval scope', async () => {
  const { error } = await admin.from('governance_artefacts')
    .insert(artefact({ project_id: null })).select('id').single()

  assert.ok(error, 'an artefact scoped to nothing must be refused')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /check constraint "governance_artefacts_check1"/)
})

test('a cross-tenant project is unrepresentable', async () => {
  const { error } = await admin.from('governance_artefacts')
    .insert(artefact({ project_id: outsiderProjectId })).select('id').single()

  assert.ok(error, "an artefact on another organisation's project must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /governance_artefacts_project_id_organization_id_fkey/)
})

test('a cross-tenant framework is unrepresentable', async () => {
  const { error } = await admin.from('governance_artefacts')
    .insert(artefact({ project_id: null, framework_id: outsiderFrameworkId })).select('id').single()

  assert.ok(error, "an artefact on another organisation's framework must be refused")
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /governance_artefacts_framework_id_organization_id_fkey/)
})

test('an outsider can neither read, write nor delete', async () => {
  const seeded = await admin.from('governance_artefacts').insert(artefact()).select('id').single()
  assert.equal(seeded.error, null)

  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('governance_artefacts').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [], "another organisation's evidence must not be visible")

  const write = await client.from('governance_artefacts').insert(artefact()).select('id').single()
  assert.ok(write.error, 'an outsider must not be able to write')
  assert.equal(write.error!.code, '42501')

  const update = await client.from('governance_artefacts').update({ name: 'Hijacked' }).eq('id', seeded.data!.id).select('id')
  assert.equal(update.error, null)
  assert.deepEqual(update.data, [], "an outsider's update must match no rows")

  const remove = await client.from('governance_artefacts').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null, 'RLS silently deletes zero rows rather than erroring')
  assert.deepEqual(remove.data, [])
  const stillThere = await admin.from('governance_artefacts').select('id, name').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1, "the outsider's delete must not have removed the row")
  assert.equal(stillThere.data![0].name, 'Test report', "the outsider's update must not have changed the row")

  await admin.from('governance_artefacts').delete().eq('id', seeded.data!.id)
})

test('a member of the organisation can read, write, update and delete', async () => {
  const client = await signedInClient(member.email, member.password)

  const created = await client.from('governance_artefacts').insert(artefact()).select('id').single()
  assert.equal(created.error, null)

  const read = await client.from('governance_artefacts').select('id').eq('id', created.data!.id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  const updated = await client.from('governance_artefacts')
    .update({ notes: 'Signed off' }).eq('id', created.data!.id).select('notes').single()
  assert.equal(updated.error, null)
  assert.equal(updated.data!.notes, 'Signed off')

  const removed = await client.from('governance_artefacts').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)

  const after = await client.from('governance_artefacts').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [], 'the deleted artefact must be gone')
})
```

- [ ] **Step 4: Run both files**

Run (foreground, one command per file):

```bash
node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/project-risks.test.ts
node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/governance-artefacts.test.ts
```

Expected: PASS. The risks file has 10 tests (three of them from the enum loop); the evidence file has 9. If one fails, follow the rule at the top of this task.

- [ ] **Step 5: Confirm nothing leaked**

Run, via the Supabase MCP `execute_sql` tool against `unison-uat` (read-only):

```sql
select
 (select count(*) from public.organizations where name ilike '%project-risks%' or name ilike '%governance-artefacts%') as leaked_orgs,
 (select count(*) from public.audit_events where organization_id is null and resource in ('project_risks','governance_artefacts','approvals') and created_at > now() - interval '3 hours') as orphan_audit;
```

Expected: both `0`. If `orphan_audit` is not 0, the sweep edit in Step 1 is wrong; fix it before committing.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/rls/helpers.ts tests/integration/rls/project-risks.test.ts tests/integration/rls/governance-artefacts.test.ts
git commit -m "test(governance): RLS coverage for risks and evidence, and sweep audit events"
```

---

### Task 2: RLS coverage for decisions, approvals, approval history and gates

**Files:**
- Create: `tests/integration/rls/governance-registers.test.ts`

**Interfaces:**
- Consumes: the six-resource audit sweep from Task 1.

Same rule as Task 1: these characterise live tables; a failure is not to be "fixed" by editing the assertion. One test is deliberately marked `todo` (see Step 1): it states behaviour the database does NOT currently have, and is expected to fail without failing the suite.

- [ ] **Step 1: Write the test**

Create `tests/integration/rls/governance-registers.test.ts`:

```ts
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

test('decisions: an outsider can neither read, write nor delete', async () => {
  const seeded = await admin.from('project_decisions').insert(decision()).select('id').single()
  assert.equal(seeded.error, null)
  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('project_decisions').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [])

  const write = await client.from('project_decisions').insert(decision()).select('id').single()
  assert.ok(write.error)
  assert.equal(write.error!.code, '42501')

  const remove = await client.from('project_decisions').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null)
  assert.deepEqual(remove.data, [])
  const stillThere = await admin.from('project_decisions').select('id').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1)

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

test('approvals: an outsider can neither read, write nor delete', async () => {
  const seeded = await admin.from('approvals').insert(approval()).select('id').single()
  assert.equal(seeded.error, null)
  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('approvals').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [])

  const write = await client.from('approvals').insert(approval()).select('id').single()
  assert.ok(write.error)
  assert.equal(write.error!.code, '42501')

  const remove = await client.from('approvals').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null)
  assert.deepEqual(remove.data, [])
  const stillThere = await admin.from('approvals').select('id').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1)

  await admin.from('approvals').delete().eq('id', seeded.data!.id)
})

test('approvals: a member can read, write, update and delete', async () => {
  const client = await signedInClient(member.email, member.password)
  const created = await client.from('approvals').insert(approval()).select('id').single()
  assert.equal(created.error, null)

  const updated = await client.from('approvals')
    .update({ status: 'Pending' }).eq('id', created.data!.id).select('status').single()
  assert.equal(updated.error, null)
  assert.equal(updated.data!.status, 'Pending')

  const removed = await client.from('approvals').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)
  const after = await client.from('approvals').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [])
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

test('approval history: an outsider can neither read, write nor delete', async () => {
  const seeded = await admin.from('approval_decisions').insert(approvalDecision()).select('id').single()
  assert.equal(seeded.error, null)
  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('approval_decisions').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [])

  const write = await client.from('approval_decisions').insert(approvalDecision()).select('id').single()
  assert.ok(write.error)
  assert.equal(write.error!.code, '42501')

  const remove = await client.from('approval_decisions').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null)
  assert.deepEqual(remove.data, [])
  const stillThere = await admin.from('approval_decisions').select('id').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1)

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

// The migration that created this table says "History rows are append-only",
// but it gives every table the same four policies, so any active member can
// rewrite or delete approval history (an audit trigger records it, nothing
// prevents it). This states the intended behaviour and is expected to FAIL
// today; `todo` reports it without failing the suite. The fix belongs to the
// Decisions and Approvals slice: see docs/follow-ups.md.
test('approval history is append-only', {
  todo: 'approval_decisions grants UPDATE and DELETE to every active member',
}, async () => {
  const seeded = await admin.from('approval_decisions').insert(approvalDecision()).select('id').single()
  assert.equal(seeded.error, null)
  try {
    const client = await signedInClient(member.email, member.password)

    const update = await client.from('approval_decisions')
      .update({ comment: 'rewritten' }).eq('id', seeded.data!.id).select('id')
    assert.ok(update.error || update.data!.length === 0, 'a member must not be able to rewrite approval history')

    const remove = await client.from('approval_decisions').delete().eq('id', seeded.data!.id).select('id')
    assert.ok(remove.error || remove.data!.length === 0, 'a member must not be able to delete approval history')
  } finally {
    await admin.from('approval_decisions').delete().eq('id', seeded.data!.id)
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

test('gates: an outsider can neither read, write nor delete', async () => {
  const seeded = await admin.from('governance_gates').insert(gate()).select('id').single()
  assert.equal(seeded.error, null)
  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('governance_gates').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [])

  const write = await client.from('governance_gates').insert(gate()).select('id').single()
  assert.ok(write.error)
  assert.equal(write.error!.code, '42501')

  const remove = await client.from('governance_gates').delete().eq('id', seeded.data!.id).select('id')
  assert.equal(remove.error, null)
  assert.deepEqual(remove.data, [])
  const stillThere = await admin.from('governance_gates').select('id').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1)

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
```

- [ ] **Step 2: Run it**

```bash
node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/governance-registers.test.ts
```

Expected: every test passes except `approval history is append-only`, which is reported as `todo` (it fails, and the run still exits 0). Record its actual failure output in the task report: it must be the assertion "a member must not be able to rewrite approval history", not an error from the test's own setup. If it PASSES, stop and report: that means the database is already append-only and the migration's policies differ from what this plan read.

- [ ] **Step 3: Confirm nothing leaked**

Via the Supabase MCP `execute_sql` tool (read-only):

```sql
select
 (select count(*) from public.organizations where name ilike '%governance-registers%') as leaked_orgs,
 (select count(*) from public.audit_events where organization_id is null and resource in ('project_decisions','approvals','approval_decisions','governance_gates') and created_at > now() - interval '3 hours') as orphan_audit;
```

Expected: both `0`. The `todo` test and the three member-removal tests create extra users; `cleanup()` deletes them through `extraUsers`, so a leaked organisation here means one of them failed before its teardown.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/rls/governance-registers.test.ts
git commit -m "test(governance): RLS coverage for decisions, approvals, approval history and gates"
```

---

### Task 3: Risk vocabulary and pure field readers

**Files:**
- Create: `features/delivery/governance-vocabulary.ts`
- Create: `features/delivery/governance-fields.ts`
- Test: `tests/unit/governance-vocabulary.test.ts`
- Test: `tests/unit/governance-fields.test.ts`

**Interfaces:**
- Produces, from `governance-vocabulary.ts`: `RISK_PROBABILITIES`, `RISK_IMPACTS`, `RISK_STATUSES` (each a `readonly` tuple).
- Produces, from `governance-fields.ts`: `readRiskFields(form: FormData): RiskFields | { error: string }` and `readArtefactFields(form: FormData): ArtefactFields | { error: string }`, where `RiskFields = { title: string; description: string | null; probability: string; impact: string; status: string; owner_id: string | null; mitigation: string | null; target_date: string | null }` and `ArtefactFields = { name: string; external_url: string; notes: string | null }`. Callers discriminate with `'error' in fields`.

Both modules must use **relative imports only** (no `@/` alias) so Node's test runner can load them. `features/delivery/risk-severity.ts` keeps its own private weight tables and is not touched.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/governance-vocabulary.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { RISK_IMPACTS, RISK_PROBABILITIES, RISK_STATUSES } from '../../features/delivery/governance-vocabulary.ts'

// The form must not offer a value the database refuses. Read the check
// constraints out of the migration that created project_risks and compare.
const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260910130104_core_delivery_governance.sql'),
  'utf8',
)
const block = migration.match(/create table public\.project_risks \(([\s\S]*?)\n\);/)
assert.ok(block, 'the project_risks table definition must be found in the migration')

function constraintValues(column: string): string[] {
  const match = block![1].match(new RegExp(`${column} text not null default '[^']*' check \\(${column} in \\(([^)]*)\\)\\)`))
  assert.ok(match, `the ${column} check constraint must be found`)
  return match![1].split(',').map((value) => value.trim().replace(/^'|'$/g, ''))
}

test('risk probabilities match project_risks_probability_check', () => {
  assert.deepEqual([...RISK_PROBABILITIES], constraintValues('probability'))
})

test('risk impacts match project_risks_impact_check', () => {
  assert.deepEqual([...RISK_IMPACTS], constraintValues('impact'))
})

test('risk statuses match project_risks_status_check', () => {
  assert.deepEqual([...RISK_STATUSES], constraintValues('status'))
})
```

Create `tests/unit/governance-fields.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { readArtefactFields, readRiskFields } from '../../features/delivery/governance-fields.ts'

const OWNER = '3f3b2bbc-a9e8-46d4-8dfb-083cc5a2b5a0'

function form(fields: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const validRisk = { title: 'Supplier delay', probability: 'Likely', impact: 'Major', status: 'Open' }

test('a minimal valid risk reads through, with optional fields null', () => {
  assert.deepEqual(readRiskFields(form(validRisk)), {
    title: 'Supplier delay',
    description: null,
    probability: 'Likely',
    impact: 'Major',
    status: 'Open',
    owner_id: null,
    mitigation: null,
    target_date: null,
  })
})

test('a fully populated risk reads through, trimmed', () => {
  const fields = readRiskFields(form({
    ...validRisk,
    title: '  Supplier delay  ',
    description: 'Hardware arrives late',
    mitigation: 'Second supplier',
    ownerId: OWNER,
    targetDate: '2026-10-31',
  }))
  assert.deepEqual(fields, {
    title: 'Supplier delay',
    description: 'Hardware arrives late',
    probability: 'Likely',
    impact: 'Major',
    status: 'Open',
    owner_id: OWNER,
    mitigation: 'Second supplier',
    target_date: '2026-10-31',
  })
})

test('every status in the vocabulary is accepted', () => {
  for (const status of ['Open', 'Mitigating', 'Accepted', 'Closed']) {
    assert.ok(!('error' in readRiskFields(form({ ...validRisk, status }))), `${status} must be accepted`)
  }
})

test('a risk with no title is refused', () => {
  assert.deepEqual(readRiskFields(form({ ...validRisk, title: '   ' })), { error: 'A risk title is required.' })
})

test('a probability, impact or status outside the vocabulary is refused', () => {
  assert.deepEqual(readRiskFields(form({ ...validRisk, probability: 'Certain' })), { error: 'Choose a valid probability.' })
  assert.deepEqual(readRiskFields(form({ ...validRisk, impact: 'Catastrophic' })), { error: 'Choose a valid impact.' })
  assert.deepEqual(readRiskFields(form({ ...validRisk, status: 'Resolved' })), { error: 'Choose a valid status.' })
})

test('a missing select is refused, not defaulted', () => {
  // createRiskAction used to default a missing probability to "Possible".
  const { probability: _omitted, ...withoutProbability } = validRisk
  assert.deepEqual(readRiskFields(form(withoutProbability)), { error: 'Choose a valid probability.' })
})

test('a malformed owner id is refused, and a blank owner is Unassigned', () => {
  assert.deepEqual(readRiskFields(form({ ...validRisk, ownerId: 'not-a-uuid' })), { error: 'Choose a valid owner.' })
  const blank = readRiskFields(form({ ...validRisk, ownerId: '' }))
  assert.ok(!('error' in blank))
  assert.equal(blank.owner_id, null)
})

test('an impossible target date is refused, and a blank one is null', () => {
  assert.deepEqual(readRiskFields(form({ ...validRisk, targetDate: '2026-02-30' })), { error: 'Enter a valid target date.' })
  const blank = readRiskFields(form({ ...validRisk, targetDate: '' }))
  assert.ok(!('error' in blank))
  assert.equal(blank.target_date, null)
})

test('a valid artefact reads through, with notes optional', () => {
  assert.deepEqual(readArtefactFields(form({ name: 'Test report', externalUrl: 'https://example.com/report' })), {
    name: 'Test report',
    external_url: 'https://example.com/report',
    notes: null,
  })
  const withNotes = readArtefactFields(form({ name: 'Test report', externalUrl: 'https://example.com/report', notes: ' Signed off ' }))
  assert.ok(!('error' in withNotes))
  assert.equal(withNotes.notes, 'Signed off')
})

test('an artefact needs a name and a url', () => {
  const message = { error: 'An artefact name and secure URL are required.' }
  assert.deepEqual(readArtefactFields(form({ name: '', externalUrl: 'https://example.com' })), message)
  assert.deepEqual(readArtefactFields(form({ name: 'Report', externalUrl: '' })), message)
})

test('an artefact url must be https', () => {
  const message = { error: 'Use a valid HTTPS evidence URL.' }
  assert.deepEqual(readArtefactFields(form({ name: 'Report', externalUrl: 'http://example.com' })), message)
  assert.deepEqual(readArtefactFields(form({ name: 'Report', externalUrl: 'not a url' })), message)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --experimental-strip-types tests/unit/governance-vocabulary.test.ts tests/unit/governance-fields.test.ts`
Expected: FAIL: both source modules do not exist yet.

- [ ] **Step 3: Write the vocabulary**

Create `features/delivery/governance-vocabulary.ts`:

```ts
// The risk vocabularies, stated once for both the server actions and the client
// form. Plain constants with no directive, so either side can import them (a
// 'use server' file cannot export non-function values across the boundary).
// tests/unit/governance-vocabulary.test.ts reads the project_risks check
// constraints out of the migration and fails if these drift from them.

/** Matches project_risks_probability_check. */
export const RISK_PROBABILITIES = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'] as const

/** Matches project_risks_impact_check. */
export const RISK_IMPACTS = ['Minor', 'Moderate', 'Major', 'Severe'] as const

/** Matches project_risks_status_check. */
export const RISK_STATUSES = ['Open', 'Mitigating', 'Accepted', 'Closed'] as const
```

- [ ] **Step 4: Write the field readers**

Create `features/delivery/governance-fields.ts`:

```ts
// Pure readers for the Governance forms, so the validation the server actions
// depend on is unit testable. Relative imports only: Node's test runner cannot
// resolve the '@/' alias, and 'use server' modules cannot be imported by a test.
import { isUuid } from '../../lib/utils/index.ts'
import { RISK_IMPACTS, RISK_PROBABILITIES, RISK_STATUSES } from './governance-vocabulary.ts'
import { isValidIsoDate } from './schemas/date.ts'
import { isHttpsUrl } from './schemas/url.ts'

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const optional = (form: FormData, key: string) => value(form, key) || null
const isOneOf = (options: readonly string[], candidate: string) => options.includes(candidate)

export type RiskFields = {
  title: string
  description: string | null
  probability: string
  impact: string
  status: string
  owner_id: string | null
  mitigation: string | null
  target_date: string | null
}

export function readRiskFields(form: FormData): RiskFields | { error: string } {
  const title = value(form, 'title')
  if (!title) return { error: 'A risk title is required.' }

  // No defaults: a missing select is a malformed request, not "Possible".
  const probability = value(form, 'probability')
  if (!isOneOf(RISK_PROBABILITIES, probability)) return { error: 'Choose a valid probability.' }
  const impact = value(form, 'impact')
  if (!isOneOf(RISK_IMPACTS, impact)) return { error: 'Choose a valid impact.' }
  const status = value(form, 'status')
  if (!isOneOf(RISK_STATUSES, status)) return { error: 'Choose a valid status.' }

  const ownerId = optional(form, 'ownerId')
  if (ownerId && !isUuid(ownerId)) return { error: 'Choose a valid owner.' }

  const targetDate = optional(form, 'targetDate')
  if (targetDate && !isValidIsoDate(targetDate)) return { error: 'Enter a valid target date.' }

  return {
    title,
    description: optional(form, 'description'),
    probability,
    impact,
    status,
    owner_id: ownerId,
    mitigation: optional(form, 'mitigation'),
    target_date: targetDate,
  }
}

export type ArtefactFields = { name: string; external_url: string; notes: string | null }

export function readArtefactFields(form: FormData): ArtefactFields | { error: string } {
  const name = value(form, 'name')
  const externalUrl = value(form, 'externalUrl')
  if (!name || !externalUrl) return { error: 'An artefact name and secure URL are required.' }
  if (!isHttpsUrl(externalUrl)) return { error: 'Use a valid HTTPS evidence URL.' }
  return { name, external_url: externalUrl, notes: optional(form, 'notes') }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test --experimental-strip-types tests/unit/governance-vocabulary.test.ts tests/unit/governance-fields.test.ts`
Expected: PASS: 3 vocabulary tests and 11 field tests.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`
Expected: 0 errors.

```bash
git add features/delivery/governance-vocabulary.ts features/delivery/governance-fields.ts tests/unit/governance-vocabulary.test.ts tests/unit/governance-fields.test.ts
git commit -m "feat(governance): risk vocabulary and pure form readers"
```

---

### Task 4: Owner names in the read query, and update/delete actions

**Files:**
- Modify: `features/delivery/queries/get-project-governance.ts`
- Modify: `features/delivery/actions/project-governance.ts`

**Interfaces:**
- Consumes: `readRiskFields`, `readArtefactFields`, `RiskFields`, `ArtefactFields` from Task 3.
- Produces: `ProjectGovernance['risks'][number]` gains `owner_id: string | null` and `owner: string` (never a raw uuid: the member's name, `'Unassigned'` or `'Former member'`). New exports from `project-governance.ts`, each `(id: string, _previous: GovernanceActionState | undefined, form: FormData) => Promise<GovernanceActionState>`: `updateRiskAction`, `deleteRiskAction`, `updateArtefactAction`, `deleteArtefactAction`. `createRiskAction` and `createArtefactAction` keep their signatures.

No unit test can import a `'use server'` file, so the validation lives in Task 3 and this task is verified by typecheck, build, and the signed-in checklist in Task 6.

- [ ] **Step 1: Resolve risk owners in the query**

In `features/delivery/queries/get-project-governance.ts`:

Add the import beneath the existing ones:

```ts
import { listOrganizationMembers } from "@/features/memberships/queries/list-organization-members";
```

Change the `risks` line of the `ProjectGovernance` type from

```ts
  risks: Array<{ id: string; title: string; description: string | null; probability: string; impact: string; status: string; mitigation: string | null; target_date: string | null; created_at: string }>;
```

to

```ts
  risks: Array<{
    id: string;
    title: string;
    description: string | null;
    probability: string;
    impact: string;
    status: string;
    owner_id: string | null;
    /** Resolved name, or 'Unassigned' / 'Former member'. Never a raw uuid. */
    owner: string;
    mitigation: string | null;
    target_date: string | null;
    created_at: string;
  }>;
```

Add `listOrganizationMembers()` to the existing `Promise.all` and destructure it. The destructuring line currently reads `const [risks, decisions, approvals, artefacts] = await Promise.all([` and the array ends with the `governance_artefacts` query. Make it:

```ts
  const [risks, decisions, approvals, artefacts, members] = await Promise.all([
```

and append `listOrganizationMembers(),` as the last element of that array (after the `governance_artefacts` query, before `]);`).

Add `owner_id` to the risks select string, changing

```ts
        "id,title,description,probability,impact,status,mitigation,target_date,created_at",
```

to

```ts
        "id,title,description,probability,impact,status,owner_id,mitigation,target_date,created_at",
```

Replace the final `return { risks: risks.data ?? [], ... }` with:

```ts
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]));
  return {
    risks: (risks.data ?? []).map((row: Omit<ProjectGovernance["risks"][number], "owner">) => ({
      ...row,
      // A removed member keeps their place here as "Former member" rather than
      // becoming a blank: nulling ownership when someone leaves would erase who
      // was accountable.
      owner: row.owner_id ? (memberNames.get(row.owner_id) ?? "Former member") : "Unassigned",
    })),
    decisions: decisions.data ?? [],
    approvals: approvals.data ?? [],
    artefacts: artefacts.data ?? [],
  };
```

- [ ] **Step 2: Rewrite the create actions and add update/delete**

In `features/delivery/actions/project-governance.ts`:

Add the import beneath the existing ones:

```ts
import { readArtefactFields, readRiskFields } from "../governance-fields";
```

Replace the whole `createRiskAction` function with:

```ts
export async function createRiskAction(
  projectId: string,
  _previous: GovernanceActionState | undefined,
  form: FormData,
): Promise<GovernanceActionState> {
  const fields = readRiskFields(form);
  if ("error" in fields) return { error: fields.error };
  const ctx = await context(projectId);
  if (!ctx) return { error: "That project is invalid." };
  const { error } = await ctx.supabase
    .from("project_risks")
    .insert({
      organization_id: ctx.organization.id,
      project_id: projectId,
      ...fields,
    });
  if (error) return { error: "The risk could not be recorded." };
  revalidatePath(`/operations/projects/${projectId}`);
  return { success: "Risk recorded." };
}

export async function updateRiskAction(
  riskId: string,
  _previous: GovernanceActionState | undefined,
  form: FormData,
): Promise<GovernanceActionState> {
  if (!isUuid(riskId)) return { error: "That risk is invalid." };
  const fields = readRiskFields(form);
  if ("error" in fields) return { error: fields.error };
  const { organization } = await getSessionContext();
  const supabase = (await createServerSupabase()) as any;
  // organization_id is redundant with RLS and stated anyway. .select() is what
  // distinguishes "saved" from "matched nothing": RLS and the organisation
  // filter both express "not yours" as zero rows, not as an error.
  const { data, error } = await supabase
    .from("project_risks")
    .update(fields)
    .eq("id", riskId)
    .eq("organization_id", organization.id)
    .select("project_id")
    .maybeSingle();
  if (error || !data) return { error: "The risk could not be updated." };
  revalidatePath(`/operations/projects/${data.project_id}`);
  return { success: "Risk updated." };
}

export async function deleteRiskAction(
  riskId: string,
  _previous: GovernanceActionState | undefined,
  _form: FormData,
): Promise<GovernanceActionState> {
  if (!isUuid(riskId)) return { error: "That risk is invalid." };
  const { organization } = await getSessionContext();
  const supabase = (await createServerSupabase()) as any;
  const { data, error } = await supabase
    .from("project_risks")
    .delete()
    .eq("id", riskId)
    .eq("organization_id", organization.id)
    .select("id, project_id");
  if (error) return { error: "The risk could not be removed." };
  if (!data || data.length === 0)
    return { error: "That risk no longer exists, or is not yours." };
  revalidatePath(`/operations/projects/${data[0].project_id}`);
  return { success: "Risk removed." };
}
```

Replace the whole `createArtefactAction` function with the version below, and add the two new functions after it:

```ts
export async function createArtefactAction(
  projectId: string,
  _previous: GovernanceActionState | undefined,
  form: FormData,
): Promise<GovernanceActionState> {
  const fields = readArtefactFields(form);
  if ("error" in fields) return { error: fields.error };
  const ctx = await context(projectId);
  if (!ctx) return { error: "That project is invalid." };
  const { error } = await ctx.supabase
    .from("governance_artefacts")
    .insert({
      organization_id: ctx.organization.id,
      project_id: projectId,
      ...fields,
      uploaded_by: ctx.user.id,
    });
  if (error) return { error: "The evidence could not be attached." };
  revalidatePath(`/operations/projects/${projectId}`);
  return { success: "Evidence attached." };
}

export async function updateArtefactAction(
  artefactId: string,
  _previous: GovernanceActionState | undefined,
  form: FormData,
): Promise<GovernanceActionState> {
  if (!isUuid(artefactId)) return { error: "That evidence is invalid." };
  const fields = readArtefactFields(form);
  if ("error" in fields) return { error: fields.error };
  const { organization } = await getSessionContext();
  const supabase = (await createServerSupabase()) as any;
  // uploaded_by is set at creation and deliberately absent from this update.
  const { data, error } = await supabase
    .from("governance_artefacts")
    .update(fields)
    .eq("id", artefactId)
    .eq("organization_id", organization.id)
    .select("project_id")
    .maybeSingle();
  if (error || !data) return { error: "The evidence could not be updated." };
  if (data.project_id) revalidatePath(`/operations/projects/${data.project_id}`);
  return { success: "Evidence updated." };
}

export async function deleteArtefactAction(
  artefactId: string,
  _previous: GovernanceActionState | undefined,
  _form: FormData,
): Promise<GovernanceActionState> {
  if (!isUuid(artefactId)) return { error: "That evidence is invalid." };
  const { organization } = await getSessionContext();
  const supabase = (await createServerSupabase()) as any;
  // Any requirement links to this evidence are removed with it: requirement_evidence
  // cascades from governance_artefacts.
  const { data, error } = await supabase
    .from("governance_artefacts")
    .delete()
    .eq("id", artefactId)
    .eq("organization_id", organization.id)
    .select("id, project_id");
  if (error) return { error: "The evidence could not be removed." };
  if (!data || data.length === 0)
    return { error: "That evidence no longer exists, or is not yours." };
  if (data[0].project_id) revalidatePath(`/operations/projects/${data[0].project_id}`);
  return { success: "Evidence removed." };
}
```

The `value` and `optional` helpers at the top of the file are still used by `createDecisionAction` and `createApprovalAction`; leave them.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors. (`project-governance-panel.tsx` still passes `governance.risks` to the old register, which only reads fields that still exist, so it stays valid until Task 5.)

- [ ] **Step 4: Verify and commit**

Run: `pnpm test && pnpm build`
Expected: suite passes; build clean.

```bash
git add features/delivery/queries/get-project-governance.ts features/delivery/actions/project-governance.ts
git commit -m "feat(governance): resolve risk owners, validate risk and evidence input, add update and delete actions"
```

---

### Task 5: The Risks register

**Files:**
- Create: `features/delivery/components/governance-form-parts.tsx`
- Create: `features/delivery/components/project-risks-register.tsx`
- Modify: `features/delivery/components/project-governance-panel.tsx`
- Modify: `features/delivery/components/project-detail-screen.tsx`
- Modify: `tests/unit/ui-completeness.test.ts`

**Interfaces:**
- Consumes: `createRiskAction`, `updateRiskAction`, `deleteRiskAction`, `GovernanceActionState` (Task 4); `RISK_PROBABILITIES`, `RISK_IMPACTS`, `RISK_STATUSES` (Task 3); `ProjectGovernance['risks']` with `owner_id` and `owner` (Task 4); `selectOwnerOptions` and `SelectableMember` from `features/delivery/form-options.ts` (already exist).
- Produces: `ProjectRisksRegister({ projectId, risks, members })`; `ProjectGovernancePanel` gains a `members: SelectableMember[]` prop; `Feedback`, `input` and `area` exported from `governance-form-parts.tsx`.

**`members` must be the RAW `OrganizationMember[]` from `listOrganizationMembers()`**: every member regardless of status, unfiltered and unmapped. `selectOwnerOptions` does its own active-filtering and retention; pre-filtering leaves it nothing to retain a removed owner against. `project-detail-screen.tsx` already receives exactly this list as `members`.

- [ ] **Step 1: Read the pattern**

Read `features/delivery/components/project-requirements-panel.tsx` in full: this register's table, inline edit row, add form and delete button follow it closely, including the `useEffect` that closes the edit form on a successful save. Do not modify that file.

- [ ] **Step 2: Write the shared form parts**

Create `features/delivery/components/governance-form-parts.tsx`:

```tsx
import type { GovernanceActionState } from "../actions/project-governance";

// Shared by the Governance registers. A plain module with no directive: it holds
// no state and is imported by client components only.
export const input =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-brand";
export const area = `${input} min-h-24 py-2`;

export function Feedback({ state }: { state: GovernanceActionState | undefined }) {
  return state?.error ? (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  ) : state?.success ? (
    <p role="status" className="text-sm text-success">
      {state.success}
    </p>
  ) : null;
}
```

- [ ] **Step 3: Write the guard tests (failing)**

Add to `tests/unit/ui-completeness.test.ts` (it already imports `readFileSync`, `join`, `assert`, and defines `workspace`):

```ts
test('the risk register retains a removed owner rather than silently dropping the selection', () => {
  // A bare /selectOwnerOptions/ match is satisfied by the add form's
  // zero-argument call, so it would pass with the edit form's retention
  // argument dropped entirely. Tie each form to its real call.
  const register = readFileSync(join(workspace, 'features', 'delivery', 'components', 'project-risks-register.tsx'), 'utf8')
  assert.match(register, /selectOwnerOptions\(\s*members\s*,\s*risk\.owner_id\s*,?\s*\)/, 'the edit form must forward risk.owner_id into selectOwnerOptions, not drop it')
  assert.match(register, /selectOwnerOptions\(members\)/, 'the add form must offer active members only')
})

test('the governance panel is handed the raw, unfiltered member list', () => {
  // selectOwnerOptions filters and retains internally; a list filtered on the way
  // in would leave it nothing to retain a removed owner against.
  const screen = readFileSync(join(workspace, 'features', 'delivery', 'components', 'project-detail-screen.tsx'), 'utf8')
  // [^>]* cannot cross the end of the element's own opening tag. A looser
  // [\s\S]*? would also match the later <ProjectRequirementsPanel ... members={members}>
  // and pass even if Governance were never given the list.
  assert.match(screen, /<ProjectGovernancePanel[^>]*\bmembers=\{members\}/, 'ProjectGovernancePanel must receive members={members} straight through')
})
```

Run: `node --test --experimental-strip-types tests/unit/ui-completeness.test.ts`
Expected: the two new tests FAIL (the register file does not exist and the screen does not yet pass `members`); every other test still passes.

- [ ] **Step 4: Build the register**

Create `features/delivery/components/project-risks-register.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createRiskAction,
  deleteRiskAction,
  updateRiskAction,
} from "../actions/project-governance";
import { selectOwnerOptions, type SelectableMember } from "../form-options";
import {
  RISK_IMPACTS,
  RISK_PROBABILITIES,
  RISK_STATUSES,
} from "../governance-vocabulary";
import type { ProjectGovernance } from "../queries/get-project-governance";
import { SectionCard } from "./delivery-primitives";
import { area, Feedback, input } from "./governance-form-parts";

type Risk = ProjectGovernance["risks"][number];

/**
 * The Risks register: full CRUD across all eight stored fields. Like the
 * Requirements register it replaces a row with its edit form in place, rather
 * than using the read-only Register the other Governance tabs share.
 */
export function ProjectRisksRegister({
  projectId,
  risks,
  members,
}: {
  projectId: string;
  risks: Risk[];
  members: SelectableMember[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <SectionCard
      title="Risk register"
      description="Project threats, exposure and mitigation ownership"
    >
      {risks.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/35 text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Probability</th>
                <th className="px-4 py-3">Impact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Target date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {risks.map((risk) =>
                editingId === risk.id ? (
                  <tr key={risk.id} className="border-t border-border">
                    <td colSpan={7} className="p-0">
                      <EditRiskForm
                        risk={risk}
                        members={members}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={risk.id} className="border-t border-border">
                    <td className="px-4 py-3 text-sm font-medium">{risk.title}</td>
                    <td className="px-4 py-3 text-sm">{risk.probability}</td>
                    <td className="px-4 py-3 text-sm">{risk.impact}</td>
                    <td className="px-4 py-3 text-sm">{risk.status}</td>
                    <td className="px-4 py-3 text-sm">{risk.owner}</td>
                    <td className="px-4 py-3 text-sm">{risk.target_date ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(risk.id)}
                          className="border border-border px-3 py-1.5 text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <DeleteRiskButton risk={risk} />
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">No risks recorded</p>
      )}
      <AddRiskForm projectId={projectId} members={members} />
    </SectionCard>
  );
}

function AddRiskForm({
  projectId,
  members,
}: {
  projectId: string;
  members: SelectableMember[];
}) {
  const [state, action, pending] = useActionState(
    createRiskAction.bind(null, projectId),
    undefined,
  );
  // No current owner yet, so the retention branch never fires: every option
  // offered is a genuinely active member.
  const addOwnerOptions = selectOwnerOptions(members);
  return (
    <form
      action={action}
      className="grid gap-3 border-t border-border p-5 md:grid-cols-2"
    >
      <input
        name="title"
        required
        placeholder="Risk title"
        className={input}
      />
      <div className="grid grid-cols-3 gap-3">
        <select name="probability" defaultValue="Possible" className={input}>
          {RISK_PROBABILITIES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select name="impact" defaultValue="Moderate" className={input}>
          {RISK_IMPACTS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select name="status" defaultValue="Open" className={input}>
          {RISK_STATUSES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
      <textarea
        name="description"
        placeholder="Risk description"
        className={area}
      />
      <textarea
        name="mitigation"
        placeholder="Mitigation plan"
        className={area}
      />
      <select name="ownerId" defaultValue="" className={input}>
        <option value="">Unassigned</option>
        {addOwnerOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <input name="targetDate" type="date" className={input} />
      <div>
        <Feedback state={state} />
        <button
          disabled={pending}
          className="mt-2 bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Add risk
        </button>
      </div>
    </form>
  );
}

function EditRiskForm({
  risk,
  members,
  onCancel,
}: {
  risk: Risk;
  members: SelectableMember[];
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(
    updateRiskAction.bind(null, risk.id),
    undefined,
  );
  // React resets an action-bound form's uncontrolled fields to their
  // defaultValue after a successful action, and the refreshed props can arrive
  // after that reset, so a form left open shows the pre-edit value even though
  // the write succeeded. Closing on success avoids the stale reset entirely.
  useEffect(() => {
    if (state?.success) onCancel();
  }, [state, onCancel]);
  // The current owner, even one since removed from the organisation, must still
  // appear: an HTML select whose defaultValue matches no option falls back to
  // its first option (Unassigned), and saving would silently erase who owned it.
  const editOwnerOptions = selectOwnerOptions(members, risk.owner_id);
  return (
    <form
      action={action}
      className="grid gap-3 border-t border-border bg-muted/20 p-5 md:grid-cols-2"
    >
      <input
        name="title"
        required
        defaultValue={risk.title}
        placeholder="Risk title"
        className={input}
      />
      <div className="grid grid-cols-3 gap-3">
        <select name="probability" defaultValue={risk.probability} className={input}>
          {RISK_PROBABILITIES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select name="impact" defaultValue={risk.impact} className={input}>
          {RISK_IMPACTS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select name="status" defaultValue={risk.status} className={input}>
          {RISK_STATUSES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </div>
      <textarea
        name="description"
        defaultValue={risk.description ?? ""}
        placeholder="Risk description"
        className={area}
      />
      <textarea
        name="mitigation"
        defaultValue={risk.mitigation ?? ""}
        placeholder="Mitigation plan"
        className={area}
      />
      <select name="ownerId" defaultValue={risk.owner_id ?? ""} className={input}>
        <option value="">Unassigned</option>
        {editOwnerOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <input
        name="targetDate"
        type="date"
        defaultValue={risk.target_date ?? ""}
        className={input}
      />
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <Feedback state={state} />
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-border px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            disabled={pending}
            className="bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Save changes
          </button>
        </div>
      </div>
    </form>
  );
}

function DeleteRiskButton({ risk }: { risk: Risk }) {
  const [state, action, pending] = useActionState(
    deleteRiskAction.bind(null, risk.id),
    undefined,
  );
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Remove "${risk.title}"? This cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive"
      >
        Remove
      </button>
      {state?.error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 5: Wire the panel**

In `features/delivery/components/project-governance-panel.tsx`:

1. Replace the import block and the constants at the top of the file (everything from `import { useActionState, useState } from "react";` down to and including `const area = ...;`) with:

```tsx
import { useActionState, useState } from "react";
import {
  createApprovalAction,
  createArtefactAction,
  createDecisionAction,
} from "../actions/project-governance";
import type { SelectableMember } from "../form-options";
import type { getProjectGovernance } from "../queries/get-project-governance";
import { SectionCard } from "./delivery-primitives";
import { area, Feedback, input } from "./governance-form-parts";
import { ProjectRisksRegister } from "./project-risks-register";

type Governance = Awaited<ReturnType<typeof getProjectGovernance>>;
const tabs = ["Gates & approvals", "Risks", "Decisions", "Evidence"] as const;
```

(The file's first line, `"use client";`, stays.)

2. Give the component a `members` prop. Change

```tsx
export function ProjectGovernancePanel({
  projectId,
  governance,
}: {
  projectId: string;
  governance: Governance;
}) {
```

to

```tsx
export function ProjectGovernancePanel({
  projectId,
  governance,
  members,
}: {
  projectId: string;
  governance: Governance;
  members: SelectableMember[];
}) {
```

3. In the tab switch, replace `<RiskRegister projectId={projectId} rows={governance.risks} />` with:

```tsx
        <ProjectRisksRegister
          projectId={projectId}
          risks={governance.risks}
          members={members}
        />
```

4. Delete the local `function Feedback(...) { ... }` (it now comes from `governance-form-parts.tsx`) and delete the whole `function RiskRegister(...) { ... }`.

Nothing else in this file changes: `ApprovalRegister`, `DecisionRegister`, `EvidenceRegister` and `Register` stay as they are.

- [ ] **Step 6: Wire the screen**

In `features/delivery/components/project-detail-screen.tsx`, change

```tsx
          <ProjectGovernancePanel projectId={project.id} governance={governance} />
```

to

```tsx
          <ProjectGovernancePanel projectId={project.id} governance={governance} members={members} />
```

`members` is already a prop of `ProjectDetailScreen` (the raw `OrganizationMember[]`).

- [ ] **Step 7: Run the guards and prove they bite**

Run: `node --test --experimental-strip-types tests/unit/ui-completeness.test.ts`
Expected: PASS, including the two new tests.

Prove the retention guard: temporarily change the edit form's `selectOwnerOptions(members, risk.owner_id)` to `selectOwnerOptions(members)` in `project-risks-register.tsx`, re-run, and confirm the first new test now FAILS with "the edit form must forward risk.owner_id". Restore the line and confirm it passes again. Paste both real outputs into the task report.

- [ ] **Step 8: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 errors; suite passes; build clean.

```bash
git add features/delivery/components/governance-form-parts.tsx features/delivery/components/project-risks-register.tsx features/delivery/components/project-governance-panel.tsx features/delivery/components/project-detail-screen.tsx tests/unit/ui-completeness.test.ts
git commit -m "feat(governance): risks get edit, delete, an owner picker and a status that moves"
```

---

### Task 6: The Evidence register, follow-ups and signed-in verification

**Files:**
- Create: `features/delivery/components/project-evidence-register.tsx`
- Modify: `features/delivery/components/project-governance-panel.tsx`
- Modify: `tests/unit/ui-completeness.test.ts`
- Modify: `docs/follow-ups.md`

**Interfaces:**
- Consumes: `createArtefactAction`, `updateArtefactAction`, `deleteArtefactAction` (Task 4); `area`, `Feedback`, `input` (Task 5); `ProjectGovernance['artefacts']`.
- Produces: `ProjectEvidenceRegister({ projectId, artefacts })`.

- [ ] **Step 1: Write the guard test (failing)**

Add to `tests/unit/ui-completeness.test.ts`:

```ts
test('the evidence register warns that removing evidence also removes its requirement links', () => {
  // True because requirement_evidence cascades from governance_artefacts (proved
  // by tests/integration/rls/traceability.test.ts). A PM deleting evidence would
  // otherwise lose Traceability coverage with no warning.
  const register = readFileSync(join(workspace, 'features', 'delivery', 'components', 'project-evidence-register.tsx'), 'utf8')
  assert.match(register, /any requirement links to it are removed too/)
})
```

Run: `node --test --experimental-strip-types tests/unit/ui-completeness.test.ts`
Expected: the new test FAILS (the file does not exist yet).

- [ ] **Step 2: Build the register**

Create `features/delivery/components/project-evidence-register.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createArtefactAction,
  deleteArtefactAction,
  updateArtefactAction,
} from "../actions/project-governance";
import type { ProjectGovernance } from "../queries/get-project-governance";
import { SectionCard } from "./delivery-primitives";
import { area, Feedback, input } from "./governance-form-parts";

type Artefact = ProjectGovernance["artefacts"][number];

/**
 * The Evidence register: attach, edit and remove project-scoped evidence links.
 * Rows replace themselves with an edit form in place, as the Requirements and
 * Risks registers do.
 */
export function ProjectEvidenceRegister({
  projectId,
  artefacts,
}: {
  projectId: string;
  artefacts: Artefact[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <SectionCard
      title="Governance evidence"
      description="Controlled links to artefacts supporting gates and approvals"
    >
      {artefacts.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/35 text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3">Artefact</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {artefacts.map((artefact) =>
                editingId === artefact.id ? (
                  <tr key={artefact.id} className="border-t border-border">
                    <td colSpan={4} className="p-0">
                      <EditArtefactForm
                        artefact={artefact}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={artefact.id} className="border-t border-border">
                    <td className="px-4 py-3 text-sm">
                      {artefact.external_url ? (
                        <a
                          href={artefact.external_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-brand"
                        >
                          {artefact.name}
                        </a>
                      ) : (
                        artefact.name
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">{artefact.notes ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      {new Date(artefact.created_at).toLocaleDateString("en-ZA")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(artefact.id)}
                          className="border border-border px-3 py-1.5 text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <DeleteArtefactButton artefact={artefact} />
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">No records yet.</p>
      )}
      <AddArtefactForm projectId={projectId} />
    </SectionCard>
  );
}

function AddArtefactForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(
    createArtefactAction.bind(null, projectId),
    undefined,
  );
  return (
    <form
      action={action}
      className="grid gap-3 border-t border-border p-5 md:grid-cols-2"
    >
      <input
        name="name"
        required
        placeholder="Artefact name"
        className={input}
      />
      <input
        name="externalUrl"
        required
        type="url"
        placeholder="https://…"
        className={input}
      />
      <textarea name="notes" placeholder="Evidence notes" className={area} />
      <div>
        <Feedback state={state} />
        <button
          disabled={pending}
          className="mt-2 bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Attach evidence
        </button>
      </div>
    </form>
  );
}

function EditArtefactForm({
  artefact,
  onCancel,
}: {
  artefact: Artefact;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(
    updateArtefactAction.bind(null, artefact.id),
    undefined,
  );
  // Close on success: React resets an action-bound form's uncontrolled fields to
  // their defaultValue afterwards, so a form left open would show the pre-edit
  // values even though the write succeeded.
  useEffect(() => {
    if (state?.success) onCancel();
  }, [state, onCancel]);
  return (
    <form
      action={action}
      className="grid gap-3 border-t border-border bg-muted/20 p-5 md:grid-cols-2"
    >
      <input
        name="name"
        required
        defaultValue={artefact.name}
        placeholder="Artefact name"
        className={input}
      />
      <input
        name="externalUrl"
        required
        type="url"
        defaultValue={artefact.external_url ?? ""}
        placeholder="https://…"
        className={input}
      />
      <textarea
        name="notes"
        defaultValue={artefact.notes ?? ""}
        placeholder="Evidence notes"
        className={area}
      />
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <Feedback state={state} />
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-border px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            disabled={pending}
            className="bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Save changes
          </button>
        </div>
      </div>
    </form>
  );
}

function DeleteArtefactButton({ artefact }: { artefact: Artefact }) {
  const [state, action, pending] = useActionState(
    deleteArtefactAction.bind(null, artefact.id),
    undefined,
  );
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Remove "${artefact.name}"? This cannot be undone, and any requirement links to it are removed too.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive"
      >
        Remove
      </button>
      {state?.error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 3: Wire the panel**

In `features/delivery/components/project-governance-panel.tsx`:

1. Add `import { ProjectEvidenceRegister } from "./project-evidence-register";` beside the `ProjectRisksRegister` import.
2. In the tab switch, replace `<EvidenceRegister projectId={projectId} rows={governance.artefacts} />` with:

```tsx
        <ProjectEvidenceRegister
          projectId={projectId}
          artefacts={governance.artefacts}
        />
```

3. Delete the whole `function EvidenceRegister(...) { ... }`.
4. Remove `createArtefactAction` from the `../actions/project-governance` import (nothing in this file uses it any more) and remove any other import the file no longer uses.

`ApprovalRegister`, `DecisionRegister` and `Register` stay as they are.

- [ ] **Step 4: Record the follow-ups**

Append to `docs/follow-ups.md`:

```markdown

## From the governance parity slice (2026-09-20)

Risks and Evidence now have full CRUD, Risks has an owner picker with removed-owner retention and a
status that can move, and every Governance table has RLS coverage. What that slice deliberately left,
and what its tests found:

- **Decisions and Approvals are still create-only** and are their own slice. Open questions for it: whether
  a recorded decision may be edited or deleted at all (it is a log), whether an approval may be edited
  only while Draft, whether only Drafts may be deleted (with Withdraw for the rest), and how an approver
  is assigned.
- **Approval history is not append-only.** `approval_decisions` is meant to be immutable (the migration that
  created it says "History rows are append-only") but gets the same four policies as every other table, so any
  active member can rewrite or delete it; an audit trigger records the change and nothing prevents it.
  `tests/integration/rls/governance-registers.test.ts` states the intended behaviour as a `todo` test that
  fails today. Fix it by dropping the update and delete policies (and the UPDATE and DELETE grants) on that
  table, in the Approvals slice.
- **The project panel's approval submit writes no history.** `createApprovalAction` sets status Pending but,
  unlike `createStandaloneApprovalAction` in the Approvals module, never writes the "Submitted"
  `approval_decisions` row, though the register describes itself as having "durable status history".
- **`governance_gates` has RLS tests but no UI.** Gates are seeded per framework and cannot be managed
  from anywhere.
- **`risk-severity.ts` keeps its own private copy of the probability and impact vocabularies.** They match the
  check constraints today; `governance-vocabulary.ts` is now the tested statement of them and the two could
  share it.
```

- [ ] **Step 5: Run the guard and prove it bites**

Run: `node --test --experimental-strip-types tests/unit/ui-completeness.test.ts`
Expected: PASS, including the new evidence test.

Prove it: temporarily delete the words `, and any requirement links to it are removed too` from the confirm message, re-run, confirm the new test FAILS, restore, confirm it passes. Paste both outputs into the report.

- [ ] **Step 6: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 errors; suite passes; build clean.

```bash
git add features/delivery/components/project-evidence-register.tsx features/delivery/components/project-governance-panel.tsx tests/unit/ui-completeness.test.ts docs/follow-ups.md
git commit -m "feat(governance): evidence gets edit and delete; record the governance follow-ups"
```

- [ ] **Step 7: Signed-in verification**

Controller-run against `unison-uat` (production). Do not insert fixtures through SQL: create everything through the UI, and remove it through the UI afterwards. **Render every page named here**: typecheck, unit tests and `next build` all passed on an earlier slice while its detail page threw on every request.

- [ ] Open a project's **Governance** tab, then each sub-tab (Gates & approvals, Risks, Decisions, Evidence): all four render with no error.
- [ ] Risks: add a risk with status Mitigating and an owner; confirm the row shows the owner's name, the status and the target date.
- [ ] Edit it: move the status through Accepted and Closed, change the impact, set the owner back to Unassigned. Confirm the form closes on each save and the row shows the new values (not the old ones).
- [ ] Open Edit on every other existing risk, including any with no owner; each opens without error and Save changes with no edits succeeds.
- [ ] Remove a risk; the confirmation names it and says it cannot be undone.
- [ ] Evidence: attach an item, edit its name and notes, try saving `http://example.com` and confirm "Use a valid HTTPS evidence URL." rather than a database error.
- [ ] If any evidence is linked to a requirement on the Traceability tab, remove it and confirm the confirmation mentioned requirement links and the link is gone.
- [ ] Check the dev server logs for anything unexpected, then remove every record created for this verification.
