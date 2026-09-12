# Requirements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A PM can record formal, discrete requirements against a project, track each through a status lifecycle, and assign an owner — with full CRUD, structurally enforced tenant isolation, and the picker-retention pattern applied from day one.

**Architecture:** One new table (`requirements`) copying `project_risks`' exact shape. A dedicated query, action set and panel component — not folded into the existing Governance files, since Requirements has full CRUD where Governance has none, and mixing the two capability levels in one file would blur that distinction rather than express it.

**Tech Stack:** Next.js 16 App Router, React 19 server actions, Supabase Postgres 17 with RLS, `node:test`.

## Global Constraints

- A field in the UI is a claim that the product supports that capability. This slice claims exactly six fields (title, description, priority, status, owner, target date) and nothing else.
- Integrity rules are enforced structurally, not only in the UI.
- No `archived_at` — a requirement's lifecycle is fully expressed by `status`; removal is a hard delete.
- Status is unconstrained between values — no transition rules, matching every other status field in this schema.
- No link to delivery items or evidence, and no representation on the executive briefing — both are explicitly out of scope for this slice.
- The picker-retention pattern (`features/delivery/form-options.ts`) applies to the owner picker from day one, since this slice ships with an edit path.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- Migrations are append-only; never edit one that has been applied.
- `features/product-ui/components/record-collection-workspace.tsx` must not be modified.
- Never run `git add -A`, `git checkout .`, `git restore .`, `git stash` or `git clean` in this repo — untracked `public/*.png` files belong to the user and must survive. Stage files by explicit path.

---

## File Structure

**Create**
- `supabase/migrations/20260912100000_requirements.sql` — table, RLS, triggers, grants
- `features/delivery/queries/list-requirements.ts` — read, both directions of nothing (project-scoped only, one direction)
- `features/delivery/actions/requirements.ts` — create, update, delete
- `features/delivery/components/project-requirements-panel.tsx` — the tab UI
- `tests/integration/rls/requirements.test.ts`

**Modify**
- `features/delivery/components/project-detail-screen.tsx` — add the tab, fix the stale "no separate register" copy
- `app/(unison)/operations/projects/[projectId]/page.tsx` — fetch and pass requirements + the owner-picker's member list
- `docs/follow-ups.md` — Task 5

---

### Task 1: The table and its RLS

**Files:**
- Create: `supabase/migrations/20260912100000_requirements.sql`
- Test: `tests/integration/rls/requirements.test.ts`

**Interfaces:**
- Produces: table `public.requirements` with columns `id`, `organization_id`, `project_id`, `title`, `description`, `priority`, `status`, `owner_id`, `target_date`, `created_at`, `updated_at`. Constraint names later tasks and tests assert on: `requirements_priority_check`, `requirements_status_check`, `requirements_project_fkey`, `requirements_owner_fkey`.

- [ ] **Step 1: Read the pattern this copies**

Read `supabase/migrations/20260910130104_core_delivery_governance.sql` lines 83-100 (the `project_risks` table) before writing anything — this migration reproduces its shape exactly, field-for-field except for the two columns that differ (`priority`/`status` instead of `probability`/`impact`, no `mitigation`).

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260912100000_requirements.sql`:

```sql
-- Formal, discrete things a project must produce or satisfy. Traceability
-- (next in the build order) will link delivery items and evidence back to
-- these; this slice does not build that link, only the entity it will need.
--
-- Copies project_risks' shape exactly: same RLS pattern, same trigger set,
-- no archived_at. A requirement's lifecycle is fully expressed by status;
-- removal is a hard delete, matching a register rather than a soft-deleted
-- hierarchy with children worth preserving.
create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  title text not null,
  description text,
  -- Matches the vocabulary already repeated across project_risks,
  -- support_tickets, support_cases and integration event priority in this
  -- schema -- not a new invented scale.
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Critical')),
  -- Unconstrained between values, matching delivery_items.status and
  -- project_risks.status: neither enforces transition order, and inventing
  -- one here for a single entity would be new complexity with no precedent.
  status text not null default 'Draft' check (status in ('Draft','Approved','In Progress','Delivered','Verified')),
  owner_id uuid,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint requirements_project_fkey foreign key (project_id, organization_id)
    references public.projects(id, organization_id) on delete cascade,
  constraint requirements_owner_fkey foreign key (organization_id, owner_id)
    references public.memberships(organization_id, user_id) on delete set null (owner_id)
);

