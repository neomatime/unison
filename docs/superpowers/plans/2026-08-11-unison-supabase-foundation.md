# UNISON Supabase Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the UNISON front end to the `unison-uat` Supabase project with auth, multi-tenancy, row level security, audit, and email, then prove the whole stack by persisting the Clients module end to end.

**Architecture:** Next.js App Router Server Components and Server Actions talk to Postgres through `@supabase/ssr` clients that run as the signed-in user, so row level security is the enforcement boundary. Tenant scope resolves per request from an httpOnly cookie validated against live membership rows. The existing `lib/tenancy` guards run in front of RLS as a second layer that returns clean authorization errors.

**Tech Stack:** Next.js 16.3, React 19, TypeScript 5.7, Tailwind v4, Supabase (Postgres 17), `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `nodemailer`, `node --test` with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-08-11-unison-supabase-foundation-design.md`

## Global Constraints

- Supabase project is `unison-uat`, ref `nwdzpjzllhhqwawmsxjd`, region us-east-1, Postgres 17.
- Project URL: `https://nwdzpjzllhhqwawmsxjd.supabase.co`
- Publishable key: `sb_publishable_Qmq5cJo69-PACiTuKnynug_y4lpTyMR`
- The secret (service role) key is **entered by the account owner** into `.env.local`. Never read it into a tool call, never commit it, never echo it.
- Every tenant-owned table carries `organization_id` directly. No table infers tenancy through a join.
- Every table has RLS enabled with no permissive default. An unpoliced table is a locked table.
- No cache key may omit the organization id.
- `lib/supabase/admin.ts` must never be imported by anything under `features/`. A test enforces this.
- Deletes get no RLS policy. Archiving via `archived_at` is the only removal path.
- Roles are exactly `owner`, `admin`, `member`, matching `config/roles.ts`.
- HIMARK's organization id is `00000000-0000-4000-8000-000000000001` and slug is `himark`, preserved verbatim from `config/tenants.ts`.
- Node test files cannot use the `@/` path alias — the test runner has no path mapping. Use relative imports with explicit `.ts` extensions, matching the existing specs in `tests/integration/tenancy/`.
- Migrations are written as files under `supabase/migrations/` **and** applied through the Supabase MCP `apply_migration` tool using the same name. No Supabase CLI or Docker required.
- Commit after every task. Never use `--no-verify`.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `lib/env.ts` | Validate and export all environment variables; throw a named error on absence |
| `lib/supabase/server.ts` | Per-request user-scoped client for Server Components/Actions |
| `lib/supabase/client.ts` | Browser user-scoped client |
| `lib/supabase/admin.ts` | Service-role client, `server-only`, bootstrap/invite/admin use only |
| `lib/auth/session-context.ts` | Resolve `{ user, organization, membership, role }` per request |
| `lib/auth/errors.ts` | `NotAuthenticatedError`, `NoMembershipError` |
| `lib/email/transport.ts` | nodemailer transport, plus a dev transport that logs |
| `lib/email/send-email.ts` | `sendEmail(to, template, data)` — the only mail entry point |
| `lib/email/templates/invitation.ts` | Invitation subject + HTML + text |
| `middleware.ts` | Session refresh and route-group gating |
| `types/database.ts` | Generated Supabase types (committed) |
| `features/clients/schemas/client.ts` | zod input schemas |
| `features/clients/queries/list-clients.ts` | Tenant-scoped list with search/filter/sort/page |
| `features/clients/queries/get-client.ts` | Single record read |
| `features/clients/actions/*.ts` | create / update / archive server actions |
| `features/invitations/actions/send-invitation.ts` | Create invitation row and dispatch mail |
| `features/invitations/actions/accept-invitation.ts` | Call the RPC |
| `features/organizations/actions/switch-organization.ts` | Validate membership, set cookie |
| `features/auth-ui/actions/*.ts` | sign in, sign out, request reset |
| `scripts/grant-owner.ts` | Grant owner membership to an email after first signup |
| `supabase/migrations/*.sql` | Ordered schema changes |
| `docs/reference/legacy-booking-schema.sql` | Archived pre-reset schema |
| `tests/unit/service-role-boundary.test.ts` | Static import-boundary guard |
| `tests/integration/rls/*.test.ts` | Live RLS enforcement specs |

**Modified:** `next.config.mjs`, `package.json`, `components/shared/tenant-switcher.tsx`, `components/navigation/sidebar.tsx`, `components/layout/app-shell.tsx`, `features/product-ui/components/module-workspace.tsx`, `app/(unison)/layout.tsx`, `app/(unison)/operations/clients/**`, `docs/database.md`, `docs/tenancy.md`, `docs/development.md`, `docs/product-ui.md`.

**Deleted:** `database/` (superseded by `supabase/migrations/`), `app/(auth)/sign-up/page.tsx` (unreachable behind the invite-only redirect).

---

### Task 1: Repository hygiene, dependencies, and the environment module

**Files:**
- Create: `lib/env.ts`
- Create: `.env.local.example`
- Modify: `next.config.mjs`
- Modify: `package.json`
- Delete: `app/(auth)/sign-up/page.tsx`, `database/` (four `.gitkeep` directories)
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces three independent readers plus `MissingEnvError`:
  - `readSupabaseEnv(source)` → `{ SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string; SUPABASE_SECRET_KEY: string }`
  - `readSmtpEnv(source)` → `{ SMTP_HOST: string; SMTP_PORT: number; SMTP_USER: string; SMTP_PASSWORD: string; SMTP_FROM: string }`
  - `readAppUrl(source)` → `string`

**Why three readers and not one:** a single eager reader would make Supabase access depend on mail configuration — the app could not boot, or even sign in, until SMTP was set up. Each group is validated only where it is used, so a mail misconfiguration can never take down authentication.

- [ ] **Step 1: Install dependencies**

```bash
pnpm add @supabase/supabase-js @supabase/ssr zod nodemailer
pnpm add -D @types/nodemailer
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/env.test.ts`. It tests the pure reader, not the module singleton, so it needs no real environment.

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { MissingEnvError, readAppUrl, readSmtpEnv, readSupabaseEnv } from '../../lib/env.ts'

const supabaseVars = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SECRET_KEY: 'secret',
}

const smtpVars = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'invitations@himark.example',
  SMTP_PASSWORD: 'password',
  SMTP_FROM: 'HIMARK <invitations@himark.example>',
}

test('readSupabaseEnv returns typed values when present', () => {
  const env = readSupabaseEnv(supabaseVars)
  assert.equal(env.SUPABASE_URL, 'https://example.supabase.co')
  assert.equal(env.SUPABASE_SECRET_KEY, 'secret')
})

test('readSupabaseEnv names the missing variable', () => {
  const { SUPABASE_SECRET_KEY: _omitted, ...incomplete } = supabaseVars
  assert.throws(() => readSupabaseEnv(incomplete), (error: unknown) => {
    assert.ok(error instanceof MissingEnvError)
    assert.match((error as Error).message, /SUPABASE_SECRET_KEY/)
    return true
  })
})

test('readSupabaseEnv does not require SMTP variables', () => {
  assert.doesNotThrow(() => readSupabaseEnv(supabaseVars))
})

test('readSmtpEnv coerces the port to a number', () => {
  assert.equal(readSmtpEnv(smtpVars).SMTP_PORT, 465)
})

test('readSmtpEnv rejects a non-numeric port', () => {
  assert.throws(() => readSmtpEnv({ ...smtpVars, SMTP_PORT: 'abc' }), MissingEnvError)
})

