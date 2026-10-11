# Registers that scale: search, filter, sort, paging, one-record detail pages and export (Stage 3, part 1)

**Date:** 2026-10-11
**Status:** Awaiting review
**Origin:** Stage 3 of `docs/crm-roadmap.md`. The five commercial and finance registers (Leads, Quotes, Sales, Invoices,
Expenses) load every row of their table and search, filter, sort and page it in the browser; Supabase silently stops at
1,000 rows, so past that point rows disappear without a warning. A detail page loads the whole table to find one record.
The summary cards count only what was loaded. This part makes those registers, their detail pages and their export work
at any size. Sales targets and a reports page are a separate, later design (Stage 3, part 2).

## Intent

A member opens a register with ten thousand rows, searches, filters, sorts and pages quickly, shares the link, and exports
exactly what they see. Success is that nothing is ever silently missing, the numbers on the cards are true for the whole
register, a detail page loads one record, and every control on the screen does what it says.

Decisions made with the user in design:

- **Registers and export first; targets and reports later** (their own design).
- **Filters:** one search box, a status list, an owner list and a "Show archived" switch, the same on all five registers.
  No date or amount ranges.
- **The database serves one page at a time.** The app asks for one page and the true total; the summary cards come from
  small database functions. Row security keeps every organisation apart.
- **Archive and Restore become real; Duplicate is left out.** Today Archive, Restore, Duplicate and "archive selected"
  in these registers change only what is on screen until the page is reloaded; nothing is saved. Archive and Restore will
  save (they set and clear the record's archived date); Duplicate is dropped from these registers (quotes already have a
  real "Duplicate as new draft" on their own page).
- **The shared register component is not touched.** It keeps serving the other modules; these five registers get a new
  server-driven screen beside it.

## Scope

**In:** the register rules (one definition per register); the page-address reader; the page query layer; the
`register_summary` database function; the new register screen (search, status, owner, archived, sort by heading, 25 rows
per page, link that remembers, summary cards, empty and error states); real Archive and Restore actions; detail pages that
load one record; export of everything matching the current filters across all pages, with a clear message above 5,000
rows; the forecast ignoring archived invoices; tests, preview check, roadmap ticks.

**Out, and why:**

- **Sales targets and reports.** Their own design.
- **Date and amount range filters, saved views, choosing which columns to show, a page-size choice.** Not asked for; the
  page is 25 rows.
- **Duplicate and bulk archive.** Duplicate only pretended to work; bulk selection goes away with the shared component's
  client-side model (the export is of the whole result, not of ticked rows).
- **Scaling the other registers** (clients, projects, tasks and the rest of the shared component's users), and the long
  select lists on the New and Edit forms (a clients list with thousands of entries). Follow-ups.
- **Importing:** the existing Import page is linked as it is today for leads, sales and expenses; it is not changed.
- **Role rules.** Every active member can archive and restore, as for editing today.

## Data

### The register rules (`features/registers/register-spec.ts`, pure)

One definition per register, used by the screen, the page query and the export, so what matches can never differ between
them. For each of `lead`, `quote`, `opportunity`, `invoice`, `expense`:

| | Table | Searched columns | Status column and values | Owner column | Sortable columns | Default order |
|---|---|---|---|---|---|---|
| Leads | `leads` | `company_name`, `contact_name`, `contact_email` | `status`: New, Contacted, Qualified, Disqualified, Converted | `owner_id` | `company_name`, `contact_name`, `source`, `estimated_value`, `status`, `created_at` | `created_at` descending |
| Quotes | `quotes` | `quote_number`, `client_name` | `status`: Draft, Internal Review, Sent, Accepted, Declined, Expired | `owner_id` | `quote_number`, `client_name`, `total_amount`, `valid_until`, `status`, `created_at` | `created_at` descending |
| Sales | `sales_opportunities` | `name`, `client_name` | `stage`: Discovery, Qualified, Proposal, Negotiation, Won, Lost | `owner_id` | `name`, `client_name`, `stage`, `expected_value`, `probability_percent`, `expected_close`, `created_at` | `created_at` descending |
| Invoices | `invoices` | `invoice_number`, `client_name` | `status`: Draft, Issued, Partially Paid, Paid, Overdue, Cancelled | `owner_id` | `invoice_number`, `client_name`, `issue_date`, `due_date`, `total_amount`, `balance_amount`, `status`, `created_at` | `created_at` descending |
| Expenses | `expenses` | `description`, `vendor_name`, `category` | `status`: Draft, Submitted, Awaiting Approval, Approved, Rejected | `submitted_by` | `description`, `category`, `vendor_name`, `amount`, `expense_date`, `status` | `expense_date` descending |

(A draft quote or invoice carries a generated `DRAFT-xxxxxxxx` reference, so searching "draft" finds drafts.) Each also
names its export collection (`leads`, `quotes`, `sales-opportunities`, `invoices`, `expenses`), its labels and its row
route base. The status lists are tested against the database checks, like the other vocabularies.

### The page address reader (`features/registers/read-register-params.ts`, pure)

Turns the page address into `{ q, status, owner, archived, sort, dir, page }`, checked against the rules. A sort column,
status or owner that is not on the register's list is ignored and the default used; a page number below 1 is 1; a page
past the end is clamped to the last page by the screen. The search text is cleaned so it cannot change the query: only
letters, digits, spaces and `. @ + ' -` are kept, runs of anything else become one space, it is trimmed and cut to 120
characters, and under 2 characters means no search ("Enter at least 2 characters to search." is shown).

### The page query (`features/registers/queries/query-register.ts`, server only)

Asks the database for exactly one page: the register's table, `organization_id` equal to the caller's, `archived_at` empty
unless "Show archived" is on, the status and owner filters, the search as a case-insensitive match over the searched
columns, ordered by the chosen column and then by `id` (so paging is stable), the requested 25-row range, with the exact
total. The rows are turned into the screen's records by the existing mapping, now a function of one row. Names (owner,
project, vendor and so on) are looked up only for the ids on the page, not by loading every member, client and project.
A failed read throws; nothing falls back to an empty table.

