# Projects Write Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it possible to create, edit and archive a project through the UI, with a tenant-scoped owner and a register that reports true totals.

**Architecture:** Three server actions already exist and are tested at the database level; nothing calls them. This wires them to a form modelled on `ClientForm`, moves the register onto `ModuleWorkspace`'s existing `connected` mode (proven by Clients), and reinstates `owner_id` behind a composite foreign key through `memberships` so a cross-tenant owner is unrepresentable.

**Tech Stack:** Next.js 16 App Router (React 19, Server Actions), TypeScript 5.7, Supabase Postgres 17 with RLS, zod, `node:test`.

## Global Constraints

- **Migrations are an append-only log.** Never edit an applied migration; add a new one. Apply through the Supabase MCP (`apply_migration`). Project id `nwdzpjzllhhqwawmsxjd` (`unison-uat`).
- **`on delete set null` on a composite foreign key MUST name its column list.** Without it Postgres nulls every column in the constraint, including `not null` ones. Migration `20260826111259` exists because this was missed once.
- Grants do not carry across a function signature change, and `revoke ... from public` does not strip Supabase's default grant to `anon` — name `anon` explicitly.
- Every `security definer` function carries `set search_path = ''` with schema-qualified references.
- `pnpm test:rls` runs against the **shared** `unison-uat` project. Every fixture must be registered for `cleanup()` or it leaks into a database other people use.
- Secrets live in `.env.local` only. Never print one or write one into a file or commit.
- **`features/product-ui/components/record-collection-workspace.tsx` must not be modified.** Ten-plus screens depend on its local-state behaviour. Projects stops *using* it; it does not change.
- **A field in the UI is a claim the product supports that capability** (`docs/product-principles.md`). This slice removes several. It must add none.
- `PGRST303: JWT issued at future` is known Supabase-side clock skew — re-run the single file before treating it as a failure.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/<ts>_project_owner_and_members.sql` | Composite owner FK; `list_organization_members()` | 1 |
| `tests/integration/rls/project-owner.test.ts` | Owner constraint and member listing | 1 |
| `features/delivery/schemas/project.ts` | `ownerId`, real date validation, notes cap | 2 |
| `features/delivery/actions/{create,update,archive}-project.ts` | Write owner; `.select()` on update/archive | 2 |
| `features/memberships/queries/list-organization-members.ts` | Typed wrapper over the RPC | 2 |
| `components/ui/form-fields.tsx` | New `EntitySelectField` (id/label options) | 3 |
| `features/delivery/components/project-form.tsx` | Replaced: wizard → real form | 3 |
| `app/(unison)/operations/projects/{new,[projectId]/edit}/page.tsx` | Wire the actions | 3 |
| `app/(unison)/operations/projects/page.tsx` | `ModuleWorkspace` connected | 4 |
| `features/delivery/queries/list-projects.ts` | `MockRecord[]`, real owner names | 4 |
| `features/product-ui/registry.ts` | Correct the `projects` definition | 4 |
| `features/delivery/components/projects-screen.tsx` | **Deleted** | 4 |
| `features/delivery/components/project-detail-screen.tsx` | Archive control | 5 |
| `app/(unison)/operations/projects/{error,loading}.tsx` | Route boundaries | 5 |

`<ts>` is `YYYYMMDDHHMMSS` at the time you create the file, strictly later than the newest migration in `supabase/migrations/`.

---

### Task 1: Owner constraint and member listing

Two database changes that everything else depends on. `projects.owner_id` currently references `auth.users(id)` with nothing tenant-scoping it, which is why `ownerId` was removed from the input schema. And `auth.users` is not reachable through PostgREST, so resolving member names needs a `security definer` function — there is no `profiles` table and `features/memberships/queries/` is empty.

**Files:**
- Create: `supabase/migrations/<ts>_project_owner_and_members.sql`
- Create: `tests/integration/rls/project-owner.test.ts`

**Interfaces:**
- Produces: constraint `projects_owner_fkey` on `public.projects`.
- Produces: `public.list_organization_members(p_organization_id uuid) returns table (user_id uuid, email text, full_name text, role_id text, status text)`, granted to `authenticated` and `service_role`. Task 2 wraps it; Tasks 3 and 4 consume that wrapper.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/rls/project-owner.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser } from './helpers.ts'

let orgId: string
let owner: { id: string; email: string; password: string }
let coOwner: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
let frameworkId: string

before(async () => {
  orgId = await createFixtureOrg('project-owner')
  owner = await createFixtureUser(orgId, 'owner')
  // A second owner so the last-owner guard does not block status changes below.
  coOwner = await createFixtureUser(orgId, 'owner')
  outsiderOrg = await createFixtureOrg('project-owner-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')

  const { data, error } = await admin
    .from('frameworks')
    .insert({ organization_id: orgId, name: 'Owner Test Framework', type: 'Enterprise', version: 'v1.0' })
    .select('id')
    .single()
  if (error) throw error
  frameworkId = data.id
})

after(async () => {
  await cleanup(
    [orgId, outsiderOrg].filter(Boolean),
    [owner?.id, coOwner?.id, outsider?.id].filter(Boolean) as string[],
  )
})

async function insertProject(ownerId: string | null) {
  return admin.from('projects').insert({
    organization_id: orgId,
    name: `Owner spec ${Date.now()}-${Math.random()}`,
    framework_id: frameworkId,
    owner_id: ownerId,
  }).select('id, owner_id, organization_id').single()
}

test('a project can be owned by an active member of the same organisation', async () => {
  const { data, error } = await insertProject(owner.id)
  assert.equal(error, null)
  assert.equal(data!.owner_id, owner.id)
})

test('an owner from another organisation is refused by the constraint', async () => {
  // The point of the composite key: this is refused by Postgres, not by
  // application code, so no code path can reach around it.
  const { error } = await insertProject(outsider.id)
  assert.ok(error, 'a cross-tenant owner must be unrepresentable')
  assert.equal(error!.code, '23503', 'expected a foreign key violation')
})

test('a member whose status is removed remains a valid owner', async () => {
  // Offboarding sets status rather than deleting the row, and ownership is
  // accountability for work already done. Nulling it would erase who was
  // responsible; the picker hides removed members, the record does not.
  const { error: statusError } = await admin.from('memberships')
    .update({ status: 'removed' }).eq('organization_id', orgId).eq('user_id', coOwner.id)
  assert.equal(statusError, null)

  const { data, error } = await insertProject(coOwner.id)
  assert.equal(error, null)
  assert.equal(data!.owner_id, coOwner.id)

  await admin.from('memberships').update({ status: 'active' })
    .eq('organization_id', orgId).eq('user_id', coOwner.id)
})

test('deleting a membership nulls the owner and leaves organization_id intact', async () => {
  // This is the assertion that catches a missing column list on
  // `on delete set null`: without it Postgres nulls organization_id too, which
  // is `not null`, and the delete fails instead of nulling one column.
  const doomed = await createFixtureUser(orgId, 'member')
  const { data: project, error } = await insertProject(doomed.id)
  assert.equal(error, null)

  const { error: deleteError } = await admin.from('memberships')
    .delete().eq('organization_id', orgId).eq('user_id', doomed.id)
  assert.equal(deleteError, null)

  const { data: after } = await admin
    .from('projects').select('owner_id, organization_id').eq('id', project!.id).single()
  assert.equal(after!.owner_id, null)
  assert.equal(after!.organization_id, orgId, 'organization_id must survive the null')

  await admin.auth.admin.deleteUser(doomed.id)
})

test('list_organization_members returns members with names and statuses', async () => {
  const { data, error } = await admin.rpc('list_organization_members', { p_organization_id: orgId })
  assert.equal(error, null)
  const rows = (data ?? []) as Array<{ user_id: string; email: string; status: string }>
  const found = rows.find((row) => row.user_id === owner.id)
  assert.ok(found, 'the owner must appear in their own organisation')
  assert.equal(found!.email, owner.email)
  assert.ok(rows.every((row) => typeof row.status === 'string'))
})

test('list_organization_members refuses an organisation the caller is not in', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error: signInError } = await client.auth.signInWithPassword({
    email: outsider.email, password: outsider.password,
  })
  assert.equal(signInError, null)

  const { error } = await client.rpc('list_organization_members', { p_organization_id: orgId })
  assert.ok(error, 'membership of another organisation must not be readable')
  assert.match(error!.message, /not a member/i)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:rls`
