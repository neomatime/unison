# Delivery Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A two-level Delivery Item hierarchy under a project, with framework-supplied level labels, where a third level is structurally impossible.

**Architecture:** One new table whose depth cap is carried by a composite foreign key through a generated column, not by triggers or application checks. Server components read; server actions write. The project detail page's Delivery tab becomes the surface, and the nine empty tabs beside it are deleted.

**Tech Stack:** Next.js 16 App Router, React 19 server actions with `useActionState`, Supabase Postgres 17 with RLS, zod, `node:test`.

## Global Constraints

- Migrations are an append-only log; never edit an applied one. Apply through the Supabase MCP.
- `on delete set null` on a composite foreign key **must** name its column list.
- Grants do not carry across a signature change, and `revoke ... from public` does not strip Supabase's default grant to `anon`.
- `pnpm test:rls` runs against the shared `unison-uat` project and is configured `--test-concurrency=1`; every fixture must be registered for `cleanup()`.
- `features/product-ui/components/record-collection-workspace.tsx` must **not** be modified.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- **A field in the UI is a claim that the product supports that capability. This slice removes nine; it must add none.**
- Health is **Healthy / Watch / At Risk / Critical**. `On Track` is deliberately absent — it is the schedule word, and `status` already carries schedule including `Blocked`.
- Status is **Not Started / In Progress / Blocked / Complete**.
- Out, and not to be quietly relaxed: user stories, tasks, sprints, story points, testing status, linked test cases, linked risks, dependency graphs, requirements coverage, defect status, traceability health, phase transition history.
- An unset framework label renders `Level 1` / `Level 2` — **never** an invented default like "Epic".

---

## File Structure

**Create**
- `supabase/migrations/20260906150000_delivery_items.sql`
- `features/delivery/schemas/delivery-item.ts` — status/health const arrays and the zod input schema
- `features/delivery/queries/list-delivery-items.ts` — the tree for one project
- `features/delivery/actions/create-delivery-item.ts`, `update-delivery-item.ts`, `set-delivery-item-archived.ts`
- `features/delivery/components/delivery-items-panel.tsx` — the Delivery tab
- `features/delivery/components/delivery-item-form.tsx` — create and edit
- `tests/integration/rls/delivery-items.test.ts`
- `tests/unit/delivery-item-schema.test.ts`

**Modify**
- `features/delivery/schemas/framework.ts` — level label fields
- `features/delivery/components/framework-form.tsx` — two label inputs
- `features/delivery/queries/get-framework.ts`, `list-frameworks.ts` — expose labels
- `features/delivery/actions/create-framework.ts`, `update-framework.ts` — persist labels
- `features/delivery/queries/get-project.ts` — expose the framework's labels for the tab
- `features/delivery/actions/update-project.ts` — a refusal when the framework cannot change
- `app/(unison)/operations/projects/[projectId]/page.tsx` — pass items and labels
- `features/delivery/components/project-detail-screen.tsx` — three tabs, new layout, panel mounted
- `tests/unit/ui-completeness.test.ts` — guards

---

### Task 1: Schema — the table, the depth cap, and the constraints that carry it

**Files:**
- Create: `supabase/migrations/20260906150000_delivery_items.sql`
- Test: `tests/integration/rls/delivery-items.test.ts`

**Interfaces:**
- Consumes: `public.is_member_of(uuid)`, `record_audit_event()`, `set_updated_at()` — all existing.
- Produces: `public.delivery_items`; `frameworks.level_1_label` / `level_2_label`; `projects` unique constraints `projects_id_org_unique (id, organization_id)` and `projects_id_framework_unique (id, framework_id)`.

The depth cap was probed against the live database before this plan was written. A stored generated column **is** accepted in a composite foreign key, and all seven scenarios behaved correctly. Do not substitute a trigger or an application check.

- [ ] **Step 1: Write the failing RLS specs**

Create `tests/integration/rls/delivery-items.test.ts`:

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

  const parent = await insertItem(client, { level: 1, name: 'Parent' })
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
})
```

- [ ] **Step 2: Run the specs to verify they fail**

Run: `pnpm test:rls`
Expected: failures — `delivery_items` does not exist.

- [ ] **Step 3: Write the migration**

Apply through the Supabase MCP `apply_migration` tool with name `delivery_items`, and save identical text to `supabase/migrations/20260906150000_delivery_items.sql`:

```sql
-- Composite targets. `projects` carried only a primary key, so the keys below
-- had nothing to reference. Both are additive and change no behaviour.
alter table public.projects
  add constraint projects_id_org_unique unique (id, organization_id);
alter table public.projects
  add constraint projects_id_framework_unique unique (id, framework_id);

-- Framework-supplied terminology for the two levels: Epic/Feature,
-- Work Package/Deliverable, Obligation/Control. Nullable, because an unset
-- label renders "Level 1" rather than an invented default -- defaulting to
-- "Epic" would assert a methodology the organisation has not chosen, which is
-- the opposite of what the generic model exists to do.
alter table public.frameworks
  add column level_1_label text,
  add column level_2_label text;

comment on column public.frameworks.level_1_label is
  'Label for level-1 delivery items. Null renders as "Level 1", never an invented default.';
