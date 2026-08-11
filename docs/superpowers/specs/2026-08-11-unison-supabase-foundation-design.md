# UNISON Supabase foundation — design

**Date:** 2026-08-11
**Status:** Approved
**Scope:** Connect the UNISON front end to the `unison-uat` Supabase project. Establish auth, tenancy, RLS, audit, and typed data access, then prove the whole stack through one module (Clients) persisted end to end.

## Context

UNISON is a front-end product specification: 16 registry-driven modules, 64 routes, no backend. `docs/product-ui.md` states the boundary plainly — no API routes, no database, no auth enforcement, no persistence. Fixtures reset on refresh.

`lib/tenancy` contains real tenant-resolution guards with five integration specs, but nothing under `app/` or `components/` imports it. The tenant switcher carries its own hardcoded organization list unrelated to `config/tenants.ts`. The tenancy layer is correct and orphaned.

### Starting state of `unison-uat`

Project ref `nwdzpjzllhhqwawmsxjd`, us-east-1, Postgres 17, created 2026-04-08.

It holds 17 tables from a **different product** — a booking/scheduling domain (`firms`, `bookings`, `services`, `team_availability`, `clients`, `audit_logs`, `notifications`, and others), 11 migrations dated 19 and 27 April 2026, and a `public.custom_access_token_hook(event jsonb)`. RLS is enabled throughout. Every table has zero rows. A newer, separate Supabase project named `ops-booking` exists, suggesting this schema was superseded and its project later renamed for UNISON.

**Decision:** reset `unison-uat` to a clean UNISON schema. The existing schema is dumped to `docs/reference/legacy-booking-schema.sql` and committed before anything is dropped.

## Decisions

| Question | Decision |
|---|---|
| Existing booking schema | Drop it; archive a dump first |
| Scope of this phase | Platform foundation + Clients proven end to end |
| Access model | Invite-only; HIMARK provisions organizations |
| Tenant enforcement | RLS via live membership lookup (not JWT claims) |

### Why membership lookup over JWT claims

Claims stamped into the access token by an auth hook are fast but stale: a revoked membership keeps working until the token refreshes, and switching organizations needs a refresh round trip. Live lookup makes revocation immediate and organization switching a cookie write. The subquery cost is negligible behind an index and a `stable` helper function.

The `lib/tenancy` guards are retained as a second layer inside the server data path. RLS is the wall; the guards return clean authorization errors instead of confusing empty result sets. Existing specs keep passing and finally protect code that runs.

## 1. Repository and environment

### Version control

The project has no git repository. `git init`, then commit the current front end as a baseline so the entire foundation lands as a reviewable diff against a known-good UI.

`.gitignore` additions: `.codex-*.log`, `tsconfig.tsbuildinfo`, `.pnpm-store/`, `supabase/.temp/`.

### Type safety

`next.config.mjs` sets `typescript.ignoreBuildErrors: true`. Remove it. This requires `tsc --noEmit` to pass first; the current error count is unknown and is the opening task. If the cleanup turns out to be large, report before proceeding rather than absorbing it silently.

### Migration home

Two candidate homes exist: the empty `database/{migrations,seeds,policies,functions}/` tree and the `supabase/` directory the CLI requires. `docs/database.md` already resolves this in favour of the CLI.

- `supabase/migrations/` becomes the single home for schema changes.
- `database/` is deleted rather than left as a decoy.
- `docs/database.md` is updated to match.

### Configuration

New dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `nodemailer`.

Environment variables — the Supabase project URL, publishable key, and secret key, plus the SMTP host, port, user, and sender address from section 6 — live in `.env.local` (already covered by `.env*.local`). All access goes through `lib/env.ts`, which validates presence at module load and throws a named error. No `process.env.X!` anywhere else: a missing variable fails at boot with a clear message rather than as a null three layers deep.

### Cleanup

With invite-only confirmed, `app/(auth)/sign-up/page.tsx` is unreachable behind the existing `/sign-up` → `/sign-in` redirect. Delete the page, keep the redirect.

## 2. Schema

Every tenant-owned table carries `organization_id` directly. No table infers tenancy through a join.

### Platform tables

**`organizations`** — `id uuid pk`, `name`, `slug unique`, `status`, `created_at`, `updated_at`. Mirrors the `Organization` type in `types/tenancy.ts`.

**`memberships`** — `id`, `organization_id`, `user_id → auth.users`, `role_id`, `status`, `created_at`, `updated_at`. Unique on `(organization_id, user_id)`.

**`invitations`** — `id`, `organization_id`, `email`, `role_id`, `status`, `token_hash`, `expires_at`, `invited_by`, `accepted_at`, `created_at`. The token is stored hashed; the raw value exists only in the email, so a database read cannot mint access.

**`audit_events`** — `id`, `organization_id`, `actor_id`, `resource`, `resource_id`, `action`, `old_value jsonb`, `new_value jsonb`, `created_at`. Shape borrowed from the legacy schema, which got this part right.

