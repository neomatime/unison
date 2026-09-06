# Frameworks Write Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Frameworks module read and write the real `frameworks` and `framework_phases` rows, with phase add, rename, reorder and archive, replacing a fixture-backed register, detail screen and five-step wizard.

**Architecture:** Server components read through new query modules; server actions write through the Supabase server client; phase reordering goes through one `security definer` RPC because the position uniqueness constraint cannot survive a multi-statement reorder outside a single transaction. The register is a plain server-component table, not `ModuleWorkspace` — see the spec's "Approach" section for why.

**Tech Stack:** Next.js 16 App Router, React 19 server actions with `useActionState`, Supabase Postgres 17 with RLS, zod, `node:test`.

## Global Constraints

- Migrations are an append-only log; never edit an applied one. Apply through the Supabase MCP.
- `on delete set null` on a composite foreign key **must** name its column list.
- Grants do not carry across a signature change, and `revoke ... from public` does not strip Supabase's default grant to `anon`.
- A `security definer` function sets `search_path = ''` and checks authorisation in Postgres, not in the caller.
- `pnpm test:rls` runs against the shared `unison-uat` project. Every fixture must be registered for `cleanup()`.
- `features/product-ui/components/record-collection-workspace.tsx` must **not** be modified — ten-plus screens depend on its local-state behaviour.
- Secrets live in `.env.local` only, and never in a file, a commit or chat.
- A field in the UI is a claim that the product supports that capability. This slice removes several; it must add none.
- `version` is displayed and never editable in this slice.
- Hard deletion is out of scope. Archive only, and archiving must be reversible from the UI.

---

## File Structure

**Create**
- `supabase/migrations/20260906120000_framework_phase_archive_and_reorder.sql` — `archived_at` column, index, reorder RPC
- `features/delivery/schemas/framework.ts` — `FRAMEWORK_TYPES`, `frameworkInputSchema`, `phaseNameSchema`
- `features/delivery/queries/list-frameworks.ts` — register rows with real counts
- `features/delivery/queries/get-framework.ts` — one framework, its phases, its projects
- `features/delivery/actions/create-framework.ts`, `update-framework.ts`, `set-framework-archived.ts`
- `features/delivery/actions/add-framework-phase.ts`, `rename-framework-phase.ts`, `set-phase-archived.ts`, `reorder-framework-phases.ts`
- `features/delivery/components/framework-form.tsx` — replaces the wizard at the same path
- `features/delivery/components/framework-phase-editor.tsx` — the Phases tab
- `app/(unison)/delivery/frameworks/error.tsx`, `loading.tsx`
- `tests/integration/rls/framework-phases.test.ts`
- `tests/unit/framework-schema.test.ts`

**Modify**
- `features/delivery/form-options.ts` — add `selectPhaseOptions`
- `features/delivery/queries/list-project-form-options.ts` — select `archived_at`, use it
- `features/delivery/components/frameworks-screen.tsx` — becomes a plain table
- `features/delivery/components/framework-detail-screen.tsx` — three real tabs
- `app/(unison)/delivery/frameworks/page.tsx`, `new/page.tsx`, `[frameworkId]/page.tsx`, `[frameworkId]/edit/page.tsx`
- `features/delivery/data.ts` — remove `frameworks` and `deliveryPhases`
- `tests/unit/ui-completeness.test.ts` — guards

---

### Task 1: Schema — archivable phases and an atomic reorder

**Files:**
- Create: `supabase/migrations/20260906120000_framework_phase_archive_and_reorder.sql`
- Test: `tests/integration/rls/framework-phases.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `framework_phases.archived_at timestamptz null`; RPC `public.reorder_framework_phases(p_framework_id uuid, p_phase_ids uuid[]) returns void`, granted to `authenticated`.

One migration, not two: neither change is applied yet, so there is no append-only reason to split them, and the projects slice already recorded "two migrations where one would have done" as a cost.

- [ ] **Step 1: Write the failing RLS specs**

Create `tests/integration/rls/framework-phases.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgId: string
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let frameworkId: string
let phaseIds: string[]

