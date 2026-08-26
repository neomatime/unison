# Delivery Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the Projects module end to end against Postgres, replacing the delivery mock data, so a second module confirms the Clients foundation generalises.

**Architecture:** Three new tables — `frameworks`, `framework_phases`, `projects` — each with `is_member_of(organization_id)` RLS, `set_updated_at` and `record_audit_event` triggers, and no delete policy. Composite foreign keys make cross-framework phases and cross-tenant client references unrepresentable rather than merely discouraged. The module mirrors `features/clients/` exactly: zod schema, server-only queries, server actions.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5.7, Supabase (Postgres 17), zod, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-26-delivery-projects-design.md`

## Global Constraints

- Migrations are applied through the Supabase MCP **first**, then the local file in `supabase/migrations/` is named after the version Supabase assigned. Never invent a version number.
- Every `security definer` function sets `search_path = ''`.
- No table gets a delete policy. Archiving via `archived_at` is the only removal path.
- Queries and actions that touch the database import `'server-only'` or are marked `'use server'`.
- Never fabricate a zero. A count with no backing table renders `'—'`, matching `list-clients.ts`.
- `pnpm test` and `npx tsc --noEmit` must both pass before any commit.
- RLS tests run with `pnpm test:rls` (needs `.env.local`), and are **not** part of `pnpm test`.

---

### Task 1: Frameworks and phases

**Files:**
- Create: `supabase/migrations/<assigned>_delivery_frameworks.sql`
- Create: `tests/integration/rls/delivery-frameworks.test.ts`
- Modify: `tests/integration/rls/helpers.ts` (extend `cleanup`)

**Interfaces:**
- Consumes: `is_member_of(uuid)`, `set_updated_at()`, `record_audit_event()` — all existing.
- Produces: tables `public.frameworks(id, organization_id, name, type, version, archived_at, created_at, updated_at)` and `public.framework_phases(id, framework_id, organization_id, name, position)`. Task 2's `projects` table references both by composite key.

- [ ] **Step 1: Apply the migration through the Supabase MCP**

Use `apply_migration` with name `delivery_frameworks` and this SQL:

```sql
create table public.frameworks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text,
  version text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint frameworks_name_unique unique (organization_id, name),
  -- Referenced by framework_phases and projects. A unique constraint on
  -- exactly these columns is what lets those tables key on (id, organization_id).
  constraint frameworks_id_org_unique unique (id, organization_id)
);

create table public.framework_phases (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null,
  -- Carried rather than reached through the parent so the RLS policy is a
  -- direct column test like every other table. The composite FK below is what
  -- stops it diverging from the framework's own organization_id.
  organization_id uuid not null,
  name text not null,
  position integer not null,
  constraint framework_phases_position_unique unique (framework_id, position),
  constraint framework_phases_name_unique unique (framework_id, name),
  -- Referenced by projects(framework_id, phase_id). Column order matches the
  -- referencing clause exactly.
  constraint framework_phases_framework_id_unique unique (framework_id, id),
  constraint framework_phases_framework_fkey
    foreign key (framework_id, organization_id)
    references public.frameworks (id, organization_id) on delete cascade
);

create index frameworks_org_idx on public.frameworks (organization_id, archived_at);
create index framework_phases_framework_idx on public.framework_phases (framework_id, position);

alter table public.frameworks enable row level security;
alter table public.framework_phases enable row level security;

create policy frameworks_select on public.frameworks
  for select to authenticated using (is_member_of(organization_id));
create policy frameworks_insert on public.frameworks
  for insert to authenticated with check (is_member_of(organization_id));
create policy frameworks_update on public.frameworks
  for update to authenticated
  using (is_member_of(organization_id)) with check (is_member_of(organization_id));

create policy framework_phases_select on public.framework_phases
  for select to authenticated using (is_member_of(organization_id));
create policy framework_phases_insert on public.framework_phases
  for insert to authenticated with check (is_member_of(organization_id));
create policy framework_phases_update on public.framework_phases
  for update to authenticated
  using (is_member_of(organization_id)) with check (is_member_of(organization_id));

create trigger frameworks_set_updated_at before update on public.frameworks
  for each row execute function set_updated_at();
create trigger frameworks_audit after insert or update or delete on public.frameworks
  for each row execute function record_audit_event();
create trigger framework_phases_audit after insert or update or delete on public.framework_phases
  for each row execute function record_audit_event();