`role_id` is `text` with a check constraint mirroring `config/roles.ts` (`owner`, `admin`, `member`). A roles table is deferred until roles become tenant-customizable.

### Clients

`id`, `organization_id`, `name`, `industry`, `website`, `contact_name`, `contact_email`, `contact_phone`, `owner_id`, `service`, `billing_email`, `notes`, `status`, `health`, `created_at`, `updated_at`, `archived_at`.

Fields follow the Clients definition in `features/product-ui/registry.ts`. `status` and `health` are constrained to explicit value sets defined once and mirrored in TypeScript. `archived_at` is a soft delete, because the UI offers Archive and never Delete.

The workspace declares an "Active Projects" column that cannot be real until a `projects` table exists. It renders `—` rather than a fabricated zero.

### Indexes

- `memberships(organization_id, user_id)` unique — also the `is_member_of` lookup path
- `clients(organization_id, archived_at)`
- `pg_trgm` index on `clients.name` for search; the extension is already installed

## 3. Row level security

RLS is enabled on every table with no permissive default, so an unpoliced table is a locked table. `anon` is granted nothing; `authenticated` gets table privileges that policies then narrow. The service role bypasses RLS by design and is confined to the admin client.

Access resolves through one helper:

```sql
create function public.is_member_of(org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.memberships
  where user_id = auth.uid() and organization_id = org and status = 'active'
) $$;
```

`security definer` is load-bearing: the policy on `memberships` must read `memberships`, which recurses without the bypass. `stable` lets Postgres evaluate the function once per statement rather than once per row.

A companion `public.has_role(org uuid, roles text[])` narrows writes where `config/permissions.ts` calls for it.

### Policy shape

- **Read:** `using (public.is_member_of(organization_id))`
- **Write:** same, plus `has_role(...)` where the permission catalogue requires it
- **Delete:** no policy at all — archiving is the only removal path
- **`organizations`:** readable where `is_member_of(id)`

### Invitation acceptance

An invitee is by definition not yet a member, so no policy can expose their row. Acceptance goes through a `security definer` RPC, `accept_invitation(raw_token)`, which verifies the token hash, checks expiry, confirms the caller's verified email matches the invitation, and creates the membership atomically. A narrow, auditable exception instead of a permissive select policy.

## 4. Auth and session

Supabase Auth, email and password, cookie-based sessions via `@supabase/ssr`.

### Three clients, one boundary

| Factory | Runs as | Used by |
|---|---|---|
| `lib/supabase/server.ts` | signed-in user, RLS applies | Server Components, Server Actions, Route Handlers |
| `lib/supabase/client.ts` | signed-in user, RLS applies | the few genuinely interactive components |
| `lib/supabase/admin.ts` | service role, bypasses RLS | bootstrap, invitation dispatch, admin scripts only |

The admin client is marked `import 'server-only'` and must never be imported by feature code. A unit test asserts that nothing under `features/` imports it, because that rule erodes quietly otherwise.

### Middleware

`middleware.ts` performs the session refresh `@supabase/ssr` requires, then gates route groups:

- no session → `/sign-in`
- session without an active membership → `/join-organization`
- session hitting an `(auth)` route → `/overview`

Three `(auth)` routes are exempt from that last rule and must stay reachable while signed in: `/accept-invitation` (an existing user joining a second organization), `/verify-email`, and `/reset-password` (both reached from emailed links that may land in an authenticated session). Bouncing these to `/overview` would silently break invitation acceptance.

### Active organization

An httpOnly cookie holds the active organization id. One function resolves per-request context:

```ts
getSessionContext(): { user, organization, membership, role }
```

It reads the cookie, loads the user's active memberships, and passes both to the existing `resolveOrganization` and `requireMembership` guards. A cookie naming an organization the user does not belong to throws `TenantAccessDeniedError` and falls back to the first active membership — it never fails open.

The tenant switcher's hardcoded list is replaced by real memberships. Selecting an organization becomes a server action that re-validates membership before writing the cookie.

### Caching

Module routes read cookies and therefore render dynamically, which is correct for per-user, per-organization results. Rule: **no cache key may omit the organization id.** A page cached by pathname alone is a cross-tenant leak.

### Bootstrap

A seed migration inserts HIMARK into `organizations` preserving the exact id and slug from `config/tenants.ts`, as `docs/tenancy.md` requires. No owner membership is seeded — no user exists to reference. An admin script grants owner to a named email after the first account is created, making the first membership deliberate and auditable.

## 5. Data access

### Feature structure

Follows the directories already scaffolded under `features/organizations/`:

```
features/clients/
  schemas/   zod input validation
  queries/   server-only reads; take session context, return typed rows
  actions/   server actions: create, update, archive
```

Every action performs four steps in order: validate input, check permission, mutate, revalidate.

