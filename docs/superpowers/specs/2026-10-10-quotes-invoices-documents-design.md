# Quotes and invoices as real documents (Stage 2, slice A)

**Date:** 2026-10-10
**Status:** Awaiting review
**Origin:** Stage 2 of `docs/crm-roadmap.md`. A quote or invoice today is a flat record with a hand-typed number,
subtotal, tax and total, and no lines. HIMARK supplied two design mock-ups (a quote and an invoice) that share one
layout. This slice makes the numbers real and shows the finished document on screen. The PDF file, email, quote to
invoice, payments, automatic Overdue and the forecast are later slices.

## Intent

A salesperson builds a quote from lines (picked from a price list or typed), sees the VAT and total work themselves
out, sends it, and gets a numbered, frozen document that looks like the HIMARK design. An invoice is built and issued
the same way. Success is that no total or number is ever typed, no sent document can be quietly changed, and the
on-screen document matches the design with real data.

Decisions made with the user in design:

- **Slice A includes** line items, a price list, generated numbers, VAT and totals, company (issuer) settings, and an
  **on-screen document page** with print styling. The PDF file download comes with email in slice B.
- **Separate counters** for quotes and invoices, shown as `HIM-Q-2026-00001` and `HIM-I-2026-00001`: a per-organisation
  prefix, a type letter, the year, and a five-digit counter that restarts each January.
- **A document is locked once sent or issued.** Drafts are editable; a sent quote or issued invoice is frozen. A quote is
  revised by duplicating it as a new draft; an invoice is corrected by cancelling it and raising a new one.
- **A managed price list plus free-text lines.**
- **The database is the authority** for totals, numbers, snapshots and the freeze (as `convert_lead` is for conversion).
- VAT: **Standard (15%) or Zero-rated** per line. The mock-up phone, bank and VAT numbers are placeholders; real values
  are entered in settings and appear nowhere in code.
- `public/brand/banner.png` is the header photo.

## Scope

**In:** the data below; send-quote and issue-invoice functions; the line editor; the document pages; company details and
price list pages; client address and VAT number; tests, preview check, roadmap ticks.

**Out, and why:**

- **PDF file and email sending:** slice B (they need a PDF renderer and a sending provider).
- **Quote to invoice in one step, payments, the invoice balance, automatic Overdue, the forecast:** slices B and C.
- **Discounts, Exempt VAT, several VAT rates, multiple currencies on one document:** not needed for the designs.
- **Uploading logos or header images:** settings hold paths to files in `public/brand`; HIMARK's point at
  `banner.png` and the wordmark. An organisation with none gets a plain header.
- **CRM roles:** every active member can build, send and issue. Only the company details are limited to owners and admins.

Production holds no quotes or invoices (one real client, no leads), so the new rules apply with nothing to migrate.

## Data

All new keys include `organization_id` (composite foreign keys), as in the rest of the schema.

### `organization_settings` (new, one row per organisation)

Legal name; address (line 1, line 2, city, postal code, country); VAT number; email, phone, website; bank name, account
name, account number, branch code, account type; `document_prefix` (for example `HIM`); `vat_rate` (default 15.00);
default quote terms (text, one numbered item per line); default payment terms; `default_quote_valid_days` and
`default_payment_days` (both 30); `logo_path` and `header_image_path` (paths under `public/brand`, nullable). Members
read; owners and admins write. Carries the audit trigger and `set_updated_at`.

### `price_list_items` (new)

`title` (required), `description`, `unit_price` (>= 0), `vat_code` (`standard` or `zero`), `archived_at`. Any active
member reads, creates, edits and archives. Not deleted, so a line's reference stays meaningful.

### `quote_lines` and `invoice_lines` (new)

`position`, `title` (required), `description`, `quantity` (> 0, up to 3 decimals), `unit_price` (>= 0), `vat_code`,
`line_amount` (generated: `round(quantity * unit_price, 2)`), `price_list_item_id` (nullable, `on delete set null`; a
line keeps its own copy of the values). The parent is a composite foreign key, `on delete cascade`.
`unique (parent, position)`. Audit trigger on update and delete.

### `document_counters` (new)

`(organization_id, kind, year)` with `last_number`. No privileges for members; written only by the numbering function.
`next_document_number(kind)` takes a row lock, increments, and returns `prefix-Q-YYYY-NNNNN` or `prefix-I-YYYY-NNNNN`.

### Changes to existing tables

- **`clients`:** `address_line1`, `address_line2`, `city`, `postal_code`, `country`, `vat_number`.
- **`quotes`:** add `issue_date`, `project_name`, `project_description`, `project_ref`, `client_ref`, `vat_rate`,
  `bill_to` (jsonb snapshot: name, address lines, VAT number) and `issuer` (jsonb snapshot of the company details at
  send time). `quote_number` becomes nullable, with a check that it is set once the status is not `Draft` or
  `Internal Review`. `subtotal`, `tax_amount`, `total_amount` become **calculated**.
- **`invoices`:** the same additions (`project_name`, `project_description`, `project_ref`, `client_ref`, `vat_rate`,
  `bill_to`, `issuer`), `invoice_number` nullable with a check that it is set once the status is not `Draft`, and the
  amounts calculated. `balance_amount` is set to the total when the invoice is issued (payments are slice C).
- **Existing statuses and the `unique (organization_id, number)` rules are unchanged.**

## Behaviour

### Totals