before(async () => {
  orgId = await createFixtureOrg('framework-phases')
  member = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('framework-phases-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const { data: framework, error } = await admin
    .from('frameworks')
    .insert({ organization_id: orgId, name: 'Reorder Test Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id')
    .single()
  if (error) throw error
  frameworkId = framework.id

  const { data: phases, error: phaseError } = await admin
    .from('framework_phases')
    .insert([
      { organization_id: orgId, framework_id: frameworkId, name: 'Alpha', position: 1 },
      { organization_id: orgId, framework_id: frameworkId, name: 'Beta', position: 2 },
      { organization_id: orgId, framework_id: frameworkId, name: 'Gamma', position: 3 },
    ])
    .select('id, position')
    .order('position')
  if (phaseError) throw phaseError
  phaseIds = phases.map((row) => row.id)
})

after(async () => { await cleanup([orgId, outsiderOrg], [member.id, outsider.id]) })

test('a member reorders phases and positions stay contiguous in the given order', async () => {
  const client = await signedInClient(member.email, member.password)
  const reversed = [...phaseIds].reverse()

  const { error } = await client.rpc('reorder_framework_phases', {
    p_framework_id: frameworkId,
    p_phase_ids: reversed,
  })
  assert.equal(error, null)

  const { data, error: readError } = await client
    .from('framework_phases')
    .select('id, position')
    .eq('framework_id', frameworkId)
    .order('position')
  assert.equal(readError, null)
  assert.deepEqual(data!.map((row) => row.id), reversed)
  assert.deepEqual(data!.map((row) => row.position), [1, 2, 3])
})

test('a member of another organisation cannot reorder this framework', async () => {
  const client = await signedInClient(outsider.email, outsider.password)
  const { error } = await client.rpc('reorder_framework_phases', {
    p_framework_id: frameworkId,
    p_phase_ids: phaseIds,
  })
  assert.ok(error, 'an outsider must be refused')
  assert.equal(error!.code, '42501')
})

test('a list missing a phase is refused', async () => {
  const client = await signedInClient(member.email, member.password)
  const { error } = await client.rpc('reorder_framework_phases', {
    p_framework_id: frameworkId,
    p_phase_ids: phaseIds.slice(0, 2),
  })
  assert.ok(error)
  assert.equal(error!.code, '22023')
})

test('a list with a duplicated phase is refused', async () => {
  const client = await signedInClient(member.email, member.password)
  const { error } = await client.rpc('reorder_framework_phases', {
    p_framework_id: frameworkId,
    p_phase_ids: [phaseIds[0], phaseIds[0], phaseIds[1]],
  })
  assert.ok(error)
  assert.equal(error!.code, '22023')
})

test('a list containing a phase from another framework is refused', async () => {
  const { data: other, error: otherError } = await admin
    .from('frameworks')
    .insert({ organization_id: orgId, name: 'Other Framework', type: 'Operations', version: 'v1.0' })
    .select('id')
    .single()
  if (otherError) throw otherError
  const { data: strayPhase, error: strayError } = await admin
    .from('framework_phases')
    .insert({ organization_id: orgId, framework_id: other.id, name: 'Stray', position: 1 })
    .select('id')
    .single()
  if (strayError) throw strayError

  const client = await signedInClient(member.email, member.password)
  const { error } = await client.rpc('reorder_framework_phases', {
    p_framework_id: frameworkId,
    p_phase_ids: [...phaseIds.slice(0, 2), strayPhase.id],
  })
  assert.ok(error)
  assert.equal(error!.code, '22023')
})

test('an archived phase remains a valid phase for a project already in it', async () => {
  const { data: project, error: projectError } = await admin
    .from('projects')
    .insert({
      organization_id: orgId,
      name: 'Archived Phase Project',
      status: 'Active',
      health: 'On Track',
      framework_id: frameworkId,
      phase_id: phaseIds[0],
    })
    .select('id')
    .single()
  if (projectError) throw projectError

  const client = await signedInClient(member.email, member.password)
  const { error } = await client
    .from('framework_phases')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', phaseIds[0])
  assert.equal(error, null)

  // The foreign key is on (framework_id, id); archived_at must not affect it.
  const { data: after, error: afterError } = await admin
    .from('projects')
    .select('phase_id')
    .eq('id', project.id)
    .single()
  assert.equal(afterError, null)
  assert.equal(after!.phase_id, phaseIds[0], 'archiving a phase must not blank any project')
})
```

- [ ] **Step 2: Run the specs to verify they fail**

Run: `pnpm test:rls`
Expected: failures — `reorder_framework_phases` does not exist, and `archived_at` is not a column.

- [ ] **Step 3: Write the migration**

Apply through the Supabase MCP `apply_migration` tool with name `framework_phase_archive_and_reorder`, and save the identical text to `supabase/migrations/20260906120000_framework_phase_archive_and_reorder.sql`:

```sql
-- Phases become archivable rather than deletable.
--
-- projects_phase_fkey is ON DELETE SET NULL (phase_id), so deleting a phase
-- would silently blank the current phase of every project sitting in it --
-- the same silent-erasure shape as the owner defect fixed in PR #2. Archiving
-- preserves the record: a project already in the phase keeps pointing at it
-- and still displays it, while pickers hide it. There is deliberately no
-- delete policy on this table, and this migration does not add one.
alter table public.framework_phases
  add column archived_at timestamptz;

comment on column public.framework_phases.archived_at is
  'Set when a phase is retired. Never delete a phase: projects_phase_fkey is ON DELETE SET NULL (phase_id), so a delete blanks the current phase of every project in it.';

create index framework_phases_active_idx
  on public.framework_phases (framework_id, archived_at);

-- Reordering has to happen inside one transaction.
--
-- framework_phases_position_unique (framework_id, position) means a naive swap
-- violates the constraint mid-flight, and every PostgREST .update() is its own
-- transaction, so nothing outside Postgres can hold the intermediate state.
-- This writes negative positions first and then flips them positive; both
-- statements run in this function's single transaction, so the unique
-- constraint is never violated and no intermediate state is observable.
--
-- The array must be exactly the framework's phase set -- archived phases
-- included -- so positions stay contiguous across all of a framework's phases
-- and no phase can be silently dropped from the order.
create or replace function public.reorder_framework_phases(
  p_framework_id uuid,
  p_phase_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_org uuid;
  v_total integer;
  v_matched integer;
begin
  select organization_id into v_org
  from public.frameworks
  where id = p_framework_id;

  if v_org is null then
    raise exception 'framework not found' using errcode = '42704';
  end if;

  if not public.is_member_of(v_org) then
    raise exception 'not a member of that organization' using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.framework_phases
  where framework_id = p_framework_id;

  -- Catches a short list and an over-long one.
  if coalesce(array_length(p_phase_ids, 1), 0) is distinct from v_total then
    raise exception 'phase list must contain every phase of the framework exactly once'
      using errcode = '22023';
  end if;

  -- Catches duplicates and ids belonging to another framework: `= any(...)`
  -- matches each row at most once, so either case leaves v_matched short.
  select count(*) into v_matched
  from public.framework_phases
  where framework_id = p_framework_id
    and id = any(p_phase_ids);

  if v_matched is distinct from v_total then
    raise exception 'phase list must contain every phase of the framework exactly once'
      using errcode = '22023';
  end if;

  update public.framework_phases p
  set position = -(sub.new_position::int)
  from unnest(p_phase_ids) with ordinality as sub(id, new_position)
  where p.id = sub.id and p.framework_id = p_framework_id;

  update public.framework_phases
  set position = -position
  where framework_id = p_framework_id and position < 0;
end $$;

-- Grants must be restated on every create or replace -- they do not carry
-- forward. No service_role grant: the only caller is a signed-in member
-- through a server action, and is_member_of() reads auth.uid(), which is null
-- under service_role, so a service_role grant would be a grant to a caller
-- the body would then refuse.
revoke all on function public.reorder_framework_phases(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_framework_phases(uuid, uuid[]) to authenticated;
```

- [ ] **Step 4: Regenerate types**

Use the Supabase MCP `generate_typescript_types` tool and write the result to `types/database.ts`.

- [ ] **Step 5: Run the specs to verify they pass**

Run: `pnpm test:rls`
Expected: PASS, no failures.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260906120000_framework_phase_archive_and_reorder.sql tests/integration/rls/framework-phases.test.ts types/database.ts
git commit -m "feat(db): make framework phases archivable and reorderable atomically"
```

---

### Task 2: Schema module and queries

**Files:**
- Create: `features/delivery/schemas/framework.ts`, `features/delivery/queries/list-frameworks.ts`, `features/delivery/queries/get-framework.ts`
- Test: `tests/unit/framework-schema.test.ts`

**Interfaces:**
- Consumes: `framework_phases.archived_at` from Task 1.
- Produces:
  - `FRAMEWORK_TYPES: readonly ['Enterprise','Technology','Operations','Compliance','Commercial']`
  - `frameworkInputSchema` parsing `{ name: string; type: string }` → `{ name: string; type: string | null }`
  - `phaseNameSchema` parsing `{ name: string }` → `{ name: string }`
  - `listFrameworks(): Promise<FrameworkSummary[]>` where `FrameworkSummary = { id, name, type: string | null, version: string | null, phaseCount: number, projectCount: number }`
  - `getFramework(id): Promise<FrameworkDetail | null>` where `FrameworkDetail = { id, name, type, version, archivedAt: string | null, phases: FrameworkPhase[], projects: FrameworkProject[] }`, `FrameworkPhase = { id, name, position, archivedAt: string | null, projectCount: number }`, `FrameworkProject = { id, name, status, health, phase: string | null }`

- [ ] **Step 1: Write the failing schema test**

Create `tests/unit/framework-schema.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { FRAMEWORK_TYPES, frameworkInputSchema, phaseNameSchema } from '../../features/delivery/schemas/framework.ts'

test('a framework requires a name', () => {
  const result = frameworkInputSchema.safeParse({ name: '   ', type: 'Enterprise' })
  assert.equal(result.success, false)
})

test('a framework type must be one the register offers', () => {
  assert.equal(frameworkInputSchema.safeParse({ name: 'Valid', type: 'Enterprise' }).success, true)
  assert.equal(frameworkInputSchema.safeParse({ name: 'Valid', type: 'Nonsense' }).success, false)
})

test('an absent type is null, not an empty string', () => {
  const result = frameworkInputSchema.safeParse({ name: 'Valid', type: '' })
  assert.equal(result.success, true)
  assert.equal(result.data!.type, null)
})

test('the offered types are exactly the five the product names', () => {
  assert.deepEqual([...FRAMEWORK_TYPES], ['Enterprise', 'Technology', 'Operations', 'Compliance', 'Commercial'])
})

test('a phase requires a name', () => {
  assert.equal(phaseNameSchema.safeParse({ name: '' }).success, false)
  assert.equal(phaseNameSchema.safeParse({ name: 'Discover' }).success, true)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test --experimental-strip-types tests/unit/framework-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the schema module**

Create `features/delivery/schemas/framework.ts`:

```ts
import { z } from 'zod'

/**
 * Exported as a const array so the form's options and the schema cannot drift.
 * There is deliberately no database check constraint on frameworks.type: it is
 * nullable free text today, nothing branches on it, and the seeded values
 * already conform. Add the constraint when something depends on it.
 */
export const FRAMEWORK_TYPES = ['Enterprise', 'Technology', 'Operations', 'Compliance', 'Commercial'] as const

export const frameworkInputSchema = z.object({
  name: z.string().trim().min(1, 'A framework name is required.'),
  type: z.enum(FRAMEWORK_TYPES).optional().or(z.literal('')).transform((value) => value || null),
})

export const phaseNameSchema = z.object({
  name: z.string().trim().min(1, 'A phase name is required.'),
})

export type FrameworkInput = z.infer<typeof frameworkInputSchema>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test --experimental-strip-types tests/unit/framework-schema.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the register query**

Create `features/delivery/queries/list-frameworks.ts`:

```ts
import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export type FrameworkSummary = {
  id: string
  name: string
  type: string | null
  version: string | null
  /** Unarchived phases. */
  phaseCount: number
  /** Unarchived projects, of any status. */
  projectCount: number
}

/**
 * Counts are tallied here rather than through PostgREST embeds because both
 * relationships hang off composite foreign keys — projects_framework_fkey is
 * (framework_id, organization_id) — and an embed across one needs a
 * disambiguating hint. Three small selects are predictable where an embed
 * hint is a guess: a tenant has around six frameworks and fifty phases.
 */
export async function listFrameworks(): Promise<FrameworkSummary[]> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [frameworks, phases, projects] = await Promise.all([
    supabase.from('frameworks').select('id, name, type, version')
      .eq('organization_id', organization.id).is('archived_at', null).order('name'),
    supabase.from('framework_phases').select('framework_id')
      .eq('organization_id', organization.id).is('archived_at', null),
    supabase.from('projects').select('framework_id')
      .eq('organization_id', organization.id).is('archived_at', null),
  ])
  if (frameworks.error) throw frameworks.error
  if (phases.error) throw phases.error
  if (projects.error) throw projects.error

  const phaseCounts = tally(phases.data ?? [])
  const projectCounts = tally(projects.data ?? [])

  return (frameworks.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    version: row.version,
    phaseCount: phaseCounts.get(row.id) ?? 0,
    projectCount: projectCounts.get(row.id) ?? 0,
  }))
}

function tally(rows: ReadonlyArray<{ framework_id: string | null }>) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.framework_id) continue
    counts.set(row.framework_id, (counts.get(row.framework_id) ?? 0) + 1)
  }
  return counts
}
```

- [ ] **Step 6: Write the detail query**

Create `features/delivery/queries/get-framework.ts`:

```ts
import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export type FrameworkPhase = {
  id: string
  name: string
  position: number
  archivedAt: string | null
  /** Unarchived projects currently in this phase. */
  projectCount: number
}

export type FrameworkProject = {
  id: string
  name: string
  status: string
  health: string
  phase: string | null
}

export type FrameworkDetail = {
  id: string
  name: string
  type: string | null
  version: string | null
  archivedAt: string | null
  /** Every phase, archived included, in stored order. */
  phases: FrameworkPhase[]
  projects: FrameworkProject[]
}

/**
 * Org-scoped, so "belongs to another organisation" and "does not exist" both
 * arrive as null and both mean 404 — the same rule getProject follows.
 *
 * Archived frameworks ARE returned: the register hides them, but the detail
 * page is where one is unarchived, so it must be reachable by URL.
 */
export async function getFramework(frameworkId: string): Promise<FrameworkDetail | null> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data: framework, error } = await supabase
    .from('frameworks')
    .select('id, name, type, version, archived_at')
    .eq('id', frameworkId)
    .eq('organization_id', organization.id)
    .maybeSingle()
  if (error) throw error
  if (!framework) return null

  const [phases, projects] = await Promise.all([
    supabase.from('framework_phases').select('id, name, position, archived_at')
      .eq('framework_id', frameworkId).eq('organization_id', organization.id)
      .order('position', { ascending: true }),
    supabase.from('projects').select('id, name, status, health, phase_id, framework_phases(name)')
      .eq('framework_id', frameworkId).eq('organization_id', organization.id)
      .is('archived_at', null).order('name'),
  ])
  if (phases.error) throw phases.error
  if (projects.error) throw projects.error

  const projectsByPhase = new Map<string, number>()
  for (const row of projects.data ?? []) {
    if (!row.phase_id) continue
    projectsByPhase.set(row.phase_id, (projectsByPhase.get(row.phase_id) ?? 0) + 1)
  }

  return {
    id: framework.id,
    name: framework.name,
    type: framework.type,
    version: framework.version,
    archivedAt: framework.archived_at,
    phases: (phases.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      archivedAt: row.archived_at,
      projectCount: projectsByPhase.get(row.id) ?? 0,
    })),
    projects: (projects.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      health: row.health,
      phase: row.framework_phases?.name ?? null,
    })),
  }
}
```

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm typecheck && pnpm test`
Expected: 0 errors; suite passes.

```bash
git add features/delivery/schemas/framework.ts features/delivery/queries/list-frameworks.ts features/delivery/queries/get-framework.ts tests/unit/framework-schema.test.ts
git commit -m "feat(frameworks): add the framework schema and the two read queries"
```

---

### Task 3: The projects phase picker retains an archived current phase

**Files:**
- Modify: `features/delivery/form-options.ts`, `features/delivery/queries/list-project-form-options.ts`
- Test: `tests/unit/project-form-options.test.ts`

**Interfaces:**
- Consumes: `framework_phases.archived_at` from Task 1.
- Produces: `selectPhaseOptions(phases: ReadonlyArray<SelectablePhase>, currentPhaseId?: string | null): PhaseOption[]` where `SelectablePhase = { id: string; name: string; frameworkId: string; archived_at: string | null }` and `PhaseOption = { id: string; name: string; frameworkId: string }`.

`PhaseOption` carries `frameworkId` because `ProjectForm` filters the list client-side on framework change (`project-form.tsx:49`). Do not drop it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/project-form-options.test.ts`:

```ts
const OPEN_PHASE = { id: 'p-open', name: 'Design', frameworkId: 'f-1', archived_at: null }
const ARCHIVED_PHASE = { id: 'p-archived', name: 'Legacy Gate', frameworkId: 'f-1', archived_at: '2026-09-01T00:00:00Z' }

test('the phase picker excludes archived phases when they are not the current one', () => {
  assert.deepEqual(selectPhaseOptions([OPEN_PHASE, ARCHIVED_PHASE]), [
    { id: 'p-open', name: 'Design', frameworkId: 'f-1' },
  ])
})

test('an archived current phase is retained and labelled', () => {
  // Same defect as the removed owner: the select's defaultValue would match no
  // option, the browser would fall back to the empty one, and saving any
  // unrelated field would write phase_id: null.
  const options = selectPhaseOptions([OPEN_PHASE, ARCHIVED_PHASE], 'p-archived')

  assert.deepEqual(options, [
    { id: 'p-open', name: 'Design', frameworkId: 'f-1' },
    { id: 'p-archived', name: 'Legacy Gate (archived)', frameworkId: 'f-1' },
  ])
})

test('a retained phase keeps its frameworkId so the form can still filter it', () => {
  const retained = selectPhaseOptions([OPEN_PHASE, ARCHIVED_PHASE], 'p-archived')
    .find((option) => option.id === 'p-archived')

  assert.equal(retained?.frameworkId, 'f-1')
})

test('an open current phase is offered once, not duplicated', () => {
  assert.deepEqual(selectPhaseOptions([OPEN_PHASE, ARCHIVED_PHASE], 'p-open'), [
    { id: 'p-open', name: 'Design', frameworkId: 'f-1' },
  ])
})
```

Add `selectPhaseOptions` to the existing import at the top of the file.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test --experimental-strip-types tests/unit/project-form-options.test.ts`
Expected: FAIL — `selectPhaseOptions` is not exported.

- [ ] **Step 3: Add the function**

Append to `features/delivery/form-options.ts`:

```ts
export type SelectablePhase = { id: string; name: string; frameworkId: string; archived_at: string | null }
export type PhaseOption = { id: string; name: string; frameworkId: string }

/**
 * Unarchived phases, plus the project's current phase when it has since been
 * archived. Identical reasoning to selectOwnerOptions: `phaseId` is optional,
 * so a missing option means the next unrelated edit silently writes
 * phase_id: null over a recorded governance fact.
 *
 * Keeps `frameworkId` because ProjectForm filters the list client-side when the
 * framework changes; an option without it would vanish from the picker.
 */
export function selectPhaseOptions(
  phases: ReadonlyArray<SelectablePhase>,
  currentPhaseId?: string | null,
): PhaseOption[] {
  const open = phases
    .filter((phase) => phase.archived_at === null)
    .map((phase) => ({ id: phase.id, name: phase.name, frameworkId: phase.frameworkId }))

  if (!currentPhaseId || open.some((option) => option.id === currentPhaseId)) return open

  const retained = phases.find((phase) => phase.id === currentPhaseId)
  if (!retained) return open

  return [...open, { id: retained.id, name: `${retained.name} (archived)`, frameworkId: retained.frameworkId }]
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test --experimental-strip-types tests/unit/project-form-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove the guard fails without the retention branch**

Temporarily replace the last three lines of `selectPhaseOptions` with `return open`, re-run the test, and confirm "an archived current phase is retained and labelled" and "a retained phase keeps its frameworkId" both FAIL. Restore the branch and confirm they pass again. Record the observed failure in the task report.

- [ ] **Step 6: Wire it into the query**

In `features/delivery/queries/list-project-form-options.ts`, change the phases select to include `archived_at`, and pass a `phaseId` through:

```ts
export async function listProjectFormOptions(
  current: { ownerId?: string | null; clientId?: string | null; phaseId?: string | null } = {},
): Promise<ProjectFormOptions> {
```

```ts
    supabase.from('framework_phases').select('id, name, framework_id, archived_at')
      .eq('organization_id', organization.id).order('position'),
```

```ts
    phases: selectPhaseOptions(
      (phases.data ?? []).map((row) => ({
        id: row.id, name: row.name, frameworkId: row.framework_id, archived_at: row.archived_at,
      })),
      current.phaseId,
    ),
```

Import `selectPhaseOptions` alongside the two existing imports from `../form-options`.

- [ ] **Step 7: Pass the current phase from the edit page**

In `app/(unison)/operations/projects/[projectId]/edit/page.tsx`, add `phaseId` to the retention argument:

```tsx
  const options = await listProjectFormOptions({
    ownerId: project.owner_id,
    clientId: project.client_id,
    phaseId: project.phase_id,
  })
```

- [ ] **Step 8: Typecheck, test and commit**

Run: `pnpm typecheck && pnpm test`
Expected: 0 errors; suite passes.

```bash
git add features/delivery/form-options.ts features/delivery/queries/list-project-form-options.ts "app/(unison)/operations/projects/[projectId]/edit/page.tsx" tests/unit/project-form-options.test.ts
git commit -m "fix(projects): retain an archived current phase in the project form's picker"
```

---

### Task 4: Framework actions

**Files:**
- Create: `features/delivery/actions/create-framework.ts`, `features/delivery/actions/update-framework.ts`, `features/delivery/actions/set-framework-archived.ts`

**Interfaces:**
- Consumes: `frameworkInputSchema` from Task 2.
- Produces:
  - `createFrameworkAction(_prev: { error?: string } | undefined, formData: FormData)` — redirects to `/delivery/frameworks/<id>`
  - `updateFrameworkAction(id: string, _prev: { error?: string } | undefined, formData: FormData)` — bound with `.bind(null, id)`, redirects to the detail page
  - `setFrameworkArchivedAction(_prev: { error?: string } | undefined, formData: FormData)` — reads `id` and `archived` (`'true'` / `'false'`) from the form

- [ ] **Step 1: Write create-framework**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { frameworkInputSchema } from '../schemas/framework'

export async function createFrameworkAction(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = frameworkInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.from('frameworks').insert({
    organization_id: organization.id,
    name: parsed.data.name,
    type: parsed.data.type,
  }).select('id').single()

  // frameworks_name_unique is (organization_id, name), and two frameworks
  // named the same thing is an ordinary mistake rather than a server fault, so
  // it must read as a field-level refusal instead of a 500.
  if (error?.code === '23505') return { error: 'A framework with that name already exists.' }
  if (error) return { error: 'The framework could not be created.' }

  revalidatePath('/delivery/frameworks')
  redirect(`/delivery/frameworks/${data.id}`)
}
```

- [ ] **Step 2: Write update-framework**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { frameworkInputSchema } from '../schemas/framework'

export async function updateFrameworkAction(id: string, _prev: { error?: string } | undefined, formData: FormData) {
  const parsed = frameworkInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.from('frameworks').update({
    name: parsed.data.name,
    type: parsed.data.type,
  }).eq('id', id).eq('organization_id', organization.id).select('id')

  if (error?.code === '23505') return { error: 'A framework with that name already exists.' }
  if (error) return { error: 'The framework could not be saved.' }
  // Without .select() an update matching no rows is indistinguishable from one
  // that saved: RLS and the organisation filter both express "not yours" as
  // zero rows, not as an error, so a wrong id would report success.
  if (!data?.length) return { error: 'That framework no longer exists, or is not yours to edit.' }

  revalidatePath('/delivery/frameworks')
  revalidatePath(`/delivery/frameworks/${id}`)
  redirect(`/delivery/frameworks/${id}`)
}
```

- [ ] **Step 3: Write set-framework-archived**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Archive and unarchive in one action. Unarchive is not optional: the projects
 * slice shipped an archive with no in-UI undo, and that hazard is not repeated.
 */
export async function setFrameworkArchivedAction(_prev: { error?: string } | undefined, formData: FormData) {
  const id = formData.get('id')?.toString()
  const archived = formData.get('archived')?.toString() === 'true'
  if (!id) return { error: 'No framework was named.' }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('frameworks')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .select('id')

  if (error) return { error: `The framework could not be ${archived ? 'archived' : 'restored'}.` }
  if (!data?.length) return { error: 'That framework no longer exists, or is not yours to change.' }

  revalidatePath('/delivery/frameworks')
  revalidatePath(`/delivery/frameworks/${id}`)
  return {}
}
```

- [ ] **Step 4: Typecheck and commit**

Run: `pnpm typecheck`
Expected: 0 errors.

```bash
git add features/delivery/actions/create-framework.ts features/delivery/actions/update-framework.ts features/delivery/actions/set-framework-archived.ts
git commit -m "feat(frameworks): add create, update and archive actions"
```

---

### Task 5: Phase actions

**Files:**
- Create: `features/delivery/actions/add-framework-phase.ts`, `rename-framework-phase.ts`, `set-phase-archived.ts`, `reorder-framework-phases.ts`

**Interfaces:**
- Consumes: `phaseNameSchema` from Task 2; the RPC from Task 1.
- Produces, each `(_prev: { error?: string } | undefined, formData: FormData)` returning `{}` on success and `{ error }` on refusal, none redirecting — the phase editor stays on the detail page:
  - `addFrameworkPhaseAction` — form fields `frameworkId`, `name`
  - `renameFrameworkPhaseAction` — form fields `id`, `frameworkId`, `name`
  - `setPhaseArchivedAction` — form fields `id`, `frameworkId`, `archived` (`'true'` / `'false'`)
  - `reorderFrameworkPhasesAction` — form fields `frameworkId`, and one `phaseIds` entry per phase in the new order

- [ ] **Step 1: Write add-framework-phase**

Reads `frameworkId` and `name`. Computes the next position as `max(position) + 1` for that framework, then inserts with `organization_id` from the session. Handles `23505` as `'A phase with that name already exists in this framework.'`

```ts
  const { data: last, error: readError } = await supabase
    .from('framework_phases')
    .select('position')
    .eq('framework_id', frameworkId)
    .eq('organization_id', organization.id)
    .order('position', { ascending: false })
    .limit(1)
  if (readError) return { error: 'The phase could not be added.' }

  const nextPosition = (last?.[0]?.position ?? 0) + 1
```

Then insert `{ organization_id, framework_id: frameworkId, name, position: nextPosition }`, `revalidatePath(\`/delivery/frameworks/${frameworkId}\`)`, return `{}`.

- [ ] **Step 2: Write rename-framework-phase**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { phaseNameSchema } from '../schemas/framework'

export async function renameFrameworkPhaseAction(_prev: { error?: string } | undefined, formData: FormData) {
  const id = formData.get('id')?.toString()
  const frameworkId = formData.get('frameworkId')?.toString()
  if (!id || !frameworkId) return { error: 'No phase was named.' }

  const parsed = phaseNameSchema.safeParse({ name: formData.get('name') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('framework_phases')
    .update({ name: parsed.data.name })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .select('id')

  // framework_phases_name_unique is (framework_id, name).
  if (error?.code === '23505') return { error: 'A phase with that name already exists in this framework.' }
  if (error) return { error: 'The phase could not be renamed.' }
  if (!data?.length) return { error: 'That phase no longer exists, or is not yours to edit.' }

  revalidatePath(`/delivery/frameworks/${frameworkId}`)
  return {}
}
```

- [ ] **Step 3: Write set-phase-archived**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Archive and restore in one action. A phase is never deleted:
 * projects_phase_fkey is ON DELETE SET NULL (phase_id), so a delete would
 * silently blank the current phase of every project sitting in it.
 */
export async function setPhaseArchivedAction(_prev: { error?: string } | undefined, formData: FormData) {
  const id = formData.get('id')?.toString()
  const frameworkId = formData.get('frameworkId')?.toString()
  const archived = formData.get('archived')?.toString() === 'true'
  if (!id || !frameworkId) return { error: 'No phase was named.' }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('framework_phases')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .select('id')

  if (error) return { error: `The phase could not be ${archived ? 'archived' : 'restored'}.` }
  if (!data?.length) return { error: 'That phase no longer exists, or is not yours to change.' }

  revalidatePath(`/delivery/frameworks/${frameworkId}`)
  return {}
}
```

- [ ] **Step 4: Write reorder-framework-phases**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Delegates to the RPC because the reorder must be one transaction: the unique
 * (framework_id, position) constraint cannot survive a multi-statement swap,
 * and every PostgREST update is its own transaction. Authorisation lives in the
 * function, in Postgres, not here.
 */
export async function reorderFrameworkPhasesAction(_prev: { error?: string } | undefined, formData: FormData) {
  const frameworkId = formData.get('frameworkId')?.toString()
  const phaseIds = formData.getAll('phaseIds').map((value) => value.toString())
  if (!frameworkId || phaseIds.length === 0) return { error: 'No phase order was submitted.' }

  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('reorder_framework_phases', {
    p_framework_id: frameworkId,
    p_phase_ids: phaseIds,
  })

  // 22023 is the function's own "not exactly this framework's phase set", which
  // means the submitted order is stale — someone added or archived a phase in
  // another tab. 42501 is a non-member. Neither is a server fault.
  if (error?.code === '22023') return { error: 'The phase list changed while you were reordering. Reload and try again.' }
  if (error) return { error: 'The phases could not be reordered.' }

  revalidatePath(`/delivery/frameworks/${frameworkId}`)
  return {}
}
```

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: 0 errors.

```bash
git add features/delivery/actions/add-framework-phase.ts features/delivery/actions/rename-framework-phase.ts features/delivery/actions/set-phase-archived.ts features/delivery/actions/reorder-framework-phases.ts
git commit -m "feat(frameworks): add phase add, rename, archive and reorder actions"
```

---

### Task 6: The register, the form and the routes

**Files:**
- Modify: `features/delivery/components/frameworks-screen.tsx`, `app/(unison)/delivery/frameworks/page.tsx`, `new/page.tsx`, `[frameworkId]/edit/page.tsx`
- Create: `features/delivery/components/framework-form.tsx` (replacing the wizard at the same path), `app/(unison)/delivery/frameworks/error.tsx`, `loading.tsx`

**Interfaces:**
- Consumes: `listFrameworks`, `getFramework`, `FRAMEWORK_TYPES`, `createFrameworkAction`, `updateFrameworkAction`.
- Produces: `FrameworksScreen({ frameworks }: { frameworks: FrameworkSummary[] })`; `FrameworkForm({ mode, framework, action })`.

**Delete first:** the whole body of `framework-form.tsx` (the five-step wizard) is replaced. It has no `name` attributes and sets `setSaved(true)`; four of its five steps collect data for domains with no tables.

- [ ] **Step 1: Rewrite `frameworks-screen.tsx` as a presentational table**

A server-compatible component (no `'use client'`) taking `frameworks: FrameworkSummary[]`. Required elements, and nothing beyond them:

- `WorkspaceHeader` with `category="Delivery"`, `title="Project Frameworks"`, `description="The delivery methodologies this organisation governs projects with."`, `action="New Framework"`, `actionHref="/delivery/frameworks/new"`
- a `<table>` with columns Framework, Type, Version, Phases, Projects — the first cell a `Link` to `/delivery/frameworks/${framework.id}`
- `type` and `version` render `'—'` when null
- an `EmptyState` when `frameworks.length === 0`

**The eight metric cards are deleted, not connected.** Of the three checkable against the database, all three were wrong. `PhaseStepper` and the `deliveryPhases` import go with them — a single global phase list is meaningless once each framework carries its own.

- [ ] **Step 2: Point the register route at the query**

```tsx
import { FrameworksScreen } from '@/features/delivery/components/frameworks-screen'
import { listFrameworks } from '@/features/delivery/queries/list-frameworks'

export default async function Page() {
  const frameworks = await listFrameworks()
  return <FrameworksScreen frameworks={frameworks} />
}
```

- [ ] **Step 3: Write the real `framework-form.tsx`**

Modelled directly on `features/delivery/components/project-form.tsx`: `'use client'`, `useActionState(action, undefined)`, `<form action={formAction}>`, and the shared `TextField` / `SelectField` / `FormSection` / `FormError` / `FormFooter` components.

Fields: `name` (`TextField`, required), `type` (`SelectField` with `options={FRAMEWORK_TYPES}`).

`version` is rendered as read-only text, not a field — a free-text version with no history behind it is a claim this slice does not keep. On create it is absent entirely.

- [ ] **Step 4: Point the two form routes at it**

`new/page.tsx`:

```tsx
import { FrameworkForm } from '@/features/delivery/components/framework-form'
import { createFrameworkAction } from '@/features/delivery/actions/create-framework'

export default function Page() {
  return <FrameworkForm mode="create" action={createFrameworkAction} />
}
```

`[frameworkId]/edit/page.tsx` fetches with `getFramework`, calls `notFound()` on null, and passes `updateFrameworkAction.bind(null, frameworkId)`.

- [ ] **Step 5: Add the route boundaries**

`error.tsx` and `loading.tsx` under `app/(unison)/delivery/frameworks/`, copied in shape from `app/(unison)/operations/projects/error.tsx` and `loading.tsx`, with the copy naming Frameworks. Without them a transient database error escalates to the root full-page fallback.

- [ ] **Step 6: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 0 errors; suite passes; build clean.

```bash
git add features/delivery/components/frameworks-screen.tsx features/delivery/components/framework-form.tsx "app/(unison)/delivery/frameworks"
git commit -m "feat(frameworks): drive the register and form from the database, not fixtures"
```

---

### Task 7: The detail screen — Overview and Projects

**Files:**
- Modify: `features/delivery/components/framework-detail-screen.tsx`, `app/(unison)/delivery/frameworks/[frameworkId]/page.tsx`

**Interfaces:**
- Consumes: `getFramework`, `setFrameworkArchivedAction`.
- Produces: `FrameworkDetailScreen({ framework }: { framework: FrameworkDetail })`, rendering three tabs. Task 8 fills the Phases tab.

- [ ] **Step 1: Point the route at the query**

```tsx
import { notFound } from 'next/navigation'

import { FrameworkDetailScreen } from '@/features/delivery/components/framework-detail-screen'
import { getFramework } from '@/features/delivery/queries/get-framework'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function Page({ params }: { params: Promise<{ frameworkId: string }> }) {
  const { frameworkId } = await params
  // Postgres rejects a non-uuid before RLS is consulted, which would surface as
  // a 500 rather than a miss. A malformed id is a miss.
  if (!UUID.test(frameworkId)) notFound()

  const framework = await getFramework(frameworkId)
  if (!framework) notFound()

  return <FrameworkDetailScreen framework={framework} />
}
```

- [ ] **Step 2: Rewrite the detail screen**

Three tabs only: `['Overview', 'Phases', 'Projects']`.

**Deleted:** Workstreams, Artefacts, Roles, Controls and Versions — five tabs with no tables — plus the fabricated framework code (`BTC-01`), the invented version history and the invented project list. `Phases & Gates` becomes `Phases`, because gates do not exist. The `frameworks` fixture import goes.

**Overview** renders a definition list: Name, Type, Version, Phases (count of unarchived), Projects (count), Status (Active / Archived from `archivedAt`). Every value comes from `framework`.

**Projects** renders a table of `framework.projects` — name linking to `/operations/projects/${id}`, status, health, current phase — with an `EmptyState` reading `'No projects are governed by this framework yet.'` when empty.

**Header controls:** an Edit link to `/delivery/frameworks/${id}/edit`, and an archive control posting `setFrameworkArchivedAction` through `useActionState`, gated behind `ConfirmationDialog` and submitted with `requestSubmit()` — the exact shape `project-detail-screen.tsx` uses. When `framework.archivedAt` is set, the control reads **Restore framework** and posts `archived=false`. Render `state?.error` in a `role="alert"` paragraph; the action refuses on a stale or foreign id and that refusal must reach the user.

- [ ] **Step 3: Verify and commit**

Run: `pnpm typecheck && pnpm build`
Expected: 0 errors; build clean.

```bash
git add features/delivery/components/framework-detail-screen.tsx "app/(unison)/delivery/frameworks/[frameworkId]/page.tsx"
git commit -m "feat(frameworks): show the real framework record, its projects and a working archive"
```

---

### Task 8: The phase editor, fixture removal and guards

**Files:**
- Create: `features/delivery/components/framework-phase-editor.tsx`
- Modify: `features/delivery/components/framework-detail-screen.tsx`, `features/delivery/data.ts`, `tests/unit/ui-completeness.test.ts`

**Interfaces:**
- Consumes: all four phase actions from Task 5; `FrameworkPhase[]` from Task 2.
- Produces: `FrameworkPhaseEditor({ frameworkId, phases }: { frameworkId: string; phases: FrameworkPhase[] })`.

- [ ] **Step 1: Build the phase editor**

`'use client'`. Renders `phases` in stored order. Per row: the name, its `projectCount`, and — for an archived row — an `(archived)` marker.

Four controls, each a real `<form>` posting a server action through `useActionState`:

- **Add** — a name field and a submit posting `addFrameworkPhaseAction` with a hidden `frameworkId`
- **Rename** — an inline field per row posting `renameFrameworkPhaseAction` with hidden `id` and `frameworkId`
- **Archive / Restore** — posts `setPhaseArchivedAction` with hidden `id`, `frameworkId` and `archived`. Archiving is gated behind `ConfirmationDialog`; the copy must state that projects currently in the phase keep it and continue to display it. Restoring needs no confirmation.
- **Move up / Move down** — each posts `reorderFrameworkPhasesAction` with a hidden `frameworkId` and one hidden `phaseIds` input per phase, in the new order. **Every phase of the framework must be submitted, archived ones included** — the RPC refuses any list that is not exactly the framework's phase set. Compose active phases in their new order followed by archived ones in their existing order.

Up is disabled on the first row, Down on the last. Render each action's `state?.error` in a `role="alert"` element.

Buttons rather than drag-and-drop: a form post survives without JavaScript, is trivially testable, and drag ordering would need a client-side library for a list of eight rows.

- [ ] **Step 2: Mount it in the Phases tab**

In `framework-detail-screen.tsx`, the Phases tab renders `<FrameworkPhaseEditor frameworkId={framework.id} phases={framework.phases} />`.

- [ ] **Step 3: Remove the fixtures**

Delete the `frameworks` array and the `deliveryPhases` array from `features/delivery/data.ts`, plus the `FrameworkRecord` type if nothing else uses it. Run `pnpm typecheck` and fix any remaining importer — `PhaseStepper` in `delivery-primitives.tsx` stays, since other screens use it; only the fixture goes.

- [ ] **Step 4: Write the guards**

Append to `tests/unit/ui-completeness.test.ts`:

```ts
test('the frameworks module reads the database rather than a fixture', () => {
  const registerRoute = readFileSync(join(workspace, 'app', '(unison)', 'delivery', 'frameworks', 'page.tsx'), 'utf8')
  const screen = readFileSync(join(workspace, 'features', 'delivery', 'components', 'frameworks-screen.tsx'), 'utf8')
  const detail = readFileSync(join(workspace, 'features', 'delivery', 'components', 'framework-detail-screen.tsx'), 'utf8')
  const data = readFileSync(join(workspace, 'features', 'delivery', 'data.ts'), 'utf8')

  assert.match(registerRoute, /listFrameworks\(\)/)
  for (const source of [screen, detail]) {
    assert.doesNotMatch(source, /from '\.\.\/data'/, 'the frameworks screens must not read the fixture module')
  }

  // The eight metric cards were fabricated, and the three checkable against the
  // database were all wrong: six frameworks not eleven, forty-six phases not
  // forty-eight, and no gates or artefacts table exists at all.
  for (const fabricated of ['Projects Covered', '91% adoption', 'Gates', 'Artefacts', '74 mandatory']) {
    assert.ok(!screen.includes(fabricated), `"${fabricated}" is not backed by any table and must not be claimed`)
  }

  // Five tabs named domains with no tables behind them.
  for (const tab of ['Workstreams', 'Artefacts', 'Roles', 'Controls', 'Versions']) {
    assert.ok(!detail.includes(`'${tab}'`), `the ${tab} tab has no table behind it and must not be offered`)
  }
  assert.ok(!detail.includes('Phases & Gates'), 'gates do not exist; the tab is Phases')

  assert.ok(!data.includes('export const frameworks'), 'the frameworks fixture must not survive alongside the real query')
  assert.ok(!data.includes('export const deliveryPhases'), 'a single global phase list is meaningless once each framework carries its own')
})

test('a duplicate name is refused as a message, not thrown as a fault', () => {
  // Both uniqueness constraints are reachable by ordinary use: two frameworks
  // named "Client Onboarding" in one organisation, two phases named "Design"
  // in one framework. Each must surface as a field-level refusal.
  //
  // Its limit, stated rather than discovered later: this asserts the branch
  // exists, not that Postgres returns 23505 for these constraints. Task 9
  // step 3 exercises that against the live database.
  const actions = [
    ['create-framework.ts', 'A framework with that name already exists.'],
    ['update-framework.ts', 'A framework with that name already exists.'],
    ['rename-framework-phase.ts', 'A phase with that name already exists in this framework.'],
  ] as const

  for (const [file, message] of actions) {
    const source = readFileSync(join(workspace, 'features', 'delivery', 'actions', file), 'utf8')
    assert.match(source, /error\?\.code === '23505'/, `${file} must handle a unique violation`)
    assert.ok(source.includes(message), `${file} must name the offending field in its message`)
  }
})

test('the frameworks wizard that wrote nothing is gone', () => {
  // Five steps, no name attributes, submit set setSaved(true) -- the same
  // defect the projects wizard had, with one more step. Four of its five steps
  // collected data for domains that have no tables.
  const form = readFileSync(join(workspace, 'features', 'delivery', 'components', 'framework-form.tsx'), 'utf8')
  assert.doesNotMatch(form, /setSaved/, 'the form must submit to a server action, not to local state')
  assert.match(form, /useActionState/, 'the framework form must post through a real action')
  for (const step of ['Framework Basics', 'Artefacts & Roles', 'Controls & Metrics']) {
    assert.ok(!form.includes(step), `"${step}" collects data for a domain with no table`)
  }
})
```

- [ ] **Step 5: Run everything and commit**

Run: `pnpm typecheck && pnpm test && pnpm test:rls && pnpm build`
Expected: 0 errors; both suites pass; build clean.

```bash
git add features/delivery/components/framework-phase-editor.tsx features/delivery/components/framework-detail-screen.tsx features/delivery/data.ts tests/unit/ui-completeness.test.ts
git commit -m "feat(frameworks): edit phases inline, and delete the fixture world"
```

---

### Task 9: Signed-in verification

Controller-run, with the human partner signed in. Not delegated to a subagent — the two defects the projects slice shipped past every automated gate were only visible to a person using the page.

- [ ] **Step 1** — the register lists the six seeded frameworks with real phase and project counts, and no metric cards.
- [ ] **Step 2** — create a framework; it lands on its detail page and the row exists in the database with the submitted name and type.
- [ ] **Step 3** — a duplicate name returns a field-level message, not a 500.
- [ ] **Step 4** — add a phase, rename it, move it up and down; verify in the database that positions are contiguous `1..n` after each move.
- [ ] **Step 5** — archive a phase that a project is currently in. Confirm in the database that the project's `phase_id` is unchanged, that the phase still displays on the project's detail page, and that it is **absent** from the projects form's phase picker for a different project but **present and labelled** for the project that is in it.
- [ ] **Step 6** — restore the phase, and archive then restore the framework.
- [ ] **Step 7** — check `preview_logs` for anything thrown, then delete every fixture row created.

---

## Notes for the executor

- **Two things this plan deliberately does not build:** gates, artefacts, evidence, roles, controls, exception rules (no tables, and §18 forbids building them before the loop closes), and framework versioning (`version` stays read-only free text).
- **The reorder RPC is the only novel mechanism.** If a task finds its reasoning wrong — that the unique constraint really can survive a multi-statement reorder — stop and report rather than working around it: the phase editor's whole shape depends on it.
- **`archived_at` on a phase must never affect `projects_phase_fkey`.** Task 1's last spec exists to prove that; if it ever fails, the archive model is broken, not the test.
