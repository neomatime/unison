# Project Prerequisites and Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A PM can declare that one project is a prerequisite of another, and see the resulting cross-project risk on the project page with a status that cannot go stale.

**Architecture:** One `project_dependencies` edge table whose three declarative rules make invalid states unrepresentable, plus a trigger for the one rule Postgres cannot express declaratively. Status is derived by a pure function, never stored. The UI is a fourth tab on the existing project detail screen.

**Tech Stack:** Next.js 16 App Router, React 19 server actions, Supabase Postgres 17 with RLS, zod, `node:test`.

## Global Constraints

- A field in the UI is a claim that the product supports that capability.
- Integrity rules are enforced **structurally, not only in the UI** (requirement §6).
- **Status is derived, never stored.** A stored status goes stale silently, which is the failure this whole feature exists to remove.
- Every non-Satisfied status carries a **reason** naming the prerequisite and what it has not reached (requirement §3). A badge without its reason is what the requirement explicitly refuses.
- Delivery-item and project health vocabularies are unchanged by this slice.
- Migrations are **append-only**; never edit one that has been applied.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- `features/product-ui/components/record-collection-workspace.tsx` must not be modified.
- Never run `git add -A`, `git checkout .`, `git restore .`, `git stash` or `git clean` in this repo — untracked `public/*.png` files belong to the user and must survive. Stage files by explicit path.

---

## A decision this plan makes, which departs from the spec's letter

The spec says all three new pickers "go through the retention pattern in `features/delivery/form-options.ts`". **Re-examined against the actual scope, that is not buildable as written**, and building it anyway would add three unused functions.

Retention exists to stop an HTML `select` whose `defaultValue` matches no option falling back to its first and writing the wrong value. **That failure requires an edit form with an existing value.** This slice ships add-and-remove only — the spec's own scope section — so every picker starts empty and no `defaultValue` exists to mismatch.

What *is* in scope, and carries the same intent, is the **display** half: a dependency whose owner has since been removed, or whose required phase has since been archived, must still render that person's or phase's name, labelled, rather than a blank or a raw uuid. Task 5 handles it there.

**When an edit path is added, the picker retention functions come with it.** Recorded in `docs/follow-ups.md` by Task 7 so it is a deferred decision rather than a dropped requirement.

---

## File Structure

**Create**
- `supabase/migrations/20260907100000_project_dependencies.sql` — table, declarative constraints, RLS, audit and updated-at triggers
- `supabase/migrations/20260907100500_project_dependency_cycle_guard.sql` — the cycle trigger and its advisory lock, separate so the two can be reviewed and reverted independently
- `features/delivery/dependency-status.ts` — the pure derivation, no `server-only`
- `features/delivery/schemas/project-dependency.ts` — zod input schema
- `features/delivery/queries/list-project-dependencies.ts` — both directions for one project
- `features/delivery/queries/list-dependency-form-options.ts` — candidate prerequisites, their phases, members
- `features/delivery/actions/create-project-dependency.ts`
- `features/delivery/actions/delete-project-dependency.ts`
- `features/delivery/components/project-dependencies-panel.tsx`
- `tests/unit/dependency-status.test.ts`
- `tests/integration/rls/project-dependencies.test.ts`

**Modify**
- `features/delivery/components/project-detail-screen.tsx` — a fourth tab
- `app/(unison)/operations/projects/[projectId]/page.tsx` — fetch and pass the dependencies
- `docs/follow-ups.md` — Task 7

---

### Task 1: The table and its three declarative rules

**Files:**
- Create: `supabase/migrations/20260907100000_project_dependencies.sql`
- Test: `tests/integration/rls/project-dependencies.test.ts`

**Interfaces:**
- Produces: table `public.project_dependencies` with columns `id`, `organization_id`, `dependent_project_id`, `prerequisite_project_id`, `prerequisite_framework_id`, `relationship_type`, `required_status`, `required_phase_id`, `dependency_owner_id`, `criticality`, `required_by_date`, `notes`, `created_at`, `updated_at`.
- Constraint names later tasks assert on: `project_dependencies_no_self_check`, `project_dependencies_required_state_check`, `project_dependencies_unique`, `project_dependencies_dependent_fkey`, `project_dependencies_prerequisite_fkey`, `project_dependencies_prerequisite_framework_fkey`, `project_dependencies_phase_fkey`, `project_dependencies_owner_fkey`.

- [ ] **Step 1: Read the pattern this follows**

Read `supabase/migrations/20260906150000_delivery_items.sql` in full before writing anything. It is the closest precedent: composite foreign keys that make invalid states unrepresentable, a denormalised `framework_id` kept honest by a composite key, RLS policies using `public.is_member_of`, and the audit and updated-at triggers.

Note that it already added `projects_id_org_unique (id, organization_id)` and `projects_id_framework_unique (id, framework_id)`. **Both composite targets you need already exist.** Do not add them again — a duplicate `alter table ... add constraint` will fail.