comment on column public.frameworks.level_2_label is
  'Label for level-2 delivery items. Null renders as "Level 2", never an invented default.';

create table public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  -- Denormalised from the project deliberately: it is what makes the phase key
  -- below expressible. delivery_items_project_framework_fkey keeps it honest.
  framework_id uuid not null,
  level int not null,
  parent_id uuid,
  -- Generated, never written by the application. This is the column that lets a
  -- foreign key say "the parent is a level-1 item", which no single-column key
  -- can express. Verified against Postgres 17: a stored generated column is
  -- accepted in a composite foreign key.
  parent_level int generated always as (case when parent_id is null then null else 1 end) stored,
  name text not null,
  description text,
  owner_id uuid,
  status text not null default 'Not Started',
  health text not null default 'Healthy',
  current_phase_id uuid,
  start_date date,
  target_date date,
  -- Plumbing for later external identity mapping. Null throughout the pilot,
  -- invisible to users, claims nothing. Retrofitting this onto populated data
  -- is what it exists to avoid.
  source_system text,
  external_reference text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint delivery_items_level_check check (level in (1, 2)),
  constraint delivery_items_shape_check check (
    (level = 1 and parent_id is null) or (level = 2 and parent_id is not null)
  ),
  -- Health omits 'On Track' deliberately: `status` already carries schedule,
  -- including Blocked, so an item could otherwise read "Blocked / On Track".
  constraint delivery_items_status_check check (status in ('Not Started', 'In Progress', 'Blocked', 'Complete')),
  constraint delivery_items_health_check check (health in ('Healthy', 'Watch', 'At Risk', 'Critical')),
  constraint delivery_items_id_level_project_unique unique (id, level, project_id),

  constraint delivery_items_organization_fkey foreign key (organization_id)
    references public.organizations (id) on delete cascade,
  constraint delivery_items_project_fkey foreign key (project_id, organization_id)
    references public.projects (id, organization_id) on delete cascade,
  constraint delivery_items_project_framework_fkey foreign key (project_id, framework_id)
    references public.projects (id, framework_id),
  constraint delivery_items_phase_fkey foreign key (framework_id, current_phase_id)
    references public.framework_phases (framework_id, id) on delete set null (current_phase_id),
  constraint delivery_items_owner_fkey foreign key (organization_id, owner_id)
    references public.memberships (organization_id, user_id) on delete set null (owner_id),
  -- The depth cap. Three guarantees in one key: the parent exists, it is level 1
  -- (parent_level generates to 1 whenever parent_id is set), and it is in the
  -- same project. `no action` on delete is a backstop against a direct database
  -- delete orphaning a level-2 item; there is no delete policy on this table.
  constraint delivery_items_parent_fkey foreign key (parent_id, parent_level, project_id)
    references public.delivery_items (id, level, project_id)
);

comment on constraint delivery_items_parent_fkey on public.delivery_items is
  'Makes a third level unrepresentable: a level-2 item cannot be the parent of anything, because parent_level is always 1 and only level-1 rows match.';

create index delivery_items_project_idx on public.delivery_items (project_id, archived_at);
create index delivery_items_parent_idx on public.delivery_items (parent_id);

alter table public.delivery_items enable row level security;

create policy delivery_items_select on public.delivery_items
  for select using (public.is_member_of(organization_id));
create policy delivery_items_insert on public.delivery_items
  for insert with check (public.is_member_of(organization_id));
create policy delivery_items_update on public.delivery_items
  for update using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));
-- Deliberately no delete policy. Archive only, as with projects and frameworks.

create trigger delivery_items_audit
  after insert or delete or update on public.delivery_items
  for each row execute function public.record_audit_event();
create trigger delivery_items_set_updated_at
  before update on public.delivery_items
  for each row execute function public.set_updated_at();
```

- [ ] **Step 4: Extend the RLS cleanup helper**

`cleanup()` in `tests/integration/rls/helpers.ts` deletes an organisation through `delete_organization()` and then sweeps `audit_events`. Read it, and confirm `delivery_items` rows are removed when their organisation is deleted — they are, via `delivery_items_organization_fkey ... on delete cascade` — and that any `audit_events` rows this table's trigger writes are swept by the existing resource loop. **If the sweep enumerates resources by name, add `delivery_items` to it.** State in your report which of the two you found.

- [ ] **Step 5: Regenerate types**

Supabase MCP `generate_typescript_types`, written to `types/database.ts`.

- [ ] **Step 6: Run the specs to verify they pass**

Run: `pnpm test:rls`
Expected: PASS, no failures.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260906150000_delivery_items.sql tests/integration/rls/delivery-items.test.ts types/database.ts
git commit -m "feat(db): add delivery items with a structurally unrepresentable third level"
```

---

### Task 2: Framework level labels, end to end

**Files:**
- Modify: `features/delivery/schemas/framework.ts`, `features/delivery/actions/create-framework.ts`, `features/delivery/actions/update-framework.ts`, `features/delivery/queries/get-framework.ts`, `features/delivery/components/framework-form.tsx`
- Test: `tests/unit/framework-schema.test.ts`

