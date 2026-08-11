# UNISON architecture

UNISON is a multi-tenant Business Operating System built with the Next.js App Router. HIMARK is the bootstrap organization and all current product fixtures are scoped to that tenant context.

## Dependency direction

```text
Routes (app)
  -> Domain screens (features)
    -> Shared interface (components)
      -> Platform services (lib)

Configuration (config) declares navigation, modules, permissions, and tenancy.
Persistence assets (database) remain independent of the interface.
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
- Authentication and onboarding routes cover sign-in, sign-up, password recovery, invitation acceptance, email verification, and organization creation/joining.
- `error.tsx`, `not-found.tsx`, and route-group loading boundaries provide global fallback states.

The `(unison)`, `(auth)`, and `(onboarding)` route groups organize layouts without changing public URLs.

## Directory responsibilities

- `app/` owns routing, layouts, loading/error boundaries, and screen composition.
- `features/` owns domain behavior. `features/product-ui` provides the registry-driven CRUD and specialized module screens; `features/overview` owns the executive dashboard.
- `components/` owns reusable layout, navigation, UI primitives, shared drawers, dialogs, tenant controls, and feedback states.
- `lib/` owns framework and platform infrastructure, including auth, tenant resolution, permissions, Supabase boundaries, files, notifications, and utilities.
- `config/` owns navigation, module registration, permissions, statuses, and tenant bootstrap configuration.
- `database/` reserves persistence assets. Supabase CLI-required paths take precedence if Supabase is introduced.
- `styles/` owns global styles and semantic UNISON tokens.
- `hooks/` and `types/` hold cross-feature hooks and types only when they are genuinely shared.
- `tests/` separates unit, integration, and future end-to-end coverage.

## Multi-tenant boundary

Tenant resolution must occur before business data access. Organization membership, tenant-scoped roles, row-level security, storage paths, audit events, exports, jobs, notifications, and caches must all include the organization identifier. Switching the visual organization context does not yet perform durable data access. See `docs/tenancy.md`.

## Intentional deviations

- No database schema, Supabase project, or API layer was invented during the UI completion pass.
- CRUD, authentication, Atlas, integrations, exports, and tenancy switching use local demonstration state until backend services are connected.
- The root overview remains available at `/` to preserve the original entry route; `/overview` is the canonical sidebar destination.
- Next.js and package-manager configuration remains at the repository root because the framework requires it.

## Adding or extending a feature

1. Declare module labels, views, fields, filters, and record tabs in `features/product-ui/registry.ts`.
2. Keep the route thin and compose a feature screen from `app/`.
3. Add domain-specific UI under the feature and promote only genuinely reusable patterns to `components/`.
4. Apply organization scope before connecting queries, mutations, files, background jobs, or external integrations.
5. Add appropriate unit, integration, and end-to-end coverage.