comment on table public.requirements is
  'Formal, discrete delivery requirements. Status is stored, never derived -- nothing yet exists to derive it from.';

create index requirements_project_idx on public.requirements(project_id, status);

alter table public.requirements enable row level security;

create policy requirements_select on public.requirements
  for select to authenticated using (public.is_member_of(organization_id));
create policy requirements_insert on public.requirements
  for insert to authenticated with check (public.is_member_of(organization_id));
create policy requirements_update on public.requirements
  for update to authenticated using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));
create policy requirements_delete on public.requirements
  for delete to authenticated using (public.is_member_of(organization_id));

create trigger requirements_set_updated_at before update on public.requirements
  for each row execute function public.set_updated_at();
create trigger requirements_audit after insert or update or delete on public.requirements
  for each row execute function public.record_audit_event();

revoke all on public.requirements from anon;
grant select, insert, update, delete on public.requirements to authenticated;
```

Both named constraints (`requirements_project_fkey`, `requirements_owner_fkey`) are given explicit names rather than left to Postgres's default naming, because the RLS tests in Step 4 assert on the exact constraint name — the same discipline `project_dependencies` used, catching a review finding earlier in this codebase's history where an unnamed constraint made a test unable to distinguish which of several foreign keys actually fired.

- [ ] **Step 3: Apply it**

Apply the migration to the `unison-uat` Supabase project the way this repo already applies migrations (via the Supabase MCP `apply_migration` tool, `project_id: "nwdzpjzllhhqwawmsxjd"`). Confirm the table exists and report how you applied it.

**`unison-uat` is production.** There is no separate staging database. Do not insert any row into it during this task beyond what Step 5's proof requires, and delete anything you create immediately after.

- [ ] **Step 4: Write the RLS tests**

Create `tests/integration/rls/requirements.test.ts`, following the fixture style of `tests/integration/rls/project-dependencies.test.ts` — read that file first for `createFixtureOrg`, `createFixtureUser`, `signedInClient`, `admin` and `cleanup`.

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
let outsiderProjectId: string

before(async () => {
  orgId = await createFixtureOrg('requirements')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('requirements-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const framework = await admin.from('frameworks')
    .insert({ organization_id: orgId, name: 'REQ Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (framework.error) throw framework.error
  frameworkId = framework.data.id

  const project = await admin.from('projects')
    .insert({ organization_id: orgId, name: 'REQ Project', status: 'Active', health: 'On Track', framework_id: frameworkId })
    .select('id').single()
  if (project.error) throw project.error
  projectId = project.data.id

  const outsiderFramework = await admin.from('frameworks')
    .insert({ organization_id: outsiderOrg, name: 'REQ Outsider Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id').single()
  if (outsiderFramework.error) throw outsiderFramework.error

  const outsiderProject = await admin.from('projects')
    .insert({ organization_id: outsiderOrg, name: 'REQ Outsider Project', status: 'Active', health: 'On Track', framework_id: outsiderFramework.data.id })
    .select('id').single()
  if (outsiderProject.error) throw outsiderProject.error
  outsiderProjectId = outsiderProject.data.id
})

after(async () => { await cleanup([orgId, outsiderOrg], [member.id, outsider.id]) })

function requirement(over: Record<string, unknown> = {}) {
  return { organization_id: orgId, project_id: projectId, title: 'A requirement', ...over }
}

test('a valid requirement is accepted', async () => {
  const { data, error } = await admin.from('requirements').insert(requirement()).select('id').single()
  assert.equal(error, null)
  await admin.from('requirements').delete().eq('id', data!.id)
})

test('a cross-tenant project is unrepresentable', async () => {
  const { error } = await admin.from('requirements')
    .insert(requirement({ project_id: outsiderProjectId })).select('id').single()

  assert.ok(error, 'a requirement on another organisation\'s project must be refused')
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirements_project_fkey/)
})

test('an owner outside the organisation is refused', async () => {
  const { error } = await admin.from('requirements')
    .insert(requirement({ owner_id: outsider.id })).select('id').single()

  assert.ok(error, 'an owner from another organisation must be refused')
  assert.equal(error!.code, '23503')
  assert.match(error!.message, /requirements_owner_fkey/)
})

test('an invalid priority is refused', async () => {
  const { error } = await admin.from('requirements')
    .insert(requirement({ priority: 'Urgent' })).select('id').single()

  assert.ok(error, 'a priority outside the fixed vocabulary must be refused')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /requirements_priority_check/)
})

test('an invalid status is refused', async () => {
  const { error } = await admin.from('requirements')
    .insert(requirement({ status: 'Rejected' })).select('id').single()

  assert.ok(error, 'a status outside the fixed vocabulary must be refused')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /requirements_status_check/)
})

test('an outsider can neither read, write nor delete', async () => {
  const seeded = await admin.from('requirements').insert(requirement()).select('id').single()
  assert.equal(seeded.error, null)

  const client = await signedInClient(outsider.email, outsider.password)

  const read = await client.from('requirements').select('id').eq('organization_id', orgId)
  assert.equal(read.error, null)
  assert.deepEqual(read.data, [], "another organisation's requirements must not be visible")

  const write = await client.from('requirements').insert(requirement()).select('id').single()
  assert.ok(write.error, 'an outsider must not be able to write')
  assert.equal(write.error!.code, '42501')

  const remove = await client.from('requirements').delete().eq('id', seeded.data!.id)
  assert.equal(remove.error, null, 'RLS silently deletes zero rows rather than erroring')
  const stillThere = await admin.from('requirements').select('id').eq('id', seeded.data!.id)
  assert.equal(stillThere.data!.length, 1, "the outsider's delete must not have removed the row")

  await admin.from('requirements').delete().eq('id', seeded.data!.id)
})

test('a member of the organisation can read, write and delete', async () => {
  const client = await signedInClient(member.email, member.password)

  const created = await client.from('requirements').insert(requirement()).select('id').single()
  assert.equal(created.error, null)

  const read = await client.from('requirements').select('id').eq('id', created.data!.id)
  assert.equal(read.error, null)
  assert.equal(read.data!.length, 1)

  const updated = await client.from('requirements').update({ status: 'Approved' }).eq('id', created.data!.id).select('status').single()
  assert.equal(updated.error, null)
  assert.equal(updated.data!.status, 'Approved')

  const removed = await client.from('requirements').delete().eq('id', created.data!.id)
  assert.equal(removed.error, null)

  const after = await client.from('requirements').select('id').eq('id', created.data!.id)
  assert.deepEqual(after.data, [], 'the deleted requirement must be gone')
})

test('removing a member sets owner_id null rather than orphaning the row', async () => {
  const removable = await createFixtureUser(orgId, 'admin')
  const created = await admin.from('requirements')
    .insert(requirement({ owner_id: removable.id })).select('id, owner_id').single()
  assert.equal(created.error, null)
  assert.equal(created.data!.owner_id, removable.id)

  const { error: deleteError } = await admin.from('memberships')
    .delete().eq('organization_id', orgId).eq('user_id', removable.id)
  assert.equal(deleteError, null)

  const after = await admin.from('requirements').select('owner_id').eq('id', created.data!.id).single()
  assert.equal(after.error, null)
  assert.equal(after.data!.owner_id, null, 'the requirement must survive with ownership cleared, not orphaned or deleted')

  await admin.from('requirements').delete().eq('id', created.data!.id)
})
```