**Interfaces:**
- Consumes: `frameworks.level_1_label` / `level_2_label` from Task 1.
- Produces: `frameworkInputSchema` gains `level1Label` and `level2Label`, both `string → string | null`; `FrameworkDetail` gains `level1Label: string | null` and `level2Label: string | null`; `levelLabel(level: 1 | 2, framework: { level1Label: string | null; level2Label: string | null }): string` exported from `features/delivery/schemas/framework.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/framework-schema.test.ts`:

```ts
test('level labels are optional and empty becomes null', () => {
  const result = frameworkInputSchema.safeParse({ name: 'F', type: 'Enterprise', level1Label: '', level2Label: '  ' })
  assert.equal(result.success, true)
  assert.equal(result.data!.level1Label, null)
  assert.equal(result.data!.level2Label, null)
})

test('level labels are trimmed and kept when set', () => {
  const result = frameworkInputSchema.safeParse({ name: 'F', type: 'Enterprise', level1Label: ' Epic ', level2Label: 'Feature' })
  assert.equal(result.data!.level1Label, 'Epic')
  assert.equal(result.data!.level2Label, 'Feature')
})

test('an unset label falls back to a neutral level name, never an invented one', () => {
  // Defaulting to "Epic" would assert a methodology the organisation has not
  // chosen, which is the opposite of what the generic model exists to do.
  assert.equal(levelLabel(1, { level1Label: null, level2Label: null }), 'Level 1')
  assert.equal(levelLabel(2, { level1Label: null, level2Label: null }), 'Level 2')
  assert.equal(levelLabel(1, { level1Label: 'Obligation', level2Label: 'Control' }), 'Obligation')
  assert.equal(levelLabel(2, { level1Label: 'Obligation', level2Label: 'Control' }), 'Control')
})
```

Add `levelLabel` to the existing import from `../../features/delivery/schemas/framework.ts`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test --experimental-strip-types tests/unit/framework-schema.test.ts`
Expected: FAIL — `levelLabel` is not exported and the schema rejects the extra keys' expectations.

- [ ] **Step 3: Extend the schema module**

In `features/delivery/schemas/framework.ts`, add to `frameworkInputSchema`:

```ts
  level1Label: z.string().trim().optional().or(z.literal('')).transform((value) => value || null),
  level2Label: z.string().trim().optional().or(z.literal('')).transform((value) => value || null),
```

and export:

```ts
/**
 * The label a framework gives a delivery-item level, or a neutral fallback.
 *
 * The fallback is deliberately "Level 1" rather than "Epic": an unset label
 * means the organisation has not chosen a methodology term, and inventing one
 * would claim a methodology on its behalf.
 */
