# Microsoft Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo "Continue with Microsoft" button with real Entra ID authentication, granting HIMARK staff a `member` membership automatically on first sign-in.

**Architecture:** A single-tenant Entra app registration makes Microsoft reject non-HIMARK accounts before any UNISON code runs. Supabase's Azure provider handles the OAuth handshake; a callback route exchanges the code for a session and calls a `security definer` RPC that turns a verified Microsoft identity into a membership. Authorisation stays in SQL, matching `accept_invitation` and `delete_organization`.

**Tech Stack:** Next.js 16.3, React 19, TypeScript 5.7, Supabase (Postgres 17), `@supabase/ssr`, `node --test` with `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-08-18-microsoft-sign-in-design.md`

## Global Constraints

- Supabase project `unison-uat`, ref `nwdzpjzllhhqwawmsxjd`. Entra tenant `fb3fa087-3378-4b7c-be4e-3ecbfbfc0f4b`.
- Migrations are applied through the Supabase MCP `apply_migration`, then written locally at `supabase/migrations/<assigned_version>_<name>.sql` where the version prefix equals what `apply_migration` returned. Never invent the version.
- `types/database.ts` is regenerated whenever a migration lands, with its two-line do-not-edit header preserved.
- Every `security definer` function: `set search_path = ''`, fully schema-qualified identifiers, `execute` revoked from `public` and `anon`.
- Nothing under `features/` may import `lib/supabase/admin`. A unit test enforces this.
- Test files cannot use the `@/` alias — relative imports with explicit `.ts` extensions.
- `.env.local` is gitignored. Never print or commit its values. Quote any value containing `#`.
- RLS fixtures must clean up everything they create, including `auth.identities` rows and `audit_events`.
- `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm test` and `pnpm test:rls` must all pass at the end of every task that touches code.
- Do NOT modify `features/product-ui/components/special-workspaces.tsx`.
- The user-facing rejection message is identical whether an account is unknown or suspended. Only the server-side signal differs.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `supabase/migrations/<v>_organization_email_domain.sql` | `organizations.email_domain` column, HIMARK's value |
| `supabase/migrations/<v>_claim_directory_membership.sql` | The RPC that turns a Microsoft identity into a membership |
| `app/auth/callback/route.ts` | Exchanges the OAuth code, claims membership, routes on the result |
| `features/auth-ui/actions/sign-in-with-microsoft.ts` | Server action starting the OAuth redirect |
| `tests/integration/rls/directory-membership.test.ts` | Authorisation rules for the RPC |

**Modified:** `proxy.ts` (exempt `/auth/callback`), `features/auth-ui/auth-screen.tsx` (wire the button, show the rejection message), `types/database.ts` (regenerate), `docs/architecture.md`, `docs/follow-ups.md`.

---

### Task 1: Verify identity linking — GATE

**This task writes no code and may invalidate the rest of the plan. Do it first and report before continuing.**

**Files:** none.

**Interfaces:**
- Consumes: nothing.
- Produces: a yes/no answer that gates Tasks 2–7.

`neo.matime@himark.co.za` exists as an email-and-password account. If signing in with Microsoft creates a *second* user rather than attaching an Azure identity to the existing one, that person ends up with owner rights on one account and a `member` membership on the other — and the symptom is silently losing admin access by signing in the "wrong" way.

- [ ] **Step 1: Record the current identity state**

```bash
node --env-file=.env.local -e "
const { createClient } = await import('@supabase/supabase-js');
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false}});
const { data } = await a.auth.admin.listUsers();
for (const u of data.users) console.log(u.email, '| id', u.id, '| identities:', (u.identities ?? []).map(i => i.provider).join(',') || 'none');
"
```

Expected: one user, `neo.matime@himark.co.za`, with a single `email` identity.

- [ ] **Step 2: Check the project's linking setting**