Expected: the cross-tenant owner spec fails because the insert *succeeds* (no constraint yet), and the `list_organization_members` specs fail with `Could not find the function`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/<ts>_project_owner_and_members.sql`:

```sql
-- projects.owner_id has always referenced auth.users(id) with nothing
-- tenant-scoping it, so a crafted submit could name a user in another
-- organisation and neither RLS nor a foreign key would refuse it. That is why
-- ownerId was removed from projectInputSchema rather than merely unused.
--
-- memberships already carries UNIQUE (organization_id, user_id), so a composite
-- key makes a cross-tenant owner unrepresentable, the same way
-- projects_client_fkey and projects_framework_fkey already do for their columns.
--
-- The (owner_id) column list is required, not decorative: without it Postgres
-- nulls EVERY column in the constraint, including organization_id, which is
-- not null. Migration 20260826111259 exists because that was missed once.
--
-- The existing owner_id -> auth.users key stays. It is redundant with this one
-- and harmless: deleting an auth user cascades to the membership, which nulls
-- the owner through this constraint.
alter table public.projects
  add constraint projects_owner_fkey
  foreign key (organization_id, owner_id)
  references public.memberships (organization_id, user_id)
  on delete set null (owner_id);

-- Owner names cannot be read through PostgREST: auth.users is not an exposed
-- schema and there is no profiles table. list-projects.ts currently renders
-- owner as an em dash with a comment saying exactly this. A security definer
-- function is the same shape list_provisioned_organizations already uses.
--
-- Returns every member with their status rather than only active ones. The
-- picker filters to active; the register needs the name of an owner whose
-- membership has since been removed, because ownership is accountability for
-- work already done and that record should not silently blank.
create or replace function public.list_organization_members(p_organization_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role_id text,
  status text
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.is_member_of(p_organization_id) then
    raise exception 'not a member of that organization' using errcode = '42501';
  end if;

  return query
    select m.user_id,
           u.email::text,
           (u.raw_user_meta_data ->> 'full_name')::text,
           m.role_id,
           m.status
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id
    order by coalesce(u.raw_user_meta_data ->> 'full_name', u.email::text);
end $$;

revoke all on function public.list_organization_members(uuid) from public, anon;
grant execute on function public.list_organization_members(uuid) to authenticated, service_role;
```

- [ ] **Step 4: Apply the migration and regenerate types**

Load the Supabase MCP tools:
`ToolSearch` query `select:mcp__cacdbb13-025d-4dbd-8de8-fa0af15580d0__apply_migration,mcp__cacdbb13-025d-4dbd-8de8-fa0af15580d0__generate_typescript_types,mcp__cacdbb13-025d-4dbd-8de8-fa0af15580d0__execute_sql`

Apply with the file's name (no `.sql`) as the migration name, then run `generate_typescript_types` and write the result to `types/database.ts`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:rls`
Expected: all six new specs pass, and every pre-existing RLS file still passes.

Run: `npx tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations tests/integration/rls/project-owner.test.ts types/database.ts
git commit -m "feat(db): tenant-scope project ownership and expose organisation members"
```

---

### Task 2: Owner in the schema, and the four recorded minors

**Files:**
- Modify: `features/delivery/schemas/project.ts`
- Modify: `features/delivery/actions/create-project.ts`, `update-project.ts`, `archive-project.ts`
- Create: `features/memberships/queries/list-organization-members.ts`
- Create: `tests/unit/project-schema.test.ts`

**Interfaces:**
- Consumes: `public.list_organization_members(p_organization_id uuid)` from Task 1.
- Produces: `listOrganizationMembers(): Promise<OrganizationMember[]>` where
  `type OrganizationMember = { userId: string; displayName: string; email: string | null; roleId: string; status: string }`, resolved for the caller's active organisation. Tasks 3 and 4 consume it.
- Produces: `projectInputSchema` with an added optional `ownerId`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/project-schema.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { projectInputSchema } from '../../features/delivery/schemas/project.ts'

const base = { name: 'Claims Platform', frameworkId: '3f1a7b6e-1f0d-4a4e-9c2b-6f2a9d8e1c34' }

test('a valid owner id is accepted', () => {
  const parsed = projectInputSchema.safeParse({ ...base, ownerId: '9a7c1d2e-3b4f-4a5c-8d6e-7f8a9b0c1d2e' })
  assert.equal(parsed.success, true)
  assert.equal(parsed.data!.ownerId, '9a7c1d2e-3b4f-4a5c-8d6e-7f8a9b0c1d2e')
})

test('an empty owner id becomes null rather than an empty string', () => {
  // FormData sends "" for an unselected picker; the column is a uuid.
  const parsed = projectInputSchema.safeParse({ ...base, ownerId: '' })
  assert.equal(parsed.success, true)
  assert.equal(parsed.data!.ownerId, null)
})

test('a non-uuid owner id is refused', () => {
  const parsed = projectInputSchema.safeParse({ ...base, ownerId: 'neo.matime' })
  assert.equal(parsed.success, false)
})

test('a malformed due date is refused with a field message, not a database error', () => {
  // dueDate was validated only as "non-empty string" and handed to a date
  // column, so "31 September" reached Postgres and came back as a 500-shaped
  // failure rather than a field-level refusal.
  const parsed = projectInputSchema.safeParse({ ...base, dueDate: '31 September' })
  assert.equal(parsed.success, false)
})

test('a valid due date is accepted and an empty one becomes null', () => {
  assert.equal(projectInputSchema.safeParse({ ...base, dueDate: '2026-09-30' }).success, true)
  const empty = projectInputSchema.safeParse({ ...base, dueDate: '' })
  assert.equal(empty.success, true)
  assert.equal(empty.data!.dueDate, null)
})

test('notes are not capped shorter than the column allows', () => {
  // projects.notes is unbounded text; the schema capped it at 500 for no stated
  // reason, so a long note was refused by the form and accepted by the database.
  const parsed = projectInputSchema.safeParse({ ...base, notes: 'x'.repeat(2000) })
  assert.equal(parsed.success, true)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test --experimental-strip-types tests/unit/project-schema.test.ts`
Expected: the owner specs fail (`ownerId` is stripped, so `parsed.data.ownerId` is `undefined`), the malformed-date spec fails (it currently succeeds), and the notes spec fails on the 500-character cap.

- [ ] **Step 3: Update the schema**

In `features/delivery/schemas/project.ts`, replace the `optionalText`/`optionalUuid` block and the `ownerId` comment:

```ts
const optionalText = z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null)
const optionalUuid = z.string().uuid().optional().or(z.literal('')).transform((v) => v || null)

// projects.notes is an unbounded text column. The schema used to cap it at 500
// for no stated reason, so the form refused what the database would accept.
const optionalLongText = z.string().trim().optional().or(z.literal('')).transform((v) => v || null)

// A date column rejects anything it cannot parse, and an unvalidated string
// turned that into a Postgres error surfacing as "the project could not be
// created" rather than a message against the field.
const optionalDate = z
  .string()
  .optional()
  .or(z.literal(''))
  .transform((v) => v || null)
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), { message: 'Enter a valid due date.' })
```

Export the two option lists so the form cannot drift from the enum. A test
comparing them would catch drift after it happened; sharing one array means
there is nothing to drift:

```ts
// Exported so the form renders exactly what the schema accepts and what
// projects_status_check allows. The product-ui registry independently offered
// Planning / On Track / At Risk as statuses, none of which the database takes.
export const PROJECT_STATUSES = ['Active', 'On Hold', 'Complete', 'Cancelled'] as const
export const PROJECT_HEALTHS = ['On Track', 'Healthy', 'Watch', 'At Risk', 'Critical'] as const
```

and use them in the schema:

```ts
  status: z.enum(PROJECT_STATUSES).default('Active'),
  health: z.enum(PROJECT_HEALTHS).default('On Track'),