**A note on the outsider-delete test:** unlike an insert or an update, a `delete` blocked by RLS does not raise an error — it silently matches and removes zero rows. The test asserts this explicitly (`remove.error` is `null`, then confirms the row is still present via the admin client) rather than expecting an error, because expecting an error there would be asserting something RLS delete policies do not do, and the test would pass for the wrong reason if it only checked for an error that never comes.

- [ ] **Step 5: Run them**

Run: `pnpm test:rls`
Expected: the whole suite passes, including all eight new tests.

If any fail with `AuthApiError: 429`, that is Supabase auth rate-limiting, not a real failure — `--test-concurrency=1` is already in the `test:rls` script for this reason. Report it rather than treating it as a footnote.

- [ ] **Step 6: Prove the two rules that matter most**

Cross-tenant and owner-outside-organisation are what make invalid states unrepresentable. Prove each by **temporarily** dropping the constraint in the live database, re-running that one test, and confirming it fails — then re-add the constraint and confirm it passes.

Do this with `alter table ... drop constraint` / `add constraint` issued directly via `execute_sql`, **not** by editing the applied migration file, which is append-only. Paste the real failure output into your report.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260912100000_requirements.sql tests/integration/rls/requirements.test.ts
git commit -m "feat(requirements): a project-scoped requirements table with structural tenant isolation"
```

---

### Task 2: The read path

**Files:**
- Create: `features/delivery/queries/list-requirements.ts`

**Interfaces:**
- Consumes: `selectOwnerOptions` from `features/delivery/form-options.ts` is NOT used here — that is Task 4's concern (the add/edit form). This task only reads recorded rows and resolves the owner's display name, the same way `list-project-dependencies.ts` resolves a removed owner to `'Former member'`.
- Produces:
  - `RequirementRow = { id: string; title: string; description: string | null; priority: string; status: string; owner: string; ownerId: string | null; targetDate: string | null; targetDateLabel: string }`
  - `listRequirements(projectId: string): Promise<RequirementRow[]>`

- [ ] **Step 1: Read the pattern**

Read `features/delivery/queries/get-project-governance.ts` in full — it is the closest precedent for a project-scoped read, though it does not resolve owner names since none of its four entities expose an owner in their UI. For that half, read `features/delivery/queries/list-project-dependencies.ts`'s `memberNames` map and `'Former member'` fallback.

- [ ] **Step 2: Write the query**

Create `features/delivery/queries/list-requirements.ts`:

```ts
import 'server-only'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export type RequirementRow = {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  /** Resolved name, or 'Unassigned' / 'Former member'. Never a raw uuid. */
  owner: string
  ownerId: string | null
  targetDate: string | null
  targetDateLabel: string
}

