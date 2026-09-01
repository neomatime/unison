# Tier Entitlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a tenant's tier decide which modules it sees and can reach, so Core, Framework and Enterprise become commercially real.

**Architecture:** One `tier` column on `organizations`, written at provisioning and carried on the session that already resolves every request. Navigation becomes a function of the entitled module set instead of a static array. Each module a tier can withhold gets a one-line layout wrapping it in a server-side gate that renders a not-available page instead of the workspace.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5.7, Supabase (Postgres 17), `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-26-tier-entitlement-design.md`

## Global Constraints

- Migrations are applied through the Supabase MCP **first**, then the local file in `supabase/migrations/` is named after the version Supabase assigned. Never invent a version number. Project ref `nwdzpjzllhhqwawmsxjd`.
- **Migrations are an append-only log.** Never edit a migration file that has already been applied.
- Every `security definer` function sets `search_path = ''`.
- **Strategic Enterprise is not permanently equal to Enterprise.** It currently receives the full Enterprise module set until the Strategic tenant-configuration layer is implemented. Every comment and test name must say *currently*, never assert the two tiers are equal.
- Do not create a second source of truth for the tier→module mapping. `config/unison-tiers.ts` is the authority; nothing encodes that map in SQL.
- Do not build a per-module activation table. It has no consumer until the Strategic slice.
- Entitlement is the commercial boundary. RLS remains the data-security boundary.
- Never fabricate a value the database does not hold.
- `pnpm test` and `npx tsc --noEmit` must both pass before any commit. RLS tests run with `pnpm test:rls`.

---

### Task 1: The tier column and provisioning

**Files:**
- Create: `supabase/migrations/<assigned>_organization_tier.sql`
- Modify: `features/internal-provisioning/schemas/provisioning.ts`
- Modify: `features/internal-provisioning/actions/provision-organization.ts`
- Modify: `types/database.ts` (regenerate)
- Modify: `tests/integration/rls/provision-organization.test.ts`

**Interfaces:**
- Consumes: `public.provision_organization(p_name text, p_slug text, p_admin_email text, p_token_hash text, p_expires_at timestamptz) returns uuid` — the existing five-argument version, which this task replaces.
- Produces: `organizations.tier`, and `public.provision_organization(p_name text, p_slug text, p_admin_email text, p_token_hash text, p_expires_at timestamptz, p_tier text default 'core') returns uuid`. Task 2 reads the column.

- [ ] **Step 1: Apply the migration through the Supabase MCP**

Use `apply_migration` with name `organization_tier`:

```sql
-- Default 'core' is a safety choice, not a convenience: an organization whose
-- tier was never set gets the smallest entitlement, so a mistake withholds
-- access rather than granting it.
alter table public.organizations
  add column tier text not null default 'core'
  check (tier in ('core', 'framework', 'enterprise', 'strategic-enterprise'));

-- HIMARK operates the platform and needs every module.
update public.organizations set tier = 'strategic-enterprise' where slug = 'himark';

-- Adding a parameter makes a NEW function rather than replacing the old one, so
-- `create or replace` would leave both live for PostgREST to resolve between.
-- Drop first.
drop function public.provision_organization(text, text, text, text, timestamptz);

create function public.provision_organization(
  p_name text,
  p_slug text,
  p_admin_email text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_tier text default 'core'
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  himark_id uuid;
  new_org uuid;
  new_invitation uuid;
  fw record;
  fw_id uuid;
  phase_name text;
  idx integer;
begin
  select id into himark_id
  from public.organizations
  where slug = 'himark' and status = 'active';

  if himark_id is null then
    raise exception 'internal organization not found' using errcode = '42501';
  end if;

  if auth.role() is distinct from 'service_role'
     and not public.has_role(himark_id, array['owner', 'admin']) then
    raise exception 'only a HIMARK administrator may provision an organization'
      using errcode = '42501';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'p_expires_at must be in the future' using errcode = '22023';
  end if;

  if p_expires_at > now() + interval '30 days' then
    raise exception 'p_expires_at must be no more than 30 days in the future'
      using errcode = '22023';
  end if;

  -- The column's check constraint rejects an unknown tier, but doing it here
  -- names the parameter at fault rather than surfacing a constraint violation.
  if p_tier not in ('core', 'framework', 'enterprise', 'strategic-enterprise') then
    raise exception 'p_tier must be a known UNISON tier' using errcode = '22023';
  end if;

  insert into public.organizations (name, slug, status, tier)
  values (p_name, p_slug, 'active', p_tier)
  returning id into new_org;

  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, auth.uid(), 'organizations', new_org, 'insert',
    jsonb_build_object('name', p_name, 'slug', p_slug, 'tier', p_tier, 'via', 'provisioning', 'organization_id', new_org)
  );

  for fw in select * from (values
    ('Business / Technology Change', 'Enterprise', 'v3.2'),
    ('Automation Implementation',    'Technology', 'v2.4'),
    ('Client Onboarding',            'Operations', 'v4.1'),
    ('Regulatory Change',            'Compliance', 'v2.8'),
    ('Digital Transformation',       'Enterprise', 'v5.0'),
    ('Product Launch',               'Commercial', 'v1.9')
  ) as t(name, type, version)
  loop
    insert into public.frameworks (organization_id, name, type, version)
    values (new_org, fw.name, fw.type, fw.version)
    returning id into fw_id;

    idx := 1;
    foreach phase_name in array (
      case when fw.name = 'Client Onboarding'
        then array['Welcome','Company Setup','Information & Documentation','Agreements','Review & Approval','Go Live / Handover']
        else array['Initiate','Discover','Design','Build','Test','Ready','Deploy','Measure']
      end
    ) loop
      insert into public.framework_phases (framework_id, organization_id, name, position)
      values (fw_id, new_org, phase_name, idx);
      idx := idx + 1;
    end loop;
  end loop;

  insert into public.invitations (
    organization_id, email, role_id, token_hash, expires_at, invited_by
  ) values (
    new_org, lower(p_admin_email), 'owner', p_token_hash, p_expires_at, auth.uid()
  )
  returning id into new_invitation;

  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, auth.uid(), 'invitations', new_invitation, 'insert',
    jsonb_build_object('via', 'provisioning', 'role_id', 'owner', 'email', lower(p_admin_email), 'organization_id', new_org)
  );

  return new_org;
end $$;

-- Grants do NOT carry across to a new signature, and `revoke ... from public`
-- alone does not strip Supabase's default grant to anon — migration
-- 20260826153200 exists solely because that was missed once on this function.
revoke all on function public.provision_organization(text, text, text, text, timestamptz, text)
  from public, anon;
grant execute on function public.provision_organization(text, text, text, text, timestamptz, text)
  to authenticated, service_role;
```

- [ ] **Step 2: Save the migration locally under its assigned version**

Call `list_migrations` to read the version Supabase assigned, then write the identical SQL to `supabase/migrations/<version>_organization_tier.sql`.

- [ ] **Step 3: Verify the old signature is gone and the new grants are right**

Via `execute_sql`:

```sql
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'provision_organization') as signatures,
  has_function_privilege('anon', 'public.provision_organization(text,text,text,text,timestamptz,text)', 'execute') as anon_can_call,
  has_function_privilege('authenticated', 'public.provision_organization(text,text,text,text,timestamptz,text)', 'execute') as authenticated_can_call,
  (select tier from public.organizations where slug = 'himark') as himark_tier;
```

Expected: `signatures` = 1, `anon_can_call` = false, `authenticated_can_call` = true, `himark_tier` = `strategic-enterprise`.

- [ ] **Step 4: Add tier to the provisioning schema**

In `features/internal-provisioning/schemas/provisioning.ts`, add to the object passed to `z.object({ ... })`, before the `.transform`:

```ts
    tier: z.enum(['core', 'framework', 'enterprise', 'strategic-enterprise']).default('core'),
```

- [ ] **Step 5: Pass the tier through the action**

In `features/internal-provisioning/actions/provision-organization.ts`, add `tier` to the parsed input:

```ts
    tier: formData.get('tier') ?? undefined,
```

and add the argument to the RPC call:

```ts
    p_tier: parsed.data.tier,
```

- [ ] **Step 6: Regenerate the database types**

Use the Supabase MCP `generate_typescript_types` and write the result to `types/database.ts`. The RPC's argument list changed, so a stale file will not compile against the new call.