```

Replace the `ownerId` comment block with the field itself:

```ts
  // Safe as of migration <ts>_project_owner_and_members: projects_owner_fkey is
  // a composite key on (organization_id, owner_id) into memberships, so a value
  // naming a user in another organisation is refused by Postgres rather than by
  // anything here. Before that constraint existed this field was deliberately
  // absent, because nothing would have caught a cross-tenant reference.
  ownerId: optionalUuid,
```

and change the two fields:

```ts
  dueDate: optionalDate,
  notes: optionalLongText,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test --experimental-strip-types tests/unit/project-schema.test.ts`
Expected: all six pass.

- [ ] **Step 5: Write owner in both actions, and add the missing `.select()`**

In `create-project.ts`, add to the insert object, after `client_id`:

```ts
    owner_id: parsed.data.ownerId,
```

In `update-project.ts`, add the same line to the update object, and replace the mutation and its error handling with a version that can tell "updated one row" from "matched none":

```ts
  const { data, error } = await supabase.from('projects').update({
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
  }).eq('id', id).eq('organization_id', organization.id).select('id')

  if (error) return { error: 'The project could not be saved.' }
  // Without .select() an update matching no rows is indistinguishable from one
  // that saved: RLS and the organisation filter both express "not yours" as
  // zero rows, not as an error, so a wrong id reported success.
  if (!data?.length) return { error: 'That project no longer exists, or is not yours to edit.' }