```

- [ ] **Step 2: Apply the seed migration through the Supabase MCP**

`framework_id` is `not null` on `projects`, so an organisation with no frameworks
cannot create one. Name this migration `seed_delivery_frameworks`:

```sql
-- Seeds every existing organization with the six frameworks the delivery
-- screens already reference by name, so projects can be created immediately.
-- Client Onboarding gets its own six stages: the mock onboardingStages list
-- differs from the eight delivery phases, which is the reason phases belong to
-- a framework rather than being global.
do $$
declare
  org record;
  fw_id uuid;
  fw record;
  phase_name text;
  idx integer;
begin
  for org in select id from public.organizations loop
    for fw in
      select * from (values
        ('Business / Technology Change', 'Enterprise',   'v3.2'),
        ('Automation Implementation',    'Technology',   'v2.4'),
        ('Client Onboarding',            'Operations',   'v4.1'),
        ('Regulatory Change',            'Compliance',   'v2.8'),
        ('Digital Transformation',       'Enterprise',   'v5.0'),
        ('Product Launch',               'Commercial',   'v1.9')
      ) as t(name, type, version)
    loop
      insert into public.frameworks (organization_id, name, type, version)
      values (org.id, fw.name, fw.type, fw.version)
      on conflict (organization_id, name) do nothing
      returning id into fw_id;

      if fw_id is null then
        continue;
      end if;

      idx := 1;
      foreach phase_name in array (
        case when fw.name = 'Client Onboarding'
          then array['Welcome','Company Setup','Information & Documentation','Agreements','Review & Approval','Go Live / Handover']
          else array['Initiate','Discover','Design','Build','Test','Ready','Deploy','Measure']
        end
      ) loop
        insert into public.framework_phases (framework_id, organization_id, name, position)
        values (fw_id, org.id, phase_name, idx);
        idx := idx + 1;
      end loop;

      fw_id := null;
    end loop;
  end loop;
end $$;
```

- [ ] **Step 3: Save both migrations locally under their assigned versions**

List migrations via the MCP to read the versions Supabase assigned, then write
each file to `supabase/migrations/<version>_<name>.sql` with the identical SQL.

- [ ] **Step 4: Extend cleanup to remove framework audit rows**

`helpers.ts` documents a rule: every new audit-writing path must be traceable
back to a fixture or its rows leak into the shared database. `frameworks_audit`
and `framework_phases_audit` are two such paths. In `cleanup()`, alongside the
existing `clientEvents` query, add:

```ts
    const { data: deliveryEvents, error: deliveryEventsError } = await admin
      .from('audit_events')
      .select('id')
      .is('organization_id', null)
      .in('resource', ['frameworks', 'framework_phases'])
      .or(`old_value->>organization_id.eq.${id},new_value->>organization_id.eq.${id}`)
    if (deliveryEventsError) errors.push(deliveryEventsError)
```

and include `...(deliveryEvents ?? [])` in the `auditIds` array.

- [ ] **Step 5: Write the failing RLS test**

Create `tests/integration/rls/delivery-frameworks.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgA: string
let orgB: string
let userA: { id: string; email: string; password: string }
let frameworkA: string