test('readAppUrl reads the public app url', () => {
  assert.equal(readAppUrl({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }), 'http://localhost:3000')
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `pnpm exec node --test --experimental-strip-types tests/unit/env.test.ts`
Expected: FAIL — cannot find module `../../lib/env.ts`.

- [ ] **Step 4: Implement `lib/env.ts`**

```ts
export class MissingEnvError extends Error {
  constructor(name: string, reason = 'is not set') {
    super(`Environment variable ${name} ${reason}. Add it to .env.local — see .env.local.example.`)
    this.name = 'MissingEnvError'
  }
}

type Source = Record<string, string | undefined>

function required(source: Source, name: string): string {
  const value = source[name]
  if (!value) throw new MissingEnvError(name)
  return value
}

function requiredPort(source: Source, name: string): number {
  const value = Number(required(source, name))
  if (!Number.isInteger(value) || value <= 0) throw new MissingEnvError(name, 'is not a valid port')
  return value
}

export function readSupabaseEnv(source: Source) {
  return {
    SUPABASE_URL: required(source, 'NEXT_PUBLIC_SUPABASE_URL'),
    SUPABASE_PUBLISHABLE_KEY: required(source, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    SUPABASE_SECRET_KEY: required(source, 'SUPABASE_SECRET_KEY'),
  } as const
}

export function readSmtpEnv(source: Source) {
  return {
    SMTP_HOST: required(source, 'SMTP_HOST'),
    SMTP_PORT: requiredPort(source, 'SMTP_PORT'),
    SMTP_USER: required(source, 'SMTP_USER'),
    SMTP_PASSWORD: required(source, 'SMTP_PASSWORD'),
    SMTP_FROM: required(source, 'SMTP_FROM'),
  } as const
}

export function readAppUrl(source: Source): string {
  return required(source, 'NEXT_PUBLIC_APP_URL')
}

export type SupabaseEnv = ReturnType<typeof readSupabaseEnv>
export type SmtpEnv = ReturnType<typeof readSmtpEnv>
```

Note: do **not** add module-level `export const env = ...` calls here. Browser bundles would then demand `SUPABASE_SECRET_KEY`. Server modules call the reader they need; the two public values are read directly from `process.env` in the browser client.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `pnpm exec node --test --experimental-strip-types tests/unit/env.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Create `.env.local.example`**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://nwdzpjzllhhqwawmsxjd.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_Qmq5cJo69-PACiTuKnynug_y4lpTyMR
SUPABASE_SECRET_KEY=
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=HIMARK <>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 7: Remove the build escape hatch**

In `next.config.mjs`, delete the entire `typescript: { ignoreBuildErrors: true },` block. Keep `images` and `redirects` exactly as they are.

- [ ] **Step 8: Remove dead files**

```bash
rm -rf database
rm -rf "app/(auth)/sign-up"
```

`/sign-up` still redirects to `/sign-in` via `next.config.mjs`, so no link breaks.

- [ ] **Step 9: Update the test scripts in `package.json`**

```json
"test": "node --test --experimental-strip-types tests/integration/tenancy/*.test.ts tests/unit/*.test.ts",
"test:rls": "node --test --env-file=.env.local --experimental-strip-types tests/integration/rls/*.test.ts",
"typecheck": "tsc --noEmit"
```

`test` stays offline and fast. `test:rls` is separate because it needs credentials and network.

- [ ] **Step 10: Verify the whole gate**

Run: `pnpm test` — expect all existing specs plus the 3 new env tests to pass.
Run: `pnpm exec tsc --noEmit` — expect exit 0.
Run: `pnpm build` — expect success with `ignoreBuildErrors` gone.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: add Supabase deps, env module, and restore type checking"
```

---

### Task 2: Archive and reset the legacy schema

**STOP — destructive.** This task drops 17 tables. Do not run Step 3 until Neo has confirmed in this session. The tables are empty, but the migration history is not recoverable.

**Files:**
- Create: `docs/reference/legacy-booking-schema.sql`
- Create: `supabase/migrations/20260811000001_reset_legacy_schema.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: an empty `public` schema on `unison-uat` with `pg_trgm` and `btree_gist` still installed.

- [ ] **Step 1: Dump the existing schema for the archive**

Use the Supabase MCP `execute_sql` against project `nwdzpjzllhhqwawmsxjd` to read every table definition, then write the result to `docs/reference/legacy-booking-schema.sql`. Capture at minimum: table names, columns with types and nullability, constraints, indexes, RLS policies, and the body of `public.custom_access_token_hook`.

```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;
```

```sql
select pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'custom_access_token_hook';
```

Add a header comment to the file recording the date, project ref, and why it was archived.

- [ ] **Step 2: Commit the archive BEFORE dropping anything**

```bash
git add docs/reference/legacy-booking-schema.sql
git commit -m "docs: archive the legacy booking schema before reset"
```

- [ ] **Step 3: Confirm with Neo, then write and apply the reset migration**

Create `supabase/migrations/20260811000001_reset_legacy_schema.sql`:

```sql
-- Reset unison-uat from the superseded booking schema.
-- Every table was empty at the time of this migration; the prior definitions
-- are archived at docs/reference/legacy-booking-schema.sql.

drop table if exists public.booking_status_history cascade;
drop table if exists public.booking_participants cascade;
drop table if exists public.bookings cascade;
drop table if exists public.service_provider_assignments cascade;
drop table if exists public.service_price_history cascade;
drop table if exists public.services cascade;
drop table if exists public.service_categories cascade;
drop table if exists public.client_addresses cascade;
drop table if exists public.client_contacts cascade;
drop table if exists public.clients cascade;
drop table if exists public.team_leave cascade;
drop table if exists public.team_invites cascade;
drop table if exists public.team_availability cascade;
drop table if exists public.notifications cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.users cascade;
drop table if exists public.firms cascade;

drop function if exists public.custom_access_token_hook(jsonb) cascade;
```

Apply it with the MCP `apply_migration` tool, name `reset_legacy_schema`.

- [ ] **Step 4: Verify the reset**

Use MCP `list_tables` on the project. Expected: no application tables in `public`. Extension-owned functions (`pg_trgm`, `btree_gist`) remain and are expected.

If the Auth hook was enabled in the dashboard, note that dropping the function is not enough — the hook setting itself must be disabled in the project's Auth configuration. Check and report; this is a dashboard action for Neo, not something to do silently.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): reset unison-uat to an empty schema"
```

---

### Task 3: Platform tables

**Files:**
- Create: `supabase/migrations/20260811000002_platform_tables.sql`
- Create: `types/database.ts` (generated)

**Interfaces:**
- Consumes: an empty `public` schema.
- Produces: tables `organizations`, `memberships`, `invitations`, `audit_events`. Generated TypeScript types in `types/database.ts` exporting `Database`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260811000002_platform_tables.sql`:

```sql
create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null check (role_id in ('owner','admin','member')),
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_lookup on public.memberships (user_id, organization_id) where status = 'active';

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role_id text not null check (role_id in ('owner','admin','member')),
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index invitations_pending on public.invitations (organization_id, status);
create unique index invitations_one_pending_per_email
  on public.invitations (organization_id, lower(email)) where status = 'pending';

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  resource text not null,
  resource_id uuid,
  action text not null check (action in ('insert','update','delete')),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_org_time on public.audit_events (organization_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.memberships  enable row level security;
alter table public.invitations  enable row level security;
alter table public.audit_events enable row level security;
```

RLS is enabled here with **no policies yet**, which locks every table. Task 4 adds access. This ordering is deliberate: the tables are never briefly readable.

- [ ] **Step 2: Apply it**

MCP `apply_migration`, project `nwdzpjzllhhqwawmsxjd`, name `platform_tables`.

- [ ] **Step 3: Verify**

MCP `list_tables`. Expected: the four tables, all with `rls_enabled: true`, all 0 rows.

- [ ] **Step 4: Generate types**

MCP `generate_typescript_types` for the project. Write the output to `types/database.ts` verbatim, with a first line comment:

```ts
// Generated by `supabase gen types`. Do not edit by hand.
// Regenerate whenever a migration lands.
```

- [ ] **Step 5: Verify types compile**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations types/database.ts
git commit -m "feat(db): add organizations, memberships, invitations, audit_events"
```

---

### Task 4: RLS helpers and platform policies

**Files:**
- Create: `supabase/migrations/20260811000003_rls_helpers_and_policies.sql`

**Interfaces:**
- Consumes: Task 3's tables.
- Produces: SQL functions `public.is_member_of(uuid) returns boolean` and `public.has_role(uuid, text[]) returns boolean`; policies on all four platform tables.

- [ ] **Step 1: Write the migration**

```sql
-- Membership lookup, not JWT claims: revocation takes effect immediately.
-- security definer is load-bearing — the policy on memberships reads
-- memberships, which recurses without the bypass.
create or replace function public.is_member_of(org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and organization_id = org
      and status = 'active'
  );
$$;

create or replace function public.has_role(org uuid, roles text[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and organization_id = org
      and status = 'active'
      and role_id = any(roles)
  );
$$;

revoke execute on function public.is_member_of(uuid) from public, anon;
revoke execute on function public.has_role(uuid, text[]) from public, anon;
grant execute on function public.is_member_of(uuid) to authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;

-- organizations
create policy organizations_select on public.organizations
  for select to authenticated using (public.is_member_of(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.has_role(id, array['owner','admin']))
  with check (public.has_role(id, array['owner','admin']));

-- memberships
create policy memberships_select on public.memberships
  for select to authenticated using (public.is_member_of(organization_id));

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.has_role(organization_id, array['owner','admin']));

create policy memberships_update on public.memberships
  for update to authenticated
  using (public.has_role(organization_id, array['owner','admin']))
  with check (public.has_role(organization_id, array['owner','admin']));

-- invitations
create policy invitations_select on public.invitations
  for select to authenticated using (public.has_role(organization_id, array['owner','admin']));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (public.has_role(organization_id, array['owner','admin']));

create policy invitations_update on public.invitations
  for update to authenticated
  using (public.has_role(organization_id, array['owner','admin']))
  with check (public.has_role(organization_id, array['owner','admin']));

-- audit_events: readable by admins, written only by triggers and the service role
create policy audit_events_select on public.audit_events
  for select to authenticated using (public.has_role(organization_id, array['owner','admin']));

revoke all on public.organizations, public.memberships, public.invitations, public.audit_events from anon;
```

No delete policies anywhere — that is intentional and matches the global constraints.

- [ ] **Step 2: Apply it**

MCP `apply_migration`, name `rls_helpers_and_policies`.

- [ ] **Step 3: Verify the policies landed**

MCP `execute_sql`:

```sql
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' order by tablename, policyname;
```

Expected: 9 policies across the four tables, none with `cmd = 'DELETE'`.

- [ ] **Step 4: Check the security advisors**

MCP `get_advisors` with type `security`. Address anything it flags about these tables. A `function_search_path_mutable` warning must not appear — both functions set `search_path = ''`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): add membership-lookup RLS helpers and platform policies"
```

---

### Task 5: Clients table, policies, and the audit trigger

**Files:**
- Create: `supabase/migrations/20260811000004_clients.sql`
- Modify: `types/database.ts` (regenerate)

**Interfaces:**
- Consumes: Tasks 3 and 4.
- Produces: table `public.clients`; trigger function `public.record_audit_event()`.

- [ ] **Step 1: Write the migration**

```sql
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  industry text,
  website text,
  contact_name text,
  contact_email text,
  contact_phone text,
  owner_id uuid references auth.users(id) on delete set null,
  service text,
  billing_email text,
  notes text,
  status text not null default 'Onboarding'
    check (status in ('Onboarding','Active','Archived')),
  health text not null default 'New'
    check (health in ('New','Healthy','Watch','Stable','At Risk')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_org_active on public.clients (organization_id, archived_at);
create index clients_name_trgm on public.clients using gin (name extensions.gin_trgm_ops);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;

create policy clients_select on public.clients
  for select to authenticated using (public.is_member_of(organization_id));

create policy clients_insert on public.clients
  for insert to authenticated with check (public.is_member_of(organization_id));

create policy clients_update on public.clients
  for update to authenticated
  using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));

revoke all on public.clients from anon;

-- Audit as a trigger, not a convention: an action cannot forget to record.
create or replace function public.record_audit_event() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, old_value, new_value
  ) values (
    coalesce(new.organization_id, old.organization_id),
    auth.uid(),
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger clients_audit
  after insert or update or delete on public.clients
  for each row execute function public.record_audit_event();
```

Note `extensions.gin_trgm_ops` — `pg_trgm` lives in the `extensions` schema on Supabase. If the index creation fails, confirm the extension's schema with `select extnamespace::regnamespace from pg_extension where extname = 'pg_trgm';` and qualify accordingly.

- [ ] **Step 2: Apply it**

MCP `apply_migration`, name `clients`.

- [ ] **Step 3: Regenerate types**

MCP `generate_typescript_types`, overwrite `types/database.ts`, keeping the do-not-edit header.

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit` — exit 0.
MCP `list_tables` — `public.clients` present, `rls_enabled: true`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations types/database.ts
git commit -m "feat(db): add clients table with RLS and audit trigger"
```

---

### Task 6: Invitation acceptance RPC

**Files:**
- Create: `supabase/migrations/20260811000005_accept_invitation.sql`

**Interfaces:**
- Consumes: Tasks 3–4.
- Produces: `public.accept_invitation(raw_token text) returns uuid` — returns the organization id on success, raises on failure.

- [ ] **Step 1: Write the migration**

An invitee is not yet a member, so no policy can expose their row. This is the narrow, audited exception.

```sql
create or replace function public.accept_invitation(raw_token text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  invitation public.invitations;
  caller_email text;
  caller_verified boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select email, (email_confirmed_at is not null)
    into caller_email, caller_verified
  from auth.users where id = auth.uid();

  if not caller_verified then
    raise exception 'email not verified' using errcode = '28000';
  end if;

  select * into invitation from public.invitations
  where token_hash = extensions.digest(raw_token, 'sha256')::text
  for update;

  if invitation.id is null then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'invitation is no longer pending' using errcode = 'P0001';
  end if;
  if invitation.expires_at < now() then
    update public.invitations set status = 'expired' where id = invitation.id;
    raise exception 'invitation has expired' using errcode = 'P0001';
  end if;
  if lower(invitation.email) <> lower(caller_email) then
    raise exception 'invitation was issued to a different address' using errcode = '28000';
  end if;

  insert into public.memberships (organization_id, user_id, role_id, status)
  values (invitation.organization_id, auth.uid(), invitation.role_id, 'active')
  on conflict (organization_id, user_id)
  do update set status = 'active', role_id = excluded.role_id;

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = invitation.id;

  insert into public.audit_events (organization_id, actor_id, resource, resource_id, action, new_value)
  values (invitation.organization_id, auth.uid(), 'memberships', invitation.id, 'insert',
          jsonb_build_object('via', 'invitation', 'role_id', invitation.role_id));

  return invitation.organization_id;
end $$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
```

The token hash uses `extensions.digest(...)` from pgcrypto. The TypeScript side must hash identically — see Task 12, which uses Node's `createHash('sha256').update(raw).digest('hex')`. **These must match.** `extensions.digest(x,'sha256')::text` renders as `\x<hex>` in Postgres, so the TypeScript side stores `'\\x' + hex`. Verify this equality explicitly in Step 3 rather than assuming it.

- [ ] **Step 2: Apply it**

MCP `apply_migration`, name `accept_invitation`.

- [ ] **Step 3: Verify the hash encodings agree**

MCP `execute_sql`:

```sql
select extensions.digest('known-test-token', 'sha256')::text as pg_hash;
```

Then locally:

```bash
node -e "console.log('\\\\x' + require('crypto').createHash('sha256').update('known-test-token').digest('hex'))"
```

Expected: identical strings. If they differ, adjust the TypeScript hashing in Task 12 to match Postgres — do not change the SQL.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): add accept_invitation RPC"
```

---

### Task 7: Supabase client factories and the service-role boundary test

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`
- Test: `tests/unit/service-role-boundary.test.ts`

**Interfaces:**
- Consumes: `readSupabaseEnv` from Task 1, `Database` from Task 3.
- Produces: `createServerSupabase(): Promise<SupabaseClient<Database>>`, `createBrowserSupabase(): SupabaseClient<Database>`, `createAdminSupabase(): SupabaseClient<Database>`.

- [ ] **Step 1: Write the failing boundary test**

```ts
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : []
  })
}