Database types are generated with `supabase gen types`, committed to `types/database.ts`, and regenerated whenever a migration lands, so a schema change that breaks a query fails typecheck rather than production.

### The component seam

`features/product-ui/components/module-workspace.tsx` currently reads `moduleFixtures[module.id]` directly. Invert this: the component receives `records` as a prop and the route decides the source. The Clients route becomes a Server Component fetching real rows; the other fifteen modules keep passing mocks, unchanged.

This allows modules to migrate one at a time without forking the shared component or a big-bang cutover.

Two consequences for a connected module:

- Search, filter, sort, and pagination move to URL search params resolved server-side. In-memory filtering of five fixtures does not survive real row counts.
- The "Preview screen state" selector disappears for Clients. Loading and error states become real Suspense and error boundaries.

### Audit

Audit rows are written by a trigger on `clients` capturing `auth.uid()`, old value, and new value — not inside each action. A convention every future action must remember is a convention that will eventually be forgotten. Actions stay focused on intent; the record keeps itself.

## 6. Email delivery

Invitations are client-facing mail from HIMARK, so they cannot go out through Supabase's default sender. Delivery uses the existing HIMARK GoDaddy mailbox, configured in two places.

**Supabase Auth mailer.** Custom SMTP configured in the project's Auth settings, covering password reset and email verification. The default templates are rebranded to match UNISON so the three emails a new user receives look like one system.

**UNISON's own sender.** The invitation email carries our token, from our `invitations` table, so it is not Supabase's to send. A small module under `lib/email/` — a directory already reserved for this — wraps `nodemailer` behind a single `sendEmail(to, template, data)` interface. Server actions call that; they never touch transport details.

One interface, two consumers, one mailbox. The provider stays swappable if GoDaddy's limits become a constraint.

### Configuration

SMTP host, port, and sender address are environment variables validated by `lib/env.ts` alongside the Supabase keys. The exact host depends on which GoDaddy email product backs the domain — their own SMTP relay and a Microsoft 365-backed mailbox use different endpoints — so it is confirmed against the live account at implementation rather than assumed here.

The SMTP password is a credential. It is entered by the account owner directly into the Supabase dashboard and into `.env.local`; it is never pasted into the repository, a migration, or a tool call.

### Constraints

GoDaddy enforces a daily outbound cap well below a transactional provider's. Invite-only provisioning keeps volume low, so this is adequate — but a future bulk notification feature would outgrow it, which is the point at which the `lib/email/` interface earns its keep.

Tests never send real mail. A development transport logs the rendered message instead, so the invitation flow is testable without a live mailbox.

## 7. Testing

Three layers, two of which already exist.

**Retained:** the five `lib/tenancy` specs and `tests/unit/ui-completeness.test.ts`, unchanged.

**New static check:** nothing under `features/` imports `lib/supabase/admin` — the service-role boundary defended by a test rather than by discipline.

**New RLS integration specs:** seed two organizations and two users, then assert the wall holds.

- User A queries clients and sees only organization A's rows
- A direct insert naming organization B's id is rejected
- A revoked membership loses access immediately

These run against `unison-uat` itself using fixture organizations the suite creates and tears down. It is the UAT environment, and this tests the real policies rather than a local approximation. The trade-off is that tests write to a shared database, so they must stay scoped to fixture organizations and never assume an empty table. If this becomes awkward, move to a local `supabase start` stack, which is cleaner but requires Docker running on Windows for every test run.

## Definition of done

- `tsc --noEmit` passes with `ignoreBuildErrors` removed from `next.config.mjs`
- `pnpm build` succeeds
- All specs pass, including the new RLS integration suite
- A browser pass, screenshotted: sign in, land on Clients, create a client, edit it, archive it, sign out — with rows visibly persisting in Supabase
- One real invitation sent from the HIMARK mailbox, accepted by a second account, resulting in a working membership

## Out of scope

Deliberately excluded from this phase, in rough priority order for what follows:

- The other 15 module schemas and their queries
- Atlas model provider, retrieval, and prompt system
- Automation engine, scheduler, and job queue
- File storage and storage-path tenancy
- Realtime subscriptions
- Notifications persistence

## Open risks

- **Unknown typecheck debt.** `ignoreBuildErrors` has been masking errors for an unknown period. The size of that cleanup is not yet measured.
- **Shared UAT database during tests.** Fixture scoping is the mitigation; drift toward a local stack is the escape hatch.
- **Invitation deliverability.** Client-facing mail from a general-purpose mailbox lands in spam more readily than mail from a transactional provider. The domain's SPF and DKIM records need checking before the first real client invitation, and GoDaddy's daily cap needs confirming against expected volume.
- **Atlas naming collision.** UNISON's Atlas module, the `himark-site` Atlas chatbot product, and the archived Command Center spec all use the name. Not a blocker for this phase, but it will need resolving before Atlas gains a backend.