export function levelLabel(level: 1 | 2, framework: { level1Label: string | null; level2Label: string | null }) {
  const label = level === 1 ? framework.level1Label : framework.level2Label
  return label ?? `Level ${level}`
}
```

- [ ] **Step 4: Persist and expose the labels**

In `create-framework.ts` and `update-framework.ts`, add `level_1_label: parsed.data.level1Label` and `level_2_label: parsed.data.level2Label` to the insert and update objects.

In `get-framework.ts`, select `level_1_label, level_2_label` and map them onto `FrameworkDetail` as `level1Label` and `level2Label`.

- [ ] **Step 5: Add the two form fields**

In `features/delivery/components/framework-form.tsx`, inside the existing `FormSection`, add two `TextField`s named `level1Label` and `level2Label`, labelled **"Level 1 term"** and **"Level 2 term"**, with `defaultValue={framework?.level1Label}` / `level2Label`, and placeholders `Epic` and `Feature`.

The section needs one line of description text: `Delivery items use these words for their two levels. Leave blank to use "Level 1" and "Level 2".` A placeholder is a hint; the description is what stops a reader assuming blank means Epic.

- [ ] **Step 6: Run the tests and commit**

Run: `pnpm typecheck && pnpm test`
Expected: 0 errors; suite passes.

```bash
git add features/delivery/schemas/framework.ts features/delivery/actions/create-framework.ts features/delivery/actions/update-framework.ts features/delivery/queries/get-framework.ts features/delivery/components/framework-form.tsx tests/unit/framework-schema.test.ts
git commit -m "feat(frameworks): let a framework name its two delivery-item levels"
```

---

### Task 3: The delivery item schema module and query

**Files:**
- Create: `features/delivery/schemas/delivery-item.ts`, `features/delivery/queries/list-delivery-items.ts`
- Test: `tests/unit/delivery-item-schema.test.ts`

**Interfaces:**
- Consumes: `delivery_items` from Task 1; `PROJECT_HEALTHS` from `features/delivery/schemas/project.ts`; `bandFor` from `features/delivery/overview-bands.ts`.
- Produces:
  - `DELIVERY_ITEM_STATUSES = ['Not Started','In Progress','Blocked','Complete'] as const`
  - `DELIVERY_ITEM_HEALTHS = ['Healthy','Watch','At Risk','Critical'] as const`
  - `deliveryItemInputSchema`
  - `listDeliveryItems(projectId: string): Promise<DeliveryItemNode[]>` where `DeliveryItemNode = DeliveryItem & { children: DeliveryItem[] }` and `DeliveryItem = { id, level, name, description: string | null, ownerName: string, status, health, phaseName: string | null, phaseArchived: boolean, startDate: string | null, targetDate: string | null, archivedAt: string | null }`

`phaseArchived` is what the tab renders the "Archived in framework" qualifier from. It is a boolean on the view-model, not a lookup in the component.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/delivery-item-schema.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { bandFor, HEALTH_BANDS } from '../../features/delivery/overview-bands.ts'
import { PROJECT_HEALTHS } from '../../features/delivery/schemas/project.ts'
import { DELIVERY_ITEM_HEALTHS, DELIVERY_ITEM_STATUSES, deliveryItemInputSchema } from '../../features/delivery/schemas/delivery-item.ts'

test('status is the four work states, and health omits On Track', () => {
  assert.deepEqual([...DELIVERY_ITEM_STATUSES], ['Not Started', 'In Progress', 'Blocked', 'Complete'])
  assert.deepEqual([...DELIVERY_ITEM_HEALTHS], ['Healthy', 'Watch', 'At Risk', 'Critical'])
})

test('health is a narrowing of the project vocabulary, not a fork', () => {
  // Every delivery-item health must be a project health that bandFor already
  // handles, so item health aggregates through the existing briefing bands with
  // no new mapping. This is the test that keeps the narrowing a narrowing.
  for (const health of DELIVERY_ITEM_HEALTHS) {
    assert.ok(PROJECT_HEALTHS.includes(health), `${health} must be a member of PROJECT_HEALTHS`)
    assert.ok(HEALTH_BANDS.includes(bandFor(health)), `bandFor must map ${health} to a known band`)
  }
})

test('On Track is deliberately absent, because status already carries schedule', () => {
  // An item that is Blocked cannot also be On Track; offering both invites a
  // row that reads "Blocked / On Track".
  assert.equal(DELIVERY_ITEM_HEALTHS.includes('On Track' as never), false)
})

test('a level 1 item may not name a parent, and a level 2 item must', () => {
  const base = { name: 'Item', status: 'Not Started', health: 'Healthy' }
  assert.equal(deliveryItemInputSchema.safeParse({ ...base, level: '1', parentId: '' }).success, true)
  assert.equal(deliveryItemInputSchema.safeParse({ ...base, level: '1', parentId: '3f3b2bbc-a9e8-46d4-8dfb-083cc5a2b5a0' }).success, false)
  assert.equal(deliveryItemInputSchema.safeParse({ ...base, level: '2', parentId: '' }).success, false)
  assert.equal(deliveryItemInputSchema.safeParse({ ...base, level: '2', parentId: '3f3b2bbc-a9e8-46d4-8dfb-083cc5a2b5a0' }).success, true)
})

test('a third level cannot be parsed', () => {
  const result = deliveryItemInputSchema.safeParse({ name: 'Deep', status: 'Not Started', health: 'Healthy', level: '3', parentId: '' })
  assert.equal(result.success, false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test --experimental-strip-types tests/unit/delivery-item-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema module**

Create `features/delivery/schemas/delivery-item.ts`:

```ts
import { z } from 'zod'

/** Where the work is. */
export const DELIVERY_ITEM_STATUSES = ['Not Started', 'In Progress', 'Blocked', 'Complete'] as const

/**
 * What condition the work is in.
 *
 * 'On Track' is deliberately absent. It is a schedule statement, and
 * DELIVERY_ITEM_STATUSES already carries schedule including 'Blocked', so
 * offering both would allow an item to read "Blocked / On Track". Every value
 * here is a member of PROJECT_HEALTHS and is handled by bandFor(), so this is a
 * narrowing of the project vocabulary rather than a second one.
 */
export const DELIVERY_ITEM_HEALTHS = ['Healthy', 'Watch', 'At Risk', 'Critical'] as const

const optionalUuid = z.string().uuid().optional().or(z.literal('')).transform((value) => value || null)
const optionalText = z.string().trim().optional().or(z.literal('')).transform((value) => value || null)
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date as yyyy-mm-dd.')
  .refine((value) => new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, 'That date does not exist.')
  .optional().or(z.literal('')).transform((value) => value || null)

export const deliveryItemInputSchema = z.object({
  name: z.string().trim().min(1, 'A name is required.'),
  description: optionalText,
  level: z.enum(['1', '2']).transform((value) => Number(value) as 1 | 2),
  parentId: optionalUuid,
  ownerId: optionalUuid,
  status: z.enum(DELIVERY_ITEM_STATUSES),
  health: z.enum(DELIVERY_ITEM_HEALTHS),
  currentPhaseId: optionalUuid,
  startDate: optionalDate,
  targetDate: optionalDate,
}).refine(
  (value) => (value.level === 1 ? value.parentId === null : value.parentId !== null),
  { message: 'A level 2 item needs a parent, and a level 1 item cannot have one.', path: ['parentId'] },
)

export type DeliveryItemInput = z.infer<typeof deliveryItemInputSchema>
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test --experimental-strip-types tests/unit/delivery-item-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the query**

Create `features/delivery/queries/list-delivery-items.ts`:

```ts
import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'

export type DeliveryItem = {
  id: string
  level: 1 | 2
  name: string
  description: string | null
  /** Resolved name, or 'Unassigned' / 'Former member'. Never a raw uuid. */
  ownerName: string
  status: string
  health: string
  phaseName: string | null
  /** Drives the "Archived in framework" qualifier. The component does no lookup. */
  phaseArchived: boolean
  startDate: string | null
  targetDate: string | null
  archivedAt: string | null
}

export type DeliveryItemNode = DeliveryItem & { children: DeliveryItem[] }

/**
 * The project's delivery items as a two-level tree.
 *
 * Two levels is a schema guarantee (delivery_items_parent_fkey), so this
 * assembles one pass of parents and one of children rather than recursing.
 */
export async function listDeliveryItems(projectId: string): Promise<DeliveryItemNode[]> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [rows, members] = await Promise.all([
    supabase.from('delivery_items')
      .select('id, level, parent_id, name, description, owner_id, status, health, start_date, target_date, archived_at, current_phase_id, framework_phases(name, archived_at)')
      .eq('project_id', projectId)
      .eq('organization_id', organization.id)
      .is('archived_at', null)
      .order('level')
      .order('name'),
    listOrganizationMembers(),
  ])
  if (rows.error) throw rows.error

  const names = new Map(members.map((member) => [member.userId, member.displayName]))
  const map = (row: (typeof rows.data)[number]): DeliveryItem => ({
    id: row.id,
    level: row.level as 1 | 2,
    name: row.name,
    description: row.description,
    // 'Former member' covers an owner whose membership row was deleted outright
    // rather than marked removed -- the same fallback list-projects.ts uses.
    ownerName: row.owner_id ? names.get(row.owner_id) ?? 'Former member' : 'Unassigned',
    status: row.status,
    health: row.health,
    phaseName: row.framework_phases?.name ?? null,
    phaseArchived: row.framework_phases?.archived_at !== null && row.framework_phases?.archived_at !== undefined,
    startDate: row.start_date,
    targetDate: row.target_date,
    archivedAt: row.archived_at,
  })

  const all = rows.data ?? []
  return all.filter((row) => row.level === 1).map((parent) => ({
    ...map(parent),
    children: all.filter((row) => row.parent_id === parent.id).map(map),
  }))
}
```

- [ ] **Step 6: Typecheck, test and commit**

Run: `pnpm typecheck && pnpm test`
Expected: 0 errors; suite passes.

```bash
git add features/delivery/schemas/delivery-item.ts features/delivery/queries/list-delivery-items.ts tests/unit/delivery-item-schema.test.ts
git commit -m "feat(delivery-items): add the schema module and the project tree query"
```

---

### Task 4: Actions

**Files:**
- Create: `features/delivery/actions/create-delivery-item.ts`, `update-delivery-item.ts`, `set-delivery-item-archived.ts`
- Modify: `features/delivery/actions/update-project.ts`

**Interfaces:**
- Consumes: `deliveryItemInputSchema` from Task 3.
- Produces:
  - `createDeliveryItemAction(projectId: string, _prev, formData)` — bound with `.bind(null, projectId)`
  - `updateDeliveryItemAction(id: string, projectId: string, _prev, formData)` — bound with `.bind(null, id, projectId)`
  - `setDeliveryItemArchivedAction(_prev, formData)` — fields `id`, `projectId`, `archived`

None redirect; each returns `{}` or `{ error }` after revalidating the project route.

- [ ] **Step 1: Write create-delivery-item**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { deliveryItemInputSchema } from '../schemas/delivery-item'

export async function createDeliveryItemAction(projectId: string, _prev: { error?: string } | undefined, formData: FormData) {
  const parsed = deliveryItemInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  // framework_id is read from the project rather than accepted from the form:
  // delivery_items_project_framework_fkey would refuse a mismatch anyway, and a
  // value the caller cannot influence is one fewer thing to validate.
  const { data: project, error: projectError } = await supabase
    .from('projects').select('framework_id')
    .eq('id', projectId).eq('organization_id', organization.id).maybeSingle()
  if (projectError) return { error: 'The delivery item could not be created.' }
  if (!project) return { error: 'That project no longer exists, or is not yours.' }

  const { error } = await supabase.from('delivery_items').insert({
    organization_id: organization.id,
    project_id: projectId,
    framework_id: project.framework_id,
    level: parsed.data.level,
    parent_id: parsed.data.parentId,
    name: parsed.data.name,
    description: parsed.data.description,
    owner_id: parsed.data.ownerId,
    status: parsed.data.status,
    health: parsed.data.health,
    current_phase_id: parsed.data.currentPhaseId,
    start_date: parsed.data.startDate,
    target_date: parsed.data.targetDate,
  }).select('id').single()

  // What the database can still refuse after zod: an owner from another
  // organisation, a phase from another framework, or a parent that is not a
  // level-1 item of this project. The copy names those three and nothing else.
  if (error) return { error: 'The delivery item could not be created. Check the owner, phase and parent.' }

  revalidatePath(`/operations/projects/${projectId}`)
  return {}
}
```

- [ ] **Step 2: Write update-delivery-item**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { deliveryItemInputSchema } from '../schemas/delivery-item'

export async function updateDeliveryItemAction(
  id: string,
  projectId: string,
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const parsed = deliveryItemInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  // level and parent_id are deliberately absent from this update. Changing an
  // item's level, or reparenting it, is not in this slice — and omitting the
  // columns is what makes that true rather than merely intended. The form
  // still submits them, because the schema's level/parent refinement needs
  // both to validate; the action ignores them.
  const { data, error } = await supabase.from('delivery_items').update({
    name: parsed.data.name,
    description: parsed.data.description,
    owner_id: parsed.data.ownerId,
    status: parsed.data.status,
    health: parsed.data.health,
    current_phase_id: parsed.data.currentPhaseId,
    start_date: parsed.data.startDate,
    target_date: parsed.data.targetDate,
  }).eq('id', id).eq('organization_id', organization.id).select('id')

  // What the database can still refuse after zod: an owner from another
  // organisation, or a phase from another framework.
  if (error) return { error: 'The delivery item could not be saved. Check the owner and phase.' }
  // Without .select() an update matching no rows is indistinguishable from one
  // that saved: RLS and the organisation filter both express "not yours" as
  // zero rows, not as an error.
  if (!data?.length) return { error: 'That delivery item no longer exists, or is not yours to edit.' }

  revalidatePath(`/operations/projects/${projectId}`)
  return {}
}
```

