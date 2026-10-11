# Payments, automatic Overdue and a calculated forecast (Stage 2, slice C)

**Date:** 2026-10-11
**Status:** Awaiting review
**Origin:** Stage 2 of `docs/crm-roadmap.md`. Slice A made quotes and invoices real documents; slice B delivered them
(PDF, email, quote to invoice). Slice C finishes Stage 2: money received is recorded, the invoice balance and its
Paid / Partially Paid / Overdue status follow from it, and the forecast is worked out from data instead of typed.

## Intent

A member records a payment against an issued invoice and the invoice works out its own balance and status. A payment
entered wrongly is voided, never deleted. An unpaid invoice becomes Overdue by itself after its due date. The Forecast
screen shows a month-by-month view built from payments, unpaid invoices and the sales pipeline, with nothing typed.

Decisions made with the user in design:

- **One spec, payments and Overdue first, the forecast last.** The forecast is the last task and can move to a later
  slice without disturbing the rest.
- **Corrections are voids.** A payment can never be edited or deleted; a wrong one is voided with a reason and stays on
  the list, struck through. The balance ignores voided payments. Every active member can record and void (no role rule
  is invented).
- **Overdue is a stored status set by a nightly database job**, shortly after midnight South African time, so the
  registers, dashboard and search keep reading one status field.
- **The Forecast screen becomes a calculated, read-only month-by-month view.** The old hand-typed forecast records stay
  in the database untouched but are no longer shown.
- **An overpayment is refused.** A payment can never exceed the current balance.
- **The database is the authority.** Payments are written only by database functions that recompute the invoice in the
  same transaction; a member can no longer type a status or a balance on an issued invoice.
- **Rules confirmed:** a payment date cannot be in the future or before the invoice's issue date; an invoice with an
  unvoided payment cannot be cancelled; any existing issued invoice whose typed balance differs from its total gets one
  automatic opening payment (production has no invoices today, so this does nothing there).

## Scope

**In:** the `payments` table; `record_payment`, `void_payment`, `cancel_invoice`; the one rule that sets balance,
status and paid date; the nightly Overdue job; the guard that stops a member typing status or balance; three new
timeline kinds; the opening-payment step; the Record payment form, Payments list, Void and Cancel invoice on the
invoice page; removal of the typed status and balance from the invoice edit form; the calculated Forecast screen;
tests, preview check, roadmap ticks.

**Out, and why:**

- **Bank feeds, refunds, credit notes, overpayment credits, payment reminders, payment receipts to the client, and
  recording a payment against a quote.** Not needed to make balance and status automatic.
- **Editing or deleting a payment.** Corrections are voids.
- **Cash flow after expenses, scenarios, budgets, a per-product forecast.** The forecast is revenue only.
- **Converting currencies.** Each currency is shown on its own, never added to another.
- **Editing the old forecast records.** Their screens and routes are removed; the table and the data-portability export
  are left as they are.
- **Role rules.** Every active member can record, void and cancel, as for sending and issuing documents.

## Data

All keys include `organization_id` (composite foreign keys), as elsewhere.

### `payments` (new)

One row per payment received against an invoice. Fields: `invoice_id` (composite foreign key to `invoices`),
`amount` (`numeric(14,2)`, more than 0), `received_on` (date), `method` (`Bank transfer`, `Card`, `Cash`, `Other`),
`reference` (optional, up to 120 characters), `recorded_by` (composite foreign key to `memberships`,
`on delete set null (recorded_by)`), `recorded_at`, and `voided_at`, `voided_by` (same kind of key) and `void_reason`
(1 to 500 characters), which are all empty or all set together. The payment's currency is its invoice's; there is no
column for it.

Members read; **nobody but the functions below writes**: `authenticated` has `select` only, no insert, update or
delete. A trigger refuses any update except setting the three void fields once on a payment that is not yet voided (so
not even a definer function can edit an amount or un-void). There is no audit trigger: the rows are the log. A member
cannot delete an invoice that has payments (the database refuses it); a draft has none.

### The one rule (`private.refresh_invoice_payment_state(invoice_id)`)

Internal, not executable by `authenticated`, called by the three functions below and by the job, with the invoice row
locked. For an invoice that is not Draft and not Cancelled:

1. `balance_amount` = `total_amount` minus the sum of its unvoided payments.
2. Balance 0: status **Paid**, `paid_at` = the date of the latest unvoided payment (midnight, South African time).
3. Otherwise `paid_at` is cleared, and: unvoided payments exist: **Partially Paid**; none: **Issued**.
4. If the balance is above 0 and `due_date` is before today (South African date), the status is **Overdue** instead
   of Issued or Partially Paid.

A Cancelled invoice has balance 0 and is never changed by this rule.