export async function listRequirements(projectId: string): Promise<RequirementRow[]> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [{ data, error }, members] = await Promise.all([
    supabase.from('requirements')
      .select('id, title, description, priority, status, owner_id, target_date')
      .eq('organization_id', organization.id)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    listOrganizationMembers(),
  ])
  if (error) throw error

  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]))

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    // A removed member keeps their name here rather than becoming a blank:
    // nulling ownership when someone leaves erases who was accountable.
    owner: row.owner_id ? (memberNames.get(row.owner_id) ?? 'Former member') : 'Unassigned',
    ownerId: row.owner_id,
    targetDate: row.target_date,
    targetDateLabel: row.target_date ? formatDate(row.target_date) : 'No target date',
  }))
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}
```

`ownerId` is carried on the row (not just the resolved display name) because Task 4's edit form needs the raw id to pre-select the owner picker — the same reason `DependencyRow` in `list-project-dependencies.ts` exists as a shape, not just rendered strings.

`listOrganizationMembers` is already wrapped in React `cache()`, so calling it here and again in Task 4's form-options fetch on the same page render collapses into one round trip rather than two — no action needed to get this, it is already true of the function being called.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add features/delivery/queries/list-requirements.ts
git commit -m "feat(requirements): read the register with owner names resolved"
```