In the Supabase dashboard, **Authentication → Providers → Azure** (once configured in Task 6's prerequisites) and **Authentication → Settings**, find whether automatic linking of identities with a matching confirmed email is enabled. Record what you find verbatim — do not infer it from documentation.

- [ ] **Step 3: Report the answer and stop**

Report one of:
- **Linking works** — an Azure sign-in attaches to the existing user. Proceed to Task 2.
- **Linking does not work** — a second user is created. STOP and report. The design needs revisiting: options include making the claim function detect duplicate emails, or requiring the owner to sign in with Microsoft from the start.

Do not begin Task 2 until this is answered.

---

### Task 2: `organizations.email_domain`

**Files:**
- Create: `supabase/migrations/<assigned_version>_organization_email_domain.sql`
- Modify: `types/database.ts` (regenerate)

**Interfaces:**
- Consumes: nothing.
- Produces: `organizations.email_domain text unique` (nullable), with HIMARK set to `himark.co.za`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- Which email domain, if any, signs in to this organization via its identity
-- provider. Nullable on purpose: an organization without SSO has no domain and
-- claim_directory_membership() finds nothing for it. This is what keeps HIMARK
-- from being a hardcoded special case — a second tenant with Entra is an
-- update, not a deploy.
alter table public.organizations
  add column email_domain text unique
  check (email_domain is null or email_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$');

comment on column public.organizations.email_domain is
  'Bare lowercased email domain whose verified directory accounts auto-join this organization.';

update public.organizations
  set email_domain = 'himark.co.za'
  where id = '00000000-0000-4000-8000-000000000001';
```

The check constraint requires lowercase — an uppercase domain would never match the lowercased value the claim function derives, and would fail silently rather than loudly.

- [ ] **Step 2: Apply it**

Use the Supabase MCP `apply_migration` on project `nwdzpjzllhhqwawmsxjd`, name `organization_email_domain`. Then read the assigned version from `list_migrations` and write the local file at `supabase/migrations/<assigned_version>_organization_email_domain.sql` with identical SQL.

- [ ] **Step 3: Verify**

```bash
node --env-file=.env.local -e "
const { createClient } = await import('@supabase/supabase-js');
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false}});
const { data } = await a.from('organizations').select('name, email_domain');
console.log(JSON.stringify(data));
"
```

Expected: `[{"name":"HIMARK","email_domain":"himark.co.za"}]`

- [ ] **Step 4: Regenerate types**

MCP `generate_typescript_types`, write to `types/database.ts` preserving the two-line header. Confirm `email_domain` appears in the `organizations` Row, Insert and Update types.

- [ ] **Step 5: Verify and commit**

```bash
pnpm exec tsc --noEmit
git add supabase/migrations types/database.ts
git commit -m "feat(db): add organizations.email_domain for directory sign-in"
```

---

### Task 3: `claim_directory_membership()`

**Files:**
- Create: `supabase/migrations/<assigned_version>_claim_directory_membership.sql`
- Modify: `types/database.ts` (regenerate)

**Interfaces:**
- Consumes: `organizations.email_domain` (Task 2).
- Produces: `public.claim_directory_membership() returns uuid` — the organization id joined or already held, or null when no organization matches. Raises `42501` when the caller's membership is suspended or removed.

- [ ] **Step 1: Write the migration SQL**

```sql
-- Turns a verified Microsoft sign-in into a membership.
--
-- Takes no arguments: every input comes from the caller's own session, so
-- there is nothing to forge. Only ever INSERTS — never updates — which keeps
-- it clear of enforce_membership_role_change and the last-owner guard rather
-- than fighting them.
create or replace function public.claim_directory_membership()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller_email text;
  caller_verified boolean;
  has_azure boolean;
  target_org uuid;
  existing_status text;
  new_membership_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select email, (email_confirmed_at is not null)
    into caller_email, caller_verified
  from auth.users where id = auth.uid();

  if not caller_verified or caller_email is null then
    raise exception 'email not verified' using errcode = '28000';
  end if;

  -- Require a Microsoft identity. Without this, anyone who obtained an address
  -- at a registered domain by another route could grant themselves access.
  -- This function must do exactly one thing.
  select exists (
    select 1 from auth.identities
    where user_id = auth.uid() and provider = 'azure'
  ) into has_azure;

  if not has_azure then
    raise exception 'no directory identity' using errcode = '28000';
  end if;

  select id into target_org
  from public.organizations
  where email_domain = lower(split_part(caller_email, '@', 2))
    and status = 'active';

  -- No organization registered for this domain. An ordinary outcome, not an
  -- incident: return null and let the caller reject cleanly.
  if target_org is null then
    return null;
  end if;

  select status into existing_status
  from public.memberships
  where organization_id = target_org and user_id = auth.uid()
  for update;

  if existing_status = 'active' then
    -- Already a member. Idempotent: change nothing, return the organization.
    return target_org;
  end if;

  -- A revoked account's Entra login still works, so this branch is the only
  -- thing between a removed employee and the data. Raise rather than return
  -- null so the attempt is distinguishable in logs from an unknown domain.
  if existing_status in ('suspended', 'removed') then
    raise exception 'membership revoked' using errcode = '42501';
  end if;

  insert into public.memberships (organization_id, user_id, role_id, status)
  values (target_org, auth.uid(), 'member', 'active')
  returning id into new_membership_id;

  insert into public.audit_events (organization_id, actor_id, resource, resource_id, action, new_value)
  values (
    target_org, auth.uid(), 'memberships', new_membership_id, 'insert',
    jsonb_build_object('via', 'directory', 'role_id', 'member', 'status', 'active')
  );

  return target_org;
