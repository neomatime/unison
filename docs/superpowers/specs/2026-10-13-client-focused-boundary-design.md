# UNISON is client-focused: the HIVE boundary

**Date:** 2026-10-13
**Status:** Draft for review (nothing removed or built yet)
**Decision (from the owner):** UNISON manages clients. The HIVE ecosystem (HIVE Origin) owns projects, retainers, credits and delivery.
UNISON must let a client be managed, quoted and invoiced, with all the CRM; HIVE links those clients to the projects and retainers
already configured there. Credit allocations (the old "Build 3") are HIVE's, not UNISON's, and are dropped.

Answers given:
1. UNISON exposes an **API**; HIVE calls it.
2. HIVE **only reads** clients. Nothing flows back in this version.
3. The project and delivery features in UNISON are **removed**.
4. Quotes and invoices offer **what HIVE offers**: the offering catalogue comes from HIVE, not from a UNISON rate card.

## What UNISON is after this change

Clients, contacts, leads, sales opportunities, quotes, invoices and payments, documents and their terms, the CRM overview and
activity timeline, company and organisation settings, sign-in, memberships and the internal provisioning area.

## Classification of today's features

Remove (project, retainer, credit and delivery; clear-cut):
- Projects, delivery items, dependencies, risks, decisions, requirements and evidence, traceability (`operations/projects`, tables
  `projects`, `delivery_items`, `project_*`, `requirement_*`, `delivery_item_phase_history`).
- Portfolios, programmes, frameworks and framework phases, governance gates and artefacts (`delivery/portfolio`, `delivery/frameworks`).
- Client engagements, support attachments, the initiative limit, credit top-ups, "first" and "monthly" invoice creation from a package
  (`client_engagements`, `engagement_support`, `create_first_document`, `create_monthly_invoice`, `create_top_up_invoice`,
  `set_client_package`, `change_retainer_tier`, `fill_document_from_package`, rate card credit and package columns).
- Azure DevOps / Jira reference integrations (they exist to reference delivery work).
- `project_assignments` (team to project).

Needs a decision (not clearly project work; each is listed with what depends on it):
- **Tasks** (`operations/tasks`): may be CRM follow-ups or project tasks.
- **Approvals** and **vendors** (`delivery/approvals`, `delivery/vendors`): the approval flow and vendor register sit under Delivery.
- **Expenses** and the **financial forecast**: the forecast is built from engagements and invoices.
- **Team, HR and leave**: not client management; used by `owner` fields in the CRM.
- **Calendar, client onboarding, knowledge, support tickets, automations, background jobs**: general operations.

Keep as they are:
- Everything in "What UNISON is" above, plus the terms engine (Builds 1 and 2). Terms templates stay keyed by an offering key; the key
  now refers to a HIVE offering rather than a UNISON rate card row.

## The API for HIVE

- Read-only, versioned: `GET /api/v1/clients` (list, with `updated_since` and cursor paging) and `GET /api/v1/clients/{id}` (the single-client route has not been built).
- Fields: id, name, status, billing details (address, VAT number, billing email), owner, primary contact and contacts, timestamps.
  Nothing about quotes or invoices unless asked for later.
- Authentication: one API key per organisation, shown once at creation, stored hashed, revocable, with a last-used time and an audit entry;
  created and revoked by an owner or admin in Settings. Calls are rate limited and always scoped to the key's organisation.
- No writes, no webhooks in this version (HIVE pulls).

### Narrowing the feed (optional, added with quote portal slice 3)

By default the feed returns every client of the key's organisation, as described above. Quote portal slice 3 adds a setting that can narrow it
(`2026-10-18-quote-portal-design.md`, "Slice 3: HIVE feed gate").

- **The setting.** `organization_settings.hive_feed_requires_accepted_quote`, default false. An owner or admin changes it in Settings > Integrations,
  with an acknowledgement that HIVE's maintainers have been told. It stays off until they have been told. While it is off, the feed is unchanged.
- **The rule when on.** A client is returned only while the organisation has at least one non-archived quote for it with status Accepted, whether it
  was accepted on the portal or marked Accepted by staff.
- **`updatedAt` and `updated_since`.** When the setting is on, both use the later of the client's own `updated_at` and its latest `accepted_at`, so an
  acceptance reaches an incremental pull at the acceptance time. The value can also move backwards: if a later acceptance is moved back or archived
  while an earlier one remains, the latest `accepted_at` is the earlier one.
- **The response shape does not change,** on or off, and nothing about quotes is added to it.
- **Leaving the feed.** A client whose last non-archived Accepted quote is moved back (or archived) leaves the feed. UNISON cannot take back what HIVE
  has already read, and what HIVE does with a client that leaves the feed is up to HIVE.
- **Edits outside the feed.** While the setting is on, clients outside the feed, and their edits, do not reach HIVE. After the setting is switched off,
  HIVE should read the whole feed once without `updated_since`: the clients that were left out have their own, older `updated_at` as `updatedAt`, so an
  incremental pull would skip them.

## Offerings from HIVE

Quotes and invoices need a list of what can be sold and at what price. That list is HIVE's. UNISON needs a source for it: either HIVE
exposes a catalogue endpoint that UNISON reads and caches, or an administrator maintains a copy. **Open:** which one, and the shape of
HIVE's offering keys and prices.

## Order of work (each step is its own reviewed change)

1. This spec approved and the borderline items decided.
2. API: tables for keys, key management screen, the two read endpoints, tests.
3. Remove the clear-cut features from the app: routes, navigation, queries and actions, tests; keep the data.
4. Replace the rate card and package invoicing with the HIVE offering source (blocked on the open question above).
5. Drop the removed tables and functions from the database in a reviewed migration, after a backup and after HIVE confirms it has
   what it needs. Dropping is irreversible and affects production data, so it is its own step with its own approval.

## Risks

- Removing tables that quotes, invoices, forecasts or CRM views still reference (engagement links on quotes and invoices, `owner_id`
  to team members). Each reference is found and handled in step 3 before anything is dropped.
- The terms engine placeholders `{{monthly_credits}}` and `{{initiative_limit}}` read the rate card; they need a new source or removal.
- Existing documents keep their numbers, wording and totals. Nothing issued is changed.
