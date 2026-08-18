# Multi-tenancy

UNISON uses organizations as its tenant boundary. HIMARK is the first bootstrap organization, seeded by migration into `public.organizations` with the stable id `00000000-0000-4000-8000-000000000001` and slug `himark`.

## Current implementation

- Shared organization, membership, invitation, and active-context types live in `types/tenancy.ts`.
- Domain exports live in `features/organizations`, `features/memberships`, and `features/invitations`.
- Pure tenant resolution and active-membership guards live in `lib/tenancy`.
- Roles and permissions live in `config/roles.ts` and `config/permissions.ts`.
- Integration specifications cover cross-tenant access, revoked memberships, role enforcement, and storage prefixes (`tests/integration/rls/`).

HIMARK is database-backed, not configuration-backed. `config/tenants.ts` still exists as a legacy placeholder, but the real record lives in `organizations`, and it has a real owner membership — the first verified account is granted ownership with `pnpm grant-owner <email>`, which requires the target `auth.users` row to have a confirmed email address.

## Enforcement

- **Row-level security** — `public.is_member_of(org)` and `public.has_role(org, roles)` are `security definer` helpers that query `memberships` directly rather than trusting JWT claims, so a revoked membership stops granting access immediately rather than at next token refresh. Every RLS policy on `organizations`, `memberships`, `invitations`, `audit_events`, and `clients` is built from these two functions.
- **Session context** — `lib/auth/session-context.ts` exports the pure `resolveSessionContext` (picks the active organization from a cookie hint or the user's memberships, never trusting an unresolvable or foreign org) and `ACTIVE_ORG_COOKIE`, the cookie name it reads. `lib/auth/get-session-context.ts` exports the server-only `getSessionContext`, which loads the signed-in user and their active memberships from Supabase and calls `resolveSessionContext` to pick the active organization. Browser-provided organization identifiers are still only routing hints; `getSessionContext` is what turns a hint into an authorized selection.
- **Role changes** — only owners may change any membership's `role_id`, enforced in the database by the `enforce_membership_role_change` trigger (a `BEFORE UPDATE` trigger, since a row policy cannot compare old and new `role_id` directly). Admins can manage members (invite, suspend, remove) but cannot promote themselves or anyone else to owner, and cannot issue an `owner` invitation — `invitations_insert` carries the same restriction.
- **Proxy** — `proxy.ts` (Next.js 16's replacement for Middleware; there is no `middleware.ts`) redirects unauthenticated requests to `/sign-in` and signed-in requests away from `/sign-in` and `/forgot-password`, except for `/accept-invitation`, `/verify-email`, and `/reset-password`, which stay reachable while signed in.

## Required persistence rules

Every tenant-owned table includes `organization_id`. Uniqueness, foreign keys, storage paths, caches, jobs, webhooks, audit events, Atlas retrieval, and automation runs must all preserve this boundary. Only `clients` and the platform tables (`organizations`, `memberships`, `invitations`, `audit_events`) currently exist; the remaining product-UI modules have no persistence yet and no `organization_id` to enforce.

The server must validate active membership for every request. Browser-provided organization identifiers are routing hints and must never be treated as authorization.

## Organization deletion

Organizations are not deletable through ordinary CRUD — there is no delete RLS policy. The one sanctioned path is `public.delete_organization(uuid)`, restricted to owners (or `service_role`). `audit_events.organization_id` is nullable with `on delete set null`, so the audit trail — including the record of who deleted the organization — survives the deletion instead of cascading away with it.
