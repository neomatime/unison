# UNISON product UI

The current phase is a front-end visual specification. It contains no API routes, database access, authentication enforcement, external integrations, AI calls, automation execution, or durable CRUD persistence.

## Product modules

The UI covers Overview, Clients, Projects, Tasks, Calendar, Leads, Quotes, Sales, Invoices, Expenses, Forecast, Team, HR, Leave, Knowledge, Atlas, and Settings.

Each applicable module has thin Next.js routes for its workspace, create form, record detail, and edit form. Shared implementations live in `features/product-ui/components`, while module behavior, fields, views, filters, tabs, and labels are declared in `features/product-ui/registry.ts`.

## Mock fixtures

Professional fixture records are isolated in `features/product-ui/mocks/modules.ts`. Local interactions intentionally reset on refresh. The tenant switcher contains HIMARK, Acme Group, Meridian Holdings, and Northstar Advisory as visual contexts.

## Shared interaction model

- Workspaces expose search, filters, sorting, export feedback, list/grid modes, view tabs, bulk selection, row actions, pagination, and populated/loading/empty/error/restricted previews.
- Major record forms use dedicated pages with logical sections, cancel/save controls, required-field indicators, and simulated success feedback.
- Record pages use consistent headers, ownership/status summaries, activity drawers, share/duplicate/export feedback, edit actions, and archive/deactivate confirmation. Documents, people, work items, approvals, related records, Atlas context, and activity each have dedicated tab treatments.
- Specialized visual workspaces cover all calendar modes, project/task boards and timeline, sales pipeline and commercial collections, finance forecasts, Team/HR/Leave subviews, Knowledge home, Atlas conversations/intelligence/memory, and every Settings area.
- Global search, notifications, help, tenant switching, responsive navigation, profile navigation, breadcrumbs, back-navigation, loading boundaries, and fallback pages are designed.
- Client-side route changes show a global progress line and loading status, including programmatic form redirects. Scroll containers retain wheel, keyboard, trackpad, and touch behavior while their native scrollbar tracks are visually hidden.

## Backend boundary

All controls are demonstrative. Connect and save buttons do not call external services. Tenant selection, module toggles, Atlas prompts, archive actions, approvals, invitations, and authentication forms are local UI only.