### `record_payment(p_invoice uuid, p_amount numeric, p_received_on date, p_method text, p_reference text) returns uuid`

`security definer`, `search_path = ''`, executable by `authenticated` only, membership check first (another
organisation's invoice is reported as not found), invoice row locked. Refuses (with tokens): an invoice that is not
Issued, Partially Paid or Overdue; an amount of 0 or less or with more than 2 decimals; an amount **over the current
balance**; a date in the future or before the invoice's issue date; an unknown method; a reference over 120 characters.
Inserts the row, applies the rule, writes the timeline entry, returns the payment id.

### `void_payment(p_payment uuid, p_reason text) returns void`

Same security shape, membership check, invoice locked. Refuses a payment already voided, an empty reason, and an invoice
that is Cancelled. Sets the void fields, applies the rule (a Paid invoice returns to Issued, Partially Paid or Overdue),
writes the timeline entry.

### `cancel_invoice(p_invoice uuid) returns void`

Same security shape. Refuses a Draft (a draft is deleted, not cancelled), an invoice already Cancelled, and an invoice
with any unvoided payment. Sets status Cancelled and balance 0.

### The guard on the invoice

For a signed-in role (`authenticated`, `anon`), the invoice trigger refuses any change to `status`, `balance_amount` or
`paid_at` of an issued invoice (token `INVOICE_STATUS_AUTOMATIC`); the functions above and the job, which run as the
table owner, are not held to it, exactly like the slice A guard. Issuing still goes through `issue_invoice`. Notes stay
editable.

### The nightly job

`private.mark_overdue_invoices()` and a `pg_cron` job `unison-mark-overdue-invoices` at 22:05 UTC (00:05 in South
Africa), following the pattern of the existing `unison-*` jobs. For every invoice that is Issued or Partially Paid, has a
balance above 0 and a due date before today (South African date), it applies the rule (status becomes Overdue) and
writes one `invoice.overdue` entry on the invoice's client. An invoice already Overdue, Paid, Cancelled or Draft is left
alone; running the job twice changes nothing.

### New timeline kinds

`payment.recorded`, `payment.voided` and `invoice.overdue` are added to `activities_kind_check` (a new migration
replaces the constraint) and to the code's list and labels; the existing drift test keeps them equal. Entries are
written on the invoice's client (an invoice has no timeline of its own); an invoice whose client was removed gets
none. The entry for a payment carries the invoice number, the amount and the payment id in `details`.

### Opening payments

Once, in the migration: for each non-draft, non-cancelled invoice whose `balance_amount` differs from its total, one
payment of the difference, method `Other`, reference `Opening balance (migrated)`, dated its `paid_at` date, else its
issue date, else today, with no recorder. Idempotent, and it changes nothing when there are no such invoices (the
production database has none today).

## Behaviour

### Invoice page

- **Record payment** form on an Issued, Partially Paid or Overdue invoice: Amount (the balance still owing is shown
  beside it as the maximum), Date (today, South African date, by default), Method, Reference (optional). It keeps what
  was typed after a failed save and cannot be double-submitted. A Draft, Paid or Cancelled invoice shows a one-line note
  instead of the form.
- **Payments** list under the lines: date, amount, method, reference, who recorded it, and a **Void** control that asks
  for a reason. Voided payments stay, struck through, with the reason and who voided them.
- The balance and status at the top update on their own. **Cancel invoice** (with a confirmation) is shown only when
  the invoice has no unvoided payment.
- The invoice edit form for an issued invoice loses its Payment status and Outstanding balance fields; only the notes
  remain editable. The save action stops reading `status` and `balanceAmount` for an issued invoice.

### Registers, dashboard, search

No new code: they already read `status` and `balance_amount`. Their totals now come from payments and the job.

### Forecast screen

A read-only table for the three previous months, the current month and the next six (ten months, South African
calendar), per currency (one block per currency, never added together), with a column total and a note saying how each
row is worked out:

- **Collected:** unvoided payments received in the month.
- **Due from invoices:** the balance of Issued, Partially Paid and Overdue invoices by the month of their due date;
  anything due before the current month (overdue) counts in the current month. Past months show collected only.
- **Pipeline:** each open (not Won, not Lost, not archived) opportunity as expected value times probability, in the
  month of its expected close; one expected to close before the current month counts in the current month; one with
  no expected close is shown on its own "No date" line, never guessed.

The calculation is one database function, `forecast_months(p_org uuid)`, `security invoker` (row level security
applies) so the rules are tested in the database. The old forecast routes (new, detail, edit) are removed.

## Errors

Plain messages: "The payment is more than the balance still owing", "Enter an amount above zero", "Enter at most two
decimals", "The payment date can't be in the future", "The payment date can't be before the invoice date", "Only an
issued invoice can be paid", "A reason is required to void a payment", "That payment has already been voided", "Void the
payments first, then cancel the invoice", "A cancelled invoice can't be changed", "Status and balance are worked out from
the payments". A document or payment from another organisation is reported as not found. A failed read shows an
error, never blank totals.

## Testing

- **Database (RLS suite, fixture organisations, cleaned up including audit events; this is production):** a member cannot
  insert, update or delete a payment, cannot type a status, balance or paid date on an issued invoice, and cannot
  delete an invoice that has payments; `anon` has no access; `record_payment` accepts a part payment (Partially Paid,
  right balance), a full payment (Paid, paid date), and refuses an overpayment, a zero or negative amount, a third
  decimal, a future date, a date before issue, a bad method, a draft, a Paid and a Cancelled invoice, another
  organisation's invoice; `void_payment` restores the right status and balance, keeps the row, refuses an empty reason, a
  second void and a cancelled invoice; two simultaneous payments cannot overspend the balance; `cancel_invoice` refuses
  a draft, a cancelled invoice and one with unvoided payments, and cancels one without; the nightly function sets
  Overdue once, writes one entry, ignores Paid, Cancelled, Draft and not-yet-due invoices, and a payment or void on an
  Overdue invoice re-derives the status; the opening-payment step; the new kinds are accepted and the code's list equals
  the database check; `forecast_months` groups by month and currency, folds overdue and past-dated items into the current
  month, shows "No date" for undated opportunities and ignores voided payments, Won, Lost and archived items.
- **Unit:** the payment form reader (amounts, decimals, dates, methods), money formatting, the forecast screen's
  rows, and source guards for the client and server boundary.
- **Preview:** the payment form, list, void and cancel at desktop and phone width, and the forecast with fixture data.
- **Not covered by anything automated:** the schedule firing by itself in production. The job is checked to be
  registered and run once by hand.

## Order of work

1. Database: `payments`, the rule, `record_payment`, `void_payment`, `cancel_invoice`, the guard, the job, the
   opening-payment step, the new kinds, and their tests.
2. Invoice screens: Record payment, Payments list, Void, Cancel invoice; remove the typed status and balance.
3. The calculated Forecast: `forecast_months` and the screen; remove the old forecast routes.
4. Preview check, follow-ups, roadmap ticks, the user's signed-in checklist.

## Global constraints

- `unison-uat` is production. Every test row is deleted, with its audit events. Rolled-back probes before applying any
  migration; only the controller applies migrations.
- Migrations are append-only. Decisions are made in the database and tested there; the UI mirrors them.
- A control in the UI is a claim the product supports it. No role-based behaviour is invented.
- No real address, bank, VAT or phone value in code or tests. Secrets live in `.env.local` only.
- Never `git add -A`; stage explicit paths. Do not touch `public/` or
  `features/commercial-finance/components/record-collection-workspace.tsx`. Commit and push only when the user asks.

## Amendments made while planning and building

Small, deliberate departures from the text above, each decided with a reason and recorded in the plan and its ledger.

1. **The job function is `public.mark_overdue_invoices()`, executable by the service role only** (not a `private`
   function), so the database test can run it; the cron job runs as the database owner. The helper
   `private.refresh_invoice_payment_state` stays private. The job writes an `invoice.overdue` entry and counts an invoice
   only when the rule actually leaves it Overdue, so a stale stored balance can never produce a false entry.
2. **The forecast has a "Later" line** for invoices and opportunities due or closing after the ten-month window, so totals
   are never silently short. Collected money older than the window is not shown.
3. **Members cannot delete an invoice because no delete policy exists** (the `authenticated` role holds the table delete
   privilege, but row level security gives it no row to delete, so a delete removes nothing and raises no error). The
   earlier wording, "no delete privilege", was wrong. Payments cascade with their invoice, so any future policy that lets
   members delete a draft invoice must exclude issued invoices.
4. **The "more than the balance still owing" message does not repeat the amount;** the form shows the balance beside the
   field as the maximum.
5. **The guard is its own trigger** (`invoices_payment_state_guard`), not an edit of `invoices_documents_before`, so the
   existing `INVOICE_CANCELLED` and `INVOICE_CANNOT_REOPEN` tokens still win. A second migration widened it to inserts and
   drafts: a paid date typed on a draft or on insert is dropped (like a typed balance), and the one-off clean-up cleared any
   stray paid date on a non-paid invoice.
6. **The old typed-forecast code is left in place, unreachable** (the `forecast` kind in the commercial-finance actions,
   queries, form and register); only its routes were removed. Removing it is a follow-up.
7. **The invoice page shows the paid date as a South African date.** The rule stores it as midnight South African time, so a
   UTC rendering would show the day before.
8. **The Record payment form is hidden when there is no balance to pay** (a zero-total invoice).