end $$;

revoke execute on function public.claim_directory_membership() from public, anon;
grant execute on function public.claim_directory_membership() to authenticated;
```

Note the `existing_status = 'invited'` case falls through to the insert, which would violate the unique constraint. That state is unreachable today — nothing creates `invited` membership rows — and `docs/follow-ups.md` already records that any future code creating them must be checked against this class of function.

- [ ] **Step 2: Apply it**

MCP `apply_migration`, name `claim_directory_membership`. Read the assigned version from `list_migrations`, write the local file with identical SQL.

- [ ] **Step 3: Confirm the grants**

```sql
select proname, prosecdef, coalesce(array_to_string(proacl, ','), '(default)') as acl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'claim_directory_membership';
```

Expected: `prosecdef` true, ACL containing `authenticated` and NOT `anon`.

- [ ] **Step 4: Regenerate types and commit**

```bash
pnpm exec tsc --noEmit
git add supabase/migrations types/database.ts
git commit -m "feat(db): add claim_directory_membership for Microsoft sign-in"
```

---

### Task 4: RLS specs for the claim function

**Files:**
- Create: `tests/integration/rls/directory-membership.test.ts`
- Modify: `tests/integration/rls/helpers.ts` (cleanup for `auth.identities`)

**Interfaces:**
- Consumes: `claim_directory_membership()` (Task 3), `createFixtureOrg`, `createFixtureUser`, `signedInClient`, `cleanup`, `admin` from `./helpers.ts`.
- Produces: nothing later tasks consume.

Fixtures cannot perform a real Microsoft sign-in, so they insert an `auth.identities` row with provider `azure` through the service role. This proves the authorisation rules, not the OAuth handshake — the handshake is verified once in a browser in Task 7.

- [ ] **Step 1: Add an identity helper and extend cleanup**

In `tests/integration/rls/helpers.ts`, add:

```ts
/**
 * Simulates a Microsoft sign-in by giving a fixture user an azure identity.
 * The real handshake cannot run in a test; claim_directory_membership() reads
 * this table either way, so the authorisation rules are exercised faithfully.
 */