test('no feature code imports the service-role client', () => {
  const offenders = walk(join(process.cwd(), 'features'))
    .filter((file) => /from ['"](@\/lib\/supabase\/admin|.*\/lib\/supabase\/admin)['"]/.test(readFileSync(file, 'utf8')))
  assert.deepEqual(offenders, [], `service-role client imported by: ${offenders.join(', ')}`)
})

test('the admin client is marked server-only', () => {
  const source = readFileSync(join(process.cwd(), 'lib', 'supabase', 'admin.ts'), 'utf8')
  assert.match(source, /import 'server-only'/)
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec node --test --experimental-strip-types tests/unit/service-role-boundary.test.ts`
Expected: FAIL on the second test — `lib/supabase/admin.ts` does not exist.

- [ ] **Step 3: Install `server-only` and write the three factories**

```bash
pnpm add server-only
```

`lib/supabase/server.ts`:

```ts
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { readSupabaseEnv } from '@/lib/env'
import type { Database } from '@/types/database'

export async function createServerSupabase() {
  const env = readSupabaseEnv(process.env)
  const cookieStore = await cookies()

  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Called from a Server Component; middleware refreshes the session instead.
        }
      },
    },
  })
}
```

`lib/supabase/client.ts`:

```ts
'use client'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
```

`lib/supabase/admin.ts`:

```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { readSupabaseEnv } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Service-role client. Bypasses RLS entirely.
 * Bootstrap, invitation dispatch, and admin scripts ONLY.
 * Never import this from anything under features/ — a test enforces that.
 */