```

In `archive-project.ts`, apply the same treatment:

```ts
  const { data, error } = await supabase
    .from('projects')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organization.id)
    .select('id')
  if (error) throw error
  // Zero rows means the id was wrong, already archived, or another tenant's.
  // Redirecting to the register as though it worked would be a fabricated
  // success — the defect class ui-completeness.test.ts exists to prevent.
  if (!data?.length) return
```

- [ ] **Step 6: Write the member query**

Create `features/memberships/queries/list-organization-members.ts`:

```ts
import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { resolveDisplayName } from '@/lib/auth/display-name'

export type OrganizationMember = {
  userId: string
  displayName: string
  email: string | null
  roleId: string
  status: string
}

/**
 * Members of the caller's active organisation, names included.
 *
 * Goes through the `list_organization_members` RPC rather than a table select
 * because names live in `auth.users`, which PostgREST does not expose. Returns
 * every member with their status rather than only active ones: the owner picker
 * filters to active, and the register needs the name of an owner whose
 * membership has since been removed.
 *
 * Display names are resolved with the same helper the shell uses, so a person
 * is named identically wherever they appear.
 */
export async function listOrganizationMembers(): Promise<OrganizationMember[]> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.rpc('list_organization_members', {
    p_organization_id: organization.id,
  })
  if (error) throw error

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    displayName: resolveDisplayName({
      email: row.email ?? undefined,
      user_metadata: row.full_name ? { full_name: row.full_name } : {},
    } as Parameters<typeof resolveDisplayName>[0]),
    email: row.email,
    roleId: row.role_id,
    status: row.status,
  }))
}
```

- [ ] **Step 7: Run everything**

Run: `npx tsc --noEmit` → exit 0.
Run: `pnpm test` → all pass.

If `resolveDisplayName`'s parameter type does not accept that shape, read `lib/auth/display-name.ts` and adapt the call rather than casting past a real mismatch. Report what you changed.

- [ ] **Step 8: Commit**

```bash
git add features/delivery/schemas/project.ts features/delivery/actions features/memberships/queries/list-organization-members.ts tests/unit/project-schema.test.ts
git commit -m "feat(projects): accept a tenant-scoped owner and fix four recorded minors"
```

---

### Task 3: The form

`features/delivery/components/project-form.tsx` is a four-step wizard whose submit handler sets local state and whose fields have no `name` attributes — it could never have submitted anything. It is replaced by a single-page form modelled on `ClientForm`.

The shared `SelectField` renders `<option value={option}>{option}</option>`, so value equals label. The four pickers need id/name pairs, which it cannot express — hence a sibling component.

**Files:**
- Modify: `components/ui/form-fields.tsx` (add `EntitySelectField`)
- Replace: `features/delivery/components/project-form.tsx`
- Modify: `app/(unison)/operations/projects/new/page.tsx`, `app/(unison)/operations/projects/[projectId]/edit/page.tsx`
- Create: `features/delivery/queries/list-project-form-options.ts`

**Interfaces:**
- Consumes: `listOrganizationMembers()` from Task 2; `projectInputSchema`'s field names.
- Produces: `ProjectForm({ mode, project, action, options })`.
- Produces: `listProjectFormOptions(): Promise<ProjectFormOptions>` where
  `type ProjectFormOptions = { frameworks: Array<{ id: string; name: string }>; phases: Array<{ id: string; name: string; frameworkId: string }>; clients: Array<{ id: string; name: string }>; members: Array<{ id: string; name: string }> }`.

- [ ] **Step 1: Add the entity picker**

Append to `components/ui/form-fields.tsx`:

```tsx
/**
 * A select whose option values are ids and whose labels are names.
 *
 * SelectField renders `<option value={option}>{option}</option>`, so it can only
 * express choices where the value and the label are the same string. Foreign
 * keys are not like that. Kept as a sibling rather than a widened SelectField so
 * the simple case stays simple.
 */