- [ ] **Step 3: Write set-delivery-item-archived, with the children refusal**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Archive and restore. A level-1 item with unarchived children is refused.
 *
 * This one rule lives here rather than in the schema, and the distinction
 * matters: a level-2 item whose parent is archived is not invalid data -- the
 * foreign key still holds, because archived_at does not affect referential
 * integrity -- it is merely confusing. Schema constraints are for impossible
 * states; this is a workflow rule.
 */
export async function setDeliveryItemArchivedAction(_prev: { error?: string } | undefined, formData: FormData) {
  const id = formData.get('id')?.toString()
  const projectId = formData.get('projectId')?.toString()
  const archived = formData.get('archived')?.toString() === 'true'
  if (!id || !projectId) return { error: 'No delivery item was named.' }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  if (archived) {
    const { count, error: childError } = await supabase
      .from('delivery_items')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', id)
      .eq('organization_id', organization.id)
      .is('archived_at', null)
    if (childError) return { error: 'The delivery item could not be archived.' }
    if (count && count > 0) {
      return { error: `Archive or move the ${count} item${count === 1 ? '' : 's'} beneath this one first.` }
    }
  }

  const { data, error } = await supabase.from('delivery_items')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id).eq('organization_id', organization.id).select('id')

  if (error) return { error: `The delivery item could not be ${archived ? 'archived' : 'restored'}.` }
  if (!data?.length) return { error: 'That delivery item no longer exists, or is not yours to change.' }

  revalidatePath(`/operations/projects/${projectId}`)
  return {}
}
```

- [ ] **Step 4: Give updateProjectAction an honest refusal for a blocked framework change**

`delivery_items_project_framework_fkey` references `projects (id, framework_id)`, so changing a project's framework while delivery items exist raises a foreign-key violation. That refusal is correct — the items' phases belong to the old framework and would be meaningless under the new one — but it currently surfaces as the generic "could not be saved" message.

In `features/delivery/actions/update-project.ts`, before the existing generic branch:

```ts
  if (error?.code === '23503') {
    return { error: 'This project has delivery items recorded under its current framework, so the framework cannot be changed. Archive them first.' }
  }