before(async () => {
  orgA = await createFixtureOrg('frameworks-a')
  orgB = await createFixtureOrg('frameworks-b')
  userA = await createFixtureUser(orgA, 'owner')

  const { data, error } = await admin
    .from('frameworks')
    .insert({ organization_id: orgB, name: 'Org B Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id')
    .single()
  if (error) throw error
  frameworkA = data.id
})

after(async () => {
  await cleanup([orgA, orgB], [userA.id])
})

test('a member cannot read another organization\'s frameworks', async () => {
  const client = await signedInClient(userA.email, userA.password)
  const { data, error } = await client.from('frameworks').select('id').eq('id', frameworkA)
  assert.equal(error, null)
  assert.deepEqual(data, [], 'org B framework must be invisible to an org A member')
})

test('a member cannot insert a framework into another organization', async () => {
  const client = await signedInClient(userA.email, userA.password)
  const { error } = await client
    .from('frameworks')
    .insert({ organization_id: orgB, name: 'Smuggled', type: 'Enterprise', version: 'v1.0' })
  assert.ok(error, 'insert into another org must be refused by RLS')
})

test('a phase cannot be attached to a framework in another organization', async () => {
  // organization_id is the caller's own, framework_id is org B's. RLS alone
  // would allow this; the composite FK is what rejects it.
  const client = await signedInClient(userA.email, userA.password)
  const { error } = await client
    .from('framework_phases')
    .insert({ framework_id: frameworkA, organization_id: orgA, name: 'Smuggled', position: 1 })
  assert.ok(error, 'cross-tenant phase must be refused')
})

test('no delete policy exists, so frameworks cannot be deleted', async () => {
  const client = await signedInClient(userA.email, userA.password)
  const { data: own, error: insertError } = await admin
    .from('frameworks')
    .insert({ organization_id: orgA, name: 'Deletable?', type: 'Enterprise', version: 'v1.0' })
    .select('id')
    .single()
  if (insertError) throw insertError

  await client.from('frameworks').delete().eq('id', own.id)

  const { data: still } = await admin.from('frameworks').select('id').eq('id', own.id)
  assert.equal(still?.length, 1, 'row must survive: no delete policy grants this')
})
```

- [ ] **Step 6: Run the RLS tests**

Run: `pnpm test:rls`
Expected: all four tests in `delivery-frameworks.test.ts` PASS. If the seed ran
correctly, `select count(*) from frameworks` for HIMARK's org returns 6.

- [ ] **Step 7: Verify the seed produced the right phase counts**

Via the Supabase MCP `execute_sql`:

```sql
select f.name, count(p.id) as phases
from public.frameworks f
left join public.framework_phases p on p.framework_id = f.id
group by f.name order by f.name;
```

Expected: `Client Onboarding` has 6, every other framework has 8.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations tests/integration/rls
git commit -m "feat(delivery): add frameworks and their phases"
```

---

### Task 2: The projects table

**Files:**
- Create: `supabase/migrations/<assigned>_delivery_projects.sql`
- Create: `tests/integration/rls/delivery-projects.test.ts`
- Modify: `types/database.ts` (regenerate)
- Modify: `tests/integration/rls/helpers.ts` (extend `cleanup` for `projects`)

**Interfaces:**
- Consumes: `frameworks (id, organization_id)` and `framework_phases (framework_id, id)` from Task 1.
- Produces: table `public.projects`. Task 3's queries select `id, name, status, health, progress, next_gate, due_date, updated_at, archived_at, client_id, framework_id, phase_id, owner_id`.

- [ ] **Step 1: Apply the migration through the Supabase MCP**

Name it `delivery_projects`:

```sql
-- Needed so projects can key on (client_id, organization_id). Additive: it
-- changes no existing behaviour, since (id) is already unique as the PK.
alter table public.clients
  add constraint clients_id_org_unique unique (id, organization_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Null for internal change work; set when the project is delivered for a client.
  client_id uuid,
  name text not null,
  framework_id uuid not null,
  phase_id uuid,
  owner_id uuid references auth.users(id) on delete set null,
  status text not null default 'Active'
    check (status in ('Active', 'On Hold', 'Complete', 'Cancelled')),
  health text not null default 'On Track'
    check (health in ('On Track', 'Healthy', 'Watch', 'At Risk', 'Critical')),
  progress smallint not null default 0 check (progress >= 0 and progress <= 100),
  next_gate text,
  due_date date,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A plain phase_id FK would let a project on Client Onboarding sit in the
  -- Build phase, since both are valid phase rows. This makes that
  -- unrepresentable instead of relying on application code to check.
  constraint projects_phase_fkey
    foreign key (framework_id, phase_id)
    references public.framework_phases (framework_id, id) on delete set null,

  -- Tenant isolation, not tidiness. The RLS insert check validates only
  -- projects.organization_id; it does not verify that client_id belongs to the
  -- same organisation. Without this, a crafted insert can hold a live
  -- cross-tenant reference. client_id is nullable and MATCH SIMPLE skips the
  -- check when it is null, which is exactly right for internal work.
  constraint projects_client_fkey
    foreign key (client_id, organization_id)
    references public.clients (id, organization_id) on delete set null,

  constraint projects_framework_fkey
    foreign key (framework_id, organization_id)
    references public.frameworks (id, organization_id)
);

create index projects_org_idx on public.projects (organization_id, archived_at);
create index projects_client_idx on public.projects (organization_id, client_id);
create index projects_name_trgm_idx on public.projects using gin (name gin_trgm_ops);

alter table public.projects enable row level security;

create policy projects_select on public.projects
  for select to authenticated using (is_member_of(organization_id));
create policy projects_insert on public.projects
  for insert to authenticated with check (is_member_of(organization_id));
create policy projects_update on public.projects
  for update to authenticated
  using (is_member_of(organization_id)) with check (is_member_of(organization_id));

create trigger projects_set_updated_at before update on public.projects
  for each row execute function set_updated_at();
create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function record_audit_event();
```

- [ ] **Step 2: Save the migration locally under its assigned version**

- [ ] **Step 3: Add `projects` to the cleanup audit sweep**

In `helpers.ts`, add `'projects'` to the `.in('resource', [...])` array added in
Task 1 Step 4, so it reads
`.in('resource', ['frameworks', 'framework_phases', 'projects'])`.

- [ ] **Step 4: Write the failing RLS test**

Create `tests/integration/rls/delivery-projects.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgA: string
let orgB: string
let userA: { id: string; email: string; password: string }
let frameworkA: string
let phaseA: string
let otherFrameworkPhase: string
let clientB: string

before(async () => {
  orgA = await createFixtureOrg('projects-a')
  orgB = await createFixtureOrg('projects-b')
  userA = await createFixtureUser(orgA, 'owner')

  const { data: fwA, error: fwAError } = await admin
    .from('frameworks').insert({ organization_id: orgA, name: 'A Framework' }).select('id').single()
  if (fwAError) throw fwAError
  frameworkA = fwA.id

  const { data: phase, error: phaseError } = await admin
    .from('framework_phases')
    .insert({ framework_id: frameworkA, organization_id: orgA, name: 'Build', position: 1 })
    .select('id').single()
  if (phaseError) throw phaseError
  phaseA = phase.id

  const { data: fwOther, error: fwOtherError } = await admin
    .from('frameworks').insert({ organization_id: orgA, name: 'Other Framework' }).select('id').single()
  if (fwOtherError) throw fwOtherError
  const { data: otherPhase, error: otherPhaseError } = await admin
    .from('framework_phases')
    .insert({ framework_id: fwOther.id, organization_id: orgA, name: 'Welcome', position: 1 })
    .select('id').single()
  if (otherPhaseError) throw otherPhaseError
  otherFrameworkPhase = otherPhase.id

  const { data: client, error: clientError } = await admin
    .from('clients')
    .insert({ organization_id: orgB, name: 'Org B Client', status: 'Active', health: 'Healthy' })
    .select('id').single()
  if (clientError) throw clientError
  clientB = client.id
})

after(async () => {
  await cleanup([orgA, orgB], [userA.id])
})

test('a member can create a project in their own organization', async () => {
  const client = await signedInClient(userA.email, userA.password)
  const { error } = await client.from('projects').insert({
    organization_id: orgA, name: 'Own Project', framework_id: frameworkA, phase_id: phaseA,
  })
  assert.equal(error, null)
})

test('a project cannot reference a client in another organization', async () => {
  // This is the hole RLS alone leaves open: organization_id is the caller's,
  // so the insert policy passes. Only the composite FK rejects it.
  const client = await signedInClient(userA.email, userA.password)
  const { error } = await client.from('projects').insert({
    organization_id: orgA, name: 'Cross-tenant', framework_id: frameworkA, client_id: clientB,
  })
  assert.ok(error, 'cross-tenant client_id must be refused')
  assert.match(error.message, /foreign key|violates/i)
})

test('a project cannot sit in a phase from a different framework', async () => {
  const client = await signedInClient(userA.email, userA.password)
  const { error } = await client.from('projects').insert({
    organization_id: orgA, name: 'Wrong phase', framework_id: frameworkA, phase_id: otherFrameworkPhase,
  })
  assert.ok(error, 'phase from another framework must be refused')
})

test('progress outside 0-100 is refused', async () => {
  const client = await signedInClient(userA.email, userA.password)
  const { error } = await client.from('projects').insert({
    organization_id: orgA, name: 'Bad progress', framework_id: frameworkA, progress: 140,
  })
  assert.ok(error, 'check constraint must reject progress above 100')
})

test('a member cannot read another organization\'s projects', async () => {
  const { data: theirs, error: insertError } = await admin
    .from('projects')
    .insert({ organization_id: orgB, name: 'Org B Project', framework_id: (
      await admin.from('frameworks').insert({ organization_id: orgB, name: 'B Framework' }).select('id').single()
    ).data!.id })
    .select('id').single()
  if (insertError) throw insertError

  const client = await signedInClient(userA.email, userA.password)
  const { data } = await client.from('projects').select('id').eq('id', theirs.id)
  assert.deepEqual(data, [], 'org B project must be invisible')
})
```

- [ ] **Step 5: Run the RLS tests**

Run: `pnpm test:rls`
Expected: all five tests in `delivery-projects.test.ts` PASS.

- [ ] **Step 6: Regenerate the database types**

Use the Supabase MCP `generate_typescript_types` and write the result to
`types/database.ts`. Stale types have caused failures on this project before.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations tests/integration/rls types/database.ts
git commit -m "feat(delivery): add the projects table with tenant-safe foreign keys"
```

---

### Task 3: Schema and queries

**Files:**
- Create: `features/delivery/schemas/project.ts`
- Create: `features/delivery/queries/list-projects.ts`
- Create: `features/delivery/queries/get-project.ts`
- Create: `tests/unit/project-schema.test.ts`

**Interfaces:**
- Consumes: `public.projects` from Task 2; `getSessionContext()` and `createServerSupabase()`, both existing.
- Produces: `projectInputSchema`, `type ProjectInput`, `listProjects(params)` returning `{ records, total, page, pageSize }`, `getProject(id)` returning a row or null, `type ProjectRecord`. Task 4 imports `projectInputSchema`; Task 5 imports `listProjects` and `getProject`.

- [ ] **Step 1: Write the failing schema test**

Create `tests/unit/project-schema.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { projectInputSchema } from '../../features/delivery/schemas/project.ts'

test('a name is required', () => {
  const result = projectInputSchema.safeParse({ name: '', frameworkId: crypto.randomUUID() })
  assert.equal(result.success, false)
})

test('a framework is required', () => {
  const result = projectInputSchema.safeParse({ name: 'Claims Intake' })
  assert.equal(result.success, false)
})

test('empty optional fields become null rather than empty strings', () => {
  // The database distinguishes "not set" from "set to nothing"; the form only
  // ever sends strings, so the schema is where that distinction is restored.
  const result = projectInputSchema.parse({
    name: 'Claims Intake', frameworkId: '11111111-1111-4111-8111-111111111111',
    clientId: '', phaseId: '', ownerId: '', nextGate: '', dueDate: '', notes: '',
  })
  assert.equal(result.clientId, null)
  assert.equal(result.phaseId, null)
  assert.equal(result.dueDate, null)
  assert.equal(result.notes, null)
})

test('progress is coerced from the form string and bounded', () => {
  assert.equal(projectInputSchema.parse({
    name: 'X', frameworkId: '11111111-1111-4111-8111-111111111111', progress: '74',
  }).progress, 74)

  assert.equal(projectInputSchema.safeParse({
    name: 'X', frameworkId: '11111111-1111-4111-8111-111111111111', progress: '140',
  }).success, false)
})

test('status and health default to the same values as the column defaults', () => {
  const parsed = projectInputSchema.parse({ name: 'X', frameworkId: '11111111-1111-4111-8111-111111111111' })
  assert.equal(parsed.status, 'Active')
  assert.equal(parsed.health, 'On Track')
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test --experimental-strip-types tests/unit/project-schema.test.ts`
Expected: FAIL — cannot find module `features/delivery/schemas/project.ts`.

- [ ] **Step 3: Write the schema**

Create `features/delivery/schemas/project.ts`:

```ts
import { z } from 'zod'

const optionalText = z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null)
const optionalUuid = z.string().uuid().optional().or(z.literal('')).transform((v) => v || null)

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required.').max(200),
  frameworkId: z.string().uuid('Choose a delivery framework.'),
  // Null for internal change work.
  clientId: optionalUuid,
  phaseId: optionalUuid,
  ownerId: optionalUuid,
  status: z.enum(['Active', 'On Hold', 'Complete', 'Cancelled']).default('Active'),
  health: z.enum(['On Track', 'Healthy', 'Watch', 'At Risk', 'Critical']).default('On Track'),
  // FormData delivers everything as a string; coerce before bounding so "140"
  // is rejected by the range check rather than passing as a truthy string.
  progress: z.coerce.number().int().min(0).max(100).default(0),
  nextGate: optionalText,
  dueDate: z.string().optional().or(z.literal('')).transform((v) => v || null),
  notes: optionalText,
})