### `register_summary(p_org uuid, p_kind text) returns jsonb` (new)

`security invoker` (row level security applies), `search_path = ''`, executable by `authenticated`. Counts and sums over
the register's **non-archived** rows, with the same cards as today:

| Register | Cards |
|---|---|
| Leads | Active leads, Qualified, Estimated value |
| Quotes | Active quotes, Accepted, Quoted value (`total_amount`) |
| Sales | Open opportunities (not Won or Lost), Pipeline value, Weighted forecast (value times probability) |
| Invoices | Invoices, Outstanding (balance of Issued, Partially Paid and Overdue invoices with a balance), Overdue (count) |
| Expenses | Recorded spend, Awaiting approval (Submitted or Awaiting Approval), Approved spend |

Money figures are returned per currency. The card shows the total for the main currency (ZAR when present, otherwise the
first by name) and, when other currencies exist, its detail says so ("other currencies not included"); amounts in
different currencies are never added. An unknown `p_kind` raises `REGISTER_KIND_UNKNOWN`.

### Archive and Restore (`features/registers/actions/archive.ts`)

`archiveRecordAction(kind, id)` and `restoreRecordAction(kind, id)`: check the kind and the id, set or clear `archived_at`
on the register's table for the caller's organisation, refresh the register pages, the detail page, the dashboard and the
forecast. They write only that column; the existing row security and document rules still apply. An already archived record
cannot be archived again and a record that is not archived cannot be restored (plain messages).

### The forecast ignores archived invoices (migration)

`forecast_months` (slice C) filters opportunities by `archived_at` but not invoices, which did not matter while nothing
could archive an invoice. A new migration recreates it with `i.archived_at is null` on the unpaid-invoices part, and the
summary function's Outstanding already excludes archived rows.

## Behaviour

### The register screen (`features/registers/components/register-screen.tsx` and a small client toolbar)

For each of the five registers, under the existing page header and New button:

- **Summary cards** (above), over all non-archived rows, not just the page and not the filtered result.
- **Toolbar:** the search box, the status list, the owner list (the organisation's active team members) and the "Show
  archived" switch. Changing any of them changes the page address and returns to page 1. A "Clear filters" link appears
  when any is set. Export and Import (leads, sales and expenses, as today) sit in the toolbar.
- **Table:** the register's columns as today; the sortable headings are buttons (ascending, then descending, with a visible
  arrow and `aria-sort`); the first column links to the record; each row has a menu with View, Edit and Archive (Restore on
  an archived row).
- **Footer:** "Showing 26–50 of 1,243", Previous and Next (disabled at the ends), "Page 2 of 50".
- **The link remembers:** `?q=...&status=...&owner=...&archived=1&sort=...&dir=...&page=...`; a refresh, the back button
  or a shared link restores the same view.
- **States:** "Nothing matches these filters" with Clear filters; the register's own empty message when it has no rows at
  all; a clear error when the read fails (never a blank table or zero totals).
- It works at phone width (the table scrolls inside its frame; the toolbar wraps).

`PhaseSixRegister` keeps its name and the five page files keep calling it (they now pass `searchParams`); it renders the new
screen for these five kinds. The old forecast branch stays (unreachable, as recorded in slice C).

### Detail pages

`getPhaseSixRecord(kind, id)` reads one row by its id for the caller's organisation and maps it; a missing record, another
organisation's record or a malformed id is "not found". The detail pages no longer call the list functions.

### Export

`GET /api/records/export` gains the register filters (`q`, `status`, `owner`, `archived`, `sort`, `dir`) for the five
register collections. With them it exports **everything that matches, across all pages**, as CSV, Excel or PDF, using the
same rules and cleaning as the screen. It reads at most 5,001 rows; if more than 5,000 match it answers 413 "More than
5,000 rows match. Narrow the search and try again." and sends no file (today it silently stops at 5,000). The same cap and
message apply to the other collections that use the route. Exporting only ticked rows goes away for these registers.