```

Add a comment naming `delivery_items_project_framework_fkey` as the constraint, so the next reader knows which relationship produces it.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: 0 errors.

```bash
git add features/delivery/actions/create-delivery-item.ts features/delivery/actions/update-delivery-item.ts features/delivery/actions/set-delivery-item-archived.ts features/delivery/actions/update-project.ts
git commit -m "feat(delivery-items): add create, update and archive actions"
```

---

### Task 5: The Delivery tab

**Files:**
- Create: `features/delivery/components/delivery-items-panel.tsx`
- Modify: `app/(unison)/operations/projects/[projectId]/page.tsx`, `features/delivery/queries/get-project.ts`

**Interfaces:**
- Consumes: `listDeliveryItems`, `DeliveryItemNode` from Task 3; `levelLabel` from Task 2; `setDeliveryItemArchivedAction` from Task 4.
- Produces: `DeliveryItemsPanel({ projectId, items, labels }: { projectId: string; items: DeliveryItemNode[]; labels: { level1Label: string | null; level2Label: string | null } })`.

- [ ] **Step 1: Expose the framework's labels on the project**

In `get-project.ts`, extend the framework embed to select `level_1_label, level_2_label` alongside `name`, so the detail page can pass them down without a second query.

- [ ] **Step 2: Fetch the items in the route**

In `app/(unison)/operations/projects/[projectId]/page.tsx`, after the project loads, `const items = await listDeliveryItems(projectId)`, and pass `items` plus the framework's two labels into `ProjectDetailScreen`.

- [ ] **Step 3: Build the panel**

`'use client'`. Renders level-1 items with their children nested beneath.

**Required, and nothing beyond it.** Each row shows: name, owner, status, health, current phase, target date. Level-1 rows are headed by `levelLabel(1, labels)` and their children by `levelLabel(2, labels)`.

**The archived-phase qualifier.** Where `item.phaseArchived` is true, the phase cell renders the phase name with a second line reading `Archived in framework`, in muted text — not a badge, not a warning colour, not an alert. The phase is a legitimate recorded state, not an error, and styling it as a problem would overstate it. Where `phaseArchived` is false, no second line.

**Row shape, which the spec requires and a reviewer will check.** Render each row from a single item object rather than positional cells, and lay the detail out as a stack of sections rather than a fixed grid, so a later "why / impact" line is an addition rather than a re-cut. Do not add any such field now.

Controls: **Add {level-1 label}** at the panel head; on each level-1 row, **Add {level-2 label}** — which is what makes the parent implicit and means no control anywhere offers a third level. Each row carries Edit and Archive; archive is gated behind `ConfirmationDialog` and submits a real form with `requestSubmit()`, copying `project-detail-screen.tsx`'s existing pattern. An archived item shows Restore instead, with no confirmation. Render `state?.error` from `useActionState` in a `role="alert"` element — the archive action refuses when children block it, and that refusal must reach the user.

Empty state: `No delivery items are recorded for this project yet.`

- [ ] **Step 4: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 errors; suite passes; build clean.

```bash
git add features/delivery/components/delivery-items-panel.tsx features/delivery/queries/get-project.ts "app/(unison)/operations/projects/[projectId]/page.tsx"
git commit -m "feat(delivery-items): show the two-level hierarchy on the project"
```

---

### Task 6: Create and edit forms

**Files:**
- Create: `features/delivery/components/delivery-item-form.tsx`
- Modify: `features/delivery/queries/list-project-form-options.ts`

**Interfaces:**
- Consumes: `deliveryItemInputSchema`, `DELIVERY_ITEM_STATUSES`, `DELIVERY_ITEM_HEALTHS` from Task 3; the actions from Task 4; `selectOwnerOptions` and `selectPhaseOptions` from `features/delivery/form-options.ts`.
- Produces: `DeliveryItemForm` rendered in a dialog from the panel.

- [ ] **Step 1: Extend the form options query for delivery items**

`listProjectFormOptions` already returns members and phases with retention. Add an exported `listDeliveryItemFormOptions(projectId: string, current?: { ownerId?: string | null; phaseId?: string | null })` to the same module, returning `{ members, phases }` for **that project's framework only**, reusing `selectOwnerOptions` and `selectPhaseOptions` unchanged.

This is the fifth and sixth instance of the retention rule. Do not write new retention logic — import the existing functions.

- [ ] **Step 2: Build the form**

Modelled on `features/delivery/components/project-form.tsx`: `useActionState`, `<form action={formAction}>`, and the shared field components.

Fields: `name` (required), `description` (textarea), `ownerId` (`EntitySelectField`, `emptyLabel="Unassigned"`), `status` (`SelectField`, `DELIVERY_ITEM_STATUSES`), `health` (`SelectField`, `DELIVERY_ITEM_HEALTHS`), `currentPhaseId` (`EntitySelectField`, `emptyLabel="Not set"`), `startDate` and `targetDate` (date).

`level` and `parentId` are **hidden inputs**, set from where the user clicked. There is no level control and no parent picker — that is the UI half of the depth cap.

On edit, `level` and `parentId` are still submitted but the action ignores them, and the form must not present either as changeable.

- [ ] **Step 3: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 errors; suite passes; build clean.

```bash
git add features/delivery/components/delivery-item-form.tsx features/delivery/queries/list-project-form-options.ts
git commit -m "feat(delivery-items): create and edit items, with picker retention"
```

---

### Task 7: Three tabs, laid out as the product surface

**Files:**
- Modify: `features/delivery/components/project-detail-screen.tsx`

**Interfaces:**
- Consumes: `DeliveryItemsPanel` from Task 5.

- [ ] **Step 1: Delete nine tabs and their configurations**

Remove `Workstreams`, `Requirements`, `Documents`, `Processes`, `Testing`, `Risks`, `Decisions`, `Governance`, `Benefits` from the `tabs` array and delete each one's `CollectionConfig`. Delete the now-unused `people` array of fabricated names (`'Neo Morake'`, `'Amara Dlamini'`, and the rest) and any `baseFields` helper left with no callers.

`tabs` becomes `['Overview', 'Framework', 'Delivery'] as const`.

- [ ] **Step 2: Mount the panel**

The `Delivery` tab renders `<DeliveryItemsPanel projectId={project.id} items={items} labels={labels} />`.

- [ ] **Step 3: Re-lay out the strip for three**

The current strip is `className="mt-5 flex gap-1 overflow-x-auto border-b border-border"` — built for twelve and scrolling. Three tabs in a scroll container sized for twelve look like nine are missing.

Size it to its contents: drop `overflow-x-auto`, and give the three tabs comfortable spacing so the strip reads as complete. **No placeholder tabs, no "coming soon", no disabled entries** — a disabled tab is the same unbacked claim in a duller colour.

The test a reviewer will apply: could a first-time viewer tell that tabs were removed?

- [ ] **Step 4: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 errors; suite passes; build clean. If a `ui-completeness` guard fails here, read it before assuming it is wrong — Task 8 updates the guards deliberately.

```bash
git add features/delivery/components/project-detail-screen.tsx
git commit -m "feat(projects): three real tabs, and nine that claimed nothing are gone"
```

---

### Task 8: Guards

**Files:**
- Modify: `tests/unit/ui-completeness.test.ts`

- [ ] **Step 1: Write the guards**

Append:

```ts
test('the project detail page offers no tab without a table behind it', () => {
  // Nine tabs rendered empty registers over tables that do not exist, which the
  // file itself admitted in a comment. The Frameworks slice deleted five
  // equivalent tabs; leaving these would put nine unbacked claims beside a tab
  // that is now real, which makes them read as more credible, not less.
  const screen = readFileSync(join(workspace, 'features', 'delivery', 'components', 'project-detail-screen.tsx'), 'utf8')

  const tabsMatch = screen.match(/const tabs\s*=\s*\[([^\]]*)\]/)
  assert.ok(tabsMatch, 'the tabs array was not found in the expected shape')
  const tabs = [...tabsMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(tabs, ['Overview', 'Framework', 'Delivery'])

  for (const gone of ['Workstreams', 'Requirements', 'Processes', 'Testing', 'Risks', 'Decisions', 'Benefits']) {
    assert.ok(!screen.includes(`'${gone}'`), `the ${gone} tab has no table behind it and must not return`)
  }

  // The same six fabricated names the registry was scrubbed of survived here
  // one file away, because that guard slices registry.ts only.
  for (const invented of ['Neo Morake', 'Amara Dlamini', 'Thabo Mokoena', 'Naledi Maseko', 'Lethabo Nkosi', 'Mia Daniels']) {
    assert.ok(!screen.includes(invented), `"${invented}" is a fabricated person and must not survive`)
  }
})