export async function giveAzureIdentity(userId: string, email: string) {
  const { error } = await admin.schema('auth').from('identities').insert({
    provider: 'azure',
    provider_id: `azure-${userId}`,
    user_id: userId,
    identity_data: { sub: `azure-${userId}`, email },
    last_sign_in_at: new Date().toISOString(),
  })
  if (error) throw error
}
```

Then extend `cleanup()` so identities are removed with their users, and update the in-code comment listing what cleanup covers so it names `auth.identities` alongside `clients` and `memberships`.

- [ ] **Step 2: Write the failing specs**

```ts
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test, { after, before } from 'node:test'
import { admin, cleanup, createFixtureOrg, createFixtureUser, giveAzureIdentity, signedInClient } from './helpers.ts'

let org: string
const userIds: string[] = []
const DOMAIN = `dir-${randomUUID().slice(0, 8)}.test`

async function directoryUser(localPart: string, opts: { azure?: boolean } = {}) {
  const user = await createFixtureUser(null)
  userIds.push(user.id)
  await admin.auth.admin.updateUserById(user.id, { email: `${localPart}@${DOMAIN}`, email_confirm: true })
  if (opts.azure !== false) await giveAzureIdentity(user.id, `${localPart}@${DOMAIN}`)
  return { ...user, email: `${localPart}@${DOMAIN}` }
}

before(async () => {
  org = await createFixtureOrg('Directory')
  await admin.from('organizations').update({ email_domain: DOMAIN }).eq('id', org)
})

after(async () => { await cleanup([org], userIds) })

test('a verified Microsoft account at a registered domain joins as a member', async () => {
  const user = await directoryUser('joiner')
  const client = await signedInClient(user.email, user.password)
  const { data, error } = await client.rpc('claim_directory_membership')
  assert.equal(error, null)
  assert.equal(data, org)

  const { data: rows } = await admin.from('memberships').select('role_id, status').eq('user_id', user.id)
  assert.deepEqual(rows, [{ role_id: 'member', status: 'active' }])
})

test('a second call is idempotent and mutates nothing', async () => {
  const user = await directoryUser('repeat')
  const client = await signedInClient(user.email, user.password)
  await client.rpc('claim_directory_membership')
  const { data: before } = await admin.from('memberships').select('id, role_id, status').eq('user_id', user.id)

  const { data, error } = await client.rpc('claim_directory_membership')
  assert.equal(error, null)
  assert.equal(data, org)

  const { data: after } = await admin.from('memberships').select('id, role_id, status').eq('user_id', user.id)
  assert.deepEqual(after, before, 'a repeat claim must not change the membership row')
})

test('an account without a Microsoft identity is refused', async () => {
  const user = await directoryUser('nodirectory', { azure: false })
  const client = await signedInClient(user.email, user.password)
  const { error } = await client.rpc('claim_directory_membership')
  assert.ok(error, 'expected a refusal')
  assert.match(error!.message, /directory identity/i)

  const { data: rows } = await admin.from('memberships').select('id').eq('user_id', user.id)
  assert.deepEqual(rows, [], 'no membership may be created')
})

test('a removed member is refused and NOT reactivated', async () => {
  const user = await directoryUser('removed')
  const client = await signedInClient(user.email, user.password)
  await client.rpc('claim_directory_membership')
  await admin.from('memberships').update({ status: 'removed' }).eq('user_id', user.id)

  const { error } = await client.rpc('claim_directory_membership')
  assert.ok(error, 'a revoked account must not regain access by signing in again')
  assert.match(error!.message, /revoked/i)

  const { data: rows } = await admin.from('memberships').select('status').eq('user_id', user.id)
  assert.deepEqual(rows, [{ status: 'removed' }], 'status must be untouched')
})

test('a suspended member is refused and NOT reactivated', async () => {
  const user = await directoryUser('suspended')
  const client = await signedInClient(user.email, user.password)
  await client.rpc('claim_directory_membership')
  await admin.from('memberships').update({ status: 'suspended' }).eq('user_id', user.id)

  const { error } = await client.rpc('claim_directory_membership')
  assert.ok(error)
  const { data: rows } = await admin.from('memberships').select('status').eq('user_id', user.id)
  assert.deepEqual(rows, [{ status: 'suspended' }])
})