export type ProjectInput = z.infer<typeof projectInputSchema>
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test --experimental-strip-types tests/unit/project-schema.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Write the list query**

Create `features/delivery/queries/list-projects.ts`:

Note the record type. `ProjectsScreen` renders `RecordCollectionWorkspace`,
which takes `CollectionRecord` — **not** the `MockRecord` that `list-clients.ts`
returns. `CollectionRecord` requires a `context` field that `MockRecord` has no
concept of, so returning the wrong one fails typecheck at the call site.

```ts
import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { CollectionRecord } from '@/features/product-ui/components/record-collection-workspace'

const PAGE_SIZE = 25

// ilike treats % and _ as wildcards and \ as its escape character — escape all
// three so a search for a literal underscore matches the text, not more rows.
export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

// Only these three columns may be ordered on. Passing params.sort straight to
// .order() would let a query string name any column in the table.
export function sortColumn(sort: string | undefined): 'name' | 'status' | 'updated_at' {
  return sort === 'name' ? 'name' : sort === 'status' ? 'status' : 'updated_at'
}

export async function listProjects(params: { q?: string; status?: string; sort?: string; page?: number }) {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()
  const page = Math.max(1, params.page ?? 1)

  let query = supabase
    .from('projects')
    .select(
      'id, name, status, health, progress, next_gate, due_date, updated_at, frameworks(name), framework_phases(name), clients(name)',
      { count: 'exact' },
    )
    .eq('organization_id', organization.id)
    .is('archived_at', null)

  if (params.q) query = query.ilike('name', `%${escapeLikePattern(params.q)}%`)
  if (params.status) query = query.eq('status', params.status)

  const column = sortColumn(params.sort)
  query = query.order(column, { ascending: column === 'name' })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const { data, error, count } = await query
  if (error) throw error

  const records: CollectionRecord[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    health: row.health,
    // CollectionRecord requires this; the existing screen used the framework
    // name as the row's supporting line, so it keeps doing so.
    context: row.frameworks?.name ?? '—',
    framework: row.frameworks?.name ?? '—',
    phase: row.framework_phases?.name ?? '—',
    client: row.clients?.name ?? '—',
    owner: '—', // Owner is a user id; resolving names needs a profiles join. Not fabricated.
    nextGate: row.next_gate ?? '—',
    due: row.due_date
      ? new Date(row.due_date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—',
    progress: `${row.progress}%`,
    updated: new Date(row.updated_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }),
  }))

  return { records, total: count ?? 0, page, pageSize: PAGE_SIZE }
}
```