export function EntitySelectField({
  name,
  label,
  options,
  defaultValue,
  required,
  emptyLabel,
  className,
}: {
  name: string
  label: string
  options: ReadonlyArray<{ id: string; name: string }>
  defaultValue?: string | null
  required?: boolean
  emptyLabel?: string
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <FieldLabel label={label} required={required} />
      <select name={name} defaultValue={defaultValue ?? ''} required={required} className={fieldClasses}>
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  )
}
```

- [ ] **Step 2: Write the options query**

Create `features/delivery/queries/list-project-form-options.ts`:

```ts
import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'

export type ProjectFormOptions = {
  frameworks: Array<{ id: string; name: string }>
  phases: Array<{ id: string; name: string; frameworkId: string }>
  clients: Array<{ id: string; name: string }>
  members: Array<{ id: string; name: string }>
}

/**
 * Everything the project form's four pickers need, in one round trip each.
 *
 * Phases for every framework load together — six frameworks of roughly eight
 * phases is under fifty rows — and the form filters them client-side when the
 * framework changes. A round trip per change would cost more than the data.
 */
export async function listProjectFormOptions(): Promise<ProjectFormOptions> {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const [frameworks, phases, clients, members] = await Promise.all([
    // An archived framework must not be offered. archived_at was never filtered
    // here, so an archived framework's name still reached the register.
    supabase.from('frameworks').select('id, name')
      .eq('organization_id', organization.id).is('archived_at', null).order('name'),
    supabase.from('framework_phases').select('id, name, framework_id')
      .eq('organization_id', organization.id).order('position'),
    supabase.from('clients').select('id, name')
      .eq('organization_id', organization.id).is('archived_at', null).order('name'),
    listOrganizationMembers(),
  ])

  if (frameworks.error) throw frameworks.error
  if (phases.error) throw phases.error
  if (clients.error) throw clients.error

  return {
    frameworks: frameworks.data ?? [],
    phases: (phases.data ?? []).map((row) => ({ id: row.id, name: row.name, frameworkId: row.framework_id })),
    clients: clients.data ?? [],
    // Only active members are offered. An existing owner who has since been
    // removed still displays on the record; they are simply not a new choice.
    members: members.filter((member) => member.status === 'active')
      .map((member) => ({ id: member.userId, name: member.displayName })),
  }
}
```

If `clients` has no `archived_at` column, drop that filter and say so in your report rather than inventing one.

- [ ] **Step 3: Replace the form**

Replace the entire contents of `features/delivery/components/project-form.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { WorkspaceHeader } from '@/components/shared/workspace-header'
import { EntitySelectField, SelectField, TextAreaField, TextField } from '@/components/ui/form-fields'
import { FormError, FormFooter, FormSection } from '@/components/ui/form-layout'
import type { ProjectFormOptions } from '../queries/list-project-form-options'
// Imported, not redeclared: these are the same arrays projectInputSchema builds
// its enums from, so the form cannot offer a value the schema or
// projects_status_check would reject. Copying them here would let them drift.
import { PROJECT_HEALTHS, PROJECT_STATUSES } from '../schemas/project'

type ActionState = { error?: string } | undefined
type ProjectFormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>

export type ProjectFormValues = {
  id: string
  name: string
  framework_id: string | null
  phase_id: string | null
  client_id: string | null
  owner_id: string | null
  status: string
  health: string
  progress: number
  next_gate: string | null
  due_date: string | null
  notes: string | null
}

