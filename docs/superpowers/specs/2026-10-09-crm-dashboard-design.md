# CRM dashboard and navigation

**Date:** 2026-10-09
**Status:** Approved by instruction (the brief said to proceed after inspecting); built on `feat/crm-dashboard`
**Origin:** the "UNISON CRM Dashboard Redesign" brief. UNISON is now HIMARK's CRM, not a delivery
platform. The reference image sets the visual direction only.

## What the inspection found (and what it changed)

- **No new tables are needed.** `clients`, `leads`, `sales_opportunities` (the "Sales" module), `quotes`,
  `invoices`, `tasks`, `vendors`, `client_onboardings` all exist, are organisation-scoped and have RLS.
- **Live data is empty.** Production holds 0 rows in every one of those tables. Every figure will show a
  confirmed zero or an empty state, and verification uses fixture organisations that are deleted afterwards.
- **There is no organisation currency, timezone or financial-year setting.** Currency is a column on each
  record, so money is never summed across currencies. The reporting timezone is `Africa/Johannesburg`, the
  platform default already used by automation schedules, and the year is the calendar year. Both are
  constants in one place, not an organisation setting.
- **`audit_events` is readable by owners and admins only.** A feed built on it would be empty for members,
  so Recent Activity is built from the record timestamps every member can already read.
- **Entitlement is by tier** (`config/unison-tiers.ts`). A tenant on a tier without a module must see
  "not included in your plan", never a zero.
- **A real accuracy defect sits under the revenue figure.** `savePhaseSixRecordAction` rebuilds
  `won_at = now()` on every save of a Won opportunity (and `sent_at` / `accepted_at` on quotes). Editing a
  deal won in March in October would re-date the revenue to October, or into the next year. A database
  trigger now makes those timestamps stick. This is a correction, not a workflow change.
- **Search already indexes** clients, leads, quotes and vendors, so the new placeholder is true.

## Data map and definitions

| Dashboard piece | Source | Definition |
|---|---|---|
| Total Clients | `clients` | `archived_at is null` (the Clients list's own filter). Comparison: count at the end of last month, rebuilt from `created_at` / `archived_at`; shown only when that count is above zero. |
| Open Leads | `leads` | `archived_at is null` and status `New`, `Contacted` or `Qualified`. `Converted` and `Disqualified` are closed. No status history exists, so **no comparison is available**; the card shows leads created this month instead. |
| Active Quotes | `quotes` | `archived_at is null` and status `Draft`, `Internal Review` or `Sent`. `Accepted`, `Declined`, `Expired` are resolved. The schema has no revision or supersede link, so nothing can be double counted. No status history, so **no comparison**. |
| Sales Revenue (YTD) | `sales_opportunities` | Stage `Won`, not archived, `won_at` this calendar year, summed **per currency**. This is sales booked, not invoiced and not collected. Comparison: the same elapsed period last year, only when exactly one currency is present and last year's figure is above zero. |
| Pipeline | `sales_opportunities` | Stages `Discovery`, `Qualified`, `Proposal`, `Negotiation` (open) and `Won` this year (closed, shown apart). `Lost` and archived are excluded. Per stage: count, per-currency totals, top three by value. A value of 0 renders as "No value" because the schema cannot tell zero from unset. Leads are not in the pipeline: a lead that converts is represented by its opportunity. |
| Revenue Overview | `sales_opportunities` | Won revenue by `won_at` month and pipeline value by `expected_close` month, per currency. Pipeline is shown only for the current month onward, because past pipeline cannot be reconstructed. Pipeline with no close date, a past close date, or a close date next year is counted and disclosed, not charted. |
| Recent Activity | record timestamps | Lead, client, quote, opportunity, invoice, vendor and onboarding creation, plus quote sent / accepted and opportunity won, each from its own exact timestamp. "Lead converted" and "onboarding completed" have no timestamp of their own, so they are not shown. |
| My Tasks | `tasks` via `team_members.user_id` | Open tasks (not Complete / Cancelled, not archived) assigned to the signed-in user, soonest due first. "View all tasks" goes to the existing `/operations/tasks`. |

## Navigation

Overview; People: Team; Operations: Clients, Onboarding, Vendors; Commercial: Leads, Quotes, Sales;
Finance: Invoices, Expenses, Forecasting. The Delivery section is gone; Portfolio, Projects, Frameworks
and Approvals leave the sidebar but their routes, tables and tier entitlements are untouched. Vendors moves
under Operations by category only; its tier entitlement does not change.

## Architecture

- One migration adds four read-only, `security invoker` SQL functions (`crm_overview_kpis`, `_pipeline`,
  `_revenue`, `_activity`), so RLS still scopes every row, each function refuses a non-member with 42501, and
  nothing is capped by PostgREST's row limit. They take the caller's entitled module ids and return `null`
  for a section the tier excludes.
- Each section loads independently; one failing never blanks the others.
- Pure helpers (`metrics.ts`) hold percent change, greeting, money formatting, chart bucketing and activity
  wording, and are unit tested without a database. The SQL is tested against fixture organisations.
- No chart dependency is added; bars are plain SVG / CSS.

## Known limits

- A consequence of the brief: Core and Framework tenants lose sidebar access to their main modules.
- The old Delivery overview components stay in the repo, unused.
- No organisation timezone / currency / financial year setting exists to read.
- `invoices.paid_at` has the same re-stamping behaviour as `won_at` and is not fixed here.