---

### Task 3: The write path

**Files:**
- Create: `features/delivery/actions/requirements.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks directly (server actions read the database themselves).
- Produces:
  - `RequirementActionState = { error?: string; success?: string } | undefined`
  - `createRequirementAction(projectId: string, _previous: RequirementActionState, form: FormData): Promise<RequirementActionState>`
  - `updateRequirementAction(requirementId: string, _previous: RequirementActionState, form: FormData): Promise<RequirementActionState>`
  - `deleteRequirementAction(projectId: string, requirementId: string, _previous: RequirementActionState, form: FormData): Promise<RequirementActionState>`

- [ ] **Step 1: Read the pattern**

Read `features/delivery/actions/project-governance.ts` in full for the `context()` helper shape, the `value`/`optional` form-reading helpers, and the `isUuid` guard. This task's actions follow the exact same shape for create; update and delete are new relative to that file, since Governance has neither.

- [ ] **Step 2: Write the actions**

Create `features/delivery/actions/requirements.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { isUuid } from '@/lib/utils'

export type RequirementActionState = { error?: string; success?: string } | undefined

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']
const STATUSES = ['Draft', 'Approved', 'In Progress', 'Delivered', 'Verified']

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const optional = (form: FormData, key: string) => value(form, key) || null

async function context() {
  const { organization } = await getSessionContext()
  return { organization, supabase: (await createServerSupabase()) as any }
}

function readFields(form: FormData) {
  const title = value(form, 'title')
  if (!title) return { error: 'A title is required.' }
  const priority = value(form, 'priority')
  if (!PRIORITIES.includes(priority)) return { error: 'Choose a valid priority.' }
  const status = value(form, 'status')
  if (!STATUSES.includes(status)) return { error: 'Choose a valid status.' }
  const ownerId = optional(form, 'ownerId')
  if (ownerId && !isUuid(ownerId)) return { error: 'Choose a valid owner.' }
  return {
    title,
    priority,
    status,
    description: optional(form, 'description'),
    owner_id: ownerId,
    target_date: optional(form, 'targetDate'),
  }
}

export async function createRequirementAction(
  projectId: string,
  _previous: RequirementActionState,
  form: FormData,
): Promise<RequirementActionState> {
  if (!isUuid(projectId)) return { error: 'That project is invalid.' }
  const fields = readFields(form)
  if ('error' in fields) return fields
  const { organization, supabase } = await context()
  const { error } = await supabase.from('requirements').insert({
    organization_id: organization.id,
    project_id: projectId,
    ...fields,
  })
  if (error) return { error: 'The requirement could not be recorded.' }
  revalidatePath(`/operations/projects/${projectId}`)
  return { success: 'Requirement recorded.' }
}

export async function updateRequirementAction(
  requirementId: string,
  _previous: RequirementActionState,
  form: FormData,
): Promise<RequirementActionState> {
  if (!isUuid(requirementId)) return { error: 'That requirement is invalid.' }
  const fields = readFields(form)
  if ('error' in fields) return fields
  const { organization, supabase } = await context()
  const { data, error } = await supabase.from('requirements')
    .update(fields)
    .eq('id', requirementId).eq('organization_id', organization.id)
    .select('project_id').maybeSingle()
  if (error || !data) return { error: 'The requirement could not be updated.' }
  revalidatePath(`/operations/projects/${data.project_id}`)
  return { success: 'Requirement updated.' }
}

