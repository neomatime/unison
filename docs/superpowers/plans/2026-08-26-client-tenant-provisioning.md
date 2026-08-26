# Client Tenant Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a HIMARK administrator create a client organisation through UNISON Internal, so its first admin receives an invitation, sets a password, and signs in to their own tenant.

**Architecture:** `organizations` has no insert policy and `invitations_insert` demands owner of the target organisation, so provisioning cannot be assembled from ordinary writes. Two `security definer` functions do it — `provision_organization` creates the organisation, its frameworks and the first invitation in one transaction; `reissue_invitation` recovers a tenant whose invitation email failed. A server action generates and hashes the token, calls the function through the caller's own session, and sends the email.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5.7, Supabase (Postgres 17), zod, `node:test`, Microsoft Graph for mail.

**Spec:** `docs/superpowers/specs/2026-08-26-client-tenant-provisioning-design.md`

## Global Constraints

- Migrations are applied through the Supabase MCP **first**, then the local file in `supabase/migrations/` is named after the version Supabase assigned. Never invent a version number. Project ref `nwdzpjzllhhqwawmsxjd`.
- Every `security definer` function sets `search_path = ''`.
- No table gets a delete policy, and no new insert policy is added to `organizations`. Privileged creation goes through the functions, not through relaxed RLS.
- Queries and actions that touch the database import `'server-only'` or are marked `'use server'`.
- `token_hash` is `text` holding `'\x' || <sha256 hex>` — the format `send-invitation.ts:65` produces. A different format silently fails to match a valid token.
- `email_domain` is left null on client organisations. It is what `claim_directory_membership()` matches on.
- Never fabricate a zero. A count with no backing table renders `'—'`.
- `pnpm test` and `npx tsc --noEmit` must both pass before any commit. RLS tests run with `pnpm test:rls` and are not part of `pnpm test`.

---

### Task 1: `provision_organization`

**Files:**
- Create: `supabase/migrations/<assigned>_provision_organization.sql`
- Create: `tests/integration/rls/provision-organization.test.ts`
- Modify: `tests/integration/rls/helpers.ts` (extend `cleanup`)

**Interfaces:**
- Consumes: `public.has_role(uuid, text[])`, `public.organizations`, `public.frameworks`, `public.framework_phases`, `public.invitations`, `public.audit_events` — all existing.
- Produces: `public.provision_organization(p_name text, p_slug text, p_admin_email text, p_token_hash text, p_expires_at timestamptz) returns uuid`. Task 3 calls it via `supabase.rpc('provision_organization', {...})`.

- [ ] **Step 1: Apply the migration through the Supabase MCP**

Use `apply_migration` with name `provision_organization`:

```sql
-- Creating a tenant cannot be done with ordinary writes: organizations has no
-- insert policy at all, and invitations_insert requires owner of the target
-- organization -- which a HIMARK administrator provisioning a client is not.
-- One transaction, so a tenant can never exist without frameworks or without a
-- way in.
create or replace function public.provision_organization(
  p_name text,
  p_slug text,
  p_admin_email text,
  p_token_hash text,
  p_expires_at timestamptz
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

  -- service_role is permitted the same way delete_organization permits it, so
  -- scripts and fixtures have a sanctioned path that is not a relaxed policy.
  if auth.role() is distinct from 'service_role'
     and not public.has_role(himark_id, array['owner', 'admin']) then
    raise exception 'only a HIMARK administrator may provision an organization'
      using errcode = '42501';
  end if;

  -- email_domain is deliberately left null. It is what
  -- claim_directory_membership() matches on, and a client tenant that carried
  -- one would silently absorb anyone at that domain if Entra ever went
  -- multi-tenant.
  insert into public.organizations (name, slug, status)
  values (p_name, p_slug, 'active')
  returning id into new_org;

  -- organizations has no audit trigger (only set_updated_at), so the creation
  -- is recorded explicitly -- the same reason delete_organization() writes its
  -- own row.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, auth.uid(), 'organizations', new_org, 'insert',
    jsonb_build_object('name', p_name, 'slug', p_slug, 'via', 'provisioning')
  );

  -- projects.framework_id is not null, so a tenant without frameworks meets a
  -- New Project form it cannot submit. frameworks and framework_phases both
  -- carry record_audit_event triggers, so these rows audit themselves.
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

  -- invitations has no audit trigger either.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, auth.uid(), 'invitations', new_invitation, 'insert',
    jsonb_build_object('via', 'provisioning', 'role_id', 'owner', 'email', lower(p_admin_email))
  );

  return new_org;
end $$;

revoke all on function public.provision_organization(text, text, text, text, timestamptz) from public;
grant execute on function public.provision_organization(text, text, text, text, timestamptz) to authenticated, service_role;
```