export function ProjectForm({
  mode,
  project,
  action,
  options,
}: {
  mode: 'create' | 'edit'
  project?: ProjectFormValues
  action: ProjectFormAction
  options: ProjectFormOptions
}) {
  const [state, formAction, pending] = useActionState(action, undefined)
  // The phase list depends on the chosen framework, and the composite key
  // (framework_id, phase_id) means a phase from another framework is refused by
  // the database. Filtering here keeps that impossible to attempt.
  const [frameworkId, setFrameworkId] = useState(project?.framework_id ?? '')
  const phases = options.phases.filter((phase) => phase.frameworkId === frameworkId)
  const backHref = project ? `/operations/projects/${project.id}` : '/operations/projects'

  return <>
    <WorkspaceHeader
      category="Delivery"
      parent={{ label: 'Projects', href: '/operations/projects' }}
      title={mode === 'create' ? 'New Project' : `Edit ${project?.name ?? 'Project'}`}
      description={mode === 'create' ? 'Create a governed delivery project.' : 'Update this project’s record.'}
    />
    <Link href={backHref} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
      Back to {project ? project.name : 'Projects'}
    </Link>

    <form action={formAction} className="mx-auto max-w-5xl space-y-5">
      <FormSection title="Project" description="What is being delivered, and under which framework.">
        <TextField name="name" label="Project name" required defaultValue={project?.name} />
        <label className="block">
          <span className="text-sm font-medium">Delivery framework <span className="text-destructive">*</span></span>
          <select
            name="frameworkId"
            required
            value={frameworkId}
            onChange={(event) => setFrameworkId(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          >
            <option value="">Select a framework</option>
            {options.frameworks.map((framework) => (
              <option key={framework.id} value={framework.id}>{framework.name}</option>
            ))}
          </select>
        </label>
        <EntitySelectField
          name="phaseId"
          label="Current phase"
          options={phases}
          defaultValue={project?.phase_id}
          emptyLabel={frameworkId ? 'Not started' : 'Choose a framework first'}
        />
      </FormSection>

      <FormSection title="Accountability" description="Who owns delivery, and for whom.">
        <EntitySelectField
          name="ownerId"
          label="Project owner"
          options={options.members}
          defaultValue={project?.owner_id}
          emptyLabel="Unassigned"
        />
        <EntitySelectField
          name="clientId"
          label="Client"
          options={options.clients}
          defaultValue={project?.client_id}
          emptyLabel="Internal change"
        />
      </FormSection>

      <FormSection title="Delivery state" description="Where this project currently stands.">
        <SelectField name="status" label="Status" options={PROJECT_STATUSES} defaultValue={project?.status ?? 'Active'} />
        <SelectField name="health" label="Health" options={PROJECT_HEALTHS} defaultValue={project?.health ?? 'On Track'} />
        <TextField name="progress" label="Progress (%)" type="number" defaultValue={String(project?.progress ?? 0)} />
        <TextField name="nextGate" label="Next gate" defaultValue={project?.next_gate} />
        <TextField name="dueDate" label="Due date" type="date" defaultValue={project?.due_date} />
      </FormSection>

      <FormSection title="Notes" description="Context for the delivery team.">
        <TextAreaField name="notes" label="Notes" defaultValue={project?.notes} />
      </FormSection>

      <FormError message={state?.error} />
      <FormFooter
        cancelHref={backHref}
        submitLabel={mode === 'create' ? 'Create project' : 'Save changes'}
        pending={pending}
      />
    </form>
  </>
}
```

The framework select is written inline rather than through `EntitySelectField` because it is the one controlled input — its value drives the phase filter.

- [ ] **Step 4: Wire the two routes**

Replace `app/(unison)/operations/projects/new/page.tsx`:

```tsx
import { ProjectForm } from '@/features/delivery/components/project-form'
import { createProjectAction } from '@/features/delivery/actions/create-project'
import { listProjectFormOptions } from '@/features/delivery/queries/list-project-form-options'

export default async function Page() {
  const options = await listProjectFormOptions()
  return <ProjectForm mode="create" action={createProjectAction} options={options} />
}
```

Replace `app/(unison)/operations/projects/[projectId]/edit/page.tsx`:

```tsx
import { notFound } from 'next/navigation'

import { ProjectForm } from '@/features/delivery/components/project-form'
import { getProject } from '@/features/delivery/queries/get-project'
import { updateProjectAction } from '@/features/delivery/actions/update-project'
import { listProjectFormOptions } from '@/features/delivery/queries/list-project-form-options'

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const [project, options] = await Promise.all([getProject(projectId), listProjectFormOptions()])
  if (!project) notFound()
  return <ProjectForm mode="edit" project={project} action={updateProjectAction.bind(null, projectId)} options={options} />
}
```

If `getProject`'s return type does not match `ProjectFormValues`, adapt `ProjectFormValues` to what it actually returns rather than casting. Report the difference.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` → exit 0.
Run: `pnpm test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add components/ui/form-fields.tsx features/delivery/components/project-form.tsx features/delivery/queries/list-project-form-options.ts "app/(unison)/operations/projects"
git commit -m "feat(projects): replace the wizard with a form that actually submits"
```

---

### Task 4: The register

**Files:**
- Modify: `app/(unison)/operations/projects/page.tsx`
- Modify: `features/delivery/queries/list-projects.ts`
- Modify: `features/product-ui/registry.ts`
- Delete: `features/delivery/components/projects-screen.tsx`
- Modify: `tests/unit/ui-completeness.test.ts`

**Interfaces:**
- Consumes: `listOrganizationMembers()` from Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/ui-completeness.test.ts`:

```ts
test('the projects register reports only what the database holds', () => {
  // Six hard-coded metric cards ("Active Projects 36", "At Risk 7") sat above a
  // register of real rows, and three hard-coded summary panels below it. The
  // delivery overview already carries real counts; a register is a register.
  assert.ok(
    !existsSync(join(workspace, 'features', 'delivery', 'components', 'projects-screen.tsx')),
    'ProjectsScreen carried fabricated metrics above real rows and must not return',
  )
  assert.ok(
    !existsSync(join(workspace, 'features', 'delivery', 'components', 'project-form.tsx')) ||
      !readFileSync(join(workspace, 'features', 'delivery', 'components', 'project-form.tsx'), 'utf8').includes('setComplete'),
    'the four-step wizard reported success without writing; it must not return',
  )

  const registry = readFileSync(join(workspace, 'features', 'product-ui', 'registry.ts'), 'utf8')
  const projects = registry.slice(registry.indexOf("id: 'projects'"), registry.indexOf("id: 'onboarding'"))
  assert.ok(projects.length > 0, 'the projects definition must still exist')
  for (const invented of ['Neo Morake', 'Amara Dlamini', 'LGNDRY.CO', 'Growthpoint Properties', 'Pioneertown']) {
    assert.ok(!projects.includes(invented), `${invented} is fabricated data and must not be offered`)
  }
  // projects_status_check accepts Active / On Hold / Complete / Cancelled.
  for (const rejected of ['Planning', 'On Track']) {
    assert.ok(!projects.includes(`'${rejected}'`), `${rejected} is not a status the database accepts`)
  }

  const page = readFileSync(join(workspace, 'app', '(unison)', 'operations', 'projects', 'page.tsx'), 'utf8')
  for (const passed of ['total', 'pageSize', 'initialQuery', 'connected']) {
    assert.match(page, new RegExp(passed), `the register must receive ${passed} from the server`)
  }
})
```

Add `existsSync` to the `node:fs` import at the top of the file if it is not already there.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test --experimental-strip-types tests/unit/ui-completeness.test.ts`
Expected: FAIL — `ProjectsScreen carried fabricated metrics above real rows and must not return`.

- [ ] **Step 3: Give the query real owner names and the right type**

In `features/delivery/queries/list-projects.ts`:

Replace the `CollectionRecord` import with `MockRecord`:

```ts
import type { MockRecord } from '@/features/product-ui/types'
import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
```

`CollectionRecord` allows `boolean | undefined` in its index signature and `MockRecord` does not, so the two are not assignable; the mapper's values are all strings already.

Add `owner_id` to the select list:

```ts
      'id, name, status, health, progress, next_gate, due_date, updated_at, owner_id, frameworks(name), framework_phases(name), clients(name)',
```

Before the mapper, resolve names once:

```ts
  // Owner is a user id and auth.users is not reachable through PostgREST, so
  // names come from the list_organization_members RPC. One call for the page,
  // not one per row.
  const members = await listOrganizationMembers()
  const memberNames = new Map(members.map((member) => [member.userId, member.displayName]))
```

Change the record type and the owner line:

```ts
  const records: MockRecord[] = (data ?? []).map((row) => ({
```

```ts
    owner: row.owner_id ? memberNames.get(row.owner_id) ?? 'Former member' : 'Unassigned',
```

`'Former member'` covers an owner whose membership row was deleted outright — offboarding sets `status` instead, so this is the rare case, not the normal one.

- [ ] **Step 4: Move the page onto `ModuleWorkspace`**

Replace `app/(unison)/operations/projects/page.tsx`:

```tsx
import { ModuleWorkspace } from '@/features/product-ui/components/module-workspace'
import { moduleById } from '@/features/product-ui/registry'
import { listProjects } from '@/features/delivery/queries/list-projects'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const status = typeof params.status === 'string' ? params.status : undefined
  const sort = typeof params.sort === 'string' ? params.sort : undefined
  const parsedPage = typeof params.page === 'string' ? Number(params.page) : undefined
  const page = parsedPage !== undefined && Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : undefined

  const { records, total, page: resolvedPage, pageSize } = await listProjects({ q, status, sort, page })

  return <ModuleWorkspace module={moduleById.projects} records={records} connected initialQuery={q} total={total} page={resolvedPage} pageSize={pageSize} />
}
```

This is the Clients page with `listProjects` and `moduleById.projects` substituted. The previous version discarded `total`, `page` and `pageSize`, so the footer counted the current slice and rows past page one were unreachable.

- [ ] **Step 5: Delete the screen and correct the registry**

```bash
git rm features/delivery/components/projects-screen.tsx
```

In `features/product-ui/registry.ts`, in the `projects` definition:

- set `columns` to `['Project', 'Client', 'Framework', 'Phase', 'Health', 'Owner', 'Next Gate', 'Due Date']`
- set `filters` to `['Status', 'Client', 'Owner', 'Due date']`
- remove every `options: [...]` array containing a person or client name from its `fields`
- change any `status` field's options to `['Active', 'On Hold', 'Complete', 'Cancelled']`

Portfolio, programme, team and risk are removed because no table backs them.

Check whether anything else reads `moduleById.projects` before changing its columns:

```bash
grep -rn "moduleById.projects\|moduleById\['projects'\]" --include=*.ts --include=*.tsx app features components
```

Report what you find.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` → exit 0.
Run: `pnpm test` → all pass, including the new register spec.

- [ ] **Step 7: Commit**

```bash
git add -A app features tests/unit/ui-completeness.test.ts
git commit -m "feat(projects): drive the register from the database, not from fixtures"
```

---

### Task 5: Archive, and the route's boundaries

`ModuleWorkspace`'s connected mode deliberately disables the row-level archive control, so archiving lives on the detail page. `operations/projects/` has neither `error.tsx` nor `loading.tsx`, which `operations/clients/` has.

**Files:**
- Modify: `features/delivery/components/project-detail-screen.tsx`
- Create: `app/(unison)/operations/projects/error.tsx`, `app/(unison)/operations/projects/loading.tsx`

- [ ] **Step 1: Add the boundaries**

Create `app/(unison)/operations/projects/error.tsx`:

```tsx
'use client'

import { AlertTriangle } from 'lucide-react'

export default function ProjectsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-border bg-card px-6 text-center">
      <AlertTriangle className="size-8 text-warning" />
      <h3 className="mt-4 font-semibold">This workspace could not load</h3>
      <p className="mt-1 text-sm text-muted-foreground">The Projects data could not be retrieved. Try the request again.</p>
      <button type="button" onClick={reset} className="mt-4 rounded-lg border border-border px-3 py-2 text-sm font-medium">Try again</button>
    </section>
  )
}
```

Create `app/(unison)/operations/projects/loading.tsx`:

```tsx
import { LoadingSkeleton } from '@/components/shared/state-feedback'

