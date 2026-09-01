# UNISON product UI

Clients remains the only product module connected to the database: its workspace, create, detail and edit routes read and write real `clients` rows through `features/clients`, scoped to the active organization and enforced by RLS. Team now uses a dedicated front-end implementation under `features/team`; its interactions are UI-only and reset on refresh. Other unconnected modules continue to use fixture-driven front-end behavior. Authentication enforcement, AI calls, external integrations and automation execution remain outside this UI layer.

## HIMARK internal provisioning

HIMARK administrators have a distinct `/internal/*` workspace with its own platform, provisioning, and support navigation. It includes organisation, provisioning, tenant, subscription, support, and knowledge registers plus a six-stage client provisioning journey: Organisation → UNISON Tier → Modules → Delivery Setup → Admin & Access → Review & Provision.

The wizard uses `config/unison-tiers.ts` for all entitlement calculations. UNISON Core includes Delivery and Team; Framework adds Operations; Enterprise includes every current product module. Strategic Enterprise is the client-configured tier and currently receives the full Enterprise module set until the Strategic tenant-configuration layer is implemented — a temporary implementation state, not a product rule. Delivery and Team are locked on. Entitled optional modules can be disabled, while modules outside the selected tier remain unavailable. Tier downgrades reconcile activation safely and explicitly state that disabled module data is preserved.

The internal workflow is a complete UI simulation only. Save Draft, organisation creation, subscription changes, invitations, sequential provisioning, failure recovery, retry, and success experiences do not persist or invoke a provisioning backend. The existing tenant-facing `Operations → Onboarding` feature is unchanged.

## Product modules

People contains one active module: Team. It covers the directory, departments, delivery teams, roles, project assignments, capacity, delivery availability and accountability activity. The former HR and leave workspaces are not product modules; their legacy URLs redirect to Team so old bookmarks do not expose orphan interfaces.

Each applicable module has thin Next.js routes for its workspace, create form, record detail, and edit form. Shared implementations live in `features/product-ui/components`, while module behavior, fields, views, filters, tabs, and labels are declared in `features/product-ui/registry.ts`.

## Mock fixtures

Professional fixture records for the sixteen unconnected modules are isolated in `features/product-ui/mocks/modules.ts`. Local interactions on those modules intentionally reset on refresh. The tenant switcher renders the signed-in user's real organizations and memberships (via `ShellProvider`/`useShellContext`, see below) rather than a fixed visual list.

## Shared interaction model

- Workspaces expose search, filters, sorting, export feedback, list/grid modes, view tabs, bulk selection, row actions, pagination, and populated/loading/empty/error/restricted previews.
- Major record forms use dedicated pages with logical sections, cancel/save controls, required-field indicators, and simulated success feedback.
- Record pages use consistent headers, ownership/status summaries, activity drawers, share/duplicate/export feedback, edit actions, and archive/deactivate confirmation. Documents, people, work items, approvals, related records, Atlas context, and activity each have dedicated tab treatments.
- Specialized visual workspaces cover all calendar modes, project/task boards and timeline, sales pipeline and commercial collections, finance forecasts, the complete Team accountability workspace, Knowledge home and every Settings area.
- Global search, notifications, help, tenant switching, responsive navigation, profile navigation, breadcrumbs, back-navigation, loading boundaries, and fallback pages are designed.
- Client-side route changes show a global progress line and loading status, including programmatic form redirects. Scroll containers retain wheel, keyboard, trackpad, and touch behavior while their native scrollbar tracks are visually hidden.

## Backend boundary

Clients create/edit/archive controls call real server actions against the database (`features/clients/actions`), scoped to the active organization and subject to RLS. Sign-in, invitation send/accept, and tenant switching are also real — they hit Supabase Auth and the `memberships`/`invitations`/`accept_invitation` machinery described in `docs/tenancy.md`, not local state. The **"Continue with Microsoft" button on `/sign-in` is no longer demonstrative** — it posts to `signInWithMicrosoftAction()` and starts a real OAuth redirect through Supabase's Azure provider; there is no local completion state for it to fall back to. Everywhere else, controls remain demonstrative: connect/save buttons on the sixteen unconnected modules do not call external services, and module toggles, Atlas prompts, approvals, and automation are local UI only. Password-reset and verification mail still come from Supabase's own sender: Auth's mailer only speaks SMTP, which Microsoft 365 blocks on this tenant, so it cannot use the Graph route invitation mail now takes. Invitation sending is real and proven — a live invitation was delivered from `info@himark.co.za` through Graph on 2026-08-18 — but no one has yet accepted one from a real emailed link, only from fixtures and the RLS suite.