export async function deleteRequirementAction(
  projectId: string,
  requirementId: string,
  _previous: RequirementActionState,
  form: FormData,
): Promise<RequirementActionState> {
  if (!isUuid(projectId) || !isUuid(requirementId)) return { error: 'That requirement is invalid.' }
  const { organization, supabase } = await context()
  // organization_id is redundant with RLS and stated anyway: a delete whose
  // filter is wrong deletes nothing rather than something else.
  const { data, error } = await supabase.from('requirements')
    .delete().eq('id', requirementId).eq('organization_id', organization.id)
    .select('id')
  if (error) return { error: 'The requirement could not be removed.' }
  if (!data || data.length === 0) return { error: 'That requirement no longer exists, or is not yours.' }
  revalidatePath(`/operations/projects/${projectId}`)
  return { success: 'Requirement removed.' }
}
```

`readFields` is shared between create and update rather than duplicated, since both need the identical validation and the identical field set — the only difference between the two actions is which row gets written to. `updateRequirementAction` reads `project_id` back from the update itself (via `.select('project_id')`) rather than requiring the caller to pass it separately, since the caller (an edit form scoped to one requirement) does not otherwise know which project it belongs to without an extra prop being threaded through.

`deleteRequirementAction` takes `projectId` as a bound argument (not read back from the deleted row) because a delete `.select('id')` after a successful delete still returns the deleted row's data in Supabase, but relying on that for the revalidation path would make the revalidation depend on the delete having found a row — simpler to bind the value the caller already has.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add features/delivery/actions/requirements.ts
git commit -m "feat(requirements): create, update and delete actions"
```

---

### Task 4: The Requirements tab

**Files:**
- Create: `features/delivery/components/project-requirements-panel.tsx`
- Modify: `features/delivery/components/project-detail-screen.tsx`, `app/(unison)/operations/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `RequirementRow` and `listRequirements` from Task 2; `createRequirementAction`, `updateRequirementAction`, `deleteRequirementAction` from Task 3; `selectOwnerOptions` and `type SelectableMember` from `features/delivery/form-options.ts` (already exists, unmodified); `type OrganizationMember` from `features/memberships/queries/list-organization-members.ts` (already exists) — `OrganizationMember` and `SelectableMember` are structurally identical (`{ userId, displayName, status }`, `SelectableMember` carrying no `email`/`roleId`), so an `OrganizationMember[]` from the page satisfies `SelectableMember[]` without any mapping.

- [ ] **Step 1: Read the patterns**

Read `features/delivery/components/project-governance-panel.tsx` in full for the register/table shape and `useActionState` wiring — this panel's create form follows it closely. Read `features/delivery/form-options.ts`'s `selectOwnerOptions` function and its doc comment in full before using it — the comment explains exactly why retention matters and what it returns.

- [ ] **Step 2: Build the panel**

`ProjectRequirementsPanel({ projectId, requirements, members }: { projectId: string; requirements: RequirementRow[]; members: SelectableMember[] })`, importing `type SelectableMember` from `../form-options`.

**`members` must be the RAW member list** — every member regardless of status, in `SelectableMember` shape (`{ userId, displayName, status }`) — not pre-filtered and not mapped to `{ id, name }`. `selectOwnerOptions` does its own active-filtering and retention internally; if the page filtered or reshaped the list before handing it to the panel, the function would have nothing left to retain against and the whole mechanism would silently stop working. This is exactly the kind of thing to get right here rather than discover later: the retention pattern only protects a field if the data it needs actually reaches it.

A single register (unlike Governance's four-tab sub-nav, since this panel covers only one entity): a table of existing requirements, each row showing title, priority, status, owner, target date, with an inline **Edit** control that expands that row into the update form, and a **Remove** control behind a confirmation dialog since deletion is irreversible. Below the table, the add form.

**The owner select in both the add and edit forms uses `selectOwnerOptions`, computed inside the panel from the one `members` list it receives:**

```tsx
import { selectOwnerOptions, type SelectableMember } from '../form-options'

// In the add form: no current owner yet, so the retention branch never fires --
// every option offered is a genuinely active member.
const addOwnerOptions = selectOwnerOptions(members)