test('an unregistered domain returns null rather than raising', async () => {
  const user = await createFixtureUser(null)
  userIds.push(user.id)
  await giveAzureIdentity(user.id, user.email)
  const client = await signedInClient(user.email, user.password)

  const { data, error } = await client.rpc('claim_directory_membership')
  assert.equal(error, null, 'an unknown domain is an ordinary outcome, not an error')
  assert.equal(data, null)
})

test('a suspended organization does not accept directory sign-in', async () => {
  const suspended = await createFixtureOrg('DirSuspended')
  const domain = `dir-${randomUUID().slice(0, 8)}.test`
  await admin.from('organizations').update({ email_domain: domain, status: 'suspended' }).eq('id', suspended)

  const user = await createFixtureUser(null)
  userIds.push(user.id)
  await admin.auth.admin.updateUserById(user.id, { email: `x@${domain}`, email_confirm: true })
  await giveAzureIdentity(user.id, `x@${domain}`)
  const client = await signedInClient(`x@${domain}`, user.password)

  const { data } = await client.rpc('claim_directory_membership')
  assert.equal(data, null)
  await cleanup([suspended], [])
})
```

- [ ] **Step 3: Run them and confirm they fail for the right reason**

Run: `pnpm test:rls`
Expected: the new specs fail because `giveAzureIdentity` or the RPC does not yet behave as asserted — not because of a syntax error. Read the failures.

- [ ] **Step 4: Make them pass**

Fix the helper or the assertions against real behaviour. If the RPC itself is wrong, fix the RPC in a NEW migration — never edit an applied one.

- [ ] **Step 5: Prove the suite is still self-cleaning**

```bash
node --env-file=.env.local -e "
const { createClient } = await import('@supabase/supabase-js');
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false}});
const { data: au } = await a.from('audit_events').select('organization_id');
const { data: o } = await a.from('organizations').select('name');
const { data: u } = await a.auth.admin.listUsers();
console.log('audit', au.length, 'null-org', au.filter(r=>!r.organization_id).length, '| orgs', o.length, '| users', u.users.length);
"
```

Run `pnpm test:rls` twice and confirm these numbers are identical before and after both runs.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/rls
git commit -m "test(rls): cover directory membership claims and revocation"
```

---

### Task 5: OAuth callback route and proxy exemption

**Files:**
- Create: `app/auth/callback/route.ts`
- Modify: `proxy.ts:7`

**Interfaces:**
- Consumes: `createServerSupabase` from `@/lib/supabase/server`, `claim_directory_membership` (Task 3).
- Produces: the route `/auth/callback`, which redirects to `/overview` on success or `/sign-in?error=no-access` on rejection.

- [ ] **Step 1: Exempt the callback in `proxy.ts`**

The OAuth return lands here *before* a session cookie exists. Without the exemption the proxy redirects it to `/sign-in` and the loop never closes — presenting as a redirect loop that looks like a Microsoft misconfiguration.

```ts
const AUTH_EXEMPT = ['/accept-invitation', '/verify-email', '/reset-password', '/auth/callback']
```