- [ ] **Step 7: Add the failing RLS tests**

Append to `tests/integration/rls/provision-organization.test.ts`:

```ts
test('an organization provisioned without a tier is core', async () => {
  // The column defaults to the smallest entitlement so a mistake withholds
  // access rather than granting it.
  const client = await signedInClient(himarkAdmin.email, himarkAdmin.password)
  const { data: orgId, error } = await client.rpc('provision_organization', args('RLS Tier Default'))
  assert.equal(error, null)
  provisioned.push(orgId as string)

  const { data } = await admin.from('organizations').select('tier').eq('id', orgId).single()
  assert.equal(data?.tier, 'core')
})

test('an explicit tier is stored', async () => {
  const client = await signedInClient(himarkAdmin.email, himarkAdmin.password)
  const { data: orgId, error } = await client.rpc('provision_organization', {
    ...args('RLS Tier Enterprise'),
    p_tier: 'enterprise',
  })
  assert.equal(error, null)
  provisioned.push(orgId as string)

  const { data } = await admin.from('organizations').select('tier').eq('id', orgId).single()
  assert.equal(data?.tier, 'enterprise')
})

test('an unknown tier is refused', async () => {
  const client = await signedInClient(himarkAdmin.email, himarkAdmin.password)
  const { error } = await client.rpc('provision_organization', {
    ...args('RLS Tier Bogus'),
    p_tier: 'platinum',
  })
  assert.ok(error, 'an unrecognised tier must not create an organization')
})
```

- [ ] **Step 8: Run the tests and the gate**

Run: `pnpm test:rls` naming `tests/integration/rls/provision-organization.test.ts`, then `npx tsc --noEmit && pnpm test`.
Expected: the three new tests pass; tsc exit 0; unit suite green. `PGRST303: JWT issued at future` failures in untouched files are a known unrelated transient.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations features/internal-provisioning types/database.ts tests/integration/rls
git commit -m "feat(tiers): store a tenant's tier, written at provisioning"
```

---

### Task 2: Entitlement on the session

**Files:**
- Modify: `types/tenancy.ts`
- Modify: `lib/auth/get-session-context.ts:30`
- Modify: `config/unison-tiers.ts`
- Create: `lib/auth/entitlement.ts`
- Create: `tests/unit/entitlement.test.ts`

**Interfaces:**
- Consumes: `organizations.tier` from Task 1.
- Produces: `Organization.tier: UnisonTierId`; `lowestTierIncluding(moduleId): UnisonTier | undefined` exported from `config/unison-tiers.ts`; `entitledModuleIds(): Promise<UnisonModuleId[]>` from `lib/auth/entitlement.ts`. Tasks 3 and 4 use all of these.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/entitlement.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getEntitledModuleIds,
  lockedModuleIds,
  lowestTierIncluding,
  unisonTiers,
} from '../../config/unison-tiers.ts'

const DELIVERY = ['overview', 'portfolio', 'projects', 'frameworks', 'approvals', 'vendors']

test('Core is the Delivery modules plus Team', () => {
  assert.deepEqual(getEntitledModuleIds('core').sort(), [...DELIVERY, 'team'].sort())
})

test('Framework adds Clients and Onboarding to Core', () => {
  assert.deepEqual(
    getEntitledModuleIds('framework').sort(),
    [...DELIVERY, 'team', 'clients', 'onboarding'].sort(),
  )
})

test('Enterprise adds Commercial and Finance to Framework', () => {
  assert.deepEqual(
    getEntitledModuleIds('enterprise').sort(),
    [...DELIVERY, 'team', 'clients', 'onboarding', 'leads', 'quotes', 'sales', 'invoices', 'expenses', 'forecast'].sort(),
  )
})

test('Strategic Enterprise currently receives the full Enterprise module set', () => {
  // TEMPORARY, not a product rule. Strategic Enterprise is the client-configured
  // tier; it receives the Enterprise set only until the Strategic
  // tenant-configuration layer exists. Delete this assertion when that lands —
  // it is a placeholder being retired, not a rule being broken.
  assert.deepEqual(
    getEntitledModuleIds('strategic-enterprise').sort(),
    getEntitledModuleIds('enterprise').sort(),
  )
})

test('every locked module is in every tier', () => {
  for (const tier of unisonTiers) {
    for (const moduleId of lockedModuleIds) {
      assert.ok(
        getEntitledModuleIds(tier.id).includes(moduleId),
        `${moduleId} must be in ${tier.id}: Delivery and Team are in every tier`,
      )
    }
  }
})

test('lowestTierIncluding names the cheapest tier that carries a module', () => {
  assert.equal(lowestTierIncluding('projects')?.id, 'core')
  assert.equal(lowestTierIncluding('clients')?.id, 'framework')
  assert.equal(lowestTierIncluding('invoices')?.id, 'enterprise')
})

test('lowestTierIncluding never names a tier that excludes the module', () => {
  for (const module of ['clients', 'invoices', 'sales', 'team'] as const) {
    const tier = lowestTierIncluding(module)
    assert.ok(tier, `expected a tier for ${module}`)
    assert.ok(getEntitledModuleIds(tier.id).includes(module))
  }
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test --experimental-strip-types tests/unit/entitlement.test.ts`
Expected: FAIL — `lowestTierIncluding` is not exported.