export default function ProjectsLoading() {
  return <section className="overflow-hidden rounded-xl border border-border bg-card"><LoadingSkeleton /></section>
}
```

- [ ] **Step 2: Wire archive on the detail screen**

Read `features/delivery/components/project-detail-screen.tsx` first. It renders mock-derived controls including a duplicate dialog and a document upload that resolve to local success states; leave those alone, they are recorded separately.

Add an archive control that posts to the real action. If the screen is a client component, this is a plain form — server actions can be passed to one:

```tsx
<form action={archiveProjectAction}>
  <input type="hidden" name="id" value={project.id} />
  <button type="submit" className="rounded-lg border border-destructive px-3 py-2 text-sm font-semibold text-destructive">
    Archive project
  </button>
</form>
```

with `import { archiveProjectAction } from '@/features/delivery/actions/archive-project'`.

Place it where the screen already groups record actions. If the screen currently has an archive control backed by local state, replace it; do not leave two.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` → exit 0.
Run: `pnpm test` → all pass.

- [ ] **Step 4: Commit**

```bash
git add "app/(unison)/operations/projects" features/delivery/components/project-detail-screen.tsx
git commit -m "feat(projects): archive for real, and give the route its boundaries"
```

---

### Task 6: Signed-in verification

> **The controller runs this task, not a subagent.** It needs the human partner to sign in — no agent may enter credentials — and it writes real rows to the shared database.