- [ ] **Step 2: Write the callback route**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Where Microsoft returns the user. Exchanges the code for a session, then
 * asks the database whether that identity corresponds to a membership.
 *
 * A caller who authenticates successfully but gets no membership holds a valid
 * session with no access, and every route would bounce them to
 * /join-organization — still a non-functional screen — producing a loop with
 * no exit. So this signs them out and rejects cleanly. That also means a
 * removed employee does not retain a session inside the app.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const origin = url.origin

  // Microsoft reports user-cancelled consent and similar here.
  if (url.searchParams.get('error')) {
    return NextResponse.redirect(`${origin}/sign-in?error=microsoft`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=microsoft`)
  }

  const supabase = await createServerSupabase()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/sign-in?error=microsoft`)
  }

  const { data: organizationId, error: claimError } = await supabase.rpc('claim_directory_membership')

  // No organization for this domain (null) and a revoked membership (raise)
  // both end the same way for the user. Only the server-side signal differs —
  // telling someone their account is suspended tells them what they do not
  // need to know.
  if (claimError || !organizationId) {
    if (claimError) console.warn('[auth/callback] directory claim refused:', claimError.message)
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/sign-in?error=no-access`)
  }

  return NextResponse.redirect(`${origin}/overview`)
}
```

- [ ] **Step 3: Verify the route builds and the proxy lets it through**

```bash
pnpm exec tsc --noEmit
pnpm build
```

Then with the dev server running on 3002:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3002/auth/callback"
```

Expected: `307 http://localhost:3002/sign-in?error=microsoft` — reaching the route and rejecting a code-less request, NOT `307 .../sign-in?next=%2Fauth%2Fcallback`, which would mean the proxy still intercepts it.

- [ ] **Step 4: Commit**

```bash
git add proxy.ts app/auth
git commit -m "feat(auth): add the Microsoft OAuth callback route"
```

---

### Task 6: Wire the button and the rejection message

**Files:**
- Create: `features/auth-ui/actions/sign-in-with-microsoft.ts`
- Modify: `features/auth-ui/auth-screen.tsx`

**Interfaces:**
- Consumes: `createServerSupabase`, `readAppUrl` from `@/lib/env`.
- Produces: `signInWithMicrosoftAction()`, a server action that redirects to Microsoft.

**Prerequisite, done by the repository owner before this task can be verified:** the Entra app registration and Supabase Azure provider from the spec's section 1. Without it, `signInWithOAuth` returns a provider-not-enabled error. The code can be written and typechecked regardless.

- [ ] **Step 1: Write the server action**

```ts
'use server'
import { redirect } from 'next/navigation'
import { readAppUrl } from '@/lib/env'
import { createServerSupabase } from '@/lib/supabase/server'

export async function signInWithMicrosoftAction() {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: `${readAppUrl(process.env)}/auth/callback`,
      // email is not in Azure's default scope set and the claim function
      // needs a verified address to match a domain against.
      scopes: 'email',
    },
  })

  if (error || !data.url) redirect('/sign-in?error=microsoft')
  redirect(data.url)
}
```

- [ ] **Step 2: Replace the demo button behaviour**

In `features/auth-ui/auth-screen.tsx`, `MicrosoftSignIn` currently takes an `onClick` that sets local completion state. Change it to submit a form posting to `signInWithMicrosoftAction`. Keep every class, the `MicrosoftMark`, and the divider markup exactly as they are — this is a behaviour change only. Remove the now-unused `setCompletion('microsoft')` path and the `'microsoft'` branch of `CompletionState` if nothing else uses it.

- [ ] **Step 3: Show the rejection message**

The sign-in page receives `?error=no-access` or `?error=microsoft`. Render a message above the form:

- `no-access` → "This Microsoft account isn't linked to a UNISON organization. Ask your administrator for access."
- `microsoft` → "Microsoft sign-in didn't complete. Try again."

Both must be identical for an unknown domain and a revoked membership — `no-access` covers both deliberately.

`app/(auth)/sign-in/page.tsx` reads `searchParams` (a Promise in Next 16 — await it) and passes the message to `AuthScreen`.

- [ ] **Step 4: Verify**

```bash
pnpm exec tsc --noEmit && pnpm test && pnpm build
```

Then check the message renders:

```bash
curl -s "http://localhost:3002/sign-in?error=no-access" | grep -o "isn.t linked to a UNISON organization" | head -1
```

Expected: one match.

- [ ] **Step 5: Commit**

```bash
git add features/auth-ui app/\(auth\)/sign-in
git commit -m "feat(auth): sign in with Microsoft instead of the demo button"
```

---

### Task 7: Live verification and documentation

**Files:**
- Modify: `docs/architecture.md`, `docs/follow-ups.md`, `docs/product-ui.md`

**Interfaces:**
- Consumes: everything.
- Produces: documentation matching reality.

- [ ] **Step 1: Sign in with Microsoft in a browser**

Start the dev server (`unison-dev`, port 3002). From `/sign-in`, click **Continue with Microsoft** and complete the Microsoft prompt with a `@himark.co.za` account.

Expected: you land on `/overview` with HIMARK as the active organization.

Then confirm the database agrees:

```bash
node --env-file=.env.local -e "
const { createClient } = await import('@supabase/supabase-js');
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {auth:{persistSession:false}});
const { data: u } = await a.auth.admin.listUsers();
for (const x of u.users) console.log(x.email, '| identities:', (x.identities ?? []).map(i=>i.provider).join(','));
const { data: m } = await a.from('memberships').select('role_id,status,user_id');
console.log('memberships:', JSON.stringify(m));
const { data: au } = await a.from('audit_events').select('resource,action,new_value').order('created_at',{ascending:false}).limit(1);
console.log('latest audit:', JSON.stringify(au));
"
```

Expected: the account carries both `email` and `azure` identities (confirming Task 1's finding held in practice), the membership exists, and the latest audit row records `via: directory`.

Screenshots have failed in this environment when the browser pane is not composited. Try, and if they fail say so and use `read_page` instead. Never claim a verification you did not perform.

- [ ] **Step 2: Verify the rejection path**

Sign out. Sign in with a Microsoft account whose domain is NOT registered — any personal Microsoft account will do, and the single-tenant registration should reject it at Microsoft before reaching UNISON. Record which layer rejected it: Microsoft's own error page, or UNISON's `?error=no-access`. Both are correct outcomes; knowing which is which matters for support.

- [ ] **Step 3: Update the documentation**

- `docs/architecture.md` — Microsoft sign-in is real; state that it is single-tenant, HIMARK-only, and that first sign-in auto-joins as `member`.
- `docs/product-ui.md` — the "Continue with Microsoft" button is no longer demonstrative.
- `docs/follow-ups.md` — add: **offboarding is two steps.** Removing someone from the Entra directory does not revoke their UNISON membership, because the membership outlives the directory account. Until that is automated, an employee removed from Microsoft keeps their UNISON access.

- [ ] **Step 4: Full gate**

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm test
pnpm test:rls
```

Report the real output of all four. If any fails, say so rather than summarising it as a pass.

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "docs: record that Microsoft sign-in is live"
```

---

## Self-Review

**Spec coverage:** Configuration → Task 6 prerequisite and Task 1 Step 2. Proxy exemption → Task 5 Step 1. `email_domain` column → Task 2. `claim_directory_membership` with all five ordered checks → Task 3. Callback route → Task 5. Button wiring → Task 6. Rejection path with sign-out → Task 5 Step 2 and Task 6 Step 3. Identity linking verification → Task 1, positioned as a gate. Testing, all six branches plus suspended-organization → Task 4. Fixture cleanup including `auth.identities` → Task 4 Step 1. Definition of done → Task 7. Every spec section maps to a task.

**Placeholder scan:** no TBD, no "add error handling", no "similar to Task N". Every code step carries real code. The one deliberately unresolved item is Task 1's outcome, which is a gate with both branches specified rather than a placeholder.

**Type consistency:** `claim_directory_membership()` returns `uuid` in Task 3 and is consumed as `organizationId` in Task 5 and as `data` in Task 4's assertions. `giveAzureIdentity(userId, email)` is defined in Task 4 Step 1 and used in Task 4 Step 2. `signInWithMicrosoftAction()` is defined in Task 6 Step 1 and consumed in Step 2. `AUTH_EXEMPT` is the existing constant name in `proxy.ts:7`. `readAppUrl` matches the existing export in `lib/env.ts`.

**Known gap, deliberate:** the `invited` membership status falls through Task 3's branches to an insert that would violate the unique constraint. Unreachable today because nothing creates such rows, and already recorded in `docs/follow-ups.md` as a constraint on future code.