`framework_phases_framework_id_unique (framework_id, id)` exists from `20260826103710_delivery_frameworks.sql`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260907100000_project_dependencies.sql`:

```sql
-- Project-to-project prerequisites. The value is not recording a dependency; it
-- is making downstream project risk visible and governable. See
-- docs/project-dependencies.md.
--
-- Three of the four integrity rules from §6 are declarative and live here. The
-- fourth -- no cycles -- cannot be expressed as a constraint and arrives in
-- 20260907100500_project_dependency_cycle_guard.sql.
create table public.project_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  dependent_project_id uuid not null,
  prerequisite_project_id uuid not null,
  -- Denormalised from the prerequisite project, exactly as delivery_items does
  -- with framework_id: it is what makes the phase key below expressible.
  -- project_dependencies_prerequisite_framework_fkey keeps it honest.
  prerequisite_framework_id uuid not null,
  -- A column, not a hardcoded assumption, so §8's further types (Dependency,
  -- Related Project, Successor/Predecessor) are an additive change to this
  -- check rather than a rebuild. One value until demand is validated.
  relationship_type text not null default 'Prerequisite',
  -- Exactly one of these is set. A single polymorphic text column would be
  -- unvalidatable, and would make Satisfied underivable.
  required_status text,
  required_phase_id uuid,
  dependency_owner_id uuid,
  criticality text not null default 'Standard',
  required_by_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_dependencies_type_check check (relationship_type in ('Prerequisite')),
  -- 'Active' means started, 'Complete' means completed -- the two entries in
  -- §2's list that are project statuses rather than phase names. 'On Hold' and
  -- 'Cancelled' are not coherent as things to *require* of a prerequisite.
  constraint project_dependencies_required_status_check
    check (required_status is null or required_status in ('Active', 'Complete')),
  constraint project_dependencies_criticality_check check (criticality in ('Standard', 'Critical')),
  constraint project_dependencies_no_self_check
    check (dependent_project_id <> prerequisite_project_id),
  -- Exactly one, never both, never neither.
  constraint project_dependencies_required_state_check check (
    (required_status is not null and required_phase_id is null)
    or (required_status is null and required_phase_id is not null)
  ),
  constraint project_dependencies_unique
    unique (organization_id, dependent_project_id, prerequisite_project_id, relationship_type),

  constraint project_dependencies_organization_fkey foreign key (organization_id)
    references public.organizations (id) on delete cascade,
  -- Both sides tenant-pinned. This is what makes a cross-tenant dependency
  -- unrepresentable rather than merely rejected: there is no pair of values
  -- naming projects in two different organisations that satisfies both keys.
  constraint project_dependencies_dependent_fkey
    foreign key (dependent_project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade,
  constraint project_dependencies_prerequisite_fkey
    foreign key (prerequisite_project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade,
  -- Ties the denormalised framework to the prerequisite project that owns it.
  constraint project_dependencies_prerequisite_framework_fkey
    foreign key (prerequisite_project_id, prerequisite_framework_id)
    references public.projects (id, framework_id),
  -- A required phase must belong to the PREREQUISITE'S OWN framework. Without
  -- this, a dependency could require "Build" from an unrelated framework and
  -- would never be satisfiable by any state the prerequisite can reach.
  constraint project_dependencies_phase_fkey
    foreign key (prerequisite_framework_id, required_phase_id)
    references public.framework_phases (framework_id, id),
  constraint project_dependencies_owner_fkey
    foreign key (organization_id, dependency_owner_id)
    references public.memberships (organization_id, user_id)
    on delete set null (dependency_owner_id)
);

comment on table public.project_dependencies is
  'Project-to-project prerequisites. Status is derived, never stored: see features/delivery/dependency-status.ts.';
comment on constraint project_dependencies_phase_fkey on public.project_dependencies is
  'A required phase must belong to the prerequisite project''s own framework, so the required state is always something that project can actually reach.';

create index project_dependencies_dependent_idx
  on public.project_dependencies (dependent_project_id);
create index project_dependencies_prerequisite_idx
  on public.project_dependencies (prerequisite_project_id);

alter table public.project_dependencies enable row level security;

create policy project_dependencies_select on public.project_dependencies
  for select using (public.is_member_of(organization_id));
create policy project_dependencies_insert on public.project_dependencies
  for insert with check (public.is_member_of(organization_id));
create policy project_dependencies_update on public.project_dependencies
  for update using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));
-- A delete policy, unlike projects/frameworks/delivery_items. A dependency is an
-- edge: it either holds or it does not, it has no children to orphan, and an
-- archived edge answers no question a deleted one does not. Hard delete is also
-- why project_dependencies_unique can stay simple -- a soft-deleted duplicate
-- would otherwise block its own recreation.
create policy project_dependencies_delete on public.project_dependencies
  for delete using (public.is_member_of(organization_id));

create trigger project_dependencies_audit
  after insert or delete or update on public.project_dependencies
  for each row execute function public.record_audit_event();
create trigger project_dependencies_set_updated_at
  before update on public.project_dependencies
  for each row execute function public.set_updated_at();