- [ ] **Step 3: Add lowestTierIncluding and the Strategic note**

In `config/unison-tiers.ts`, replace the `strategic-enterprise` entry's `description` line with the description plus a comment directly above the entry:

```ts
  // Strategic Enterprise is the client-configured tier. It currently receives the
  // full Enterprise module set until the Strategic tenant-configuration layer is
  // implemented — a temporary implementation state, not a product rule. When that
  // layer lands, a Strategic tenant's modules come from its own configuration
  // rather than from this fixed list.
  {
    id: 'strategic-enterprise',
```

and append at the end of the file:

```ts
/**
 * The cheapest tier that includes a module — what the not-available page offers
 * as the upgrade target. `unisonTiers` is ordered smallest to largest, so this is
 * a find rather than a mapping anyone has to keep in step.
 */
export function lowestTierIncluding(moduleId: UnisonModuleId): UnisonTier | undefined {
  return unisonTiers.find((tier) => (tier.moduleIds as readonly UnisonModuleId[]).includes(moduleId))
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test --experimental-strip-types tests/unit/entitlement.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Carry the tier on the Organization type**

In `types/tenancy.ts`, add the import and the field:

```ts
import type { UnisonTierId } from '@/config/unison-tiers'
```

and inside `export type Organization = {`:

```ts
  tier: UnisonTierId
```

- [ ] **Step 6: Select the tier with the session**

In `lib/auth/get-session-context.ts`, line 30, add `tier` to the embedded organizations select:

```ts
    .select('id, organization_id, user_id, role_id, status, created_at, organizations(id, name, slug, status, created_at, tier)')
```

and in the `organizations` mapping below it, add:

```ts
    tier: row.organizations.tier as Organization['tier'],
```

- [ ] **Step 7: Write the entitlement helpers**

Create `lib/auth/entitlement.ts`:

```ts
import 'server-only'
import { getEntitledModuleIds, type UnisonModuleId } from '@/config/unison-tiers'
import { getSessionContext } from './get-session-context'

/**
 * The modules this tenant's tier includes. Costs nothing: getSessionContext is
 * already wrapped in React's cache() and already joins organizations, so the tier
 * arrives with the session and the mapping is pure.
 */
export async function entitledModuleIds(): Promise<UnisonModuleId[]> {
  const { organization } = await getSessionContext()
  return getEntitledModuleIds(organization.tier)
}
```

One export, not two. A `hasModule(id)` convenience would read well but nothing
would call it — `ModuleGate` needs the list anyway, and navigation needs the
whole set. Add it when something wants it.

- [ ] **Step 8: Typecheck and run the suite**

Run: `npx tsc --noEmit && pnpm test`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add types/tenancy.ts lib/auth config/unison-tiers.ts tests/unit/entitlement.test.ts
git commit -m "feat(tiers): resolve a tenant's entitled modules from its session"
```

---

### Task 3: Navigation derived per tenant

**Files:**
- Modify: `config/navigation.ts:52-63`
- Modify: `components/layout/shell-context.tsx`
- Modify: `components/layout/app-shell.tsx`
- Modify: `components/navigation/sidebar.tsx:8,42`
- Modify: `app/(unison)/layout.tsx`
- Create: `tests/unit/navigation-sections.test.ts`

**Interfaces:**
- Consumes: `entitledModuleIds()` from Task 2.
- Produces: `navigationSectionsFor(moduleIds: readonly UnisonModuleId[]): NavigationSection[]` from `config/navigation.ts`, and `ShellContextValue.navigationSections`. Task 4 does not use these.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/navigation-sections.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { navigationSectionsFor } from '../../config/navigation.ts'
import { getEntitledModuleIds } from '../../config/unison-tiers.ts'

test('a Core tenant sees Delivery and People only', () => {
  const headings = navigationSectionsFor(getEntitledModuleIds('core')).map((section) => section.heading)
  assert.deepEqual(headings, ['Delivery', 'People'])
})

test('a Framework tenant also sees Operations', () => {
  const headings = navigationSectionsFor(getEntitledModuleIds('framework')).map((section) => section.heading)
  assert.deepEqual(headings, ['Delivery', 'Operations', 'People'])
})

test('an Enterprise tenant sees every section', () => {
  const headings = navigationSectionsFor(getEntitledModuleIds('enterprise')).map((section) => section.heading)
  assert.deepEqual(headings, ['Delivery', 'Operations', 'Commercial', 'Finance', 'People'])
})

test('a section with no entitled modules is omitted, not left empty', () => {
  // An empty "Finance" heading would tell a Core tenant they are missing
  // something without saying what, which is worse than not showing it.
  const sections = navigationSectionsFor(getEntitledModuleIds('core'))
  assert.equal(sections.every((section) => section.items.length > 0), true)
})

test('only entitled modules appear as items', () => {
  const items = navigationSectionsFor(getEntitledModuleIds('core')).flatMap((s) => s.items.map((i) => i.id))
  assert.ok(!items.includes('invoices'))
  assert.ok(items.includes('projects'))
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test --experimental-strip-types tests/unit/navigation-sections.test.ts`
Expected: FAIL — `navigationSectionsFor` is not exported.

- [ ] **Step 3: Make navigation a function of the entitled set**

In `config/navigation.ts`, replace the `itemsFor` helper and the `navigationSections` constant (lines 52-63) with:

```ts
const itemsFor = (category: (typeof modules)[number]['category'], moduleIds: readonly UnisonModuleId[]) => modules
  .filter((module) => module.category === category && module.enabled && moduleIds.includes(module.id))
  .map((module) => ({ ...module, icon: moduleIcons[module.id] }))

/**
 * Built per tenant from its tier's entitlement rather than once at import. A
 * section whose modules are all withheld is dropped entirely — an empty "Finance"
 * heading tells a Core tenant they are missing something without saying what.
 */
export function navigationSectionsFor(moduleIds: readonly UnisonModuleId[]): NavigationSection[] {
  return [
    { heading: 'Delivery', items: itemsFor('delivery', moduleIds) },
    { heading: 'Operations', items: itemsFor('operations', moduleIds) },
    { heading: 'Commercial', items: itemsFor('commercial', moduleIds) },
    { heading: 'Finance', items: itemsFor('finance', moduleIds) },
    { heading: 'People', items: itemsFor('people', moduleIds) },
  ].filter((section) => section.items.length > 0)
}
```

Add `import type { UnisonModuleId } from '@/config/unison-tiers'` at the top. Delete the old `navigationSections` export.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test --experimental-strip-types tests/unit/navigation-sections.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Carry the sections on the shell context**

In `components/layout/shell-context.tsx`, add to the imports:

```ts
import type { NavigationSection } from '@/config/navigation'
```

and to `ShellContextValue`:

```ts
  navigationSections: NavigationSection[]
```

- [ ] **Step 6: Pass them through AppShell**

`AppShell` renders `<Sidebar />` in two places, so the sections travel by context rather than by prop. Add `navigationSections` to `AppShellProps`, and include it in the value handed to `ShellProvider` alongside `user`, `organization`, `organizations` and `role`.

- [ ] **Step 7: Read them in the sidebar**

In `components/navigation/sidebar.tsx`, delete the `import { navigationSections } from '@/config/navigation'` on line 8, and take the sections from context instead — the destructure on the `useShellContext()` line becomes:

```tsx
  const { user, organization, role, navigationSections } = useShellContext()
```

The `navigationSections.map(...)` at line 42 then needs no change.

- [ ] **Step 8: Compute them in the layout**

In `app/(unison)/layout.tsx`, after `getSessionContext()` resolves, add:

```tsx
    const navigationSections = navigationSectionsFor(await entitledModuleIds())
```

and pass `navigationSections={navigationSections}` to `<AppShell>`. Import `navigationSectionsFor` from `@/config/navigation` and `entitledModuleIds` from `@/lib/auth/entitlement`.

- [ ] **Step 9: Run the full gate**

Run: `npx tsc --noEmit && pnpm test && pnpm build`
Expected: tsc exit 0; all tests pass; build succeeds.

- [ ] **Step 10: Commit**

```bash
git add config/navigation.ts components/layout components/navigation "app/(unison)/layout.tsx" tests/unit/navigation-sections.test.ts
git commit -m "feat(tiers): build navigation from the tenant's entitlement"
```

---

### Task 4: Route guards and the not-available page

**Files:**
- Create: `components/shared/module-not-available.tsx`
- Create: `components/shared/module-gate.tsx`
- Create: eight layouts (paths listed in Step 4)
- Modify: `tests/unit/ui-completeness.test.ts`

**Interfaces:**
- Consumes: `entitledModuleIds()` from Task 2, `lowestTierIncluding()` from Task 2.
- Produces: nothing later tasks depend on. This is the last task.

- [ ] **Step 1: Write the not-available page**

Create `components/shared/module-not-available.tsx`:

```tsx
import Link from 'next/link'

import { moduleById } from '@/features/product-ui/registry'
import { getTier, lowestTierIncluding, type UnisonModuleId, type UnisonTierId } from '@/config/unison-tiers'

/**
 * Every value is derived. Naming the module means the page confirms it exists,
 * which is acceptable: the tier list is public product information, and whoever
 * typed the URL usually wants the module.
 */
export function ModuleNotAvailable({ moduleId, tier }: { moduleId: UnisonModuleId; tier: UnisonTierId }) {
  const label = moduleById[moduleId]?.label ?? moduleId
  const current = getTier(tier)
  const upgrade = lowestTierIncluding(moduleId)

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6">
      <section className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-xs font-semibold tracking-[0.09em] text-muted-foreground uppercase">Not included</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          {label} isn&rsquo;t part of {current.label}
        </h1>
        {upgrade ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Available on {upgrade.label}. Ask your UNISON administrator to upgrade.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Ask your UNISON administrator for access.</p>
        )}
        <Link
          href="/overview"
          className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Back to Overview
        </Link>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Write the gate**

Create `components/shared/module-gate.tsx`:

```tsx
import type React from 'react'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { entitledModuleIds } from '@/lib/auth/entitlement'
import type { UnisonModuleId } from '@/config/unison-tiers'
import { ModuleNotAvailable } from './module-not-available'

/**
 * A product boundary, not a data boundary. Next renders layouts and pages in
 * parallel, so a withheld page's queries may still run before this returns —
 * nothing leaks, because every query is RLS-scoped to the caller's organization,
 * but the security boundary remains RLS rather than this component.
 */
export async function ModuleGate({ moduleId, children }: { moduleId: UnisonModuleId; children: React.ReactNode }) {
  const entitled = await entitledModuleIds()
  if (entitled.includes(moduleId)) return <>{children}</>

  const { organization } = await getSessionContext()
  return <ModuleNotAvailable moduleId={moduleId} tier={organization.tier} />
}
```

- [ ] **Step 3: Write the failing guard-coverage test**

Append to `tests/unit/ui-completeness.test.ts`:

```ts
test('every module a tier can withhold is guarded by its own layout', () => {
  // The failure mode is forgetting a guard on a new module, which fails open —
  // the module would simply be reachable on every tier. Locked modules need no
  // guard: no tier can withhold Delivery or Team.
  const gated = moduleDefinitions
    .filter((module) => !(lockedModuleIds as readonly string[]).includes(module.id))
    .map((module) => ({ id: module.id, dir: join(unisonRoot, module.route.replace(/^\//, '')) }))

  assert.equal(gated.length, 8, 'expected exactly the Operations, Commercial and Finance modules')

  for (const { id, dir } of gated) {
    const layout = join(dir, 'layout.tsx')
    assert.ok(existsSync(layout), `${id} has no guard layout at ${layout}`)
    assert.match(
      readFileSync(layout, 'utf8'),
      new RegExp(`moduleId="${id}"`),
      `${id}'s layout must gate on its own module id`,
    )
  }
})
```

**The alias is load-bearing.** This file already binds `modules` to the *source
text* of `config/modules.ts` — several existing assertions do
`assert.doesNotMatch(modules, /id: 'hr'/)` against that string. Importing the
array as `modules` would shadow or collide with it and break those tests. Add
these two imports at the top, keeping the alias exactly as written:

```ts
import { modules as moduleDefinitions } from '../../config/modules.ts'
import { lockedModuleIds } from '../../config/unison-tiers.ts'
```

`existsSync`, `readFileSync`, `join` and `unisonRoot` are already present in this
file — do not re-declare them.

- [ ] **Step 4: Run it to confirm it fails**

Run: `node --test --experimental-strip-types tests/unit/ui-completeness.test.ts`
Expected: FAIL — no guard layouts exist yet.

- [ ] **Step 5: Add the eight guard layouts**

Create each of these with the body below, substituting the module id:

| module | path |
|---|---|
| `clients` | `app/(unison)/operations/clients/layout.tsx` |
| `onboarding` | `app/(unison)/operations/onboarding/layout.tsx` |
| `leads` | `app/(unison)/commercial/leads/layout.tsx` |
| `quotes` | `app/(unison)/commercial/quotes/layout.tsx` |
| `sales` | `app/(unison)/commercial/sales/layout.tsx` |
| `invoices` | `app/(unison)/finance/invoices/layout.tsx` |
| `expenses` | `app/(unison)/finance/expenses/layout.tsx` |
| `forecast` | `app/(unison)/finance/forecast/layout.tsx` |

```tsx
import type React from 'react'