export function createAdminSupabase() {
  const env = readSupabaseEnv(process.env)
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm exec node --test --experimental-strip-types tests/unit/service-role-boundary.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm exec tsc --noEmit
git add -A
git commit -m "feat(auth): add Supabase client factories with a tested service-role boundary"
```

---

### Task 8: Per-request session context

**Files:**
- Create: `lib/auth/errors.ts`, `lib/auth/session-context.ts`, `lib/auth/get-session-context.ts`
- Test: `tests/unit/session-context.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase` (Task 7); `resolveOrganization`, `requireMembership`, `TenantAccessDeniedError` from `lib/tenancy`.
- Produces, from `lib/auth/session-context.ts` (pure, no `server-only`): `resolveSessionContext(input)` and `ACTIVE_ORG_COOKIE = 'unison_org'`.
- Produces, from `lib/auth/get-session-context.ts` (`server-only`): `getSessionContext()` returning `{ user, organizations, organization, membership, role }`.

**Split rationale:** the Step 1 unit test imports the pure resolver under `node --test`, where `server-only` throws. Keeping the request-bound wrapper in its own file is what makes the core testable.

- [ ] **Step 1: Write the failing test for the pure resolver**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSessionContext } from '../../lib/auth/session-context.ts'
import type { Organization, OrganizationMembership } from '../../types/tenancy.ts'

const himark: Organization = { id: 'org-1', name: 'HIMARK', slug: 'himark', status: 'active', createdAt: '' }
const acme: Organization = { id: 'org-2', name: 'Acme', slug: 'acme', status: 'active', createdAt: '' }
const membership: OrganizationMembership = {
  id: 'm-1', organizationId: 'org-1', userId: 'user-1', roleId: 'owner', status: 'active', createdAt: '',
}

test('uses the cookie organization when the user is a member', () => {
  const context = resolveSessionContext({
    userId: 'user-1', organizations: [himark, acme], memberships: [membership], cookieOrganizationId: 'org-1',
  })
  assert.equal(context.organization.slug, 'himark')
  assert.equal(context.role, 'owner')
})

test('falls back to the first active membership when the cookie names a foreign org', () => {
  const context = resolveSessionContext({
    userId: 'user-1', organizations: [himark, acme], memberships: [membership], cookieOrganizationId: 'org-2',
  })
  assert.equal(context.organization.id, 'org-1')
})

test('falls back when the cookie is absent', () => {
  const context = resolveSessionContext({
    userId: 'user-1', organizations: [himark], memberships: [membership], cookieOrganizationId: undefined,
  })
  assert.equal(context.organization.id, 'org-1')
})

test('throws when the user has no active membership', () => {
  assert.throws(() => resolveSessionContext({
    userId: 'user-1', organizations: [himark], memberships: [], cookieOrganizationId: undefined,
  }), /no active membership/i)
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec node --test --experimental-strip-types tests/unit/session-context.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/auth/errors.ts`**

```ts
export class NotAuthenticatedError extends Error {
  constructor() {
    super('No authenticated user for this request.')
    this.name = 'NotAuthenticatedError'
  }
}

export class NoMembershipError extends Error {
  constructor() {
    super('This user has no active membership in any organization.')
    this.name = 'NoMembershipError'
  }
}
```

- [ ] **Step 4: Implement `lib/auth/session-context.ts`**

```ts
import { requireMembership, resolveOrganization } from '@/lib/tenancy'
import type { Organization, OrganizationMembership } from '@/types/tenancy'
import { NoMembershipError } from './errors'

export const ACTIVE_ORG_COOKIE = 'unison_org'

export function resolveSessionContext(input: {
  userId: string
  organizations: readonly Organization[]
  memberships: readonly OrganizationMembership[]
  cookieOrganizationId: string | undefined
}) {
  const active = input.memberships.filter((m) => m.status === 'active')
  if (active.length === 0) throw new NoMembershipError()

  const candidate = input.cookieOrganizationId ?? active[0].organizationId

  // A cookie naming a foreign organization falls back — it never fails open.
  let organization: Organization
  let membership: OrganizationMembership
  try {
    organization = resolveOrganization(input.organizations, candidate)
    membership = requireMembership(active, input.userId, organization.id)
  } catch {
    organization = resolveOrganization(input.organizations, active[0].organizationId)
    membership = requireMembership(active, input.userId, organization.id)
  }

  return { organization, membership, role: membership.roleId }
}
```

Note the pure core takes plain data, so the existing `lib/tenancy` guards are exercised without any request plumbing.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `pnpm exec node --test --experimental-strip-types tests/unit/session-context.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Add the request-bound wrapper in a SEPARATE file**

Create `lib/auth/get-session-context.ts`. It must be a different file from `session-context.ts`, because `session-context.ts` is imported directly by the Node test in Step 1 and `server-only` throws outside a bundler. The pure resolver stays testable; the request-bound wrapper stays server-only.

```ts
import 'server-only'
import { cookies } from 'next/headers'
import { resolveSessionContext, ACTIVE_ORG_COOKIE } from './session-context'
import type { Organization, OrganizationMembership } from '@/types/tenancy'
import { createServerSupabase } from '@/lib/supabase/server'
import { NotAuthenticatedError } from './errors'

export async function getSessionContext() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new NotAuthenticatedError()

  const { data: rows, error } = await supabase
    .from('memberships')
    .select('id, organization_id, user_id, role_id, status, created_at, organizations(id, name, slug, status, created_at)')
    .eq('user_id', user.id)
    .eq('status', 'active')
  if (error) throw error

  const memberships: OrganizationMembership[] = (rows ?? []).map((row) => ({
    id: row.id, organizationId: row.organization_id, userId: row.user_id,
    roleId: row.role_id, status: row.status as OrganizationMembership['status'], createdAt: row.created_at,
  }))
  const organizations: Organization[] = (rows ?? []).flatMap((row) => row.organizations ? [{
    id: row.organizations.id, name: row.organizations.name, slug: row.organizations.slug,
    status: row.organizations.status as Organization['status'], createdAt: row.organizations.created_at,
  }] : [])

  const cookieStore = await cookies()
  const context = resolveSessionContext({
    userId: user.id, organizations, memberships,
    cookieOrganizationId: cookieStore.get(ACTIVE_ORG_COOKIE)?.value,
  })

  return { user, organizations, ...context }
}
```

`import 'server-only'` at the top of a file that also exports the pure function is fine for the app, but the Node test imports the same file. If `server-only` throws under the test runner, move `getSessionContext` into `lib/auth/get-session-context.ts` and keep `session-context.ts` pure. Check this when running Step 7 and split if needed.

- [ ] **Step 7: Verify both consumers still work**

Run: `pnpm test` — all specs pass, including the 4 new ones.
Run: `pnpm exec tsc --noEmit` — exit 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(auth): resolve per-request session context through the tenancy guards"
```