```

- [ ] **Step 3: Apply it**

Apply the migration to the `unison-uat` Supabase project the way this repo already applies migrations. Confirm the table exists and report how you applied it.

- [ ] **Step 4: Write the RLS tests**

Create `tests/integration/rls/project-dependencies.test.ts`, following the fixture style of `tests/integration/rls/delivery-items.test.ts` — read that file first for `createFixtureOrg`, `createFixtureUser`, `signedInClient`, `admin` and `cleanup`.

**Assert the constraint NAME, not only the SQLSTATE.** This table has five foreign keys that all raise `23503` and three checks that all raise `23514`; a test matching only the code passes when the wrong rule fires. This exact gap was a review finding on the delivery-items slice.

```ts
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

  for (const [name, target] of [['PD A', 'a'], ['PD B', 'b']] as const) {
    const project = await admin.from('projects')
      .insert({ organization_id: orgId, name, status: 'Active', health: 'On Track', framework_id: frameworkId })
      .select('id').single()
    if (project.error) throw project.error
    if (target === 'a') projectA = project.data.id
    else projectB = project.data.id
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
  assert.match(error!.message, /project_dependencies_no_self_check/)
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
```

- [ ] **Step 5: Run them**

Run: `pnpm test:rls`
Expected: the whole suite passes, including all twelve new tests.

If any fail with `AuthApiError: 429`, that is Supabase auth rate-limiting, not a real failure — the `--test-concurrency=1` flag in the `test:rls` script exists for it. Report it rather than treating it as a footnote.

- [ ] **Step 6: Prove the two rules that matter most**

Cross-tenant and same-framework-phase are the rules that make invalid states unrepresentable. Prove each by **temporarily** dropping the constraint in the live database, re-running that one test, and confirming it fails — then re-add the constraint and confirm it passes.

Do this with `alter table ... drop constraint` / `add constraint` issued directly, **not** by editing the applied migration file, which is append-only. Paste the real failure output into your report.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260907100000_project_dependencies.sql tests/integration/rls/project-dependencies.test.ts
git commit -m "feat(dependencies): project dependency edges with tenant and framework integrity"
```

---

### Task 2: The cycle guard, and the lock that makes it hold

**Files:**
- Create: `supabase/migrations/20260907100500_project_dependency_cycle_guard.sql`
- Modify: `tests/integration/rls/project-dependencies.test.ts`

**Interfaces:**
- Consumes: the table from Task 1.
- Produces: trigger function `public.project_dependencies_reject_cycle()`, trigger `project_dependencies_cycle_guard`. Its exception message contains the literal text `circular dependency` and its SQLSTATE is `23514` (raised with `errcode = 'check_violation'`), so tests and application copy can match on it.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260907100500_project_dependency_cycle_guard.sql`:

```sql
-- The fourth integrity rule from §6: no cycles. A -> B, B -> A and
-- A -> B, B -> C, C -> A must both be rejected.
--
-- This cannot be a constraint. Postgres has no declarative way to forbid a
-- cycle in a self-referencing edge table, so it is a trigger running a
-- recursive CTE from the new dependent back through its prerequisites.
create or replace function public.project_dependencies_reject_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The trigger alone is NOT enough. Two transactions can each insert an edge
  -- that is individually acyclic but jointly forms a cycle, because neither
  -- sees the other's uncommitted row. This lock serialises dependency writes
  -- within one organisation for the rest of the transaction.
  --
  -- Chosen over `serializable` isolation because it is cheaper and scoped: it
  -- blocks only concurrent dependency edits in the same tenant, and those are
  -- rare. A rule that only holds when nobody else is working is not a rule.
  perform pg_advisory_xact_lock(hashtext(new.organization_id::text));

  -- Walk forward from the prerequisite: what does IT ultimately depend on? If
  -- that walk reaches the dependent, adding this edge closes a loop.
  if exists (
    with recursive upstream as (
      select new.prerequisite_project_id as project_id, 1 as depth
      union all
      select d.prerequisite_project_id, u.depth + 1
      from public.project_dependencies d
      join upstream u on d.dependent_project_id = u.project_id
      -- A depth cap is a backstop, not the mechanism: existing data is acyclic
      -- by this same trigger, so the walk terminates. It bounds the damage if
      -- a cycle ever reaches the table another way.
      where u.depth < 100
    )
    select 1 from upstream where project_id = new.dependent_project_id
  ) then
    raise exception
      'This would create a circular dependency between projects.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.project_dependencies_reject_cycle() is
  'Rejects edges that would close a dependency loop. Takes a per-organisation advisory lock first, because two concurrent individually-acyclic inserts can jointly form a cycle.';

create trigger project_dependencies_cycle_guard
  before insert or update on public.project_dependencies
  for each row execute function public.project_dependencies_reject_cycle();
```

- [ ] **Step 2: Apply it**

Apply the migration the same way as Task 1. Confirm the trigger exists.

- [ ] **Step 3: Add the cycle tests**

Append to `tests/integration/rls/project-dependencies.test.ts`. You will need a third project — add `projectC` to the fixtures in `before`, created exactly like `PD A` and `PD B` with `name: 'PD C'`.

```ts
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
```

- [ ] **Step 4: Run them**

Run: `pnpm test:rls`
Expected: the whole suite passes, including the four new tests.

- [ ] **Step 5: Prove the guard**

Drop the trigger in the live database, re-run, and confirm **both** cycle tests fail. Re-create the trigger and confirm they pass. Paste the real failure output into your report.

Do this with `drop trigger` / `create trigger` issued directly, not by editing the applied migration.

- [ ] **Step 6: Report on the lock**

The advisory lock cannot be proved by a single-threaded test, and this plan does not ask you to build a concurrency harness. State explicitly in your report: that the lock is present, what it is keyed on, and that its behaviour under genuine concurrency is **unproven by this suite**. Do not imply coverage the tests do not give.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260907100500_project_dependency_cycle_guard.sql tests/integration/rls/project-dependencies.test.ts
git commit -m "feat(dependencies): reject dependency cycles, with a per-tenant advisory lock"
```

---

### Task 3: The derived status

**Files:**
- Create: `features/delivery/dependency-status.ts`
- Test: `tests/unit/dependency-status.test.ts`

**Interfaces:**
- Produces:
  - `DependencyStatus = 'Satisfied' | 'Pending' | 'At Risk' | 'Blocked'`
  - `PrerequisiteState = { name: string; status: string; health: string; archived: boolean; currentPhasePosition: number | null }`
  - `DependencyRequirement = { requiredStatus: string | null; requiredPhaseName: string | null; requiredPhasePosition: number | null; requiredByDate: string | null }`
  - `deriveDependencyStatus(requirement, prerequisite, today): { status: DependencyStatus; reason: string }`
- `today` is an ISO `yyyy-mm-dd` string, injected rather than read from the clock so the tests are deterministic.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/dependency-status.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveDependencyStatus, type DependencyRequirement, type PrerequisiteState } from '../../features/delivery/dependency-status.ts'

const TODAY = '2026-09-06'

function requirement(over: Partial<DependencyRequirement> = {}): DependencyRequirement {
  return { requiredStatus: 'Complete', requiredPhaseName: null, requiredPhasePosition: null, requiredByDate: null, ...over }
}

function prerequisite(over: Partial<PrerequisiteState> = {}): PrerequisiteState {
  return { name: 'Customer Data Migration', status: 'Active', health: 'Healthy', archived: false, currentPhasePosition: null, ...over }
}

test('a status requirement is satisfied on an exact match', () => {
  const result = deriveDependencyStatus(requirement(), prerequisite({ status: 'Complete' }), TODAY)
  assert.equal(result.status, 'Satisfied')
})

test('a status requirement is not satisfied by a different status', () => {
  // Project status is a lifecycle vocabulary, not an ordered progression, so
  // there is no ">=" reading. On Hold is not "past" Complete.
  const result = deriveDependencyStatus(requirement(), prerequisite({ status: 'On Hold' }), TODAY)
  assert.equal(result.status, 'Pending')
})

test('a phase requirement is satisfied once the prerequisite has PASSED it', () => {
  // "Reached" means reached or passed. A project in Deploy has evidently
  // passed Build; requiring it to sit exactly on Build would make the
  // dependency un-satisfiable the moment the prerequisite moved on.
  const result = deriveDependencyStatus(
    requirement({ requiredStatus: null, requiredPhaseName: 'Build', requiredPhasePosition: 4 }),
    prerequisite({ currentPhasePosition: 7 }),
    TODAY,
  )
  assert.equal(result.status, 'Satisfied')
})

test('a phase requirement is satisfied when sitting exactly on the phase', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredStatus: null, requiredPhaseName: 'Build', requiredPhasePosition: 4 }),
    prerequisite({ currentPhasePosition: 4 }),
    TODAY,
  )
  assert.equal(result.status, 'Satisfied')
})

test('a prerequisite with no phase recorded is not satisfied', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredStatus: null, requiredPhaseName: 'Build', requiredPhasePosition: 4 }),
    prerequisite({ currentPhasePosition: null }),
    TODAY,
  )
  assert.equal(result.status, 'Pending')
})