import { ModuleGate } from '@/components/shared/module-gate'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ModuleGate moduleId="clients">{children}</ModuleGate>
}
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `node --test --experimental-strip-types tests/unit/ui-completeness.test.ts`
Expected: the new test passes and every pre-existing assertion in that file still passes.

- [ ] **Step 7: Run the full gate**

Run: `npx tsc --noEmit && pnpm test && pnpm build`
Expected: tsc exit 0; all tests pass; build succeeds.

- [ ] **Step 8: Verify what a signed-out session can prove**

Start the dev server with `preview_start` using `{name: "unison-dev"}` — never `pnpm dev` via bash. Confirm `/finance/invoices` still redirects to `/sign-in?next=%2Ffinance%2Finvoices`, and check `preview_logs` for compilation errors on that route.

You cannot sign in — the app authenticates through Microsoft Entra and no agent may enter those credentials. Do not attempt it. HIMARK is `strategic-enterprise`, so a signed-in check would show every module anyway; the tier-withholding path needs a tenant on a lower tier and is left to a human. Record that in your report.

- [ ] **Step 9: Commit**

```bash
git add components/shared "app/(unison)/operations" "app/(unison)/commercial" "app/(unison)/finance" tests/unit/ui-completeness.test.ts
git commit -m "feat(tiers): withhold modules a tenant's tier does not include"
```

---

## Done when

- `organizations.tier` exists, defaults to `core`, and rejects an unknown value
- HIMARK is `strategic-enterprise`; a provisioned tenant is `core` unless a tier is given
- `provision_organization` has exactly one signature, callable by `authenticated` and `service_role`, never `anon`
- Navigation shows only the sections and modules a tenant's tier includes
- All eight withholdable modules have a guard layout, and a test fails if one is missing
- `/finance/invoices` on a Core tenant renders the not-available page naming UNISON Enterprise
- Nothing asserts Strategic Enterprise is permanently equal to Enterprise
- `npx tsc --noEmit`, `pnpm test`, `pnpm test:rls` and `pnpm build` are green

**Not covered, deliberately:** changing a tier from the UI, per-module activation for Strategic Enterprise, downgrade behaviour, and billing.
