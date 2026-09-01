# Provisioning Security Cut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the caller-chosen-token path that lets any HIMARK owner or admin mint a pre-confirmed platform-wide account for an address they do not control, and close out three smaller items from the same review.

**Architecture:** `provision_organization` and `reissue_invitation` stop trusting `auth.uid()` and start taking an explicit `p_actor_id`, checked against a new actor-parameterised membership predicate. `execute` is revoked from `authenticated` on both, so the only caller is the server action running under the service role. The `service-role-boundary` test changes from a directory rule to an explicit allowlist of permitted request paths.

**Tech Stack:** Postgres 17 (Supabase), PL/pgSQL, `security definer` functions, PostgREST, Next.js 16 App Router server actions, `node:test`.

## Global Constraints

- **Migrations are an append-only log.** Never edit an applied migration file; add a new one. Apply through the Supabase MCP (`mcp__cacdbb13-...__apply_migration`).
- **Grants do not carry across a signature change.** Every drop-and-recreate must restate them and must name `anon` explicitly — Supabase re-grants `anon` by default on a newly created function.
- Every `security definer` function carries `set search_path = ''`, and every reference inside it is schema-qualified (`public.`, `auth.`).
- Authorisation checks come before parameter validation, so a malformed-parameter error can never act as an oracle for a caller who is not entitled to be there at all.
- Secrets live in `.env.local` only. Never paste one into a file, a commit, or chat.
- `pnpm test:rls` runs against the shared `unison-uat` project. Every fixture must be registered for `cleanup()` or it leaks into a shared database.
- Verify suites from a **clean tree** (`git stash --include-untracked`), never from the working copy.
- The em-dash-free house style of surrounding comments is not a rule; match the file you are editing.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/<ts>_has_role_for.sql` | New actor-parameterised predicate; redefines `has_role` in terms of it | 1 |
| `tests/integration/rls/has-role-for.test.ts` | Proves the predicate matches on status and role | 1 |
| `supabase/migrations/<ts>_provision_organization_actor.sql` | Drop/recreate with `p_actor_id`; service-role-only grants | 2 |
| `features/internal-provisioning/actions/provision-organization.ts` | Calls it through the admin client, supplying the session user as actor | 2 |
| `tests/unit/service-role-boundary.test.ts` | Allowlist of request paths permitted to hold the service role | 2 |
| `types/database.ts` | Regenerated — the RPC signatures changed | 2, 4 |
| `tests/integration/rls/provision-organization.test.ts` | Rewritten to drive the function through the service role | 2, 4 |
| `supabase/migrations/<ts>_reissue_invitation_actor.sql` | Drop/recreate with `p_actor_id` | 4 |
| `tests/unit/ui-completeness.test.ts` | Row-action pins match markup, not prose | 5, 6 |
| `features/internal-provisioning/components/internal-registers.tsx` | `Edit Internal Metadata` removed | 6 |

`<ts>` is `YYYYMMDDHHMMSS` at the time you create the file, matching every existing migration name.

---

### Task 1: The actor-parameterised predicate

`public.has_role(org, roles)` resolves `auth.uid()` internally. Under the service role that is null, so it returns false for every caller and cannot express "is this *named* actor a HIMARK administrator". Tasks 2 and 4 both need that question answered.

Adding a second function that duplicates the membership query would create two places for the rule to drift. Instead the new function holds the body and the old one delegates to it.

**Files:**
- Create: `supabase/migrations/<ts>_has_role_for.sql`
- Create: `tests/integration/rls/has-role-for.test.ts`

**Interfaces:**
- Produces: `public.has_role_for(org uuid, actor uuid, roles text[]) returns boolean`. Tasks 2 and 4 call it. Not granted to `authenticated` — its callers are `security definer` functions, which execute as the owner.
- Produces: `public.has_role(org uuid, roles text[]) returns boolean`, unchanged signature and unchanged behaviour, now delegating.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/rls/has-role-for.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { admin, cleanup, createFixtureOrg, createFixtureUser } from './helpers.ts'

let orgId: string
let owner: { id: string; email: string; password: string }
let member: { id: string; email: string; password: string }
let outsiderOrg: string
let outsider: { id: string; email: string; password: string }

before(async () => {
  orgId = await createFixtureOrg('has-role-for')
  owner = await createFixtureUser(orgId, 'owner')
  member = await createFixtureUser(orgId, 'member')
  outsiderOrg = await createFixtureOrg('has-role-for-outsider')
  outsider = await createFixtureUser(outsiderOrg, 'owner')
})

after(async () => {
  await cleanup(
    [orgId, outsiderOrg].filter(Boolean),
    [owner?.id, member?.id, outsider?.id].filter(Boolean) as string[],
  )
})

async function hasRoleFor(org: string, actor: string, roles: string[]) {
  const { data, error } = await admin.rpc('has_role_for', { org, actor, roles })
  assert.equal(error, null)
  return data
}

test('an active owner matches', async () => {
  assert.equal(await hasRoleFor(orgId, owner.id, ['owner', 'admin']), true)
})

test('a member does not match an owner-or-admin question', async () => {
  assert.equal(await hasRoleFor(orgId, member.id, ['owner', 'admin']), false)
})

test('membership of another organization does not carry over', async () => {
  assert.equal(await hasRoleFor(orgId, outsider.id, ['owner', 'admin']), false)
})

test('a suspended membership does not match', async () => {
  // The whole point of resolving membership live rather than from a JWT claim
  // is that revocation takes effect on the next call, not on the next login.
  await admin.from('memberships').update({ status: 'suspended' })
    .eq('organization_id', orgId).eq('user_id', owner.id)
  assert.equal(await hasRoleFor(orgId, owner.id, ['owner', 'admin']), false)

  await admin.from('memberships').update({ status: 'active' })
    .eq('organization_id', orgId).eq('user_id', owner.id)
  assert.equal(await hasRoleFor(orgId, owner.id, ['owner', 'admin']), true)
})

test('a null actor matches nothing', async () => {
  // Task 2 rejects a null p_actor_id before it reaches here, but the predicate
  // must not answer "true" for an absent actor under any circumstances.
  const { data, error } = await admin.rpc('has_role_for', {
    org: orgId, actor: null, roles: ['owner', 'admin'],
  })
  assert.equal(error, null)
  assert.notEqual(data, true)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:rls`