---

### Task 9: Middleware and the sign-in flow

**Files:**
- Create: `middleware.ts`, `features/auth-ui/actions/sign-in.ts`, `features/auth-ui/actions/sign-out.ts`
- Modify: `app/(auth)/sign-in/page.tsx`

**Interfaces:**
- Consumes: Task 7 factories.
- Produces: `signInAction(formData: FormData)`, `signOutAction()`.

- [ ] **Step 1: Write `middleware.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/sign-in', '/forgot-password']
// Reachable while signed in: an existing user joining a second organization,
// and links that arrive in an already-authenticated session.
const AUTH_EXEMPT = ['/accept-invitation', '/verify-email', '/reset-password']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  if (AUTH_EXEMPT.some((p) => path.startsWith(p))) return response

  if (!user && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  if (user && PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/overview'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|brand|avatars|placeholder).*)'],
}
```

The no-membership redirect to `/join-organization` is deliberately **not** here — middleware cannot query memberships cheaply without a second round trip on every request. It belongs in `app/(unison)/layout.tsx`, added in Task 13, where `getSessionContext()` already runs.

- [ ] **Step 2: Write the sign-in action**

`features/auth-ui/actions/sign-in.ts`:

```ts
'use server'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'

export async function signInAction(_prev: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/overview')

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: 'That email and password combination was not recognised.' }

  redirect(next)
}
```

The error message is deliberately identical for unknown-email and wrong-password: distinguishing them tells an attacker which accounts exist.

- [ ] **Step 3: Write the sign-out action**

`features/auth-ui/actions/sign-out.ts`:

```ts
'use server'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'

export async function signOutAction() {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  redirect('/sign-in')
}
```

- [ ] **Step 4: Wire the sign-in screen**

Read `app/(auth)/sign-in/page.tsx` and `features/auth-ui/auth-screen.tsx` first. Convert the form to post to `signInAction` via `useActionState`, keeping the existing visual design untouched — this task changes behaviour, not appearance. Add a hidden `next` input populated from `searchParams.next`.

- [ ] **Step 5: Verify**

Run: `pnpm exec tsc --noEmit` — exit 0.
Run: `pnpm build` — success.

Full browser verification waits for Task 10, when a user actually exists.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): add session middleware and the sign-in flow"
```

---

### Task 10: HIMARK bootstrap and first owner

**Files:**
- Create: `supabase/migrations/20260811000006_seed_himark.sql`, `scripts/grant-owner.ts`
- Modify: `package.json` (add the script entry)

**Interfaces:**
- Consumes: Tasks 3 and 7.
- Produces: the HIMARK organization row; `pnpm grant-owner <email>`.

- [ ] **Step 1: Write the seed migration**

```sql
-- Migrates config/tenants.ts himarkTenant into the database, preserving its
-- stable id and slug exactly as docs/tenancy.md requires.
insert into public.organizations (id, name, slug, status, created_at)
values ('00000000-0000-4000-8000-000000000001', 'HIMARK', 'himark', 'active', '2026-08-10T00:00:00.000Z')
on conflict (id) do nothing;
```

No owner membership is seeded — no user exists to reference yet.

- [ ] **Step 2: Apply it and verify**

MCP `apply_migration`, name `seed_himark`. Then:

```sql
select id, name, slug, status from public.organizations;
```

Expected: exactly one row, id `00000000-0000-4000-8000-000000000001`, slug `himark`.

- [ ] **Step 3: Write the grant-owner script**

`scripts/grant-owner.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { readSupabaseEnv } from '../lib/env.ts'

const HIMARK_ID = '00000000-0000-4000-8000-000000000001'

const email = process.argv[2]
if (!email) {
  console.error('Usage: pnpm grant-owner <email>')
  process.exit(1)
}

const env = readSupabaseEnv(process.env)
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await supabase.auth.admin.listUsers()
if (error) throw error

const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())
if (!user) {
  console.error(`No account found for ${email}. Create it first, then re-run.`)
  process.exit(1)
}

const { error: insertError } = await supabase.from('memberships').upsert(
  { organization_id: HIMARK_ID, user_id: user.id, role_id: 'owner', status: 'active' },
  { onConflict: 'organization_id,user_id' },
)
if (insertError) throw insertError

console.log(`Granted owner of HIMARK to ${email}.`)
```

Add to `package.json`:

```json
"grant-owner": "node --env-file=.env.local --experimental-strip-types scripts/grant-owner.ts"
```

- [ ] **Step 4: Create the first account and grant it**

Ask Neo for the email address for the first owner. Neo creates the account — either through the running sign-in screen's password-reset path or in the Supabase dashboard — and confirms the address is verified. Then:

```bash
pnpm grant-owner <that-email>
```

- [ ] **Step 5: Verify end to end in the browser**

Start the dev server with `preview_start` using `.claude/launch.json` (create it if absent: `runtimeExecutable` `pnpm`, `runtimeArgs` `["dev"]`, `port` 3000). Sign in with the new account. Expect to land on `/overview` rather than being bounced to `/sign-in`. Check `read_console_messages` for errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): seed HIMARK and add the grant-owner script"
```

---

### Task 11: Email layer

**Files:**
- Create: `lib/email/transport.ts`, `lib/email/send-email.ts`, `lib/email/templates/invitation.ts`
- Test: `tests/unit/email-templates.test.ts`

**Interfaces:**
- Consumes: `readSmtpEnv` (Task 1).
- Produces: `sendEmail(input: { to: string; template: EmailTemplate })`, and `invitationTemplate(data: { organizationName: string; acceptUrl: string; invitedBy: string })` returning `{ subject: string; html: string; text: string }`.

- [ ] **Step 1: Write the failing template test**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { invitationTemplate } from '../../lib/email/templates/invitation.ts'

test('invitation template carries the accept link and organization', () => {
  const mail = invitationTemplate({
    organizationName: 'HIMARK',
    acceptUrl: 'https://unison.example/accept-invitation?token=abc',
    invitedBy: 'Neo Morake',
  })
  assert.match(mail.subject, /HIMARK/)
  assert.match(mail.html, /https:\/\/unison\.example\/accept-invitation\?token=abc/)
  assert.match(mail.text, /https:\/\/unison\.example\/accept-invitation\?token=abc/)
  assert.match(mail.text, /Neo Morake/)
})