test('an unmet requirement past its required-by date is Blocked', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2026-09-01' }),
    prerequisite({ status: 'Active' }),
    TODAY,
  )
  assert.equal(result.status, 'Blocked')
  assert.match(result.reason, /Customer Data Migration/)
})

test('a cancelled prerequisite is Blocked even with no date at all', () => {
  // The case that proves cancellation is independent of the date. A dependency
  // waiting on a cancelled project must not sit as Pending until some date
  // happens to lapse -- it is the clearest possible blockage.
  const result = deriveDependencyStatus(requirement(), prerequisite({ status: 'Cancelled' }), TODAY)

  assert.equal(result.status, 'Blocked')
  assert.match(result.reason, /cancelled/i)
})

test('an archived prerequisite is Blocked even with no date at all', () => {
  const result = deriveDependencyStatus(requirement(), prerequisite({ archived: true }), TODAY)

  assert.equal(result.status, 'Blocked')
  assert.match(result.reason, /archived/i)
})

test('a satisfied requirement stays Satisfied even when the date has passed', () => {
  // Lateness cannot un-satisfy a met requirement.
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2026-01-01' }),
    prerequisite({ status: 'Complete' }),
    TODAY,
  )
  assert.equal(result.status, 'Satisfied')
})

test('an unmet requirement due inside 30 days is At Risk', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2026-09-20' }),
    prerequisite({ status: 'Active' }),
    TODAY,
  )
  assert.equal(result.status, 'At Risk')
})

test('an unmet requirement on an At Risk prerequisite is At Risk with no date', () => {
  const result = deriveDependencyStatus(requirement(), prerequisite({ health: 'At Risk' }), TODAY)
  assert.equal(result.status, 'At Risk')
})

test('an unmet requirement on a Critical prerequisite is At Risk with no date', () => {
  const result = deriveDependencyStatus(requirement(), prerequisite({ health: 'Critical' }), TODAY)
  assert.equal(result.status, 'At Risk')
})

test('an unmet requirement with a distant date and a healthy prerequisite is Pending', () => {
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2027-06-01' }),
    prerequisite({ status: 'Active', health: 'Healthy' }),
    TODAY,
  )
  assert.equal(result.status, 'Pending')
})

test('Blocked beats At Risk', () => {
  // A past date and a Critical prerequisite together must not read as merely
  // At Risk -- the more severe reading wins.
  const result = deriveDependencyStatus(
    requirement({ requiredByDate: '2026-08-01' }),
    prerequisite({ health: 'Critical' }),
    TODAY,
  )
  assert.equal(result.status, 'Blocked')
})

test('every non-satisfied status names the prerequisite and what it has not reached', () => {
  // Requirement §3: the reason for a non-satisfied state must be visible. A
  // badge without its reason is what that section explicitly refuses.
  for (const state of [
    prerequisite({ status: 'Active' }),
    prerequisite({ status: 'Cancelled' }),
    prerequisite({ archived: true }),
    prerequisite({ health: 'Critical' }),
  ]) {
    const result = deriveDependencyStatus(requirement({ requiredByDate: '2026-09-10' }), state, TODAY)
    assert.notEqual(result.status, 'Satisfied')
    assert.match(result.reason, /Customer Data Migration/, 'the reason must name the prerequisite')
    assert.ok(result.reason.length > 0)
  }
})