// In the edit form for an existing requirement: the current owner, even one
// since removed from the organisation, must still appear -- this is the
// retention pattern the delivery-item, framework, phase, owner and client
// pickers already needed, applied here because THIS is the first edit path
// this codebase has built where the defect could recur for a sixth time.
const editOwnerOptions = selectOwnerOptions(members, requirement.ownerId)
```

**Status and priority selects** list `Draft/Approved/In Progress/Delivered/Verified` and `Low/Medium/High/Critical` respectively, matching `STATUSES`/`PRIORITIES` in Task 3's actions file exactly -- do not retype either vocabulary as a third copy; import nothing across the client/server boundary for this (client components cannot import from a `'use server'` file's exported non-function values), so restate the two arrays as local constants in this file with a comment pointing at `requirements.ts` as the source of truth the database enforces.

**Empty state:** "No requirements recorded" when the list is empty, matching the "No records yet." tone Governance already uses but naming the specific entity rather than a generic placeholder.

**Delete confirmation:** follow `ConfirmDeleteForm` in `features/platform-automation/components/platform-forms.tsx` -- a `window.confirm()` gate before submit, naming what will be removed and stating it cannot be undone.

- [ ] **Step 3: Add the tab**

In `project-detail-screen.tsx`, change line 23:

```tsx
const tabs = ["Overview", "Framework", "Delivery", "Governance", "Dependencies", "Requirements"] as const;
```

Extend the screen's props to take `requirements: RequirementRow[]` and `members: OrganizationMember[]` (imported as `type { OrganizationMember } from '@/features/memberships/queries/list-organization-members'`), and add the branch to the tab body alongside the existing `Governance`/`Dependencies` branches (around line 202-203), passing both straight through to `ProjectRequirementsPanel`.

- [ ] **Step 4: Fix the stale claim on the Overview tab**

At `project-detail-screen.tsx` around line 278, the "What this project tracks" section currently reads:

> There is no separate register for workstreams, requirements, risks, decisions, governance or benefits — those do not exist as tables yet, so they are not offered as tabs.

This sentence is already false for risks, decisions and governance (all three exist and are offered as tabs -- a pre-existing staleness from before this slice, not this task's to fix) and becomes false for requirements the moment this ships. **Fix only the word this task makes false.** Change the sentence to remove "requirements" from the list of things that do not exist:

```
There is no separate register for workstreams, risks, decisions, governance or benefits — those do not exist as tables yet, so they are not offered as tabs.
```

Leave "risks, decisions, governance" in the sentence exactly as they are, even though they are also wrong -- fixing those is not this task's job, and doing so here would be scope creep into a paragraph this slice does not own. Task 5 records that pre-existing staleness as a follow-up.

- [ ] **Step 5: Wire the page**

In `app/(unison)/operations/projects/[projectId]/page.tsx`, add `listRequirements(projectId)` to the existing `Promise.all` alongside `listDeliveryItems`, `listProjectDependencies` and `getProjectGovernance`. For the owner picker's member list, reuse the `members` already fetched on line 49 when there is an owner to resolve -- but that fetch is conditional (`project.owner_id ? await listOrganizationMembers() : []`), and the Requirements tab needs the full member list regardless of whether the project itself has an owner. Change that fetch to run unconditionally as part of the same `Promise.all`, since `listOrganizationMembers` is wrapped in `cache()` and this was already being called from within `listProjectDependencies` on every render regardless -- making it unconditional here costs no additional round trip, only removes the conditional that no longer reflects an actual saving.

Pass `requirements` and `members` (the **raw**, unfiltered `OrganizationMember[]` from `listOrganizationMembers()` -- do not filter or map it before this point; see Step 2's note on why) through to `ProjectDetailScreen`, which forwards both to `ProjectRequirementsPanel` unchanged.

- [ ] **Step 6: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 errors; suite passes; build clean.

```bash
git add features/delivery/components/project-requirements-panel.tsx features/delivery/components/project-detail-screen.tsx "app/(unison)/operations/projects/[projectId]/page.tsx"
git commit -m "feat(requirements): a Requirements tab with full CRUD and owner retention"
```

---

### Task 5: Guards, signed-in verification and follow-ups

**Files:**
- Create/modify: a guard test asserting the owner-retention pattern is actually used
- Modify: `docs/follow-ups.md`

- [ ] **Step 1: Write the retention guard**

Add to `tests/unit/ui-completeness.test.ts` (read its existing pattern first -- it already asserts source-derived facts about other panels the same way):

```ts
test('the requirements panel retains a removed owner rather than silently dropping the selection', () => {
  const panel = readFileSync(join(workspace, 'features', 'delivery', 'components', 'project-requirements-panel.tsx'), 'utf8')
  assert.match(panel, /selectOwnerOptions/, 'the owner picker must go through the retention pattern, not a raw member list')
})
```

- [ ] **Step 2: Prove it**

Temporarily replace the `selectOwnerOptions(...)` call with a raw `members` array in the file, run the test, confirm it fails, restore it, confirm it passes again. Paste the real failure output.

- [ ] **Step 3: Record the follow-ups**

Append to `docs/follow-ups.md`, under a new heading for this slice:

- **Governance has no RLS test coverage at all** -- `project_risks`, `project_decisions`, `approvals`, `approval_decisions` and `governance_artefacts` all ship with full CRUD RLS policies and zero tests proving any of the four operations are actually tenant-isolated. This was found while building Requirements, not caused by it.
- **The Overview tab's "what this project tracks" copy is still wrong for risks, decisions and governance** -- it claims those "do not exist as tables yet," which stopped being true when the Governance tab shipped. This slice fixed only the "requirements" clause it made false; the other three are pre-existing and still need a correction.
- **Requirements is now more capable than its four Governance siblings** (full CRUD vs. create-only, an owner picker vs. none) -- a real, visible inconsistency, decided deliberately rather than discovered by accident. Worth a future pass bringing Governance up to the same bar, not worth blocking this slice on.

```bash
git add tests/unit/ui-completeness.test.ts docs/follow-ups.md
git commit -m "test(requirements): guard the owner-retention pattern; record follow-ups"
```

- [ ] **Step 4: Signed-in verification**

Controller-run, against `unison-uat` (production) -- create a real project through the UI if one is not already available for this purpose, do not insert fixtures via SQL.

- [ ] Create a requirement with a title only; confirm it appears with default priority Medium and status Draft.
- [ ] Edit it: change status to Approved, assign an owner, set a target date; confirm the row updates and the owner's name (not a raw id) displays.
- [ ] Remove the assigned member from the organisation (or use an existing removed member if one exists); confirm the requirement still displays with the owner shown as "Former member," not blank and not deleted.
- [ ] Attempt to delete the requirement; confirm the confirmation dialog names it and states it cannot be undone; confirm on accept it is gone from the list.
- [ ] Confirm the Overview tab's "what this project tracks" paragraph no longer mentions "requirements" among the things that do not exist.
- [ ] Check `preview_logs` for anything unexpected, then delete every real record created for this verification (the project, if one was created solely for this purpose, and the requirement).

---

## Notes for the executor

- **This is Requirements, not Traceability.** No field, column, or UI control in this plan links a requirement to a delivery item or a piece of evidence. If a task's implementation naturally suggests adding one "while you're in there," that is exactly the scope creep the spec's "Out of scope" section exists to prevent -- do not add it.
- **`unison-uat` is production.** There is no separate database. Every SQL write in Task 1 must be deleted before the task ends; every UI verification in Task 5 must use real records created and then removed through the product, not left behind.
- **Governance's create-only shape is not a bug to silently fix elsewhere.** This plan builds full CRUD for Requirements specifically, by explicit decision. It does not touch Governance's files, and no task should "helpfully" add an edit button to Risks or Decisions while working nearby.