- [ ] **Step 6: Write the detail query**

Create `features/delivery/queries/get-project.ts`:

```ts
import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function getProject(id: string) {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('projects')
    .select('*, frameworks(id, name), framework_phases(id, name), clients(id, name)')
    .eq('organization_id', organization.id)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export type ProjectRecord = NonNullable<Awaited<ReturnType<typeof getProject>>>
```

- [ ] **Step 7: Write tests for the query helpers**

The query itself needs a database, but its two decision points are pure and are
where the bugs live. Create `tests/unit/project-query-helpers.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { escapeLikePattern, sortColumn } from '../../features/delivery/queries/list-projects.ts'

test('wildcards in a search term are escaped to literals', () => {
  // Without this, searching "big_corp" also matches "bigXcorp", and "50%"
  // matches every row — the count and the visible rows then disagree.
  assert.equal(escapeLikePattern('big_corp'), 'big\\_corp')
  assert.equal(escapeLikePattern('50%'), '50\\%')
  assert.equal(escapeLikePattern('back\\slash'), 'back\\\\slash')
})

test('an ordinary search term is unchanged', () => {
  assert.equal(escapeLikePattern('Claims Intake'), 'Claims Intake')
})

test('only known columns can be sorted on', () => {
  assert.equal(sortColumn('name'), 'name')
  assert.equal(sortColumn('status'), 'status')
  assert.equal(sortColumn(undefined), 'updated_at')
  // Anything else falls back rather than reaching .order() as-is.
  assert.equal(sortColumn('notes'), 'updated_at')
  assert.equal(sortColumn('owner_id'), 'updated_at')
})
```