- [ ] **Step 2: Save the migration locally under its assigned version**

Call `list_migrations` to read the version Supabase assigned, then write the identical SQL to `supabase/migrations/<version>_provision_organization.sql`.

- [ ] **Step 3: Extend cleanup for the new audit resources**

`tests/integration/rls/helpers.ts` documents a GUARANTEE that cleanup removes every row a fixture caused. `provision_organization` writes `audit_events` rows with `resource` of `'organizations'` and `'invitations'`, plus framework rows via triggers. In `cleanup()`, the existing delivery sweep reads:

```ts
      .in('resource', ['frameworks', 'framework_phases', 'projects'])
```

Change it to:

```ts
      .in('resource', ['frameworks', 'framework_phases', 'projects', 'invitations'])
```

`'organizations'` rows are already swept by the `orgEvent` query above it, which matches on `resource_id`.

- [ ] **Step 4: Write the failing RLS test**

Create `tests/integration/rls/provision-organization.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { randomUUID } from 'node:crypto'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

let himarkId: string
let himarkAdmin: { id: string; email: string; password: string }
let himarkMember: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }
const provisioned: string[] = []

before(async () => {
  const { data, error } = await admin
    .from('organizations').select('id').eq('slug', 'himark').single()
  if (error) throw error
  himarkId = data.id

  himarkAdmin = await createFixtureUser(himarkId, 'admin')
  himarkMember = await createFixtureUser(himarkId, 'member')
  outsiderOrg = await createFixtureOrg('provision-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')
})

after(async () => {
  await cleanup(
    [outsiderOrg, ...provisioned].filter(Boolean),
    [himarkAdmin?.id, himarkMember?.id, outsider?.id].filter(Boolean) as string[],
  )
})

function args(name: string) {
  return {
    p_name: name,
    p_slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`,
    p_admin_email: `admin-${randomUUID()}@client.test`,
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  }
}

test('a HIMARK admin provisions an organization with frameworks and an owner invitation', async () => {
  const client = await signedInClient(himarkAdmin.email, himarkAdmin.password)
  const payload = args('RLS Provision Alpha')
  const { data: orgId, error } = await client.rpc('provision_organization', payload)
  assert.equal(error, null)
  assert.ok(orgId)
  provisioned.push(orgId as string)

  const { data: frameworks } = await admin
    .from('frameworks').select('id, name').eq('organization_id', orgId)
  assert.equal(frameworks?.length, 6, 'every tenant needs frameworks or New Project cannot submit')

  const onboarding = frameworks!.find((f) => f.name === 'Client Onboarding')!
  const { data: onboardingPhases } = await admin
    .from('framework_phases').select('id').eq('framework_id', onboarding.id)
  assert.equal(onboardingPhases?.length, 6)

  const other = frameworks!.find((f) => f.name === 'Product Launch')!
  const { data: otherPhases } = await admin
    .from('framework_phases').select('id').eq('framework_id', other.id)
  assert.equal(otherPhases?.length, 8)

  const { data: invites } = await admin
    .from('invitations').select('email, role_id, status').eq('organization_id', orgId)
  assert.equal(invites?.length, 1)
  assert.equal(invites![0].role_id, 'owner')
  assert.equal(invites![0].status, 'pending')
  assert.equal(invites![0].email, payload.p_admin_email.toLowerCase())
})

test('the provisioned organization carries no email_domain', async () => {
  // Populating it would let anyone at that domain auto-join through
  // claim_directory_membership if Entra ever went multi-tenant.
  const { data } = await admin
    .from('organizations').select('email_domain').eq('id', provisioned[0]).single()
  assert.equal(data?.email_domain, null)
})