test('invitation template escapes organization names', () => {
  const mail = invitationTemplate({
    organizationName: '<script>alert(1)</script>',
    acceptUrl: 'https://unison.example/a',
    invitedBy: 'Neo',
  })
  assert.ok(!mail.html.includes('<script>'))
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec node --test --experimental-strip-types tests/unit/email-templates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the template**

`lib/email/templates/invitation.ts`:

```ts
export type EmailTemplate = { subject: string; html: string; text: string }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!
  ))
}

export function invitationTemplate(data: {
  organizationName: string
  acceptUrl: string
  invitedBy: string
}): EmailTemplate {
  const org = escapeHtml(data.organizationName)
  const by = escapeHtml(data.invitedBy)
  const url = escapeHtml(data.acceptUrl)

  return {
    subject: `You have been invited to ${data.organizationName} on UNISON`,
    text: [
      `${data.invitedBy} has invited you to join ${data.organizationName} on UNISON.`,
      '',
      'Accept the invitation:',
      data.acceptUrl,
      '',
      'This link expires in 7 days. If you were not expecting it, you can ignore this email.',
    ].join('\n'),
    html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#16202e;line-height:1.6">
<p style="font-size:20px;font-weight:600;letter-spacing:.12em;margin:0 0 24px">UNISON</p>
<p>${by} has invited you to join <strong>${org}</strong> on UNISON.</p>
<p style="margin:32px 0"><a href="${url}" style="background:#16202e;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Accept invitation</a></p>
<p style="color:#6b7280;font-size:14px">This link expires in 7 days. If you were not expecting it, you can ignore this email.</p>
</body></html>`,
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm exec node --test --experimental-strip-types tests/unit/email-templates.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Implement the transport and sender**

`lib/email/transport.ts`:

```ts
import 'server-only'
import nodemailer from 'nodemailer'
import { readSmtpEnv } from '@/lib/env'

let cached: nodemailer.Transporter | undefined

export function getTransport() {
  if (cached) return cached

  // Read SMTP config here, not at import time: a mail misconfiguration
  // must never break authentication or database access.
  const env = readSmtpEnv(process.env)

  // Tests and local work without a mailbox: log instead of sending.
  if (process.env.EMAIL_TRANSPORT === 'log') {
    cached = nodemailer.createTransport({ jsonTransport: true })
    return cached
  }

  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  })
  return cached
}
```

`lib/email/send-email.ts`:

```ts
import 'server-only'
import { readSmtpEnv } from '@/lib/env'
import { getTransport } from './transport'
import type { EmailTemplate } from './templates/invitation'

export async function sendEmail(input: { to: string; template: EmailTemplate }) {
  const env = readSmtpEnv(process.env)
  const info = await getTransport().sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.template.subject,
    text: input.template.text,
    html: input.template.html,
  })
  if (process.env.EMAIL_TRANSPORT === 'log') console.log('[email:log]', info.message)
  return info
}
```

- [ ] **Step 6: Configure Supabase Auth SMTP**

This is a dashboard action for Neo, not a tool call — it requires the SMTP password. Ask Neo to set custom SMTP in the `unison-uat` project's Auth settings using the same GoDaddy mailbox, and to rebrand the Confirm Signup, Reset Password, and Magic Link templates to match the invitation styling above.

Confirm the correct GoDaddy endpoint against the live account before Neo configures it — their own relay and a Microsoft 365-backed mailbox use different hosts and ports.

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm exec tsc --noEmit
git add -A
git commit -m "feat(email): add the provider-agnostic mail layer and invitation template"
```

---

### Task 12: Invitation send and accept

**Files:**
- Create: `features/invitations/actions/send-invitation.ts`, `features/invitations/actions/accept-invitation.ts`, `features/invitations/schemas/invitation.ts`
- Modify: `app/(auth)/accept-invitation/page.tsx`

**Interfaces:**
- Consumes: Tasks 6, 7, 8, 11.
- Produces: `sendInvitationAction(formData: FormData)`, `acceptInvitationAction(token: string)`.

- [ ] **Step 1: Write the schema**

`features/invitations/schemas/invitation.ts`:

```ts
import { z } from 'zod'

export const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  roleId: z.enum(['owner', 'admin', 'member']),
})

export type InviteInput = z.infer<typeof inviteSchema>
```

- [ ] **Step 2: Write the send action**

`features/invitations/actions/send-invitation.ts`:

```ts
'use server'
import { createHash, randomBytes } from 'node:crypto'
import { readAppUrl } from '@/lib/env'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send-email'
import { invitationTemplate } from '@/lib/email/templates/invitation'
import { inviteSchema } from '../schemas/invitation'

const EXPIRY_DAYS = 7

export async function sendInvitationAction(_prev: { error?: string; sent?: boolean } | undefined, formData: FormData) {
  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    roleId: formData.get('roleId'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization, role, user } = await getSessionContext()
  if (role !== 'owner' && role !== 'admin') return { error: 'You do not have permission to invite people.' }

  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = '\\x' + createHash('sha256').update(rawToken).digest('hex')

  const supabase = await createServerSupabase()
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86_400_000).toISOString()

  const { error } = await supabase.from('invitations').insert({
    organization_id: organization.id,
    email: parsed.data.email,
    role_id: parsed.data.roleId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    invited_by: user.id,
  })
  if (error) {
    return error.code === '23505'
      ? { error: 'An invitation is already pending for that address.' }
      : { error: 'The invitation could not be created.' }
  }

  const appUrl = readAppUrl(process.env)
  await sendEmail({
    to: parsed.data.email,
    template: invitationTemplate({
      organizationName: organization.name,
      acceptUrl: `${appUrl}/accept-invitation?token=${rawToken}`,
      invitedBy: user.email ?? 'A colleague',
    }),
  })

  return { sent: true }
}
```

The raw token exists only in the email. The row holds the hash. This must match the encoding verified in Task 6 Step 3.

- [ ] **Step 3: Write the accept action**

`features/invitations/actions/accept-invitation.ts`:

```ts
'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ACTIVE_ORG_COOKIE } from '@/lib/auth/session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function acceptInvitationAction(_prev: { error?: string } | undefined, formData: FormData) {
  const token = String(formData.get('token') ?? '')
  if (!token) return { error: 'This invitation link is incomplete.' }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('accept_invitation', { raw_token: token })
  if (error) return { error: error.message }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORG_COOKIE, data as string, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production',
  })

  redirect('/overview')
}
```

- [ ] **Step 4: Wire the accept screen**

Read `app/(auth)/accept-invitation/page.tsx`. Pass `searchParams.token` into a hidden input on a form posting to `acceptInvitationAction`. If there is no session, the middleware exemption lets the page render — show the existing sign-in prompt so the invitee authenticates first, then returns to the same URL.

- [ ] **Step 5: Verify the round trip**

With `EMAIL_TRANSPORT=log` set, invite a second address from a signed-in owner session, copy the logged accept URL, open it in a second browser profile after signing up that address, and confirm a membership row appears:

```sql
select organization_id, user_id, role_id, status from public.memberships;
```

Then remove `EMAIL_TRANSPORT=log` and send one real invitation through GoDaddy to confirm delivery.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(invitations): send and accept invitations with hashed tokens"
```

---

### Task 13: Real organization context in the shell

**Files:**
- Modify: `app/(unison)/layout.tsx`, `components/layout/app-shell.tsx`, `components/navigation/sidebar.tsx`, `components/shared/tenant-switcher.tsx`
- Create: `features/organizations/actions/switch-organization.ts`

**Interfaces:**
- Consumes: `getSessionContext` (Task 8).
- Produces: `switchOrganizationAction(formData: FormData)`. `AppShell` gains props `{ user, organization, organizations }`.

- [ ] **Step 1: Write the switch action**

```ts
'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { ACTIVE_ORG_COOKIE } from '@/lib/auth/session-context'

export async function switchOrganizationAction(formData: FormData) {
  const target = String(formData.get('organizationId') ?? '')
  const { organizations } = await getSessionContext()

  // Re-validate membership server-side: the form value is a routing hint, not authorization.
  if (!organizations.some((organization) => organization.id === target)) return

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORG_COOKIE, target, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production',
  })
  revalidatePath('/', 'layout')
}
```

- [ ] **Step 2: Make the layout resolve context and handle the no-membership case**

`app/(unison)/layout.tsx`:

```tsx
import type React from 'react'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { NoMembershipError } from '@/lib/auth/errors'

export default async function UnisonLayout({ children }: { children: React.ReactNode }) {
  try {
    const { user, organization, organizations } = await getSessionContext()
    return (
      <AppShell user={user} organization={organization} organizations={organizations}>
        {children}
      </AppShell>
    )
  } catch (error) {
    if (error instanceof NoMembershipError) redirect('/join-organization')
    throw error
  }
}
```

`app/page.tsx` renders `AppShell` directly and must get the same treatment — either redirect it to `/overview` or give it the identical context resolution. Redirecting is simpler and matches the sidebar, which already treats `/overview` as canonical.