## Errors

Plain messages: "Nothing matches these filters.", "Enter at least 2 characters to search.", "More than 5,000 rows match.
Narrow the search and try again.", "The register could not be loaded.", "That record was not found.", "This record is already
archived.", "This record is not archived." A failed read shows an error, never blank totals.

## Testing

- **Unit:** the register rules (columns, statuses equal to the database checks); the page-address reader (a bad or hostile
  sort, status, owner, page 0, a huge page, search text with commas, brackets, percent signs, quotes, underscores and a
  500-character string, a single character); the page arithmetic ("Showing 26–50 of 1,243", the last partial page, an empty
  result, a page past the end); the card figures and the main-currency rule; source guards for the client and server
  boundary and for no raw column names taken from the address.
- **Database (RLS suite, fixture organisations, cleaned up including audit events; this is production):**
  `register_summary` gives the right figures for each register, ignores archived rows, never adds currencies and refuses an
  unknown kind; another organisation sees nothing and a non-member gets nothing; **a register with more than 1,000 rows
  pages correctly to its last row with the exact total** (1,100 fixture invoices read through a signed-in client: page 1,
  page 44 and the 1,001st row), proving the cut-off is gone; the forecast ignores an archived invoice.
- **Server actions and export:** archive and restore refuse an unknown kind, a malformed id, another organisation's record
  and a repeat; the export applies the same filters as the page, includes every page, excludes other organisations, and
  answers 413 above 5,000 (tested through the shared query builder, not through real mail or files).
- **Preview:** the register at desktop and phone width with fixture data: search, status, owner, sort, paging, empty and
  error states.
- **Not covered by anything automated:** speed on real data at scale. The query plans for the main filters are checked once
  and any missing index is recorded as a follow-up.

## Order of work

1. The register rules, the page-address reader, the query layer, `register_summary` and the forecast change, with tests.
2. The register screen and Archive and Restore, switched on for Invoices first, then Quotes, Leads, Sales and Expenses;
   the detail pages load one record.
3. Export with the filters and the 5,000-row message.
4. Checks, follow-ups, roadmap ticks and the user's signed-in checklist.

## Global constraints

- `unison-uat` is production. Every test row is deleted, with its audit events; rolled-back probes before applying any
  migration; only the controller applies migrations.
- Migrations are append-only. Decisions are made in the database and tested there; the UI mirrors them.
- A control in the UI is a claim the product supports it: nothing on these registers pretends to save.
- Nothing from the page address reaches the database except through the register rules' allow-lists and the cleaned search.
- No real address, bank, VAT or phone value in code or tests. Secrets live in `.env.local` only.
- Never `git add -A`; stage explicit paths. Do not touch `public/` or
  `features/product-ui/components/record-collection-workspace.tsx` or
  `features/commercial-finance/components/record-collection-workspace.tsx`. Commit and push only when the user asks.

## Amendments made while planning and building

Small, deliberate departures from the text above, each decided with a reason and recorded in the plan and its ledger.

1. **"Show archived" shows only archived records** (as the shared register does today), not archived and active together.
2. **The page address names a sortable column by its screen column id** (`sort=due`); the register rules map each id to its
   database column, and the default order (for example `created_at`) is used when `sort` is absent.
3. **The Sales "Weighted forecast" card counts open opportunities only.** The old card multiplied every row, Won and Lost
   included, which inflated it.
4. **Row actions are inline links and buttons** (View, Edit, Archive or Restore), not a menu, so they work without scripts.
5. **The Import button links to the existing import page** with the slug the shared register derives, and appears only for
   registers that have import columns (leads, sales, expenses).
6. **The toolbar is a small client component; the table, headings, paging and row actions are server rendered links and
   forms.** A "Clear filters" link sits in the toolbar whenever a filter is set (and in the empty state).
7. **A page past the end is handled by the query layer:** PostgREST answers such a range with an error (PGRST103), so the
   layer reads page 1 for the total and then the last page.
8. **Names (owner, project, vendor, client, quote, lead, opportunity) are looked up only for the ids on the page** and now
   resolve even for archived or inactive owners, vendors and projects (the old lists left those as "Unassigned" or "—").
9. **The owner filter accepts any well-formed uuid** (lower-cased); one that is not in the active list shows as "Former member"
   in the list and simply matches nothing.
10. **The export cap applies to every collection that uses the route,** not only the five registers: more than 5,000 matching
    rows is a 413 with a message instead of a silent cut-off.
11. **The test cleanup helper pages past PostgREST's 1,000-row cap, and the 1,100-invoice test removes exactly its own audit
    rows by id.** The shared helper cannot reach the 2,200 audit rows that many fixture invoices write.
12. **The export first counts the matching rows (a count-only query, so the 1,000-row server limit does not apply), refuses
    with the message above 5,000, and then reads the rows in ranges of 1,000.** The first version asked for 5,001 rows in one
    request, which the server cut to 1,000 without saying so; the final review caught it.