test('a satisfied dependency still explains itself', () => {
  const result = deriveDependencyStatus(requirement(), prerequisite({ status: 'Complete' }), TODAY)
  assert.match(result.reason, /Customer Data Migration/)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test --experimental-strip-types tests/unit/dependency-status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `features/delivery/dependency-status.ts`:

```ts
/**
 * Derives a dependency's status from the prerequisite's CURRENT state.
 *
 * Nothing here is stored. Pending and Satisfied depend on a project that
 * changes independently of the dependency row, so a stored status would go
 * stale silently -- precisely the failure this feature exists to remove.
 *
 * Pure, and free of `server-only`, so it is unit testable -- the same split
 * overview-bands.ts and item-briefing.ts already use.
 */

/** Matches PROJECT_DATE_WINDOW_DAYS in queries/delivery-overview.ts deliberately. */
const AT_RISK_WINDOW_DAYS = 30

export type DependencyStatus = 'Satisfied' | 'Pending' | 'At Risk' | 'Blocked'

export type PrerequisiteState = {
  name: string
  status: string
  health: string
  archived: boolean
  /** Position of the prerequisite's current phase; null when none is recorded. */
  currentPhasePosition: number | null
}

export type DependencyRequirement = {
  /** Exactly one of requiredStatus / requiredPhasePosition is set — enforced by the database. */
  requiredStatus: string | null
  requiredPhaseName: string | null
  requiredPhasePosition: number | null
  /** ISO yyyy-mm-dd, or null. A dependency with no date can never be late. */
  requiredByDate: string | null
}

export function deriveDependencyStatus(
  requirement: DependencyRequirement,
  prerequisite: PrerequisiteState,
  /** ISO yyyy-mm-dd. Injected rather than read from the clock, so this is testable. */
  today: string,
): { status: DependencyStatus; reason: string } {
  const target = requirement.requiredPhaseName ?? requirement.requiredStatus ?? 'its required state'

  if (isSatisfied(requirement, prerequisite)) {
    return { status: 'Satisfied', reason: `${prerequisite.name} has reached ${target}.` }
  }

  // Permanent unreachability outranks the date, and outranks health. A
  // dependency waiting on a cancelled or archived project is blocked now, not
  // whenever its date happens to lapse.
  if (prerequisite.archived) {
    return { status: 'Blocked', reason: `${prerequisite.name} has been archived and cannot reach ${target}.` }
  }
  if (prerequisite.status === 'Cancelled') {
    return { status: 'Blocked', reason: `${prerequisite.name} was cancelled and cannot reach ${target}.` }
  }

  const daysRemaining = requirement.requiredByDate === null
    ? null
    : daysBetween(today, requirement.requiredByDate)

  if (daysRemaining !== null && daysRemaining < 0) {
    return { status: 'Blocked', reason: `${prerequisite.name} has not reached ${target}, and the required-by date has passed.` }
  }
  if (daysRemaining !== null && daysRemaining <= AT_RISK_WINDOW_DAYS) {
    return { status: 'At Risk', reason: `${prerequisite.name} has not reached ${target}, and is required within ${daysRemaining} days.` }
  }
  if (prerequisite.health === 'At Risk' || prerequisite.health === 'Critical') {
    return { status: 'At Risk', reason: `${prerequisite.name} has not reached ${target}, and its own health is ${prerequisite.health}.` }
  }

  return { status: 'Pending', reason: `${prerequisite.name} has not yet reached ${target}.` }
}

function isSatisfied(requirement: DependencyRequirement, prerequisite: PrerequisiteState): boolean {
  if (requirement.requiredPhasePosition !== null) {
    // "Reached" means reached OR passed. Requiring the prerequisite to sit
    // exactly on the phase would un-satisfy the dependency the moment that
    // project moved forward, which is the opposite of what a prerequisite means.
    // A prerequisite with no phase recorded has no position and cannot satisfy.
    return prerequisite.currentPhasePosition !== null
      && prerequisite.currentPhasePosition >= requirement.requiredPhasePosition
  }
  return prerequisite.status === requirement.requiredStatus
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000)
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test --experimental-strip-types tests/unit/dependency-status.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Prove two of the rules**

A guard that has never failed is not yet a guard. Break each of these, run the tests, confirm the named test fails, then restore:

1. Change `>=` to `===` in `isSatisfied` — **"a phase requirement is satisfied once the prerequisite has PASSED it"** must fail.
2. Move the `prerequisite.status === 'Cancelled'` check to *after* the date checks — **"a cancelled prerequisite is Blocked even with no date at all"** must fail.

Paste the real failure output for both.

- [ ] **Step 6: Commit**

```bash
git add features/delivery/dependency-status.ts tests/unit/dependency-status.test.ts
git commit -m "feat(dependencies): derive dependency status with a visible reason"
```

---

### Task 4: The input schema and the write actions

**Files:**
- Create: `features/delivery/schemas/project-dependency.ts`, `features/delivery/actions/create-project-dependency.ts`, `features/delivery/actions/delete-project-dependency.ts`

**Interfaces:**
- Produces:
  - `projectDependencyInputSchema` parsing `prerequisiteProjectId`, `requiredState`, `criticality`, `dependencyOwnerId`, `requiredByDate`, `notes`
  - `createProjectDependencyAction(dependentProjectId: string, _prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }>`
  - `deleteProjectDependencyAction(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }>` reading `id` and `projectId` from the form

- [ ] **Step 1: Read the patterns**

Read `features/delivery/schemas/delivery-item.ts` and `features/delivery/actions/create-delivery-item.ts` in full before writing. Two things to carry across exactly:

- **The `optionalDate` shape.** Blank-first: `.optional().or(z.literal('')).transform(v => v || null)` **before** the refine, so an empty string is already `null` when the refine runs. The other ordering throws inside zod parsing, escapes `safeParse`, and surfaces as a 500. That is a defect this repo has already shipped once.
- **Reading server-side values from the database rather than the form.** `create-delivery-item.ts` reads `framework_id` off the project instead of trusting the client. Do the same for `prerequisite_framework_id` here: read it from the prerequisite project. A value the caller cannot influence is one fewer thing to validate.

- [ ] **Step 2: Write the schema**

Create `features/delivery/schemas/project-dependency.ts`:

```ts
import { z } from 'zod'

import { isValidIsoDate } from './date.ts'

const optionalText = z.string().trim().optional().or(z.literal('')).transform((v) => v || null)
const optionalUuid = z.string().uuid().optional().or(z.literal('')).transform((v) => v || null)

// Blank-first, same as schemas/project.ts and schemas/delivery-item.ts:
// .optional().or('') and the transform to null run BEFORE the refine, so an
// empty date never reaches isValidIsoDate. The other ordering throws inside
// zod parsing, escapes safeParse, and surfaces as a 500 rather than a field
// error. This repo has shipped that bug once already.
const optionalDate = z.string().optional().or(z.literal(''))
  .transform((v) => v || null)
  .refine((v) => v === null || isValidIsoDate(v), 'Enter a valid date, as yyyy-mm-dd.')

/** Matches project_dependencies_required_status_check. */
export const DEPENDENCY_REQUIRED_STATUSES = ['Active', 'Complete'] as const
/** Matches project_dependencies_criticality_check. */
export const DEPENDENCY_CRITICALITIES = ['Standard', 'Critical'] as const

/**
 * The required state arrives as one field so the form cannot submit both or
 * neither -- the shape project_dependencies_required_state_check enforces.
 * A phase is submitted as `phase:<uuid>`, a status as `status:Complete`.
 */
export const projectDependencyInputSchema = z.object({
  prerequisiteProjectId: z.string().uuid('Choose a prerequisite project.'),
  requiredState: z.string().regex(
    /^(status:(Active|Complete)|phase:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    'Choose a required state.',
  ),
  criticality: z.enum(DEPENDENCY_CRITICALITIES),
  dependencyOwnerId: optionalUuid,
  requiredByDate: optionalDate,
  notes: optionalText,
}).transform((input) => {
  const [kind, value] = splitRequiredState(input.requiredState)
  return {
    ...input,
    requiredStatus: kind === 'status' ? value : null,
    requiredPhaseId: kind === 'phase' ? value : null,
  }
})

function splitRequiredState(value: string): ['status' | 'phase', string] {
  const separator = value.indexOf(':')
  const kind = value.slice(0, separator)
  return [kind === 'phase' ? 'phase' : 'status', value.slice(separator + 1)]
}
```

- [ ] **Step 3: Write the create action**

Create `features/delivery/actions/create-project-dependency.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { projectDependencyInputSchema } from '../schemas/project-dependency'

export async function createProjectDependencyAction(
  dependentProjectId: string,
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const parsed = projectDependencyInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Refused here as well as by project_dependencies_no_self_check, because a
  // constraint violation is not a sentence a PM can act on.
  if (parsed.data.prerequisiteProjectId === dependentProjectId) {
    return { error: 'A project cannot be its own prerequisite.' }
  }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  // Read from the prerequisite rather than accept from the form:
  // project_dependencies_prerequisite_framework_fkey would refuse a mismatch
  // anyway, and a value the caller cannot influence is one fewer to validate.
  const { data: prerequisite, error: lookupError } = await supabase
    .from('projects').select('framework_id')
    .eq('id', parsed.data.prerequisiteProjectId).eq('organization_id', organization.id).maybeSingle()
  if (lookupError) return { error: 'The dependency could not be created.' }
  if (!prerequisite) return { error: 'That prerequisite project no longer exists, or is not yours.' }

  const { error } = await supabase.from('project_dependencies').insert({
    organization_id: organization.id,
    dependent_project_id: dependentProjectId,
    prerequisite_project_id: parsed.data.prerequisiteProjectId,
    prerequisite_framework_id: prerequisite.framework_id,
    relationship_type: 'Prerequisite',
    required_status: parsed.data.requiredStatus,
    required_phase_id: parsed.data.requiredPhaseId,
    dependency_owner_id: parsed.data.dependencyOwnerId,
    criticality: parsed.data.criticality,
    required_by_date: parsed.data.requiredByDate,
    notes: parsed.data.notes,
  }).select('id').single()

  // The cycle trigger raises check_violation with its own sentence. Surfacing
  // it as the generic message would hide the one refusal a PM most needs to
  // understand -- which is why §6's rules are worth naming individually.
  if (error?.message.includes('circular dependency')) {
    return { error: 'That dependency would create a circular dependency between projects.' }
  }
  if (error?.code === '23505') {
    return { error: 'That dependency already exists.' }
  }
  if (error) {
    return { error: 'The dependency could not be created. Check the prerequisite, required state and owner.' }
  }

  revalidatePath(`/operations/projects/${dependentProjectId}`)
  return {}
}
```

- [ ] **Step 4: Write the delete action**

Create `features/delivery/actions/delete-project-dependency.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

const schema = z.object({ id: z.string().uuid(), projectId: z.string().uuid() })

/**
 * A hard delete, unlike archive-project.ts. A dependency is an edge: it has no
 * children to orphan, and an archived edge answers no question a deleted one
 * does not. See the migration's comment on the delete policy.
 */
export async function deleteProjectDependencyAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'That dependency could not be removed.' }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  // organization_id is redundant with RLS and stated anyway: a delete whose
  // filter is wrong deletes nothing rather than something else.
  const { data, error } = await supabase.from('project_dependencies')
    .delete().eq('id', parsed.data.id).eq('organization_id', organization.id)
    .select('id')

  if (error) return { error: 'That dependency could not be removed.' }
  if (!data || data.length === 0) return { error: 'That dependency no longer exists, or is not yours.' }

  revalidatePath(`/operations/projects/${parsed.data.projectId}`)
  return {}
}
```

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck && pnpm test`
Expected: 0 errors, suite passes.

```bash
git add features/delivery/schemas/project-dependency.ts features/delivery/actions/create-project-dependency.ts features/delivery/actions/delete-project-dependency.ts
git commit -m "feat(dependencies): input schema and write actions"
```

---

### Task 5: The queries

**Files:**
- Create: `features/delivery/queries/list-project-dependencies.ts`, `features/delivery/queries/list-dependency-form-options.ts`

**Interfaces:**
- Consumes: `deriveDependencyStatus`, `DependencyStatus` from Task 3.
- Produces:
  - `DependencyRow = { id: string; projectId: string; projectName: string; requiredState: string; status: DependencyStatus; reason: string; owner: string; requiredByDate: string | null; criticality: string; notes: string | null }`
  - `listProjectDependencies(projectId: string): Promise<{ dependsOn: DependencyRow[]; dependedOnBy: DependencyRow[] }>`
  - `listDependencyFormOptions(projectId: string): Promise<{ projects: { id: string; name: string; frameworkId: string }[]; phases: { id: string; name: string; frameworkId: string; position: number }[]; members: { id: string; name: string }[] }>`

- [ ] **Step 1: Write `list-project-dependencies.ts`**

Both directions in one query. `dependsOn` is the rows where this project is the dependent; `dependedOnBy` is the rows where it is the prerequisite.

Requirement §4 requires both: a PM must see the downstream risk this project *creates*, not only the risk it carries.

```ts
import 'server-only'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { deriveDependencyStatus, type DependencyStatus } from '../dependency-status'

export type DependencyRow = {
  id: string
  /** The project at the OTHER end of the edge, whichever direction this row came from. */
  projectId: string
  projectName: string
  requiredState: string
  status: DependencyStatus
  reason: string
  /** Resolved name, or 'Unassigned' / 'Former member'. Never a raw uuid. */
  owner: string
  requiredByDate: string | null
  criticality: string
  notes: string | null
}

export async function listProjectDependencies(projectId: string): Promise<{
  dependsOn: DependencyRow[]
  dependedOnBy: DependencyRow[]
}> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  // Both projects on the edge are embedded, so one query serves both
  // directions. The status of a row is always derived from the PREREQUISITE,
  // whichever side of the edge the current project sits on.
  const [{ data, error }, members] = await Promise.all([
    supabase.from('project_dependencies')
      .select(`id, dependent_project_id, prerequisite_project_id, required_status, required_by_date,
               criticality, notes, dependency_owner_id,
               dependent:projects!project_dependencies_dependent_fkey (id, name),
               prerequisite:projects!project_dependencies_prerequisite_fkey (id, name, status, health, archived_at, phase_id),
               required_phase:framework_phases!project_dependencies_phase_fkey (id, name, position)`)
      .eq('organization_id', organization.id)
      .or(`dependent_project_id.eq.${projectId},prerequisite_project_id.eq.${projectId}`),
    listOrganizationMembers(),
  ])
  if (error) throw error

  const rows = data ?? []
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]))
  const today = new Date().toISOString().slice(0, 10)

  // The prerequisite's CURRENT phase position, which the embed above cannot
  // reach: phase_id points at framework_phases, and PostgREST will not follow
  // a second hop from an embedded row. One extra query, not one per row.
  const phasePositions = await currentPhasePositions(supabase, organization.id, rows)

  const dependsOn: DependencyRow[] = []
  const dependedOnBy: DependencyRow[] = []

  for (const row of rows) {
    const requiredState = row.required_phase?.name ?? row.required_status ?? '—'
    const { status, reason } = deriveDependencyStatus(
      {
        requiredStatus: row.required_status,
        requiredPhaseName: row.required_phase?.name ?? null,
        requiredPhasePosition: row.required_phase?.position ?? null,
        requiredByDate: row.required_by_date,
      },
      {
        name: row.prerequisite.name,
        status: row.prerequisite.status,
        health: row.prerequisite.health,
        archived: row.prerequisite.archived_at !== null,
        currentPhasePosition: row.prerequisite.phase_id
          ? phasePositions.get(row.prerequisite.phase_id) ?? null
          : null,
      },
      today,
    )

    // The far end of the edge, from this project's point of view.
    const isDependent = row.dependent_project_id === projectId
    const other = isDependent ? row.prerequisite : row.dependent

    const built: DependencyRow = {
      id: row.id,
      projectId: other.id,
      projectName: other.name,
      requiredState,
      status,
      reason,
      // A removed member keeps their name here rather than becoming a blank.
      // Nulling ownership when someone leaves erases who was responsible.
      owner: row.dependency_owner_id
        ? memberNames.get(row.dependency_owner_id) ?? 'Former member'
        : 'Unassigned',
      requiredByDate: row.required_by_date,
      criticality: row.criticality,
      notes: row.notes,
    }

    if (isDependent) dependsOn.push(built)
    else dependedOnBy.push(built)
  }

  // Worst first, then soonest, then name -- so the row a PM must act on is at
  // the top rather than wherever the database happened to return it.
  const severity: Record<DependencyStatus, number> = { Blocked: 0, 'At Risk': 1, Pending: 2, Satisfied: 3 }
  const order = (a: DependencyRow, b: DependencyRow) =>
    severity[a.status] - severity[b.status]
    || (a.requiredByDate ?? '9999-12-31').localeCompare(b.requiredByDate ?? '9999-12-31')
    || a.projectName.localeCompare(b.projectName)
    || a.id.localeCompare(b.id)

  return { dependsOn: dependsOn.sort(order), dependedOnBy: dependedOnBy.sort(order) }
}
```

And the helper, in the same file:

```ts
/**
 * Positions of the prerequisites' current phases.
 *
 * A second query rather than a second embed hop: `phase_id` on the embedded
 * prerequisite points at framework_phases, and PostgREST will not follow a
 * further relationship from an already-embedded row. One query for all rows,
 * never one per row.
 */
async function currentPhasePositions(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  organizationId: string,
  rows: ReadonlyArray<{ prerequisite: { phase_id: string | null } }>,
): Promise<Map<string, number>> {
  const ids = [...new Set(rows.map((row) => row.prerequisite.phase_id).filter((id): id is string => id !== null))]
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase.from('framework_phases')
    .select('id, position').eq('organization_id', organizationId).in('id', ids)
  if (error) throw error

  return new Map((data ?? []).map((phase) => [phase.id, phase.position]))
}
```

**Verify the embed hint syntax against a real query before assuming it works.** `project_dependencies` has two foreign keys to `projects`, so PostgREST cannot disambiguate them without the constraint-name hint used above. If the hint form is wrong the query fails at runtime, not at typecheck. Run it once against the live database and report what you ran.

- [ ] **Step 2: Write `list-dependency-form-options.ts`**

```ts
import 'server-only'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Candidates for a new dependency on `projectId`.
 *
 * Every picker on the add form is populated from here. There is no retention
 * logic, unlike form-options.ts: this form only ever creates, so every select
 * starts empty and there is no recorded value for a missing option to silently
 * overwrite. When an edit path is added, retention comes with it.
 */
export async function listDependencyFormOptions(projectId: string) {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [projectResult, phaseResult, members] = await Promise.all([
    // Unarchived projects, excluding this one -- self-dependency is refused, so
    // offering it would be offering a choice that cannot be saved.
    supabase.from('projects').select('id, name, framework_id')
      .eq('organization_id', organization.id).is('archived_at', null)
      .neq('id', projectId).order('name'),
    // Every unarchived phase in the organisation. The form filters client-side
    // by the chosen prerequisite's framework, the way ProjectForm already
    // filters phases when the framework changes.
    supabase.from('framework_phases').select('id, name, framework_id, position')
      .eq('organization_id', organization.id).is('archived_at', null)
      .order('position'),
    listOrganizationMembers(),
  ])
  if (projectResult.error) throw projectResult.error
  if (phaseResult.error) throw phaseResult.error

  return {
    projects: (projectResult.data ?? []).map((row) => ({ id: row.id, name: row.name, frameworkId: row.framework_id })),
    phases: (phaseResult.data ?? []).map((row) => ({ id: row.id, name: row.name, frameworkId: row.framework_id, position: row.position })),
    members: members.filter((member) => member.status === 'active')
      .map((member) => ({ id: member.userId, name: member.displayName })),
  }
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `pnpm typecheck && pnpm test`
Expected: 0 errors, suite passes.

```bash
git add features/delivery/queries/list-project-dependencies.ts features/delivery/queries/list-dependency-form-options.ts
git commit -m "feat(dependencies): read both directions with a derived status"
```

---

### Task 6: The Dependencies tab

**Files:**
- Create: `features/delivery/components/project-dependencies-panel.tsx`
- Modify: `features/delivery/components/project-detail-screen.tsx`, `app/(unison)/operations/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `DependencyRow` and both queries from Task 5; both actions from Task 4.

- [ ] **Step 1: Read the pattern**

Read `features/delivery/components/delivery-items-panel.tsx` in full. It is the closest precedent — a panel on this same screen that lists records and drives a create action with `useActionState`, and a delete/archive action behind a `ConfirmationDialog`. Match its structure, its `SectionCard` usage and its error rendering rather than inventing a new shape.

- [ ] **Step 2: Build the panel**

`ProjectDependenciesPanel({ projectId, dependsOn, dependedOnBy, options })`.

**Two sections, both required by §4:**

- *"This project depends on"* — prerequisite name, required state, status badge **with its reason as visible text**, owner, required-by date, criticality. Each row has a Remove control behind a `ConfirmationDialog`, since a hard delete is irreversible.
- *"Projects that depend on this"* — the same columns, **read-only**. A dependency is owned by the project that declares it; removing it from the far end would be editing another project's record from this page.

**The status badge is never alone.** Requirement §3 requires the reason to be visible, in the shape *"Digital Claims Platform prerequisite has not reached Completed."* `reason` is already that sentence — render it, do not summarise it, and do not hide it behind a tooltip or a hover. **A tooltip is not visible.**

The row's status cell is therefore two elements, not one:

```tsx
<td className="px-4 py-3 align-top">
  <DependencyStatusBadge status={row.status} />
  {/* Requirement §3: the reason for a non-satisfied state must be visible.
      A badge alone is what that section explicitly refuses, so this <p> is
      not decoration -- it is the requirement. */}
  <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.reason}</p>
</td>
```

`DependencyStatusBadge` is a small local component mapping the four statuses to tones, following `HealthBadge` in `./delivery-primitives`:

```tsx
const dependencyTone: Record<DependencyStatus, string> = {
  Blocked: 'border-destructive/40 bg-destructive/5 text-destructive',
  'At Risk': 'border-amber-500/40 bg-amber-500/5 text-amber-700',
  Pending: 'border-border bg-muted text-muted-foreground',
  Satisfied: 'border-emerald-600/40 bg-emerald-600/5 text-emerald-700',
}

function DependencyStatusBadge({ status }: { status: DependencyStatus }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${dependencyTone[status]}`}>{status}</span>
}
```

**The add form** submits `prerequisiteProjectId`, `requiredState`, `criticality`, `dependencyOwnerId`, `requiredByDate` and `notes`, via `useActionState(createProjectDependencyAction.bind(null, projectId), undefined)` — the binding pattern `delivery-items-panel.tsx` already uses to pass the project id.

The required-state select is one control, because the database enforces exactly-one and two controls would let a user express "both" or "neither". Build its options from the selected prerequisite:

```tsx
const prerequisite = options.projects.find((project) => project.id === selectedPrerequisiteId)
// Client-side filter by the chosen prerequisite's framework, the same way
// ProjectForm re-filters phases when the framework changes. The database
// refuses a phase from another framework anyway; this stops the user being
// offered one in the first place.
const phaseOptions = prerequisite
  ? options.phases.filter((phase) => phase.frameworkId === prerequisite.frameworkId)
  : []