Note this imports from a `'server-only'` module. If `node:test` refuses to load
it, move both helpers to `features/delivery/queries/list-projects-helpers.ts`
without the `'server-only'` import, and have `list-projects.ts` re-export them.

- [ ] **Step 8: Run the helper tests**

Run: `node --test --experimental-strip-types tests/unit/project-query-helpers.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 9: Typecheck and run the full suite**

Run: `npx tsc --noEmit && pnpm test`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 10: Commit**

```bash
git add features/delivery/schemas features/delivery/queries tests/unit/project-schema.test.ts tests/unit/project-query-helpers.test.ts
git commit -m "feat(delivery): add the project schema and queries"
```

---

### Task 4: Actions

**Files:**
- Create: `features/delivery/actions/create-project.ts`
- Create: `features/delivery/actions/update-project.ts`
- Create: `features/delivery/actions/archive-project.ts`

**Interfaces:**
- Consumes: `projectInputSchema` from Task 3.
- Produces: `createProjectAction(_prev, formData)`, `updateProjectAction(id, _prev, formData)`, `archiveProjectAction(formData)`. Task 5's forms bind to these.

- [ ] **Step 1: Write the create action**

Create `features/delivery/actions/create-project.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { projectInputSchema } from '../schemas/project'

export async function createProjectAction(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = projectInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.from('projects').insert({
    organization_id: organization.id,
    name: parsed.data.name,
    framework_id: parsed.data.frameworkId,
    phase_id: parsed.data.phaseId,
    client_id: parsed.data.clientId,
    owner_id: parsed.data.ownerId,
    status: parsed.data.status,
    health: parsed.data.health,
    progress: parsed.data.progress,
    next_gate: parsed.data.nextGate,
    due_date: parsed.data.dueDate,
    notes: parsed.data.notes,
  }).select('id').single()

  // The composite foreign keys reject a client or phase belonging elsewhere.
  // That is a caller mistake, not a server fault, so it reads as a refusal
  // rather than a crash.
  if (error) return { error: 'The project could not be created. Check the client, framework and phase selected.' }

  revalidatePath('/operations/projects')
  redirect(`/operations/projects/${data.id}`)
}
```

- [ ] **Step 2: Write the update action**

Create `features/delivery/actions/update-project.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { projectInputSchema } from '../schemas/project'