test('a HIMARK member who is not owner or admin is refused', async () => {
  const client = await signedInClient(himarkMember.email, himarkMember.password)
  const { error } = await client.rpc('provision_organization', args('RLS Provision Member'))
  assert.ok(error, 'a plain member must not be able to create tenants')
  assert.match(error.message, /HIMARK administrator/i)
})

test('an owner of another organization is refused', async () => {
  const client = await signedInClient(outsider.email, outsider.password)
  const { error } = await client.rpc('provision_organization', args('RLS Provision Outsider'))
  assert.ok(error, 'owning some organization must not confer provisioning rights')
})

test('the provisioned organization is invisible to an outsider', async () => {
  const client = await signedInClient(outsider.email, outsider.password)
  const { data } = await client.from('organizations').select('id').eq('id', provisioned[0])
  assert.deepEqual(data, [], 'a new tenant must not leak to other organizations')
})
```

- [ ] **Step 5: Run the RLS tests**

Run: `pnpm test:rls`
Expected: all five tests in `provision-organization.test.ts` PASS. `PGRST303: JWT issued at future` failures elsewhere are a known transient; ignore those specifically.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations tests/integration/rls
git commit -m "feat(provisioning): create a client organization in one transaction"
```

---

### Task 2: `reissue_invitation`

**Files:**
- Create: `supabase/migrations/<assigned>_reissue_invitation.sql`
- Modify: `tests/integration/rls/provision-organization.test.ts`

**Interfaces:**
- Consumes: `public.provision_organization` from Task 1, `public.has_role(uuid, text[])`.
- Produces: `public.reissue_invitation(p_organization_id uuid, p_email text, p_token_hash text, p_expires_at timestamptz) returns void`. Task 3 references it in its error copy.

- [ ] **Step 1: Apply the migration through the Supabase MCP**

Use `apply_migration` with name `reissue_invitation`:

```sql
-- Recovery for a specific failure: provision_organization commits, then the
-- email send fails. The raw token existed only in memory, so nobody can enter
-- the tenant -- and no HIMARK administrator can issue a replacement through
-- ordinary writes, because invitations_insert requires owner of that
-- organization and they hold no role there at all.
create or replace function public.reissue_invitation(
  p_organization_id uuid,
  p_email text,
  p_token_hash text,
  p_expires_at timestamptz
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  himark_id uuid;
  new_invitation uuid;
begin
  select id into himark_id
  from public.organizations
  where slug = 'himark' and status = 'active';

  if himark_id is null then
    raise exception 'internal organization not found' using errcode = '42501';
  end if;

  if auth.role() is distinct from 'service_role'
     and not public.has_role(himark_id, array['owner', 'admin']) then
    raise exception 'only a HIMARK administrator may reissue an invitation'
      using errcode = '42501';
  end if;

  -- Must be status, not expires_at. invitations_one_pending_per_email is a
  -- partial unique index on (organization_id, lower(email)) where status =
  -- 'pending', so backdating expires_at would leave the old row occupying the
  -- slot and the insert below would fail with 23505.
  update public.invitations
  set status = 'expired'
  where organization_id = p_organization_id
    and lower(email) = lower(p_email)
    and status = 'pending';

  insert into public.invitations (
    organization_id, email, role_id, token_hash, expires_at, invited_by
  ) values (
    p_organization_id, lower(p_email), 'owner', p_token_hash, p_expires_at, auth.uid()
  )
  returning id into new_invitation;

  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    p_organization_id, auth.uid(), 'invitations', new_invitation, 'insert',
    jsonb_build_object('via', 'reissue', 'role_id', 'owner', 'email', lower(p_email))
  );
end $$;

revoke all on function public.reissue_invitation(uuid, text, text, timestamptz) from public;
grant execute on function public.reissue_invitation(uuid, text, text, timestamptz) to authenticated, service_role;
```

- [ ] **Step 2: Save the migration locally under its assigned version**

- [ ] **Step 3: Add the failing tests**

Append to `tests/integration/rls/provision-organization.test.ts`:

```ts
test('reissue supersedes the pending invitation rather than duplicating it', async () => {
  const client = await signedInClient(himarkAdmin.email, himarkAdmin.password)
  const orgId = provisioned[0]

  const { data: before } = await admin
    .from('invitations').select('id, email, status')
    .eq('organization_id', orgId).eq('status', 'pending')
  assert.equal(before?.length, 1)
  const email = before![0].email

  const { error } = await client.rpc('reissue_invitation', {
    p_organization_id: orgId,
    p_email: email,
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.equal(error, null, 'the partial unique index must not reject the new row')

  const { data: pendingAfter } = await admin
    .from('invitations').select('id').eq('organization_id', orgId).eq('status', 'pending')
  assert.equal(pendingAfter?.length, 1, 'exactly one invitation may be pending per address')

  const { data: expired } = await admin
    .from('invitations').select('id').eq('organization_id', orgId).eq('status', 'expired')
  assert.equal(expired?.length, 1, 'the old one is expired, not deleted')
})

test('an outsider cannot reissue an invitation into a tenant', async () => {
  const client = await signedInClient(outsider.email, outsider.password)
  const { error } = await client.rpc('reissue_invitation', {
    p_organization_id: provisioned[0],
    p_email: 'someone@client.test',
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  assert.ok(error, 'reissue must carry the same authorisation as provisioning')
})
```

- [ ] **Step 4: Run the RLS tests**

Run: `pnpm test:rls`
Expected: seven tests in `provision-organization.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations tests/integration/rls
git commit -m "feat(provisioning): recover a tenant whose invitation email failed"
```

---

### Task 3: Schema and the provisioning action

**Files:**
- Create: `features/internal-provisioning/schemas/provisioning.ts`
- Create: `features/internal-provisioning/actions/provision-organization.ts`
- Create: `tests/unit/provisioning-schema.test.ts`

**Interfaces:**
- Consumes: `provision_organization` from Task 1. `sendEmail` from `@/lib/email/send-email` and `invitationTemplate` from `@/lib/email/templates/invitation`, both used by `features/invitations/actions/send-invitation.ts`. `readAppUrl` from `@/lib/env`. `getSessionContext` from `@/lib/auth/get-session-context`.
- Produces: `provisioningInputSchema`, `type ProvisioningInput`, `deriveSlug(name: string): string`, and `provisionOrganizationAction(_prev, formData)` returning `{ error?: string; organizationId?: string; emailFailed?: boolean }`. Task 4's wizard binds to the action.

- [ ] **Step 1: Write the failing schema test**

Create `tests/unit/provisioning-schema.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { deriveSlug, provisioningInputSchema } from '../../features/internal-provisioning/schemas/provisioning.ts'

test('a name and an admin email are required', () => {
  assert.equal(provisioningInputSchema.safeParse({ name: '', adminEmail: 'a@b.com' }).success, false)
  assert.equal(provisioningInputSchema.safeParse({ name: 'Acme' }).success, false)
})

test('the admin email must look like an address', () => {
  assert.equal(provisioningInputSchema.safeParse({ name: 'Acme', adminEmail: 'not-an-email' }).success, false)
})

test('a slug is derived from the name when none is given', () => {
  assert.equal(deriveSlug('Acme Holdings'), 'acme-holdings')
  assert.equal(deriveSlug('  Acme   Holdings  '), 'acme-holdings')
})

test('slug derivation strips characters that cannot appear in a URL', () => {
  assert.equal(deriveSlug('Acme & Co. (Pty) Ltd'), 'acme-co-pty-ltd')
  assert.equal(deriveSlug('Café Ürban'), 'caf-rban')
})

test('a name with no usable characters is rejected rather than producing an empty slug', () => {
  // An empty slug would collide with any other empty slug on the unique index,
  // and produce a URL segment that resolves to nothing.
  assert.equal(provisioningInputSchema.safeParse({ name: '???', adminEmail: 'a@b.com' }).success, false)
})

test('an explicit slug is normalised, not trusted', () => {
  const parsed = provisioningInputSchema.parse({ name: 'Acme', adminEmail: 'a@b.com', slug: 'Acme Holdings!' })
  assert.equal(parsed.slug, 'acme-holdings')
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test --experimental-strip-types tests/unit/provisioning-schema.test.ts`
Expected: FAIL — cannot find the module.

