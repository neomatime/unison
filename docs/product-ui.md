# UNISON product UI

Seventeen product modules exist as routed screens. Of those, **Clients is the only module connected to the database** — its workspace, create, detail, and edit routes read and write real `clients` rows through `features/clients`, scoped to the active organization and enforced by RLS. Every other module (Projects, Tasks, Calendar, Leads, Quotes, Sales, Invoices, Expenses, Forecast, Team, HR, Leave, Knowledge, Atlas, Overview, Settings) still renders `moduleFixtures` from `features/product-ui/mocks/modules.ts` — no persistence, no API route, local-only interaction that resets on refresh. Authentication enforcement, AI calls, external integrations, and automation execution remain unimplemented outside of what Clients and the auth/tenancy flows use.

## Product modules

The UI covers Overview, Clients, Projects, Tasks, Calendar, Leads, Quotes, Sales, Invoices, Expenses, Forecast, Team, HR, Leave, Knowledge, Atlas, and Settings.

Each applicable module has thin Next.js routes for its workspace, create form, record detail, and edit form. Shared implementations live in `features/product-ui/components`, while module behavior, fields, views, filters, tabs, and labels are declared in `features/product-ui/registry.ts`.

## Mock fixtures

Professional fixture records for the sixteen unconnected modules are isolated in `features/product-ui/mocks/modules.ts`. Local interactions on those modules intentionally reset on refresh. The tenant switcher renders the signed-in user's real organizations and memberships (via `ShellProvider`/`useShellContext`, see below) rather than a fixed visual list.

## Shared interaction model

- Workspaces expose search, filters, sorting, export feedback, list/grid modes, view tabs, bulk selection, row actions, pagination, and populated/loading/empty/error/restricted previews.
- Major record forms use dedicated pages with logical sections, cancel/save controls, required-field indicators, and simulated success feedback.
- Record pages use consistent headers, ownership/status summaries, activity drawers, share/duplicate/export feedback, edit actions, and archive/deactivate confirmation. Documents, people, work items, approvals, related records, Atlas context, and activity each have dedicated tab treatments.
- Specialized visual workspaces cover all calendar modes, project/task boards and timeline, sales pipeline and commercial collections, finance forecasts, Team/HR/Leave subviews, Knowledge home, Atlas conversations/intelligence/memory, and every Settings area.
- Global search, notifications, help, tenant switching, responsive navigation, profile navigation, breadcrumbs, back-navigation, loading boundaries, and fallback pages are designed.
- Client-side route changes show a global progress line and loading status, including programmatic form redirects. Scroll containers retain wheel, keyboard, trackpad, and touch behavior while their native scrollbar tracks are visually hidden.

## Backend boundary

Clients create/edit/archive controls call real server actions against the database (`features/clients/actions`), scoped to the active organization and subject to RLS. Sign-in, invitation send/accept, and tenant switching are also real — they hit Supabase Auth and the `memberships`/`invitations`/`accept_invitation` machinery described in `docs/tenancy.md`, not local state. Everywhere else, controls remain demonstrative: connect/save buttons on the sixteen unconnected modules do not call external services, and module toggles, Atlas prompts, approvals, and automation are local UI only. Password-reset and verification mail still come from Supabase's own sender: Auth's mailer only speaks SMTP, which Microsoft 365 blocks on this tenant, so it cannot use the Graph route invitation mail now takes. Invitation sending is real and proven — a live invitation was delivered from `info@himark.co.za` through Graph on 2026-08-18 — but no one has yet accepted one from a real emailed link, only from fixtures and the RLS suite.