export async function updateProjectAction(id: string, _prev: { error?: string } | undefined, formData: FormData) {
  const parsed = projectInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { error } = await supabase.from('projects').update({
    name: parsed.data.name,
    framework_id: parsed.data.frameworkId,
    phase_id: parsed.data.phaseId,
    client_id: parsed.data.clientId,
    owner_id: parsed.data.ownerId,
    status: parsed.data.status,
    health: parsed.data.health,
    progress: parsed.data.progress,
    next_gate: parsed.data.nextGate,
    due_date: parsed.data.dueDate,
    notes: parsed.data.notes,
  }).eq('id', id).eq('organization_id', organization.id)

  if (error) return { error: 'The project could not be saved.' }

  revalidatePath('/operations/projects')
  revalidatePath(`/operations/projects/${id}`)
  redirect(`/operations/projects/${id}`)
}
```

- [ ] **Step 3: Write the archive action**

Create `features/delivery/actions/archive-project.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

// There is no delete policy on projects, by design. Archiving sets
// archived_at, which every list query already filters on.
export async function archiveProjectAction(formData: FormData) {
  const id = formData.get('id')?.toString()
  if (!id) return

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from('projects')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organization.id)
  if (error) throw error

  revalidatePath('/operations/projects')
  redirect('/operations/projects')
}
```

- [ ] **Step 4: Typecheck and run the suite**

Run: `npx tsc --noEmit && pnpm test`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add features/delivery/actions
git commit -m "feat(delivery): add project create, update and archive actions"
```

---

### Task 5: Wire the screens to the database

**Files:**
- Modify: `features/delivery/components/projects-screen.tsx`
- Modify: `features/delivery/components/project-table.tsx`
- Modify: `app/(unison)/operations/projects/page.tsx`
- Modify: `tests/unit/ui-completeness.test.ts`

**Interfaces:**
- Consumes: `listProjects` from Task 3.
- Produces: nothing later tasks depend on. This is the last task.

- [ ] **Step 1: Make ProjectsScreen take its records as a prop**

`features/delivery/components/projects-screen.tsx` is written as very dense
single-line code. Make exactly three edits and change nothing else:

1. Delete the line `import { deliveryProjects } from '../data'`.
2. Add `import type { CollectionRecord } from '@/features/product-ui/components/record-collection-workspace'`.
3. Replace

```tsx
export function ProjectsScreen(){const records=deliveryProjects.map((project)=>({...}));return <>
```

with

```tsx
export function ProjectsScreen({ records }: { records: CollectionRecord[] }){return <>
```

deleting the whole `const records=deliveryProjects.map(...)` expression — the
`listProjects` query already produces that shape, including `context`.

Leave the metric cards and the three summary panels exactly as they are. They
show counts for gates, approvals and vendor dependencies, none of which have
backing tables yet. Replacing them with zeros would state something false;
they stay mock until their own slice lands.

- [ ] **Step 2: Leave ProjectTable on the mocks, deliberately**

Do **not** convert `features/delivery/components/project-table.tsx`. It renders
`project.blockers`, `project.dependencies` and a numeric `project.progress` —
and `blockers` and `dependencies` are precisely the two fields the spec refuses
to model, because they are counts of rows in tables that do not exist. Wiring
it to the database now would mean inventing zeros for both.

It is used by the delivery overview, which stays mock-backed in this slice.
Confirm it is not on the projects route:

Run: `grep -rn "ProjectTable" app/ features/`
Expected: no match under `app/(unison)/operations/projects/`.

- [ ] **Step 3: Make the route fetch real projects**

Replace `app/(unison)/operations/projects/page.tsx` with:

```tsx
import { ProjectsScreen } from '@/features/delivery/components/projects-screen'
import { listProjects } from '@/features/delivery/queries/list-projects'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const status = typeof params.status === 'string' ? params.status : undefined
  const sort = typeof params.sort === 'string' ? params.sort : undefined
  const parsedPage = typeof params.page === 'string' ? Number(params.page) : undefined
  const page = parsedPage !== undefined && Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : undefined

  const { records } = await listProjects({ q, status, sort, page })

  return <ProjectsScreen records={records} />
}
```

- [ ] **Step 4: Update the UI completeness test**