test('nothing offers a third delivery-item level', () => {
  // The depth cap is structural in the database. This pins the UI half: the
  // level is derived from where the user clicked, never chosen, so no control
  // can offer a third.
  const form = readFileSync(join(workspace, 'features', 'delivery', 'components', 'delivery-item-form.tsx'), 'utf8')
  assert.match(form, /name="level"[^>]*type="hidden"|type="hidden"[^>]*name="level"/, 'level must be a hidden input, not a control')
  assert.ok(!/'3'/.test(form), 'no level 3 may appear anywhere in the form')

  const schema = readFileSync(join(workspace, 'features', 'delivery', 'schemas', 'delivery-item.ts'), 'utf8')
  assert.match(schema, /z\.enum\(\['1', '2'\]\)/, 'the schema must accept only levels 1 and 2')
})

test('an archived current phase is disclosed rather than shown as current', () => {
  // Retention keeps the data honest; this keeps the display honest. An item
  // still in a phase its framework has archived must say so.
  const panel = readFileSync(join(workspace, 'features', 'delivery', 'components', 'delivery-items-panel.tsx'), 'utf8')
  assert.match(panel, /phaseArchived/, 'the panel must read the phaseArchived flag')
  assert.ok(panel.includes('Archived in framework'), 'the qualifier text must be present')
})
```

- [ ] **Step 2: Prove each guard fails**

Break each of the three deliberately — restore one deleted tab name, change the schema enum to include `'3'`, remove the qualifier text — confirm the matching test fails, then restore. Record the observed failures in your report. A guard that has never failed is not yet a guard.

- [ ] **Step 3: Run everything and commit**

Run: `pnpm typecheck && pnpm test && pnpm test:rls && pnpm build`
Expected: 0 errors; both suites pass; build clean.

```bash
git add tests/unit/ui-completeness.test.ts
git commit -m "test(delivery-items): guard the depth cap, the deleted tabs and the phase qualifier"
```

---

### Task 9: Signed-in verification

Controller-run, with the human partner signed in. Not delegated — the defects that reached production on the two preceding slices were only visible to a person using the page.

- [ ] **Step 1** — set two level labels on a framework; confirm they appear as the headings on a project using it, and that a framework with them unset reads "Level 1" / "Level 2".
- [ ] **Step 2** — create a level-1 item and a level-2 item beneath it; verify both rows in the database, including `level`, `parent_id`, `framework_id` and `organization_id`.
- [ ] **Step 3** — confirm no control anywhere offers a third level, and that a crafted submit with `level=3` is refused.
- [ ] **Step 4** — set owner, status, health, current phase and target date on each; confirm each persisted.
- [ ] **Step 5** — archive the phase an item is in, from the framework screen. Confirm the item keeps its `current_phase_id`, that the panel shows **Archived in framework**, and that the picker retains it for that item while omitting it for a new one.
- [ ] **Step 6** — attempt to archive the level-1 item while its child is live; confirm the refusal names the child count. Archive the child, then the parent; restore both.
- [ ] **Step 7** — attempt to change the project's framework while items exist; confirm the refusal is the specific message, not "could not be saved".
- [ ] **Step 8** — confirm the tab strip reads as three deliberate tabs, then check `preview_logs` and delete every fixture created.

---

## Notes for the executor

- **The depth cap was verified before this plan was written.** A stored generated column is accepted in a composite foreign key on Postgres 17, and all seven scenarios behaved correctly. If a task finds otherwise, stop and report — every other task depends on it.
- **Do not add a field.** The exclusion list in Global Constraints is the spec's, not a suggestion, and the phase qualifier is the only new piece of secondary information in this slice.
- **The retention functions already exist.** Task 6 imports `selectOwnerOptions` and `selectPhaseOptions`; it does not write new ones. This is the fifth instance of that defect class and the codebase already knows the shape.