Expected: the `has-role-for` specs fail — PostgREST reports `Could not find the function public.has_role_for`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/<ts>_has_role_for.sql`:

```sql
-- has_role(org, roles) resolves auth.uid() internally, so it returns false for
-- every caller under the service role and cannot express "is this NAMED actor a
-- HIMARK administrator". provision_organization and reissue_invitation both need
-- that question once they stop being callable from an authenticated session.
--
-- The predicate moves here and has_role delegates, so the session path and the
-- service-role path cannot drift apart.
create function public.has_role_for(org uuid, actor uuid, roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = actor
      and organization_id = org
      and status = 'active'
      and role_id = any(roles)
  );
$$;

-- Same signature, so this replaces the body in place: every RLS policy that
-- depends on has_role keeps working and its existing grants carry.
create or replace function public.has_role(org uuid, roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.has_role_for(org, auth.uid(), roles); $$;

-- No grant to authenticated. Its callers are security definer functions, which
-- execute as the owner regardless. service_role gets execute so the RLS suite
-- can test the predicate directly rather than only through its callers.
revoke all on function public.has_role_for(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.has_role_for(uuid, uuid, text[]) to service_role;
```

- [ ] **Step 4: Apply the migration**

Apply it through the Supabase MCP `apply_migration` tool, with the file's name (without `.sql`) as the migration name and the file's contents as the query.

- [ ] **Step 5: Regenerate database types**

Run the Supabase MCP `generate_typescript_types` tool and write the result to `types/database.ts`. Without this, `admin.rpc('has_role_for', ...)` does not typecheck.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:rls`
Expected: the five `has-role-for` specs pass, and every other RLS file still passes — `has_role`'s behaviour is unchanged, so any regression there means the delegation is wrong.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations tests/integration/rls/has-role-for.test.ts types/database.ts
git commit -m "feat(db): add has_role_for, an actor-parameterised membership predicate"
```

---

### Task 2: `provision_organization` takes an explicit actor

The security cut itself. The function, its only caller, its tests and the boundary rule all move together — a signature change breaks the action the moment it lands, so splitting them would leave the tree broken between commits.

**Read before starting:** `docs/superpowers/specs/2026-09-01-provisioning-security-cut-design.md`, sections "Why → 1" and "Approach".

**Files:**
- Create: `supabase/migrations/<ts>_provision_organization_actor.sql`
- Modify: `features/internal-provisioning/actions/provision-organization.ts`
- Modify: `tests/unit/service-role-boundary.test.ts`
- Modify: `tests/integration/rls/provision-organization.test.ts`
- Modify: `types/database.ts` (regenerated)

**Interfaces:**
- Consumes: `public.has_role_for(org uuid, actor uuid, roles text[])` from Task 1.
- Produces: `public.provision_organization(p_name text, p_slug text, p_admin_email text, p_token_hash text, p_expires_at timestamptz, p_actor_id uuid, p_tier text default 'core') returns uuid`, granted to `service_role` only.
- Produces: `SERVICE_ROLE_REQUEST_PATHS`, an exported array of repo-relative paths in `tests/unit/service-role-boundary.test.ts`. Nothing else consumes it.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `tests/integration/rls/provision-organization.test.ts` between the `args` helper and the `reissue_invitation` banner comment. Keep the imports, `hash`, `sessions`/`sessionFor`, `anonymous`, the `before`/`after` blocks and the `reissue_invitation` section exactly as they are — Task 4 edits those.

Change `args` so every call carries an actor by default:

```ts
function args(name: string) {
  return {
    p_name: name,
    p_slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`,
    p_admin_email: `admin-${randomUUID()}@client.test`,
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    p_actor_id: himarkAdmin.id,
  }
}
```

Then replace the provisioning tests with these. Note every successful call now goes through `admin`, not through a session:

```ts
test('a signed-in HIMARK admin cannot call provision_organization at all', async () => {
  // The grant pin, and the whole point of this change. Before it, this call
  // succeeded with a caller-chosen p_token_hash and a p_admin_email the caller
  // did not control, which made it a platform-wide account takeover via the
  // pre-confirmed signed-out invited-signup path.
  const client = await sessionFor(himarkAdmin)
  const { error } = await client.rpc('provision_organization', args('RLS Provision Denied'))
  assert.ok(error, 'provisioning must be unreachable from an authenticated session')
  assert.match(error!.message, /permission denied for function provision_organization/i)
})

test('a HIMARK admin provisions an organization with frameworks and an owner invitation', async () => {
  const payload = args('RLS Provision Alpha')
  const { data: orgId, error } = await admin.rpc('provision_organization', payload)
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
    .from('invitations')
    .select('email, role_id, status, token_hash, expires_at, invited_by')
    .eq('organization_id', orgId)
  assert.equal(invites?.length, 1)
  assert.equal(invites![0].role_id, 'owner')
  assert.equal(invites![0].status, 'pending')
  assert.equal(invites![0].email, payload.p_admin_email.toLowerCase())
  assert.equal(invites![0].token_hash, payload.p_token_hash)
  assert.equal(
    new Date(invites![0].expires_at as string).getTime(),
    new Date(payload.p_expires_at).getTime(),
  )

  // Attribution is now the parameter, not auth.uid(). Under the service role
  // auth.uid() is null, so without p_actor_id every provisioned tenant would
  // record that an owner invitation was minted and not by whom.
  assert.equal(invites![0].invited_by, himarkAdmin.id)
})

test('the provisioning audit rows name the actor', async () => {
  const { data: events } = await admin
    .from('audit_events').select('resource, actor_id')
    .eq('organization_id', provisioned[0]).in('resource', ['organizations', 'invitations'])
  assert.equal(events?.length, 2, 'the organisation and its owner invitation are both recorded')
  for (const event of events!) {
    assert.equal(event.actor_id, himarkAdmin.id, `${event.resource} must be attributable`)
  }
})

test('the provisioned organization carries no email_domain', async () => {
  // Populating it would let anyone at that domain auto-join through
  // claim_directory_membership if Entra ever went multi-tenant.
  const { data } = await admin
    .from('organizations').select('email_domain').eq('id', provisioned[0]).single()
  assert.equal(data?.email_domain, null)
})

test('a null actor is refused', async () => {
  const payload = { ...args('RLS Provision No Actor'), p_actor_id: null }
  const { data, error } = await admin.rpc('provision_organization', payload)
  assert.ok(error, 'an unattributable provision must not create a tenant')
  assert.equal(error!.code, '22023')
  assert.equal(data, null)

  const { data: orphan } = await admin
    .from('organizations').select('id').eq('slug', payload.p_slug)
  assert.deepEqual(orphan, [], 'the rejection must roll back the organisation too')
})

test('a HIMARK member who is not owner or admin is refused, even through the service role', async () => {
  // Before this change service_role skipped the authorisation check entirely.
  // Once service_role is the ONLY caller, that bypass would have meant no check
  // at all, so it was removed in the same migration.
  const payload = { ...args('RLS Provision Member'), p_actor_id: himarkMember.id }
  const { error } = await admin.rpc('provision_organization', payload)
  assert.ok(error, 'a plain member must not be able to create tenants')
  assert.match(error!.message, /HIMARK administrator/i)
})

test('an owner of another organization is refused, even through the service role', async () => {
  const payload = { ...args('RLS Provision Outsider'), p_actor_id: outsider.id }
  const { error } = await admin.rpc('provision_organization', payload)
  assert.ok(error, 'owning some organization must not confer provisioning rights')
  assert.match(error!.message, /HIMARK administrator/i)
})

test('the provisioned organization is invisible to an outsider', async () => {
  const client = await sessionFor(outsider)
  const { data } = await client.from('organizations').select('id').eq('id', provisioned[0])
  assert.deepEqual(data, [], 'a new tenant must not leak to other organizations')
})

test('a HIMARK admin lists the tenants their own RLS hides from them', async () => {
  const client = await sessionFor(himarkAdmin)

  // The premise: organizations_select is is_member_of(id), and a HIMARK
  // administrator is not a member of the tenants they provision.
  const { data: direct } = await client.from('organizations').select('id').eq('id', provisioned[0])
  assert.deepEqual(direct, [], 'the register cannot be built from a direct select')

  const { data, error } = await client.rpc('list_provisioned_organizations')
  assert.equal(error, null)
  const rows = (data ?? []) as Array<{ id: string; status: string; admin_email: string | null }>
  const row = rows.find((organization) => organization.id === provisioned[0])
  assert.ok(row, 'the provisioned tenant must reach the internal register')

  const { data: invitation } = await admin
    .from('invitations').select('email')
    .eq('organization_id', provisioned[0]).eq('role_id', 'owner').single()
  assert.equal(row.admin_email, invitation!.email, 'the Primary Admin column is the owner invitation')
  assert.equal(row.status, 'active')
})

test('a HIMARK member who is not owner or admin cannot list organizations', async () => {
  const client = await sessionFor(himarkMember)
  const { error } = await client.rpc('list_provisioned_organizations')
  assert.ok(error, 'the read counterpart must carry the same authorisation as provisioning')
  assert.match(error.message, /HIMARK administrator/i)
})

test('an owner of another organization cannot list organizations', async () => {
  const client = await sessionFor(outsider)
  const { error } = await client.rpc('list_provisioned_organizations')
  assert.ok(error, 'owning some organization must not confer sight of every tenant')
  assert.match(error!.message, /HIMARK administrator/i)
})
```

Further down the file, the expiry and tier tests also call through a session. Change each of these to `admin.rpc`, leaving their assertions alone:

- in `provision_organization refuses an expiry ${label}`: replace the two lines
  `const client = await sessionFor(himarkAdmin)` and
  `const { data, error } = await client.rpc('provision_organization', payload)`
  with a single `const { data, error } = await admin.rpc('provision_organization', payload)`
- in `an organization provisioned without a tier is core`, `an explicit tier is stored` and `an unknown tier is refused`: same substitution, `client.rpc` becomes `admin.rpc` and the `sessionFor` line is deleted.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:rls`
Expected: the new specs fail. `a signed-in HIMARK admin cannot call provision_organization at all` fails because the call still succeeds; `a null actor is refused` and the two `even through the service role` specs fail because PostgREST reports `Could not find the function ... p_actor_id`.

If instead you see `PGRST303: JWT issued at future`, that is known Supabase-side clock skew unrelated to this work — re-run the single file.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/<ts>_provision_organization_actor.sql`. This is a drop-and-recreate: adding `p_actor_id` makes a new function rather than replacing the old one, so `create or replace` would leave both live for PostgREST to resolve between.

```sql
-- The caller-chosen token hash (CRITICAL). provisionOrganizationAction generates
-- the token server-side and returns only { organizationId }, so an operator
-- driving the wizard never sees it. The `authenticated` grant is what reopened
-- the hole: the same operator could skip the action, call this RPC directly with
-- a p_token_hash of their choosing and a p_admin_email they do NOT control, then
-- open the invitation signed out -- lib/invitations/create-invited-account.ts
-- mints a PRE-CONFIRMED, platform-wide auth identity for that address with a
-- password they choose. The organisation is a decoy; the account is the prize,
-- and the real owner of that address can never register under it afterwards.
--
-- send-invitation.ts never lets an inviter choose a token. Neither does this now:
-- execute is service_role only, so the only caller is the server action.
--
-- p_token_hash stays a parameter deliberately. Generating it here would mean
-- returning a raw secret in a function result, which is worse if statement
-- logging is ever enabled.
drop function public.provision_organization(text, text, text, text, timestamptz, text);

create function public.provision_organization(
  p_name text,
  p_slug text,
  p_admin_email text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_actor_id uuid,
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

  -- Attribution is not optional. Under service_role auth.uid() is null, so
  -- without this every provisioned tenant would record that an owner invitation
  -- was minted and not by whom. Checked before authorisation because an absent
  -- actor is not a refusal to authorise, it is a malformed call.
  if p_actor_id is null then
    raise exception 'p_actor_id is required' using errcode = '22023';
  end if;

  -- Unconditional. The previous version skipped this check for service_role,
  -- which was sound while an authenticated HIMARK admin was the ordinary caller
  -- and service_role meant scripts. Now service_role is the ONLY caller, so that
  -- branch would mean no authorisation check at all.
  if not public.has_role_for(himark_id, p_actor_id, array['owner', 'admin']) then
    raise exception 'only a HIMARK administrator may provision an organization'
      using errcode = '42501';
  end if;

  -- Applied after authorisation so a malformed expiry can never act as an oracle
  -- for a caller who is not entitled to be here at all.
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

  -- email_domain is deliberately left null. It is what
  -- claim_directory_membership() matches on, and a client tenant that carried
  -- one would silently absorb anyone at that domain if Entra ever went
  -- multi-tenant.
  insert into public.organizations (name, slug, status, tier)
  values (p_name, p_slug, 'active', p_tier)
  returning id into new_org;

  -- organizations has no audit trigger (only set_updated_at), so the creation is
  -- recorded explicitly. organization_id is repeated inside new_value so the row
  -- stays traceable to its fixture after delete_organization nulls the column.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, p_actor_id, 'organizations', new_org, 'insert',
    jsonb_build_object('name', p_name, 'slug', p_slug, 'tier', p_tier, 'via', 'provisioning', 'organization_id', new_org)
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
    new_org, lower(p_admin_email), 'owner', p_token_hash, p_expires_at, p_actor_id
  )
  returning id into new_invitation;

  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, p_actor_id, 'invitations', new_invitation, 'insert',
    jsonb_build_object('via', 'provisioning', 'role_id', 'owner', 'email', lower(p_admin_email), 'organization_id', new_org)
  );

  return new_org;
end $$;

-- Grants do NOT carry to a new signature, and `revoke ... from public` alone does
-- not strip Supabase's default grant to anon. authenticated is named explicitly
-- because removing it is the entire point of this migration.
revoke all on function public.provision_organization(text, text, text, text, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.provision_organization(text, text, text, text, timestamptz, uuid, text)
  to service_role;
```

- [ ] **Step 4: Apply the migration and regenerate types**

Apply through the Supabase MCP `apply_migration` tool, then run `generate_typescript_types` and write the result to `types/database.ts`.

- [ ] **Step 5: Run the RLS tests to verify they pass**

Run: `pnpm test:rls`
Expected: all of `provision-organization.test.ts` passes except the `reissue_invitation` specs, which Task 4 handles — those may fail now and that is expected at this step. Every other RLS file passes.

- [ ] **Step 6: Rewire the action**

In `features/internal-provisioning/actions/provision-organization.ts`:

Replace the `createServerSupabase` import with the admin client:

```ts
import { createAdminSupabase } from '@/lib/supabase/admin'
```

Move `getSessionContext()` above the RPC call — it is currently called after it — and pass the actor. The block from `const supabase = ...` through the error mapping becomes:

```ts
  // Resolved before the call, not after: the function now requires a named
  // actor, and it comes from the session rather than from formData so a
  // crafted submit cannot choose who the audit trail blames.
  const { user } = await getSessionContext()

  // The service role, deliberately. provision_organization is service-role only
  // as of migration <ts>_provision_organization_actor: an authenticated caller
  // could otherwise skip this action and choose their own p_token_hash. The
  // authorisation is not lost, it moved into the function, which checks
  // has_role_for against p_actor_id on every call. See
  // tests/unit/service-role-boundary.test.ts for why this import is allowed.
  const supabase = createAdminSupabase()

  const { data: organizationId, error } = await supabase.rpc('provision_organization', {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_admin_email: parsed.data.adminEmail,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
    p_actor_id: user.id,
    p_tier: parsed.data.tier,
  })

  if (error) {
    if (error.code === '23505') return { error: 'An organisation with that name already exists.' }
    if (error.code === '42501') return { error: 'You do not have permission to provision organisations.' }
    return { error: 'The organisation could not be created.' }
  }

  const appUrl = readAppUrl(process.env)
```

Delete the now-duplicated `const { user } = await getSessionContext()` further down, and leave the `sendEmail` block and both returns exactly as they are.

Do **not** add a membership check to the action. The function is the gate; a second check is a second thing to drift.

- [ ] **Step 7: Write the failing boundary test**

`tests/unit/service-role-boundary.test.ts` currently forbids every file under `features/` from importing the admin client. Step 6 makes that fail. Replace the first test with an allowlist, keeping the second test untouched:

```ts
/**
 * Request paths permitted to hold the service role, and why.
 *
 * This list replaced a rule that keyed on the `features/` directory. That rule
 * did not mean what its name suggested: `lib/` already held a service-role
 * caller on a request path — create-invited-account.ts, which runs on the
 * signed-out accept-invitation request — so moving a call one directory
 * sideways would have satisfied the test while changing nothing.
 *
 * Adding an entry here is a deliberate act. Each one needs a reason that says
 * why RLS cannot express the authorisation instead.
 */
export const SERVICE_ROLE_REQUEST_PATHS = [
  // Creates the auth identity for an invited address. Runs signed out, so there
  // is no session for RLS to scope to; the invitation token is the credential.
  'lib/invitations/create-invited-account.ts',
  // Provisioning creates an organisation the operator is not a member of, so
  // there is no membership for a policy to check. Authorisation moved into
  // provision_organization, which checks has_role_for against a named actor.
  'features/internal-provisioning/actions/provision-organization.ts',
]

test('only allowlisted request paths import the service-role client', () => {
  const roots = ['features', 'lib', 'app', 'components']
  const offenders = roots
    .flatMap((root) => walk(join(process.cwd(), root)))
    .filter((file) => /from ['"](@\/lib\/supabase\/admin|.*\/lib\/supabase\/admin)['"]/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(process.cwd(), file).split(sep).join('/'))
    .filter((file) => !SERVICE_ROLE_REQUEST_PATHS.includes(file))
  assert.deepEqual(offenders, [], `service-role client imported outside the allowlist by: ${offenders.join(', ')}`)
})

test('the allowlist names files that exist', () => {
  // An allowlist entry for a deleted or renamed file silently widens nothing,
  // but it does rot: the next reader trusts a reason that no longer applies.
  for (const file of SERVICE_ROLE_REQUEST_PATHS) {
    assert.ok(existsSync(join(process.cwd(), file)), `${file} is allowlisted but does not exist`)
  }
})

test('the allowlist is exactly the two known request-path callers', () => {
  // Pinned by value so widening it is a visible diff in this file rather than a
  // silent pass. A third service-role request path may well be legitimate; it
  // must be argued for here, next to the reasons the other two carry.
  assert.deepEqual([...SERVICE_ROLE_REQUEST_PATHS].sort(), [
    'features/internal-provisioning/actions/provision-organization.ts',
    'lib/invitations/create-invited-account.ts',
  ])
})
```

Add `relative` and `sep` to the `node:path` import and `existsSync` to the `node:fs` import. The test now walks `app` and `components` too, which the directory rule never covered.

- [ ] **Step 8: Update the admin client's doc comment**

`lib/supabase/admin.ts`'s comment says "Never import this from anything under features/ — a test enforces that", which is no longer the rule. Replace that line with:

```ts
 * Only the request paths in SERVICE_ROLE_REQUEST_PATHS
 * (tests/unit/service-role-boundary.test.ts) may import this. Adding one is a
 * deliberate edit to that list, with a reason.
```

- [ ] **Step 9: Run everything**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `pnpm test`
Expected: all pass, including both `service-role-boundary` specs.

Run: `pnpm test:rls`
Expected: `provision-organization.test.ts` passes except the `reissue_invitation` specs.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations types/database.ts features/internal-provisioning/actions/provision-organization.ts lib/supabase/admin.ts tests/unit/service-role-boundary.test.ts tests/integration/rls/provision-organization.test.ts
git commit -m "fix(provisioning): require an explicit actor and revoke authenticated"
```

---

### Task 3: Verify the wizard still provisions end to end

The migration and the action changed together; nothing has yet confirmed that a real operator can still create a tenant. A signed-in run is the only thing that exercises the action, and the last two regressions in this project both shipped green suites and failed on the first signed-in request.

> **The controller runs this task, not a subagent.** It needs the human partner to sign in — no agent may enter credentials — and it sends real mail on the success branch. Do not dispatch it.

**Files:** none modified. This task produces evidence, and a report.

**Interfaces:**
- Consumes: the action and function from Task 2.

- [ ] **Step 1: Start the dev server**

Use the Browser pane's `preview_start` with the project's launch configuration. Do not run `next dev` through Bash.

- [ ] **Step 2: Confirm the environment holds a secret key**

The admin client calls `readSupabaseSecretKey`. Confirm the variable it reads is present in `.env.local`. Do not print its value, and do not add it to any file. If it is missing, stop and report — this is a configuration prerequisite, not a code defect.

- [ ] **Step 3: Ask the human partner to sign in**

You must not enter credentials. Ask them to sign in at `/internal/sign-in` and confirm when they are through.

- [ ] **Step 4: Provision a throwaway tenant**

Drive `/internal/provisioning/new`. Use a name and slug that are obviously disposable, and an admin email at a domain that cannot receive mail — `admin@provisioning-check.test`. **Do not use a real address:** the action sends a real invitation through Microsoft Graph on success.

Expect either success or the `emailFailed` branch. `emailFailed` is a **pass** for this task: the tenant is what is being verified, and a `.test` domain cannot receive mail.

- [ ] **Step 5: Confirm what reached the database**

Run through the Supabase MCP `execute_sql`, substituting the slug you used:

```sql
select o.id, o.name, o.tier,
       (select count(*) from public.frameworks f where f.organization_id = o.id) as frameworks,
       (select count(*) from public.invitations i where i.organization_id = o.id) as invitations,
       (select count(*) from public.audit_events a
         where a.organization_id = o.id and a.actor_id is null) as unattributed_events
from public.organizations o
where o.slug = '<the slug you used>';
```

Expected: one row, `tier` = `core`, `frameworks` = 6, `invitations` = 1, `unattributed_events` = 0.

- [ ] **Step 6: Check the runtime log for the failure this change could cause**

Read the dev server log through `preview_logs`. A missing secret key surfaces as `MissingEnvError`, and the admin client throwing inside a server action surfaces as a generic action failure in the UI — neither is visible in the suite.

- [ ] **Step 7: Remove the throwaway tenant**

```sql
select public.delete_organization('<the organization id from step 5>');
```

Confirm it is gone, then report. If `delete_organization` refuses or does not exist with that signature, report the tenant id rather than improvising a manual cascade.

- [ ] **Step 8: Report**

No commit. Report what you saw at each step, including which branch the action took, and paste the query result.

---

### Task 4: `reissue_invitation` takes an explicit actor

The same mechanism, on the function that is already service-role only. It writes `invited_by` and `audit_events.actor_id` from `auth.uid()`, which is null under the service role — so the only supported recovery path for a failed provisioning email records that an owner invitation was minted and not by whom.

**Files:**
- Create: `supabase/migrations/<ts>_reissue_invitation_actor.sql`
- Modify: `tests/integration/rls/provision-organization.test.ts` (the `reissue_invitation` section)
- Modify: `types/database.ts` (regenerated)

**Interfaces:**
- Consumes: `public.has_role_for(org uuid, actor uuid, roles text[])` from Task 1.
- Produces: `public.reissue_invitation(p_organization_id uuid, p_email text, p_token_hash text, p_expires_at timestamptz, p_actor_id uuid) returns void`, granted to `service_role` only.

- [ ] **Step 1: Update the tests to expect attribution**

In `tests/integration/rls/provision-organization.test.ts`, every `admin.rpc('reissue_invitation', {...})` call gains `p_actor_id: himarkAdmin.id`. There are six of them: the supersede test, the foreign-organisation second layer, the HIMARK-itself test, the never-invited test, and the two expiry tests.

In `reissue supersedes the pending invitation rather than duplicating it`, the null assertion inverts. Replace:

```ts
  // invited_by is auth.uid(), and a service-role call has none. This is the
  // shape of a genuine operator recovery now: attributable to the script, not
  // to a signed-in HIMARK session.
  assert.equal(pendingAfter![0].invited_by, null)
```

with:

```ts
  // A service-role call has no auth.uid(), so before p_actor_id this was null:
  // the only supported recovery path recorded that an owner invitation was
  // minted and not by whom. An operator running the script now names themselves.
  assert.equal(pendingAfter![0].invited_by, himarkAdmin.id)
```

The four calls made through a *session* (`a signed-in HIMARK admin cannot call reissue_invitation at all`, `a HIMARK admin cannot reissue into a foreign existing organisation`'s first half, `an outsider cannot reissue`, `a HIMARK member ... cannot reissue`) keep asserting `permission denied for function reissue_invitation`. Add `p_actor_id: himarkAdmin.id` to their payloads too, so they fail at the grant rather than at a missing argument — a `Could not find the function` error would make those specs pass for the wrong reason.

Add one new spec at the end of the `reissue_invitation` section:

```ts
test('reissue refuses an actor who is not a HIMARK administrator', async () => {
  // Same bypass removal as provision_organization: service_role used to skip
  // the check, which is only safe while it is not the sole caller.
  const { data: pending } = await admin
    .from('invitations').select('email').eq('organization_id', provisioned[0]).eq('status', 'pending')
  const { error } = await admin.rpc('reissue_invitation', {
    p_organization_id: provisioned[0],
    p_email: pending![0].email,
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    p_actor_id: outsider.id,
  })
  assert.ok(error, 'an operator script must still name a HIMARK administrator')
  assert.match(error!.message, /HIMARK administrator/i)
})

test('reissue refuses a null actor', async () => {
  const { data: pending } = await admin
    .from('invitations').select('email').eq('organization_id', provisioned[0]).eq('status', 'pending')
  const { error } = await admin.rpc('reissue_invitation', {
    p_organization_id: provisioned[0],
    p_email: pending![0].email,
    p_token_hash: '\\x' + randomUUID().replace(/-/g, '').repeat(2),
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    p_actor_id: null,
  })
  assert.ok(error, 'an unattributable reissue must not mint an invitation')
  assert.equal(error!.code, '22023')
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:rls`
Expected: the `reissue_invitation` specs fail with `Could not find the function public.reissue_invitation` naming `p_actor_id`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/<ts>_reissue_invitation_actor.sql`:

```sql
-- reissue_invitation has been service_role only since 20260826172947, which is
-- why it is not part of the account-takeover path provision_organization was.
-- What it still had was null attribution: invited_by and audit_events.actor_id
-- came from auth.uid(), which a service-role call does not have. The only
-- supported recovery path for a failed provisioning email therefore recorded
-- that an owner invitation was minted and not by whom.
--
-- Adding a parameter makes a new function, so this is a drop-and-recreate.
drop function public.reissue_invitation(uuid, text, text, timestamptz);

create function public.reissue_invitation(
  p_organization_id uuid,
  p_email text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  himark_id uuid;
  new_invitation uuid;
  prior_owner_invitation uuid;
begin
  select id into himark_id
  from public.organizations
  where slug = 'himark' and status = 'active';

  if himark_id is null then
    raise exception 'internal organization not found' using errcode = '42501';
  end if;

  if p_actor_id is null then
    raise exception 'p_actor_id is required' using errcode = '22023';
  end if;

  -- Unconditional, for the same reason as provision_organization: service_role
  -- is the only caller, so a bypass for it would be no check at all.
  if not public.has_role_for(himark_id, p_actor_id, array['owner', 'admin']) then
    raise exception 'only a HIMARK administrator may reissue an invitation'
      using errcode = '42501';
  end if;

  if p_organization_id = himark_id then
    raise exception 'reissue_invitation cannot target HIMARK''s own organization; use the ordinary invitation path'
      using errcode = '42501';
  end if;

  select id into prior_owner_invitation
  from public.invitations
  where organization_id = p_organization_id
    and lower(email) = lower(p_email)
    and role_id = 'owner'
  limit 1;

  if prior_owner_invitation is null then
    raise exception 'no prior owner invitation exists for that organization and address'
      using errcode = '42501';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'p_expires_at must be in the future' using errcode = '22023';
  end if;

  if p_expires_at > now() + interval '30 days' then
    raise exception 'p_expires_at must be no more than 30 days in the future'
      using errcode = '22023';
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
    p_organization_id, lower(p_email), 'owner', p_token_hash, p_expires_at, p_actor_id
  )
  returning id into new_invitation;

  -- invitations has no audit trigger, so this function writes its own row.
  -- organization_id is repeated inside new_value because the row's own column is
  -- nulled by delete_organization's on-delete-set-null; without the key in the
  -- JSONB, cleanup()'s sweep in tests/integration/rls/helpers.ts could never
  -- trace this row back to its fixture and it would leak into a shared database.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    p_organization_id, p_actor_id, 'invitations', new_invitation, 'insert',
    jsonb_build_object('via', 'reissue', 'role_id', 'owner', 'email', lower(p_email), 'organization_id', p_organization_id)
  );
end $$;

revoke all on function public.reissue_invitation(uuid, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.reissue_invitation(uuid, text, text, timestamptz, uuid)
  to service_role;
```

- [ ] **Step 4: Apply the migration and regenerate types**

Apply through the Supabase MCP `apply_migration` tool, then `generate_typescript_types` into `types/database.ts`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:rls`
Expected: the whole file passes now, including the previously-failing `reissue_invitation` specs.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations types/database.ts tests/integration/rls/provision-organization.test.ts
git commit -m "fix(provisioning): make reissue_invitation attributable to an operator"
```

---

### Task 5: Make the row-action pins match markup

`ui-completeness.test.ts` pins the internal registers' row actions with `assert.match(registers, new RegExp(action))` against the **whole file**, for a list including bare `'Suspend'`. The same file carries a comment reading "a local-state Suspend/Archive that flips a badge", so the assertion matches prose whether or not the action exists. Deleting `TenantsScreen`'s Suspend action today leaves the test green.

Task 6 adds a pin of exactly this kind. Fixing the mechanism first is the point of doing this task before that one.

**Files:**
- Modify: `tests/unit/ui-completeness.test.ts:311-316`

**Interfaces:**
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Prove the tripwire is broken**

Temporarily delete the `Suspend` row action from `TenantsScreen` in `features/internal-provisioning/components/internal-registers.tsx` — the `{ id: 'suspend', label: 'Suspend', tone: 'danger', onSelect: () => setConfirm(record) }` entry.

Run: `pnpm test`
Expected: **PASSES**. That is the defect. Record the result, then restore the deleted entry with `git checkout -- features/internal-provisioning/components/internal-registers.tsx`.

- [ ] **Step 2: Rewrite the assertion to match markup**

Replace the body of `internal registers provide non-destructive operational actions and tier impact review`:

```ts
test('internal registers provide non-destructive operational actions and tier impact review', () => {
  const provisioning = readFileSync(join(workspace, 'features', 'internal-provisioning', 'components', 'provisioning-register.tsx'), 'utf8')
  const registers = readFileSync(join(workspace, 'features', 'internal-provisioning', 'components', 'internal-registers.tsx'), 'utf8')

  // Matched as `label: 'X'`, which only a row action produces. Matching the bare
  // name against the whole file meant a comment satisfied the assertion: this
  // test passed with TenantsScreen's Suspend action deleted, because the phrase
  // "local-state Suspend/Archive" survives in a comment thirty lines above.
  const rowAction = (label: string) => new RegExp(`label: '${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`)

  for (const action of ['Continue Setup', 'Duplicate Setup', 'Pause', 'Resume', 'Archive']) {
    assert.match(provisioning, rowAction(action), `${action} must be offered as a row action`)
  }
  for (const action of ['View Tenant', 'View Provisioning', 'Manage Subscription', 'Change Tier', 'Update Subscription', 'Suspend']) {
    assert.match(registers, rowAction(action), `${action} must be offered as a row action`)
  }

  // Copy rather than row actions, so these stay whole-file matches.
  for (const copy of ['Module Impact', 'Data is not deleted when a module is disabled']) {
    assert.match(registers, new RegExp(copy))
  }
})
```

`Module Impact` and `Data is not deleted when a module is disabled` move out of the row-action loop because they are dialog copy, not `label:` entries — leaving them in would make the assertion fail for a correct file.

`Change Tier` stays pinned here. The tier spec removes that action and must move this assertion as part of that change; the point of this task is that the pin will actually turn red when it does.

- [ ] **Step 3: Prove the tripwire now works**

Delete the same `Suspend` row action again.

Run: `pnpm test`
Expected: **FAILS**, with `Suspend must be offered as a row action`.

Restore it: `git checkout -- features/internal-provisioning/components/internal-registers.tsx`

- [ ] **Step 4: Run the full suite**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/ui-completeness.test.ts
git commit -m "test: pin internal row actions to markup rather than prose"
```

---

### Task 6: Remove `Edit Internal Metadata`

`OrganisationsScreen` renders real `organizations` rows. Its `Edit Internal Metadata` row action opens a drawer over a real tenant's fields, editable, with a "Save Metadata" button whose only handler is `onClose`. Typed changes vanish with no signal and the drawer closing reads as confirmation — worse than the Suspend/Archive theatre removed from the same screen, because that flipped a badge which reverted on refresh, so the lie was at least visible.

**Files:**
- Modify: `features/internal-provisioning/components/internal-registers.tsx:39-40`
- Modify: `tests/unit/ui-completeness.test.ts:277-295`

**Interfaces:**
- Consumes: the `rowAction` helper style from Task 5. The negative pin below is a separate assertion and does not use it.

- [ ] **Step 1: Write the failing test**

In `the organisations register reports only what the database holds`, extend the existing negative loop. Replace:

```ts
  for (const action of ["'Suspend'", "'Archive'"]) {
    assert.ok(!screen.includes(action), `${action} has no backing action, so it must not be offered`)
  }
```

with:

```ts
  for (const action of ["'Suspend'", "'Archive'", "'Edit Internal Metadata'"]) {
    assert.ok(!screen.includes(action), `${action} has no backing action, so it must not be offered`)
  }
  // The drawer opened editable and its Save button only closed it, so typed
  // changes vanished while the close read as confirmation. Nothing in this
  // screen may open an editable drawer until a mutation backs it.
  assert.doesNotMatch(screen, /open\(record, true\)/, 'no row action may open an editable drawer here')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test`
Expected: FAILS with `'Edit Internal Metadata' has no backing action, so it must not be offered`.

- [ ] **Step 3: Remove the action**

In `features/internal-provisioning/components/internal-registers.tsx`, delete this entry from `OrganisationsScreen`'s `RowActionMenu` actions array:

```ts
{ id: 'edit', label: 'Edit Internal Metadata', onSelect: () => open(record, true) },
```

Then simplify `OrganisationsScreen`'s `open`, which no longer has a caller passing `true`:

```ts
  const open = (record: OrganisationRow) => setDrawer({ title: record.name, subtitle: 'Organisation internal metadata', fields: [['Tier', record.tier], ['Status', record.status], ['Modules', record.modules], ['Primary Admin', record.admin], ['Implementation Owner', record.owner], ['Created', record.created], ['Last Activity', record.activity]] })
```

**Leave `DrawerState.editable` and `InternalDrawer`'s editable branch in place.** `SubscriptionsScreen`'s `Update Subscription` action still passes `true` at line 58 and has the same discard defect over demo rows. Removing the type or the branch here would break it; fixing it is the tier spec's job, which is already editing that screen.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: all pass — both the new negative assertions and Task 5's positive pins, which must not be disturbed by this removal.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Record what this task deliberately left**

Append to `docs/follow-ups.md`, under the existing `## Provisioning: two Important items found after merge` section:

```markdown
**Update: item 2 removed 2026-09-01.** `Edit Internal Metadata` is gone from
`OrganisationsScreen` and its absence is pinned. The identical defect survives
one screen over: `SubscriptionsScreen`'s `Update Subscription` opens the same
editable drawer with the same close-only Save. It is over demo rows rather than
real ones, which is the only reason it is less severe. The tier spec is already
editing that screen to remove `Change Tier` and should take it.
```

- [ ] **Step 6: Commit**

```bash
git add features/internal-provisioning/components/internal-registers.tsx tests/unit/ui-completeness.test.ts docs/follow-ups.md
git commit -m "fix(internal): remove the metadata drawer that discarded input"
```

---

### Task 7: Verify the whole branch from a clean tree

Every "suite green" claim made earlier in this project's history was against a dirty working tree, and a clean checkout of `main` was red for three merged branches. This task exists so that does not happen again.

**Files:** none modified.

- [ ] **Step 1: Confirm the tree is clean**

Run: `git status --short`
Expected: empty. If anything is listed, stash it with `git stash --include-untracked` and note what you stashed.

- [ ] **Step 2: Run every gate**

```bash
npx tsc --noEmit && pnpm test && pnpm build
```

Expected: exit 0, all unit tests passing, build succeeding.

Run: `pnpm test:rls`
Expected: all specs pass. A `PGRST303: JWT issued at future` is known Supabase-side clock skew — re-run the affected file alone before treating it as a failure.

- [ ] **Step 3: Confirm the grant actually landed**

The whole point of the branch is one revoked grant. Verify it directly rather than inferring it from a passing test, through the Supabase MCP `execute_sql`:

```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       coalesce(array_to_string(p.proacl, ', '), 'default (owner only)') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('provision_organization', 'reissue_invitation', 'has_role_for', 'has_role')
order by p.proname;
```

Expected: exactly one `provision_organization` and one `reissue_invitation`, each with `p_actor_id` in its arguments, and neither ACL granting `authenticated`. Two rows for either name means a drop was missed and PostgREST can resolve to the old one — that is a failure, not a cosmetic issue.

- [ ] **Step 4: Report**

No commit. Report each command's outcome and paste the query result from step 3.

---

## Notes for the executor

**If the plan and the code disagree, stop and say so.** Two things in this plan were written from a reading of the repository at 2026-09-01 and could have moved: the exact line numbers, and the assumption that `SubscriptionsScreen` still passes `open(record, true)`.

**Do not edit an applied migration.** If a migration is wrong after applying it, add another. The one thing that cannot be undone here is rewriting history that Supabase has already recorded.

**`p_token_hash` stays.** It looks like the obvious thing to remove and it is not: once only `service_role` can call the function, the token is chosen by trusted code, and moving generation into Postgres would put a raw secret in a function result.