`tests/unit/ui-completeness.test.ts` checks that routes exist, not what they
import — line 13 maps `['projects', 'operations/projects']` and line 36 checks
`['operations/projects', 'projectId']`. Both stay true, so no existing
assertion should need changing. If one does fail, read it before editing: a
failure here means a route or screen went missing, which is a real regression,
not a test to update.

Add one assertion that the route is genuinely wired to the database:

```ts
test('the projects route reads from the database, not the delivery mocks', () => {
  const source = readFileSync('app/(unison)/operations/projects/page.tsx', 'utf8')
  assert.match(source, /listProjects/)
  assert.doesNotMatch(source, /features\/delivery\/data/)
})
```

- [ ] **Step 5: Run the full gate**

Run: `npx tsc --noEmit && pnpm test && pnpm build`
Expected: tsc exit 0; all tests pass; build succeeds.

- [ ] **Step 6: Verify in the browser**

Start the dev server via `preview_start` with `{name: "unison-dev"}`, sign in,
and visit `/operations/projects`. Confirm:
- the list renders from the database (empty at first — no projects are seeded)
- creating a project through `/operations/projects/new` lands on its detail page
- the created project appears in the list
- searching by name narrows the list and the count agrees with the rows shown

If the dev server exits on startup, another `next dev` is already running for
this project — Next refuses a second. Check with
`Get-CimInstance Win32_Process -Filter "Name='node.exe'"` and stop it first.

- [ ] **Step 7: Record the provisioning gap**

Append to `docs/follow-ups.md`:

```markdown
## New tenants have no delivery frameworks

`projects.framework_id` is `not null`, and the seed migration only covered
organizations that existed when it ran. Provisioning a new tenant must create
that organization's frameworks and phases, or the first thing a new customer
meets at /operations/projects/new is a form they cannot submit.
```

- [ ] **Step 8: Commit**

```bash
git add features/delivery/components app/\(unison\)/operations/projects tests/unit/ui-completeness.test.ts docs/follow-ups.md
git commit -m "feat(delivery): read projects from the database"
```

---

## Done when

> **Corrected 2026-08-26, after the whole-branch review.** The criteria below
> were written for a slice that included the write path. This plan's own tasks
> never wired one: no task asks any form to call a server action, so the branch
> could satisfy every step and still not do what these criteria claim. The
> original wording is kept verbatim, with each line marked, so the difference
> between what was claimed and what shipped stays visible.

- **True.** `/operations/projects` reads from Postgres
- **Not delivered.** ~~search, filter, sort and pagination agree with the record count~~ —
  `listProjects` implements all four server-side, but nothing drives them: the
  page discards `total`, `page` and `pageSize`, and `RecordCollectionWorkspace`
  searches, filters and pages in local state over the 25 rows it was handed.
  No URL can set `?q=`. Rows past the first page of the server query are
  unreachable from the UI (finding F5)
- **Not delivered.** ~~a project can be created, edited and archived through the UI~~ —
  `createProjectAction`, `updateProjectAction` and `archiveProjectAction` exist
  and their policies are covered by `tests/integration/rls/delivery-projects.test.ts`,
  but no form calls any of them. `/operations/projects/new` and
  `/operations/projects/[projectId]/edit` render a wizard whose submit handler
  sets local state, and the register's own create/edit/archive controls call
  `setRecords`. Nothing in the UI writes to `public.projects` (findings F2, F8)
- **Partly true.** ~~no project route imports `features/delivery/data.ts`~~ — the
  three route files do not, and neither does the register or the detail screen
  any more. `features/delivery/components/project-form.tsx`, which the `new`
  and `edit` routes render, still imports the mock `frameworks` array to
  populate its framework picker
- **True.** `pnpm test:rls` passes, including the cross-tenant `client_id` and wrong-framework phase rejections
- **True.** `npx tsc --noEmit`, `pnpm test` and `pnpm build` are all green

### What this branch actually delivers

A **read-only projects register**, plus the whole database half of the slice:

- `public.frameworks`, `public.framework_phases` and `public.projects`, with
  composite tenant-scoped foreign keys, RLS on all three, no delete policy,
  audit and `updated_at` triggers, and the frameworks seed
- `listProjects` and `getProject`, both org-scoped
- `/operations/projects` rendering real rows, and
  `/operations/projects/[projectId]` rendering the real record it names, 404ing
  when the id does not resolve in the caller's organisation
- three server actions that are written and whose database-level behaviour is
  tested, waiting on a caller

**Next slice:** wire the write path — replace the wizard with a form that posts
to `createProjectAction` / `updateProjectAction`, point the detail page's
archive at `archiveProjectAction`, drive the register from the URL so the
server-side search and pagination are reachable, and stop the register mutating
records in local state.