```

Render the two statuses first as `status:Active` ("Has started") and `status:Complete` ("Is complete"), then each phase as `phase:<id>` labelled `Has reached <name>`. The labels say *reached*, not *is at*, because that is what the derivation means. Import `DEPENDENCY_REQUIRED_STATUSES` and `DEPENDENCY_CRITICALITIES` from `../schemas/project-dependency` rather than retyping either vocabulary — a second copy is what drifts from the check constraint.

Until a prerequisite is chosen, `phaseOptions` is empty and only the two statuses appear. Reset the selected required state when the prerequisite changes, or a phase from the previous prerequisite's framework stays selected and the write is refused by `project_dependencies_phase_fkey`.

**No relationship-type field.** The vocabulary holds one value, and a select with one option is a claim of choice the product does not offer.

**Empty states.** Each section renders its own sentence when it has no rows; do not render an empty table with headers. "This project has no recorded prerequisites" and "No other project depends on this one" say different things and both are useful.

**When there is no other project to depend on** — a single-project organisation — the add form says so instead of offering an empty picker. An empty select is a dead control.

- [ ] **Step 3: Add the tab**

In `project-detail-screen.tsx`, change line 14:

```tsx
const tabs = ['Overview','Framework','Delivery','Dependencies'] as const
```

Extend `ProjectDetailScreenProps` to take `dependsOn`, `dependedOnBy` and `options`, and add the branch to the tab body at the end of the existing ternary chain.

- [ ] **Step 4: Wire the page**

In `app/(unison)/operations/projects/[projectId]/page.tsx`, fetch both alongside the existing `listDeliveryItems` call and pass them through. Follow the existing style: the file already awaits `getProject`, `listOrganizationMembers` and `listDeliveryItems`.

- [ ] **Step 5: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 errors; suite passes; build clean.

```bash
git add features/delivery/components/project-dependencies-panel.tsx features/delivery/components/project-detail-screen.tsx "app/(unison)/operations/projects/[projectId]/page.tsx"
git commit -m "feat(dependencies): a Dependencies tab showing both directions"
```

---

### Task 7: Signed-in verification and follow-ups

Controller-run. Three consecutive slices have shipped a defect past every automated gate that only a person using the page could see.

- [ ] **Step 1** — with no dependencies, confirm both sections render their own empty sentence and the add form is usable.
- [ ] **Step 2** — create a dependency requiring a status. Confirm it appears under "This project depends on" as Pending with a reason, and appears on the *other* project under "Projects that depend on this".
- [ ] **Step 3** — complete the prerequisite; confirm the dependency turns Satisfied on both screens.
- [ ] **Step 4** — create one requiring a phase. Confirm it is Satisfied once the prerequisite has *passed* that phase, not only when sitting on it.
- [ ] **Step 5** — set a required-by date in the past on an unmet dependency; confirm Blocked with a reason naming the date.
- [ ] **Step 6** — cancel a prerequisite with no date set; confirm Blocked with cancellation as the reason. Archive another; confirm the dependency still renders rather than vanishing.
- [ ] **Step 7** — attempt a cycle through the UI; confirm the message names circular dependency rather than surfacing a constraint violation. Attempt a duplicate; confirm its own message.
- [ ] **Step 8** — confirm the required-state picker offers only the prerequisite's own phases, and changes when a different prerequisite is chosen.
- [ ] **Step 9** — remove a dependency; confirm the confirmation dialog appears and the row goes from both projects.
- [ ] **Step 10** — check `preview_logs`, then delete every fixture created.

- [ ] **Step 11: Record the deferred decision**

Append to `docs/follow-ups.md`, under a heading for this slice: that **picker retention is not implemented for dependencies because there is no edit path**, that the display side resolves removed owners to 'Former member' in `list-project-dependencies.ts`, and that **an edit path must bring the retention functions with it** — the defect has been found five times in this codebase and an edit form is exactly where it appears.

Also record that **the advisory lock's behaviour under genuine concurrency is unproven by the test suite**, and what proving it would take.

```bash
git add docs/follow-ups.md
git commit -m "docs: record deferred follow-ups from the dependencies slice"
```

---

## Notes for the executor

- **The status must never be stored.** If you find yourself adding a `status` column to `project_dependencies` to make something easier, stop — that is the defect this feature exists to remove.
- **Assert constraint names, not just SQLSTATEs.** Five foreign keys on this table raise `23503` and three checks raise `23514`. A test matching only the code passes when the wrong rule fires.
- **The cycle trigger and the future portfolio view are the same traversal.** This slice puts it only in the trigger. When the portfolio cascade is built it must reuse it, not grow a second walk that can disagree with the rule.