`line_amount = round(quantity * unit_price, 2)`. `subtotal` is the sum of the line amounts. `tax_amount` is the sum of
the Standard-rated line amounts times the document's `vat_rate`, rounded to cents (Zero-rated lines add nothing).
`total_amount = subtotal + tax_amount`. A trigger recomputes all three whenever a line is inserted, updated or deleted,
and a before-write trigger on the document sets them from its lines (zero when there are none), so a typed total is
ignored whoever writes it. `vat_rate` is copied from the settings when the document is created and stays with it.

### Drafts

On a draft quote (`Draft` or `Internal Review`) or draft invoice (`Draft`) a member adds, edits, reorders and removes
lines; picks from the price list (which copies title, description, price and VAT code into the line) or types a one-off
line; and edits project, client ref, terms and payment terms. Defaults come from the settings (terms, validity days).

### Send quote / issue invoice

`send_quote(p_id)` and `issue_invoice(p_id)` are `security definer`, with their own membership check, and run in one
transaction. They:

1. Refuse a caller who is not a member of the document's organisation (reported as not found), a document that is not a
   draft, one with no lines, or one with no client.
2. Take the next number from `next_document_number` (two simultaneous calls get different numbers).
3. Snapshot the client (`bill_to`) and the company details (`issuer`) onto the document.
4. Fill the dates: a quote's `issue_date` is today and `valid_until` defaults to `default_quote_valid_days` later; an
   invoice's `issue_date` is today and `due_date` defaults to `default_payment_days` later.
5. Set the status (`Sent` or `Issued`), `sent_at`, and for an invoice `balance_amount = total_amount`. The existing
   `quote.sent` timeline entry is written by the existing trigger.

A guard trigger (the same `current_user` pattern as `leads_guard_conversion`) stops members setting `Sent` or `Issued`,
writing a number, or moving a document back to `Draft` by a direct update; only these two functions do.

### The freeze

Once a quote is `Sent` or beyond, or an invoice is `Issued` or beyond, a trigger refuses any change to its lines, number,
`bill_to`, `issuer`, `vat_rate`, project and client ref, terms, and any insert or delete of lines. What may still change:
a quote's status (`Accepted`, `Declined`, `Expired`) and an invoice's status (`Partially Paid`, `Paid`, `Overdue`, `Cancelled`, by hand until payments arrive in slice C), plus notes. A quote is "sent or beyond" in `Sent`, `Accepted`, `Declined` and `Expired`; an invoice is "issued or beyond" in every status except `Draft`.
"Duplicate as new draft" copies a quote's lines and project details into a new draft quote.

### The document page

`/commercial/quotes/[quoteId]/document` and `/finance/invoices/[invoiceId]/document` render the design: header photo and
logo from the settings, the large title, the details box (number, issue date, valid-until or due date, currency, client
ref), the three columns (client, project, company with VAT number), the line table, subtotal, VAT and total, terms (quote)
or payment terms (invoice), the bank panel, the closing block, and the footer. A draft shows live data with a DRAFT mark
and no number; a sent document shows only its frozen snapshot. A Print button and print CSS give a clean A4 page.
All values are rendered as text, never as HTML.

## Screens

- Line editor and the Send quote / Issue invoice buttons on the draft quote and invoice pages; once sent, the editing
  controls are replaced by a note that the document has been sent and how to revise it.
- The register forms stop asking for a number or any total.
- Company details page and Price List page; client form gains the address and VAT number.
- The CSV import of quotes and invoices is withdrawn in this slice, because a document needs lines and a generated
  number; the export keeps working.

## Errors

Plain messages that say what to do: "Add at least one line first", "Choose a client first", "This quote has already been
sent and can no longer be edited", "Quantity must be more than zero". A document from another organisation is reported as
not found. Nothing falls back to a default when a read fails.

## Testing

- **Database (RLS suite, fixture organisations, cleaned up including audit events; this is production):** totals and VAT
  for mixed rates and rounding; typed totals ignored; numbers unique, per type, restarting each year; concurrent sends get
  different numbers; no cross-organisation use of a price list, client, line or counter; settings writable only by owners
  and admins; the guard (Sent, Issued and numbers only through the functions; no moving back to Draft); the freeze for
  every frozen field and for line insert, update and delete; send and issue refuse with no lines, no client, a non-draft,
  or a non-member; the snapshot is unchanged by later edits to the client or the settings; `anon` has no access.
- **Existing tests** that type totals on quotes or invoices (`crm-overview`, `phase-six-commercial-finance`,
  `crm-contacts-activities`) are updated to build lines instead.
- **Unit:** the form readers and the totals mirror; a drift test keeping the VAT codes in code equal to the database;
  source guards for the server and client boundary and for no fixture or HIMARK-specific values in product code.
- **Preview:** the document page and line editor with fixture data in a throwaway route at desktop, tablet and mobile
  widths and as A4 print, with hostile and very long text, then deleted.
- **Not covered by anything automated:** a signed-in session against real records, which stays with the user.

## Order of work

1. Database foundation: tables, calculated totals, numbering, guard and freeze triggers, `send_quote`, `issue_invoice`,
   and their tests (and the updated existing tests).
2. Company details and Price List pages; client address and VAT number.
3. Line editor, Send and Issue buttons, duplicate quote, and the register form changes.
4. The document pages.
5. Preview check, follow-ups doc, roadmap ticks.

## Global constraints

- `unison-uat` is production. Every test row is deleted, with its audit events. Rolled-back probes before applying any
  migration.
- Migrations are append-only. Decisions are made in the database and tested there; the UI mirrors them.
- A control in the UI is a claim the product supports it. No role-based behaviour is invented.
- No real bank, VAT, phone or address value in code or tests; they live in settings.
- Secrets live in `.env.local` only.
- Never `git add -A`; stage explicit paths. Commit and push only when the user asks.