- [ ] **Step 3: Thread props through `AppShell` to the sidebar**

`AppShell` currently hardcodes nothing but renders `<Sidebar />`. Add the props and pass `user` and organization data down. In `components/navigation/sidebar.tsx`, replace the hardcoded `Neo Morake` / `CEO` / `/avatars/neo-morake.png` block with the real user's email, role from context, and a fallback avatar when `user_metadata.avatar_url` is absent. Replace the `Sign out demo` link with a form posting to `signOutAction`.

- [ ] **Step 4: Replace the tenant switcher's hardcoded list**

In `components/shared/tenant-switcher.tsx`, delete the local `organizations` array. Accept `{ organizations, active }` as props and render each option as a form button posting to `switchOrganizationAction`. Keep the existing markup and classes exactly — this is a data change, not a redesign.

- [ ] **Step 5: Verify in the browser**

Sign in, confirm the sidebar shows the real account and the switcher shows HIMARK only (one membership). Screenshot it. Check `read_console_messages` is clean.

- [ ] **Step 6: Typecheck, build, commit**

```bash
pnpm exec tsc --noEmit && pnpm build
git add -A
git commit -m "feat(tenancy): drive the shell from real session context"
```

---

### Task 14: The module-workspace data seam

**Files:**
- Modify: `features/product-ui/components/module-workspace.tsx`
- Modify: every route rendering `ModuleWorkspace` (16 `page.tsx` files under `app/(unison)/`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ModuleWorkspace` accepts `{ module: ModuleDefinition; records: MockRecord[]; connected?: boolean }`.

- [ ] **Step 1: Invert the data dependency**

In `module-workspace.tsx`, delete `const records = moduleFixtures[module.id] ?? []` and the `moduleFixtures` import. Add `records` and `connected` to the props type. Guard the demo-state selector so it only renders when `connected` is falsy — a connected module gets real loading and error states from Suspense and error boundaries, not a dropdown.

- [ ] **Step 2: Update the 16 routes to pass fixtures explicitly**

Each currently reads like `<ModuleWorkspace module={moduleById.clients} />`. Change to:

```tsx
import { moduleFixtures } from '@/features/product-ui/mocks/modules'

<ModuleWorkspace module={moduleById.clients} records={moduleFixtures.clients ?? []} />
```

Fifteen of them keep mocks. Clients is replaced wholesale in Task 15.

- [ ] **Step 3: Verify nothing changed visually**

Run: `pnpm exec tsc --noEmit && pnpm build`.
In the browser, open three module workspaces and confirm they render exactly as before. Screenshot one.

- [ ] **Step 4: Confirm the route matrix test still passes**

Run: `pnpm test` — `ui-completeness.test.ts` asserts each route references `moduleById.<id>`, which these edits preserve.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(product-ui): pass records into ModuleWorkspace instead of reading fixtures"
```

---

### Task 15: Clients end to end

**Files:**
- Create: `features/clients/schemas/client.ts`, `features/clients/queries/list-clients.ts`, `features/clients/queries/get-client.ts`, `features/clients/actions/create-client.ts`, `features/clients/actions/update-client.ts`, `features/clients/actions/archive-client.ts`
- Modify: `app/(unison)/operations/clients/page.tsx`, `new/page.tsx`, `[clientId]/page.tsx`, `[clientId]/edit/page.tsx`

**Interfaces:**
- Consumes: Tasks 5, 7, 8, 14.
- Produces: `listClients(params)`, `getClient(id)`, `createClientAction`, `updateClientAction`, `archiveClientAction`.

- [ ] **Step 1: Write the schema**

`features/clients/schemas/client.ts`:

```ts
import { z } from 'zod'

const optionalText = z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null)

export const clientInputSchema = z.object({
  name: z.string().trim().min(1, 'Company name is required.').max(200),
  industry: optionalText,
  website: optionalText,
  contactName: optionalText,
  contactEmail: z.string().email('Enter a valid email address.').optional().or(z.literal('')).transform((v) => v || null),
  contactPhone: optionalText,
  service: optionalText,
  billingEmail: z.string().email('Enter a valid billing email.').optional().or(z.literal('')).transform((v) => v || null),
  notes: optionalText,
  status: z.enum(['Onboarding', 'Active', 'Archived']).default('Onboarding'),
  health: z.enum(['New', 'Healthy', 'Watch', 'Stable', 'At Risk']).default('New'),
})

export type ClientInput = z.infer<typeof clientInputSchema>
```

The enums must match the check constraints in Task 5 exactly.

- [ ] **Step 2: Write the list query with server-side search, filter, sort, and paging**

`features/clients/queries/list-clients.ts`:

```ts
import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { MockRecord } from '@/features/product-ui/types'

const PAGE_SIZE = 25

export async function listClients(params: { q?: string; status?: string; sort?: string; page?: number }) {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()
  const page = Math.max(1, params.page ?? 1)

  let query = supabase
    .from('clients')
    .select('id, name, status, health, contact_name, service, updated_at, archived_at', { count: 'exact' })
    .eq('organization_id', organization.id)
    .is('archived_at', null)

  if (params.q) query = query.ilike('name', `%${params.q}%`)
  if (params.status) query = query.eq('status', params.status)

  const column = params.sort === 'name' ? 'name' : params.sort === 'status' ? 'status' : 'updated_at'
  query = query.order(column, { ascending: column === 'name' })
                .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const { data, error, count } = await query
  if (error) throw error

  const records: MockRecord[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    owner: '—',
    updated: new Date(row.updated_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }),
    contact: row.contact_name ?? '—',
    service: row.service ?? '—',
    health: row.health,
    projects: '—', // No projects table yet; not fabricated as 0.
  }))

  return { records, total: count ?? 0, page, pageSize: PAGE_SIZE }
}
```

The `.eq('organization_id', ...)` is belt-and-braces: RLS already forbids other organizations. Keeping it makes the query's intent explicit and keeps the index in play.

- [ ] **Step 3: Write `getClient`**

```ts
import 'server-only'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function getClient(id: string) {
  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('clients').select('*')
    .eq('organization_id', organization.id).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}
```

- [ ] **Step 4: Write the three actions**

Each follows the same four steps — validate, authorize, mutate, revalidate. `create-client.ts`:

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { clientInputSchema } from '../schemas/client'

export async function createClientAction(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = clientInputSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { organization } = await getSessionContext()
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.from('clients').insert({
    organization_id: organization.id,
    name: parsed.data.name,
    industry: parsed.data.industry,
    website: parsed.data.website,
    contact_name: parsed.data.contactName,
    contact_email: parsed.data.contactEmail,
    contact_phone: parsed.data.contactPhone,
    service: parsed.data.service,
    billing_email: parsed.data.billingEmail,
    notes: parsed.data.notes,
    status: parsed.data.status,
    health: parsed.data.health,
  }).select('id').single()

  if (error) return { error: 'The client could not be created.' }

  revalidatePath('/operations/clients')
  redirect(`/operations/clients/${data.id}`)
}
```

`update-client.ts` is the same shape with `.update(...).eq('id', id)` and no redirect to a new id. `archive-client.ts` sets `archived_at: new Date().toISOString()` and `status: 'Archived'`, then revalidates the list. Write all three in full — do not abbreviate the second and third.

- [ ] **Step 5: Wire the four routes**

`app/(unison)/operations/clients/page.tsx` becomes a Server Component reading `searchParams` and calling `listClients`, then rendering `<ModuleWorkspace module={moduleById.clients} records={records} connected />`. The other three read `getClient` and post to the actions. Keep the existing forms and layout; only the data source and submit handlers change.

- [ ] **Step 6: Verify in the browser and screenshot**

Sign in, open `/operations/clients`, create a client, edit it, archive it, and confirm it leaves the list. Confirm rows in Supabase:

```sql
select id, name, status, health, archived_at from public.clients;
select resource, action, actor_id from public.audit_events order by created_at desc limit 5;
```

Expected: the client rows, and three audit events — insert, update, update — recorded by the trigger with a real `actor_id`.

- [ ] **Step 7: Typecheck, build, commit**

```bash
pnpm exec tsc --noEmit && pnpm build && pnpm test
git add -A
git commit -m "feat(clients): persist the Clients module end to end"
```

---

### Task 16: RLS integration specs

**Files:**
- Create: `tests/integration/rls/helpers.ts`, `tests/integration/rls/cross-tenant.test.ts`, `tests/integration/rls/revocation.test.ts`

**Interfaces:**
- Consumes: everything.
- Produces: `pnpm test:rls` proving the wall holds against the live database.

- [ ] **Step 1: Write the fixture helper**

`tests/integration/rls/helpers.ts` — note relative imports and `.ts` extensions; the `@/` alias does not work here.

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
const secret = process.env.SUPABASE_SECRET_KEY!

export const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })

export async function createFixtureOrg(label: string) {
  const { data, error } = await admin.from('organizations')
    .insert({ name: `RLS ${label} ${randomUUID().slice(0, 8)}`, slug: `rls-${randomUUID().slice(0, 8)}` })
    .select('id').single()
  if (error) throw error
  return data.id as string
}

export async function createFixtureUser(organizationId: string | null) {
  const email = `rls-${randomUUID()}@unison.test`
  const password = randomUUID()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  if (organizationId) {
    const { error: membershipError } = await admin.from('memberships')
      .insert({ organization_id: organizationId, user_id: data.user.id, role_id: 'member', status: 'active' })
    if (membershipError) throw membershipError
  }
  return { id: data.user.id, email, password }
}

export async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, publishable, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

export async function cleanup(organizationIds: string[], userIds: string[]) {
  for (const id of organizationIds) await admin.from('organizations').delete().eq('id', id)
  for (const id of userIds) await admin.auth.admin.deleteUser(id)
}
```

Fixtures create and destroy their own organizations, so the suite never assumes an empty table on shared UAT.

- [ ] **Step 2: Write the cross-tenant spec**

`tests/integration/rls/cross-tenant.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let orgA: string, orgB: string
let userA: Awaited<ReturnType<typeof createFixtureUser>>
let clientA: Awaited<ReturnType<typeof signedInClient>>

before(async () => {
  orgA = await createFixtureOrg('A')
  orgB = await createFixtureOrg('B')
  userA = await createFixtureUser(orgA)
  await admin.from('clients').insert([
    { organization_id: orgA, name: 'Visible To A' },
    { organization_id: orgB, name: 'Belongs To B' },
  ])
  clientA = await signedInClient(userA.email, userA.password)
})

after(async () => { await cleanup([orgA, orgB], [userA.id]) })

test('a member sees only their own organization rows', async () => {
  const { data, error } = await clientA.from('clients').select('name')
  assert.equal(error, null)
  assert.deepEqual(data?.map((row) => row.name), ['Visible To A'])
})

test('a direct read of another org id returns nothing rather than erroring', async () => {
  const { data } = await clientA.from('clients').select('name').eq('organization_id', orgB)
  assert.deepEqual(data, [])
})

test('inserting into another organization is rejected', async () => {
  const { error } = await clientA.from('clients').insert({ organization_id: orgB, name: 'Smuggled' })
  assert.ok(error, 'expected the insert to violate the RLS check')
  assert.match(error!.message, /row-level security/i)
})

test('deleting is refused outright', async () => {
  const { error } = await clientA.from('clients').delete().eq('organization_id', orgA)
  assert.ok(error, 'expected no delete policy to exist')
})
```

- [ ] **Step 3: Write the revocation spec**

`tests/integration/rls/revocation.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let org: string
let user: Awaited<ReturnType<typeof createFixtureUser>>
let client: Awaited<ReturnType<typeof signedInClient>>

before(async () => {
  org = await createFixtureOrg('Revocation')
  user = await createFixtureUser(org)
  await admin.from('clients').insert({ organization_id: org, name: 'Before Revocation' })
  client = await signedInClient(user.email, user.password)
})

after(async () => { await cleanup([org], [user.id]) })

test('access disappears the moment membership is revoked, without a token refresh', async () => {
  const before = await client.from('clients').select('name')
  assert.equal(before.data?.length, 1)

  await admin.from('memberships').update({ status: 'removed' }).eq('organization_id', org).eq('user_id', user.id)

  // Same client, same token — this is the whole argument for membership lookup over JWT claims.
  const after = await client.from('clients').select('name')
  assert.deepEqual(after.data, [])
})
```

- [ ] **Step 4: Run the suite**

Run: `pnpm test:rls`
Expected: 5 tests passing. If the delete test fails because a policy exists, remove that policy — deletes must have none.

- [ ] **Step 5: Confirm no fixture rows survived**

```sql
select count(*) from public.organizations where slug like 'rls-%';
```

Expected: 0. If not, the `after` hooks are not running; fix before committing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(rls): prove tenant isolation and instant revocation against the live database"
```

---

### Task 17: Documentation and final verification

**Files:**
- Modify: `docs/database.md`, `docs/tenancy.md`, `docs/development.md`, `docs/product-ui.md`, `docs/architecture.md`

**Interfaces:**
- Consumes: everything.
- Produces: documentation that matches reality.

- [ ] **Step 1: Correct the stale claims**

- `docs/database.md` — replace the "does not currently connect to a database" framing and the `database/` directory table with the `supabase/migrations/` workflow and how to apply migrations.
- `docs/tenancy.md` — HIMARK is now database-backed; describe `is_member_of`, the cookie, and `getSessionContext`.
- `docs/development.md` — remove "No test runner exists yet" (already false), document `pnpm test`, `pnpm test:rls`, `pnpm grant-owner`, and the `.env.local` requirement.
- `docs/product-ui.md` — Clients is no longer demonstrative; state which modules are connected and which remain mock-backed.
- `docs/architecture.md` — update the "Intentional deviations" section, which claims no database or API layer exists.

- [ ] **Step 2: Run the full gate**

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm test
pnpm test:rls
```

All four must pass. Report the actual output; do not summarise a failure as a pass.

- [ ] **Step 3: Browser verification with evidence**

Sign in, create a client, edit it, archive it, sign out. Screenshot the populated Clients workspace. Confirm `read_console_messages` shows no errors.

- [ ] **Step 4: Check advisors one last time**

MCP `get_advisors` for both `security` and `performance`. Report anything outstanding rather than silently accepting it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: align documentation with the connected backend"
```

---

## Self-Review

**Spec coverage:** Repository hygiene → Task 1. Legacy reset → Task 2. Platform tables → Task 3. RLS helpers and policies → Task 4. Clients table, indexes, audit trigger → Task 5. `accept_invitation` RPC → Task 6. Three client factories and the service-role boundary test → Task 7. Session context through `lib/tenancy` → Task 8. Middleware with the three exemptions → Task 9. HIMARK seed and first owner → Task 10. SMTP and the mail interface → Task 11. Invitation send/accept → Task 12. Tenant switcher on real memberships → Task 13. The `records` prop seam → Task 14. Clients end to end with server-side search → Task 15. RLS integration specs → Task 16. Documentation → Task 17. Every spec section maps to a task.

**Known gaps, deliberately left:** the spec's `has_role` narrowing is applied to platform tables only — `clients` uses plain membership because `config/permissions.ts` defines no client-level permission yet. The `owner_id` column exists on `clients` but no UI sets it, since the account-owner picker needs a member list that arrives with the Team module; `listClients` renders `—` rather than inventing a value.

**Type consistency:** `createServerSupabase` / `createBrowserSupabase` / `createAdminSupabase` are used under those exact names in Tasks 8–15. `resolveSessionContext` (pure) and `getSessionContext` (request-bound) stay distinct throughout. `ACTIVE_ORG_COOKIE` is defined in Task 8 and imported in Tasks 12 and 13. `EmailTemplate` is defined in Task 11 and consumed by `sendEmail`. The token hash encoding `'\\x' + sha256hex` appears in Tasks 6 and 12 and is explicitly verified in Task 6 Step 3.