- [ ] **Step 3: Write the schema**

Create `features/internal-provisioning/schemas/provisioning.ts`:

```ts
import { z } from 'zod'

/**
 * A slug reaches a URL and a unique index, so it is derived rather than
 * accepted: lowercase, non-alphanumerics collapsed to single hyphens, ends
 * trimmed. An explicit slug is normalised the same way rather than trusted.
 */
export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const provisioningInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Organisation name is required.').max(200),
    adminEmail: z.string().trim().email('Enter a valid administrator email address.'),
    slug: z.string().optional(),
  })
  .transform((value) => ({
    ...value,
    slug: deriveSlug(value.slug?.trim() || value.name),
  }))
  .refine((value) => value.slug.length > 0, {
    message: 'Organisation name must contain letters or numbers.',
    path: ['name'],
  })

export type ProvisioningInput = z.infer<typeof provisioningInputSchema>
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test --experimental-strip-types tests/unit/provisioning-schema.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Write the action**

Create `features/internal-provisioning/actions/provision-organization.ts`:

```ts
'use server'
import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { readAppUrl } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send-email'
import { invitationTemplate } from '@/lib/email/templates/invitation'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { provisioningInputSchema } from '../schemas/provisioning'

const EXPIRY_DAYS = 7

export async function provisionOrganizationAction(
  _prev: { error?: string; organizationId?: string; emailFailed?: boolean } | undefined,
  formData: FormData,
) {
  const parsed = provisioningInputSchema.safeParse({
    name: formData.get('name'),
    adminEmail: formData.get('adminEmail'),
    slug: formData.get('slug') ?? undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Same token shape as send-invitation.ts: the raw value never reaches the
  // database, and token_hash is text holding '\x' || sha256 hex.
  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = '\\x' + createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86_400_000).toISOString()

  const supabase = await createServerSupabase()

  // Called through the caller's own session, not the service key, so the
  // function's own authorisation check is the real gate.
  const { data: organizationId, error } = await supabase.rpc('provision_organization', {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_admin_email: parsed.data.adminEmail,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  })

  if (error) {
    if (error.code === '23505') return { error: 'An organisation with that name already exists.' }
    if (error.code === '42501') return { error: 'You do not have permission to provision organisations.' }
    return { error: 'The organisation could not be created.' }
  }

  const appUrl = readAppUrl(process.env)
  const { user } = await getSessionContext()

  // The transaction has already committed. If the mail fails, the tenant exists
  // and the raw token is gone with this request — say so plainly rather than
  // reporting a success nobody can act on. reissue_invitation is the recovery.
  try {
    await sendEmail({
      to: parsed.data.adminEmail,
      template: invitationTemplate({
        organizationName: parsed.data.name,
        acceptUrl: `${appUrl}/accept-invitation?token=${rawToken}`,
        invitedBy: user.email ?? 'HIMARK',
      }),
    })
  } catch {
    revalidatePath('/internal/provisioning')
    return { organizationId: organizationId as string, emailFailed: true }
  }

  revalidatePath('/internal/provisioning')
  return { organizationId: organizationId as string }
}
```

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npx tsc --noEmit && pnpm test`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add features/internal-provisioning/schemas features/internal-provisioning/actions tests/unit/provisioning-schema.test.ts
git commit -m "feat(provisioning): validate input and provision through the caller's session"
```

---

### Task 4: Wire the wizard and the organisations register

**Files:**
- Create: `supabase/migrations/<assigned>_list_provisioned_organizations.sql`
- Create: `features/internal-provisioning/queries/list-organizations.ts`
- Modify: `features/internal-provisioning/components/internal-registers.tsx` (`OrganisationsScreen` only)
- Modify: `app/(internal)/internal/organisations/page.tsx`
- Modify: `features/internal-provisioning/components/provisioning-wizard.tsx`
- Modify: `docs/follow-ups.md`

**Interfaces:**
- Consumes: `provisionOrganizationAction` from Task 3; `public.has_role(uuid, text[])`.
- Produces: nothing later tasks depend on. This is the last task.

**Which register, and why not the other one.** `/internal/provisioning` renders `ProvisioningRegister`, whose rows are provisioning *drafts* — `tier`, `modules`, `goLive`, and a numeric `progress` feeding a `ProgressBar`. None of those exist once an organisation is created directly, and `progress` cannot degrade to `'—'` because it is a number. Leave that register on its mock data, exactly as `ProjectTable` was left in the Projects slice, and for the same reason.

`/internal/organisations` renders `OrganisationsScreen`, which lists organisations with columns Organisation, Tier, Status, Modules, Primary Admin, Implementation Owner, Created, Last Activity. Every one of those is a plain string cell, so the columns we cannot supply render `'—'` honestly. That is the register to wire.

- [ ] **Step 1: Apply the listing function through the Supabase MCP**

RLS on `organizations` is `is_member_of(id)`, so a HIMARK administrator's own session sees only HIMARK and no client tenant at all. Reaching for the service-role client here is not an option — `lib/supabase/admin.ts` is guarded by the `service-role-boundary` test, and using it in a request path defeats that boundary. Instead, one more `security definer` function carrying the same authorisation rule.

Use `apply_migration` with name `list_provisioned_organizations`:

```sql
-- A HIMARK administrator is not a member of the tenants they provision, so
-- organizations_select (is_member_of(id)) hides every one of them. This is the
-- read counterpart to provision_organization, carrying the identical check so
-- the rule lives in one place.
create or replace function public.list_provisioned_organizations()
returns table (
  id uuid,
  name text,
  slug text,
  status text,
  created_at timestamptz,
  admin_email text
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  himark_id uuid;
begin
  select o.id into himark_id
  from public.organizations o
  where o.slug = 'himark' and o.status = 'active';

  if himark_id is null then
    raise exception 'internal organization not found' using errcode = '42501';
  end if;

  if auth.role() is distinct from 'service_role'
     and not public.has_role(himark_id, array['owner', 'admin']) then
    raise exception 'only a HIMARK administrator may list organizations'
      using errcode = '42501';
  end if;

  return query
  select
    o.id, o.name, o.slug, o.status, o.created_at,
    (
      select i.email from public.invitations i
      where i.organization_id = o.id and i.role_id = 'owner'
      order by i.created_at desc
      limit 1
    ) as admin_email
  from public.organizations o
  order by o.created_at desc;
end $$;

revoke all on function public.list_provisioned_organizations() from public;
grant execute on function public.list_provisioned_organizations() to authenticated, service_role;
```

- [ ] **Step 2: Save the migration locally under its assigned version**

- [ ] **Step 3: Write the register query**

Create `features/internal-provisioning/queries/list-organizations.ts`:

```ts
import 'server-only'
import { createServerSupabase } from '@/lib/supabase/server'

export type OrganisationRow = {
  id: string
  name: string
  tier: string
  status: string
  modules: string
  admin: string
  owner: string
  created: string
  activity: string
}

/**
 * Shaped to what OrganisationsScreen already renders. Tier, modules,
 * implementation owner and last activity have no backing column, so they render
 * '—' rather than a fabricated value — the same rule the delivery queries follow.
 */
export async function listOrganizations(): Promise<OrganisationRow[]> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('list_provisioned_organizations')
  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    tier: '—',
    status: row.status,
    modules: '—',
    admin: row.admin_email ?? '—',
    owner: '—',
    created: new Date(row.created_at).toLocaleDateString('en-ZA', {
      day: '2-digit', month: 'short', year: 'numeric',
    }),
    activity: '—',
  }))
}
```

- [ ] **Step 4: Make OrganisationsScreen take its records as a prop**

`features/internal-provisioning/components/internal-registers.tsx` is dense single-line code. Change `OrganisationsScreen` only, with exactly these edits and nothing else — no reformatting, no reflow:

1. Add `import type { OrganisationRow } from '../queries/list-organizations'`.
2. Change the signature from `export function OrganisationsScreen() {` to `export function OrganisationsScreen({ records: initial }: { records: OrganisationRow[] }) {`.
3. Change `const [records, setRecords] = useState(initialOrganisations)` to `const [records, setRecords] = useState(initial)`.
4. Change the typed parameter on line 20 from `(typeof initialOrganisations)[number]` to `OrganisationRow`.

Leave the four metric cards above the table alone — they read `"12"`, `"8"`, `"3"`, `"1"` from literals with no backing query. Replacing them with real counts is not in this slice, and replacing them with zeros would be worse than leaving them visibly static.

Note `ProvisioningStatusBadge status={record.status}` will receive `'active'` from the database rather than one of the mock's labels. Check how that component handles an unknown status; if it falls through to a default style, that is acceptable for this slice — record it in your report rather than adding a mapping.

- [ ] **Step 5: Point the organisations page at the query**

Replace `app/(internal)/internal/organisations/page.tsx` with:

```tsx
import { OrganisationsScreen } from '@/features/internal-provisioning/components/internal-registers'
import { listOrganizations } from '@/features/internal-provisioning/queries/list-organizations'

export default async function Page() {
  const records = await listOrganizations()
  return <OrganisationsScreen records={records} />
}
```

- [ ] **Step 6: Bind the wizard's final stage to the action**

`features/internal-provisioning/components/provisioning-wizard.tsx` is dense, multi-stage, client-side code holding all its state locally. Make the minimum change: on the final stage's submit, call `provisionOrganizationAction` with a `FormData` carrying `name` (the organisation name field) and `adminEmail` (the Primary Admin's email), instead of setting a local completion flag.

Handle all three outcomes:
- `error` — show it inline and stay on the stage.
- `emailFailed` — show that the organisation was created but the invitation email did not send, naming `reissue_invitation` as the recovery. Do not present this as success.
- `organizationId` — proceed to the existing success state.

Leave every other stage, field and toggle exactly as it is. The initial users, departments, teams, delivery roles and access toggles are deliberately not persisted in this slice.

- [ ] **Step 7: Record what is still not persisted**

Append to `docs/follow-ups.md`:

```markdown
## Provisioning collects more than it persists

The wizard gathers initial users, departments, teams, delivery roles, and
toggles for guest access, restricted projects, SSO-required and MFA-required.
Only the organisation and its primary admin are saved. The toggles in
particular describe enforcement that exists nowhere in the codebase — a tenant
provisioned with "MFA Required" on is not enforcing anything.

Either persist and enforce them, or remove them from the wizard so it stops
implying a guarantee.

The provisioning register at /internal/provisioning still lists mock drafts.
Its rows carry tier, modules, go-live and a numeric progress bar, none of which
exist now that provisioning creates an organisation directly. Either model a
draft entity or retire that register in favour of /internal/organisations.
```

- [ ] **Step 8: Run the full gate**

Run: `npx tsc --noEmit && pnpm test && pnpm build`
Expected: tsc exit 0; all tests pass; build succeeds.

- [ ] **Step 9: Verify what a signed-out session can prove**

Start the dev server with `preview_start` using `{name: "unison-dev"}` (never `pnpm dev` via bash). Confirm `/internal/organisations` redirects to `/internal/sign-in?next=%2Finternal%2Forganisations`, and check `preview_logs` for compilation errors on that route.

You cannot sign in — the app authenticates through Microsoft Entra and no agent may enter those credentials. Do not attempt it, and do not report list rendering or provisioning as verified. Record in your report that end-to-end provisioning is left to a human.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations features/internal-provisioning "app/(internal)/internal/organisations" docs/follow-ups.md
git commit -m "feat(provisioning): create real tenants from the internal wizard"
```

---

## Done when

- A HIMARK owner or admin can call `provision_organization` and get an organisation with six frameworks and one pending owner invitation
- A HIMARK member who is neither owner nor admin, and an owner of any other organisation, are both refused
- `reissue_invitation` supersedes a pending invitation without tripping the partial unique index
- The provisioned organisation carries no `email_domain`
- `/internal/organisations` lists real organisations, with the columns that have no backing data rendering `'—'`
- The wizard's final stage calls the action and distinguishes error, email-failure and success
- `npx tsc --noEmit`, `pnpm test`, `pnpm test:rls` and `pnpm build` are all green

**Not covered, and deliberately:** initial users, departments, teams, delivery roles, access toggles, tier enforcement, editing an organisation after creation, and any UI for `reissue_invitation` — it is callable but has no button.