Every gate so far can pass while the form fails for a signed-in user. That is exactly how the RSC-boundary outage and the provisioning failures reached production.

**Files:** none. This task produces evidence.

- [ ] **Step 1: Start the dev server** with the Browser pane's `preview_start` (`unison-dev`). Do not run `next dev` through Bash.
- [ ] **Step 2: Ask the human partner to sign in.** You must not enter credentials.
- [ ] **Step 3: Create a project** at `/operations/projects/new`. Disposable name. Choose a framework, then a phase, then an owner and a client. Confirm the phase list is empty until a framework is chosen and filters to that framework afterwards.
- [ ] **Step 4: Confirm it landed** through the Supabase MCP `execute_sql`:

```sql
select p.name, p.status, p.health, p.owner_id, p.client_id, p.phase_id,
       f.name as framework, ph.name as phase,
       (select count(*) from public.memberships m
         where m.organization_id = p.organization_id and m.user_id = p.owner_id) as owner_is_member
from public.projects p
left join public.frameworks f on f.id = p.framework_id
left join public.framework_phases ph on ph.id = p.phase_id
where p.name = '<the name you used>';
```

Expected: one row, `owner_is_member` = 1, framework and phase names matching what was chosen.

- [ ] **Step 5: Edit it**, change the health and the owner, save, and re-run the query to confirm both changed.
- [ ] **Step 6: Archive it** from the detail page, confirm it leaves the register, and reload to confirm it stays gone.
- [ ] **Step 7: Check the runtime log** through `preview_logs` for anything the UI swallowed.
- [ ] **Step 8: Clean up.**

```sql
delete from public.projects where name = '<the name you used>';
```

- [ ] **Step 9: Report.** No commit. Say which branch each step took and paste the query results.

---

### Task 7: Verify the whole branch from a clean tree

Every "suite green" claim in this project's history was once made against a dirty tree, and a clean checkout of `main` was red for three merged branches.

**Files:** none.

- [ ] **Step 1: Confirm the tree is clean**

Run: `git status --short`

`proxy.ts` may appear modified with an **empty diff** — that is a CRLF artefact, not a change. Untracked `public/*.png` files are the human partner's and must survive. Stash with `git stash push --include-untracked` and restore afterwards with `git stash pop`, then confirm they came back.

- [ ] **Step 2: Run every gate**

```bash
npx tsc --noEmit && pnpm test && pnpm build
```

Run `pnpm test:rls` separately. All must pass.

- [ ] **Step 3: Confirm the constraint is live**

```sql
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.projects'::regclass and conname = 'projects_owner_fkey';
```

Expected: one row, referencing `memberships(organization_id, user_id)`, with `ON DELETE SET NULL (owner_id)` — the column list present.

- [ ] **Step 4: Report.** No commit. Paste each result.

---

## Notes for the executor

**If the plan and the code disagree, stop and say so.** Line numbers and the exact shape of `getProject`, `project-detail-screen.tsx` and the registry's `projects` definition were read on 2026-09-05 and may have moved.

**Do not modify `record-collection-workspace.tsx`.** Ten screens depend on its local-state behaviour. Projects stops using it; it does not change.

**Do not edit an applied migration.** If Task 1's migration is wrong after applying, add another.
