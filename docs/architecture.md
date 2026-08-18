# UNISON architecture

UNISON is a multi-tenant Business Operating System built with the Next.js App Router, backed by a Supabase Postgres project. HIMARK is the bootstrap organization, seeded into the database by migration, and all current product fixtures and the Clients module are scoped to that tenant context.

## Dependency direction

```text
Routes (app)
  -> Domain screens (features)
    -> Shared interface (components)
      -> Platform services (lib)

Configuration (config) declares navigation, modules, permissions, and tenancy.
Persistence assets (supabase/migrations) remain independent of the interface.
```

Dependencies flow down this diagram. Route files stay thin, shared UI does not import business routes, and platform utilities do not import interface components.

## Current routes

- `/` and `/overview` provide the executive overview.
- `/operations/*` covers Clients, Projects, Tasks, and Calendar.
- `/commercial/*` covers Leads, Quotes, and Sales.
- `/finance/*` covers Invoices, Expenses, and Forecast.
- `/people/*` covers Team, HR, and Leave.
- `/knowledge`, `/atlas`, and `/settings` provide standalone workspaces.
- Every product module has workspace, create, record detail, and edit routes.
- Authentication and onboarding routes cover sign-in, password recovery, invitation acceptance, email verification, and organization creation/joining. There is no sign-up route — UNISON is invite-only, so `app/(auth)/sign-up/` was removed as unreachable.
- `error.tsx`, `not-found.tsx`, and route-group loading boundaries provide global fallback states.

The `(unison)`, `(auth)`, and `(onboarding)` route groups organize layouts without changing public URLs.

## Directory responsibilities

- `app/` owns routing, layouts, loading/error boundaries, and screen composition.
- `features/` owns domain behavior. `features/product-ui` provides the registry-driven CRUD and specialized module screens; `features/overview` owns the executive dashboard.
- `components/` owns reusable layout, navigation, UI primitives, shared drawers, dialogs, tenant controls, and feedback states.
- `lib/` owns framework and platform infrastructure, including auth, tenant resolution, permissions, Supabase boundaries, files, notifications, and utilities.
- `config/` owns navigation, module registration, permissions, statuses, and tenant bootstrap configuration.
- `supabase/migrations/` owns the ordered SQL schema history, applied through the Supabase MCP. There is no `database/` directory.
- `styles/` owns global styles and semantic UNISON tokens.
- `hooks/` and `types/` hold cross-feature hooks and types only when they are genuinely shared.
- `tests/` separates unit, integration, and future end-to-end coverage.

## Multi-tenant boundary

Tenant resolution occurs before business data access: `getSessionContext()` (`lib/auth/get-session-context.ts`) loads the signed-in user's active memberships and resolves the active organization from a cookie hint or membership order via the pure `resolveSessionContext`, and every RLS policy re-derives membership from `auth.uid()` rather than trusting the client. Organization membership, tenant-scoped roles, and row-level security all include and enforce the organization identifier today, for the tables that exist (`organizations`, `memberships`, `invitations`, `audit_events`, `clients`). Storage paths, exports, jobs, notifications, and caches remain to be built and must preserve the same boundary when they are. Switching the visual organization context writes `ACTIVE_ORG_COOKIE` and re-resolves session context on the next request; it does not itself perform a database write. See `docs/tenancy.md`.

## What is now true, and what genuinely remains undone

Connected: a real Supabase Postgres project, RLS-enforced `organizations`/`memberships`/`invitations`/`audit_events`/`clients` tables, `getSessionContext`/`resolveSessionContext` session resolution, a `proxy.ts` (Next.js 16's Middleware, renamed) that gates unauthenticated and already-authenticated routes, sign-in/sign-out/invitation-accept against Supabase Auth, owner-gated role changes, and one full CRUD module (Clients) reading and writing real rows with server-side search.

Still not done:
- **Clients is the only connected product module.** The other sixteen (Projects, Tasks, Calendar, Leads, Quotes, Sales, Invoices, Expenses, Forecast, Team, HR, Leave, Knowledge, Atlas, Overview, Settings) still render `moduleFixtures` — no API route, no persistence. See `docs/product-ui.md`.
- **Sign-up does not exist.** UNISON is invite-only, and `app/(auth)/sign-up/` was removed as unreachable (see "Current routes" above).
- **`/forgot-password`, `/reset-password`, and `/verify-email` remain non-functional demos.** Each renders a bare `<AuthScreen>` for its `kind` with no Supabase call behind it — no `resetPasswordForEmail`, no `updateUser`, nothing wired. Only sign-in, sign-out, and invitation acceptance (`kind="accept"`) actually call Supabase Auth today.
- **Invitation mail goes through the Microsoft Graph API, not SMTP.** Microsoft 365 blocks SMTP AUTH while security defaults are enabled — verified against the live server, which answers `535 5.7.139 ... locked by your organization's security defaults policy` — and Microsoft is deprecating SMTP client submission regardless. `lib/email` therefore acquires an OAuth2 client-credentials token and posts a raw MIME message to Graph. The `sendEmail()` interface is unchanged, so no caller knows the difference.
- **Supabase Auth's own mail still comes from Supabase's sender.** Auth's custom SMTP only speaks SMTP, so the Graph route cannot serve it; password-reset and verification email are unbranded until a transactional provider is introduced.
- **No live invitation email has ever been sent.** The send and accept flow is verified against a log transport, and the Graph path is unit-tested but has not yet delivered a real message.
- **Atlas, automation, file storage, realtime, and notifications remain unimplemented** — no schema, no service, no UI wiring beyond the existing visual mock.
- The root overview remains available at `/` to preserve the original entry route; `/overview` is the canonical sidebar destination.
- Next.js and package-manager configuration remains at the repository root because the framework requires it.

## Adding or extending a feature

1. Declare module labels, views, fields, filters, and record tabs in `features/product-ui/registry.ts`.
2. Keep the route thin and compose a feature screen from `app/`.
3. Add domain-specific UI under the feature and promote only genuinely reusable patterns to `components/`.
4. Apply organization scope before connecting queries, mutations, files, background jobs, or external integrations.
5. Add appropriate unit, integration, and end-to-end coverage.
