# Retiring the rate card and package billing

**Date:** 2026-10-13
**Status:** Step 1 (app) is live (PR #45). Step 2 and step 3 are drafted as migrations in PR #46 and are **not applied**:
`20261013230000_retire_rate_card_and_package_billing.sql`, then `20261013240000_drop_retired_billing_columns.sql`
(step 3 refuses to run until step 2 has been applied). The code cleanup that stops reading and writing the retired
columns, and removes `features/billing/rate-card.ts`, is in the same PR. Decisions taken: project names from the HIVE
feed, the 5 locked lines become ordinary lines, the price list screen goes.

Note: while writing the migrations I found the scoping below understated one thing. `duplicate_quote()` and
`create_invoice_from_quote()` copy the retired columns, so the columns could not be dropped in step 2; they go in step 3
after those two functions are rewritten.
**Follows:** `2026-10-13-client-focused-boundary-design.md` (on `claude/awesome-einstein-9eqd4z`), step 4 and step 5.

## Where we are

HIVE Origin is now the source of what can be sold. UNISON reads HIVE's feed (`HIVE_OFFERINGS_URL`) and offers it on draft quotes
and invoices through "Add from HIVE offerings". The old "Add from the rate card" picker is removed (PR #44).

Still using the old rate card (`price_list_items` rows with a `rate_key`, 28 of them):

| Area | What it does today | Where |
|---|---|---|
| Package billing on a client | Set a package, change tier, add support, build first invoice or quote, monthly invoice, top-up invoice | `features/billing/**`, rendered by `features/clients/components/client-detail.tsx` |
| New quote or invoice "Package" list | Starts a document from a tier or project at rate card prices | `features/commercial-finance/**` (`packageKey`, `fill_document_from_package`) |
| Project name and reference suggestions | Names and two-letter codes for the four tiers and five projects | `features/commercial-finance/document-references.ts`, built from `features/billing/rate-card.ts` |
| Terms placeholders | `{{monthly_fee}}`, `{{monthly_credits}}`, `{{initiative_limit}}` read the retainer's rate card row | `features/terms/queries/load-preview.ts`, `features/terms/seed-wording.ts` |
| Price list screen | Shows and edits rate card rows next to custom items | `features/documents/**` (`price-list-screen.tsx`, `price-item-form.tsx`, `price-list.ts`) |
| Database | Functions, triggers, tables listed below | migrations `20261012100000` to `20261012141000` |

## Facts from the live database (read-only check, 2026-10-13)

- 28 rate card rows; 0 custom price list items.
- `client_engagements`: 0 rows. `engagement_support`: 0 rows. Package billing has never been used for a real client.
- 3 quotes and 1 invoice exist. 3 quote lines and 2 invoice lines are rate-locked (they point at rate card rows).
- 22 terms templates exist.
- `quote_lines` and `invoice_lines` reference `price_list_items` with `ON DELETE SET NULL`, so deleting rate card rows does not delete lines, but the lines stay `rate_locked` unless cleared first.
- `quotes`, `invoices`, `engagement_support` reference `client_engagements` with `ON DELETE` rules `a` (no action) and `c` (cascade).
- Triggers to retire with them: `quote_lines_rate_lock`, `invoice_lines_rate_lock`, `price_list_items_rate_guard`, `client_engagements_audit`, `client_engagements_initiative_limit`, `engagement_support_audit` and the two `set_updated_at` triggers.
- Functions: `set_client_package`, `change_retainer_tier`, `fill_document_from_package`, `create_first_document`, `create_monthly_invoice`, `create_top_up_invoice`, `add_rate_card_line`, plus `end_engagement`, `add_support_service`, `end_support_service`, `discard_billing_draft`.

## What replaces each dependency

- **Terms placeholders.** HIVE's feed already carries what they need: the retainer's `price.amount`, `credits.amount` and `projectLimit` (`retainer:<code>`). Read them through the existing client in `lib/integrations/hive-offerings.ts`. If HIVE is unreachable the preview must say so rather than print blanks.
- **Project name and reference suggestions.** Either read the offering names from the feed, or keep a small static list of names. The two-letter reference codes are UNISON's own convention and are not in HIVE.
- **"Package" list on a new quote or invoice.** Dropped. Lines are added on the draft from HIVE offerings, the price list, or by hand.
- **Package billing on a client** (first invoice, monthly invoice, top-ups, tier changes). Dropped. Retainers, credits and delivery belong to HIVE under the boundary spec. No data is lost because nothing was ever created.

## Proposed order (each its own reviewed change)

1. **App only, reversible.** Remove the package billing section from the client page, the "Package" list from the new quote and invoice form, and the rate card rows from the price list screen. Move the terms placeholders and the project-name suggestions to their replacements above. Existing documents, the database and all data stay as they are.
2. **Backup, then a database migration, applied by you.**
   - Back up first: `scripts` export or a Supabase backup of `price_list_items`, `quote_lines`, `invoice_lines`, `quotes`, `invoices`, `client_engagements`, `engagement_support`.
   - Clear `rate_locked` on the 5 affected lines (they keep their title, price and totals, and become ordinary editable lines on drafts; sent or issued documents stay frozen by their own rules).
   - Drop the rate lock and guard triggers, then the billing functions, then `engagement_support` and `client_engagements` (empty), then the rate card rows. Columns `engagement_id`, `rate_locked` and the rate columns on `price_list_items` are dropped last, in their own step, once nothing reads them.
   - Existing issued documents keep their numbers, wording and totals. Nothing issued changes.
3. **Cleanup.** Delete `features/billing`, `rate-card.ts`, the tests that pin them, and the old migrations' unit tests; update docs.

## Risks

- **Terms placeholders are the one live dependency.** They are used by the commercial terms screens and by the fill action on documents. Step 1 must switch them before anything is dropped, and the unit tests that pin the seed wording (`terms-seed.test.ts`) need the new source.
- **Locked lines.** Dropping the lock trigger before clearing `rate_locked` leaves lines that cannot be edited and cannot be explained. Order matters.
- **Dropping is irreversible.** It runs on the production database. It needs a backup, your approval of the exact SQL, and a rollback note, as the boundary spec already requires.
- **HIVE availability.** Terms previews and the picker now depend on HIVE being reachable. Both degrade with a message; neither blocks saving a document.

## Decisions needed from you

1. Project name suggestions on new documents: read from HIVE, or keep a small fixed list?
2. The 5 rate-locked lines: convert to ordinary lines (recommended), or leave them locked and keep the guard trigger for them?
3. Price list screen: after the rate card rows go, keep it for custom items only, or remove it as well?
4. Go-ahead for step 1 (app-only) as the next change.
