# Accept to invoice, Stage 3: payment reminders and outstanding balances — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind its own off-by-default switch, UNISON sends a friendly reminder for an unpaid plan invoice 3 days after its due date and then weekly (five in all), stops the moment the invoice is paid in full, lets an owner or admin pause reminders on one invoice with a reason, tells the owner and makes a follow-up task after the last one, and shows the amount outstanding on the quote's plan panel.

**Architecture:** Stage 2's daily runner gains a reminders step. The database decides everything (`billing_reminder_candidates`, `billing_reminder_claim`, `billing_reminder_record`, `billing_reminder_release`: service role only, row locks that skip, a unique key per invoice and sequence, a ten-minute lease), Node only loads the invoice, makes the PDF, sends the email and reports back. Pausing is one definer function writing to the plan item. Reads of reminders and the balance come from the member's own client under RLS.

**Tech Stack:** as Stage 2 (Next.js 16.3.4, Supabase definer functions, `node --test --experimental-strip-types`, pnpm).

**Spec:** `docs/superpowers/specs/2026-10-26-accept-to-invoice-to-payment-design.md` §6 (Reminders), §7 (Payment), §9 stage 3 and "Calls settled after a builder check" 1, 4 and 5. Stage 2 (`docs/superpowers/plans/2026-11-11-accept-to-invoice-stage-2.md`) is built; this plan reuses its runner, route, secret, lease pattern, outbox and `private.billing_notify`.

## Global Constraints

- **Production is the only database** (`unison-uat`, `nwdzpjzllhhqwawmsxjd`) and `pnpm test:rls` runs against it. Every fixture row is deleted and verified gone. Migrations are append-only and additive; the owner applies each one (the assistant cannot), and each is verified by looking at the functions in `pg_proc`, not the migration list. **Baseline before Task 1**, in the Task 1 commit body: `select count(*) from public.audit_events where organization_id is null` (1320); counts of `invoices` (1), `quotes` (3), `document_emails` (3), `billing_plans` (0), `billing_notice_emails` (0), `tasks`; the real organisation's three billing switches (all false).
- **The real organisation is never switched on and its data is never touched.** `billing_reminders_enabled` defaults to false. **The runner's database tests are scoped to their own fixtures** (as `billing-runner-db.test.ts` is): the fake mail server must never be shown a real organisation's reminder.
- **No real email in any test or walk-through** (`EMAIL_TRANSPORT=log`). No new environment variable (the secret is Stage 2's `CRON_SECRET`), no new dependency, no new file that imports `lib/supabase/admin`.
- **Switch off means identical.** With `billing_reminders_enabled` false the runner finds no reminder, no notice changes, and every Stage 1 and 2 behaviour is exactly as it was.
- **Reminders cover only plan invoices** (an invoice linked to a billing plan item, first or monthly), **only invoices whose due date falls on or after the day the switch was turned on**, never invoices made by hand, and **at most one reminder per invoice per run** (spec call 5).
- **Nothing is marked paid, and no reminder is stopped, by anything but a recorded payment (the balance reaching 0) or a recorded pause.** Wording says "reminder", "balance", "owing"; never "paid" for an invoice that is not.
- **Schedule (spec §6, South African days):** reminder *n* of 5 is due `due_date + 3 + 7 × (n − 1)` days (3, 10, 17, 24, 31). The next reminder to send is the first sequence not yet sent; a late run sends that one, not several.
- **Git, Next 16, house style, test commands:** exactly as in the Stage 2 plan's Global Constraints (stage by explicit path; commit on `main`; never push; `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; read the route and page guides in `node_modules/next/dist/docs/` before page code; `'use server'` files export only async functions; pure modules use relative `.ts` imports; replaced functions restate `security`, `set search_path = ''`, `revoke` and `grant`; "replaced from the newest definition" means find it with `grep -l "function <name>" supabase/migrations/*.sql | sort | tail -1`).

## Review Focus

1. **A reminder is never sent twice, in a burst, or after payment.** Two runners at once, a re-run, a run after a part payment, a run after full payment (Tasks 2, 4).
2. **Part payment keeps reminders going for the balance; full payment ends them at once;** a cancelled invoice and a paused one get none (Task 2).
3. **Nothing is sent retroactively:** an invoice due before the switch was turned on, a hand-made invoice, and an invoice of an organisation with the switch off get none (Task 2).
4. **A failed send is retried, not lost and not doubled;** a crash after the claim does not block the sequence forever (Tasks 2, 4).
5. **After the fifth reminder the owner is told once and exactly one follow-up task exists,** however often the run is repeated (Task 2).
6. **The pause is a person's decision with a reason;** a member cannot pause, another organisation's invoice cannot be paused, and resuming restarts from the next unsent reminder (Task 3).

---

### Task 1: Schema — the switch, the reminders table, pause state

**Files:**
- Create: `supabase/migrations/20261112100000_billing_reminders_schema.sql`, `tests/integration/rls/billing-reminders-schema.test.ts`
- Modify: `features/crm-workspace/vocabulary.ts`, `tests/integration/rls/billing-fixtures.ts`

**Interfaces:** Produces:
- `organization_settings.billing_reminders_enabled boolean not null default false`, `billing_reminders_enabled_at timestamptz`; `public.organization_settings_billing_stamp()` replaced from `20261111100000_billing_auto_send_schema.sql` to stamp it with the same rules as the other two.
- `billing_plan_items`: `reminders_paused_at timestamptz`, `reminders_paused_by uuid references auth.users on delete set null`, `reminders_pause_reason text check (char_length <= 500)`, with `check ((reminders_paused_at is null) = (reminders_pause_reason is null))`.
- `public.billing_reminders` (`id`, `organization_id` → organizations cascade, `invoice_id uuid not null`, `sequence smallint not null check (1..5)`, `claimed_until timestamptz`, `attempts smallint not null default 0 check (0..100)`, `sent_at timestamptz`, `to_address text`, `subject text`, `balance_at_send numeric(14,2)`, `pdf_sha256 text`, `created_at`; `unique (invoice_id, sequence)`, composite FK `(invoice_id, organization_id)` → `invoices (id, organization_id)` on delete cascade; check `sent_at is null or to_address is not null`). Row level security: members read their organisation's rows (`is_member_of`); `revoke all ... from anon, authenticated; grant select to authenticated; grant select, insert, update to service_role`.
- `activities_kind_check` replaced from its newest definition (it ends `..., 'billing.invoice_auto_issued', 'billing.item_held'`) plus `invoice.reminder_sent`, `billing.reminders_changed`; `vocabulary.ts` lists them in that order with labels `Payment reminder sent`, `Reminders changed`.
- `billing-fixtures.ts`: `setReminders(enabled: boolean): Promise<void>`; `issuedPlanInvoice(options?): Promise<{ quoteId: string; itemId: string; invoiceId: string }>` — `approvedPlan`, then month 2 made due and issued with the real `billing_run_item`; `agePast(invoiceId, daysPastDue: number)`: sets that invoice's `due_date` (and `issue_date` if needed to keep `due_date >= issue_date`) so today is `daysPastDue` days after it, as the service role; `payInvoice(invoiceId, amount)`: a recorded payment through the real `record_payment` as a member (read `tests/integration/rls/payments.test.ts` for how).

- [ ] **Step 1:** Record the baseline. Read `20261111100000_billing_auto_send_schema.sql` and the payments test helper.
- [ ] **Step 2: Failing tests:** `'billing_reminders_enabled defaults to false, an owner or admin can switch it, a member cannot, and its time is stamped on, cleared off and cannot be typed'`; `'the pause columns are both set or both null and the reason is at most 500 characters'`; `'billing_reminders is readable by members of its organisation only, unreadable by anon and another organisation, and unwritable by every signed-in role'`; `'one reminder per invoice and sequence; sequence 1 to 5 only; a sent row needs an address'`; `'the fixtures make an issued plan invoice, age it, and pay it'`.
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Write the migration, vocabulary and fixtures. The owner applies it (`billing_reminders_schema`). Run the new file, `billing-auto-schema.test.ts` and `tests/unit/crm-workspace-vocabulary.test.ts`. Expected: pass; residue check.
- [ ] **Step 5:** Commit `feat(billing): the reminders switch, the reminders table and pause state`.

---

### Task 2: Choosing, claiming and recording a reminder

**Files:**
- Create: `supabase/migrations/20261112101000_billing_reminders_run.sql`, `tests/integration/rls/billing-reminders-run.test.ts`

**Interfaces:** Consumes Task 1, `private.billing_notify`, `private.billing_client_email`, `private.billing_notice_users`. Produces (definer, `set search_path = ''`, revoked from public, anon, authenticated, granted to `service_role` only):
- `private.billing_reminder_next(p_invoice_id uuid) returns smallint` (revoked from all): the sequence to send now, or null. Non-null only when: the invoice is linked to a plan item that is open; status in (`Issued`,`Partially Paid`,`Overdue`) with `balance_amount > 0`; `due_date` not null and `>=` the South African day of `billing_reminders_enabled_at`; the organisation has `billing_plans_enabled` and `billing_reminders_enabled`; the item's `reminders_paused_at` is null; and let *n* = 1 + the number of its `billing_reminders` with `sent_at` not null; *n* ≤ 5; the South African today ≥ `due_date + 3 + 7 × (n − 1)`; and the unsent row for *n*, if any, has `attempts < 5`.
- `public.billing_reminder_candidates(p_limit integer) returns table (invoice_id uuid, sequence smallint)` (1..200, else `22023`): invoices with `private.billing_reminder_next` non-null, ordered by due date then id.
- `public.billing_reminder_claim(p_invoice_id uuid) returns jsonb` → `{ "state": "ready" | "busy" | "skipped", "invoice_id", "sequence", "to", "reply_to", "sender_name", "number", "balance", "currency", "due_date", "month_number" }`: locks the invoice `for update skip locked` (not obtainable → `busy`), re-checks `billing_reminder_next` (null → `skipped`), then inserts the `(invoice, sequence)` row with `claimed_until = now() + 10 minutes` — or, when an unsent row exists, takes it over only if its `claimed_until` is null or past (else `busy`) — and returns the context (`to` from `billing_client_email`, `reply_to` the quote owner's team email, `sender_name` the owner's name else the company legal name).
- `public.billing_reminder_record(p_invoice_id uuid, p_sequence smallint, p_to text, p_subject text, p_sha256 text, p_bytes integer) returns uuid`: the unsent claimed row for that sequence must exist (else `BILLING_REMINDER_NOT_FOUND`, `42501`); validates the address, subject and hash as `record_document_email` does; sets `sent_at = now()`, `to_address`, `subject`, `balance_at_send` (the invoice's balance now), `pdf_sha256`, `claimed_until = null`; writes `invoice.reminder_sent` on the client's timeline (`Reminder <n> of 5 sent for invoice <number> to <address>`, details with the sequence and balance); and for sequence 5 only, in a block whose failure only warns: `private.billing_notify` (`<client> has not paid invoice <number> after five reminders`, body `The reminders have finished. Please follow up with the client yourself.`) and one `tasks` row (`Follow up: <client> has not paid invoice <number>`, client, assignee the quote owner's team member, `High`, `Planned`, due in three days). Returns the row's id.
- `public.billing_reminder_release(p_invoice_id uuid, p_sequence smallint) returns void`: an unsent row gets `claimed_until = null` and `attempts + 1`; a sent row is untouched.
- `private.billing_notify` replaced from its newest definition (`20261111104000_billing_notice_emails.sql`): the email is queued when the organisation has `billing_auto_send_enabled` **or** `billing_reminders_enabled`.

- [ ] **Step 1: Failing tests** (`billing-reminders-run.test.ts`; fixtures `issuedPlanInvoice`, `agePast`, `payInvoice`, `setReminders`; all calls through the service role, filtered to the fixture's invoices): `'the schedule: not before 3 days past due, reminder 1 at 3, 2 at 10, 3 at 17, 4 at 24, 5 at 31, one per call however late, none after five'`; `'a part payment keeps reminders going and the record carries the balance; a payment in full ends them; a cancelled invoice and a paused one get none'`; `'nothing retroactive: a due date before the switch was turned on, a hand-made invoice, an organisation with the switch off or billing plans off get none'`; `'claim and record: ready, then busy while leased, a lease in the past is taken over, record writes the row, the timeline entry and clears the lease, and the same sequence cannot be recorded twice'`; `'two claims at once give one ready and one busy; two runs at once record one reminder'`; `'release counts an attempt, five attempts stop the candidate, a sent row is untouched'`; `'after the fifth record: one notice per person, one follow-up task assigned to the quote owner, and recording again is refused so nothing doubles'`; `'record validates like record_document_email'`; `'a failing address (no billing email, no contact) answers ready with no address and the runner records NO_ADDRESS'` is a Task 4 test; `'none of the functions is callable by a member, another organisation or anon'`; `'the date is South African: a due date set so that today is 3 days after it is due, tomorrow is not; no function reads the server date'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Write the migration. The owner applies it (`billing_reminders_run`). Run the file, `billing-notice-emails.test.ts`, `billing-run-item.test.ts`, `payments.test.ts`. Expected: pass; residue check (also `tasks` count at baseline).
- [ ] **Step 4:** Commit `feat(billing): the database chooses, claims and records payment reminders`.

---

### Task 3: Pausing reminders, and reading them

**Files:**
- Create: `supabase/migrations/20261112102000_billing_reminders_pause.sql`, `tests/integration/rls/billing-reminders-pause.test.ts`
- Modify: `features/documents/errors.ts`

**Interfaces:** Consumes Tasks 1 and 2. Produces:
- `public.billing_reminders_set_paused(p_invoice_id uuid, p_paused boolean, p_reason text) returns void` (`revoke ... from public, anon; grant ... to authenticated`): the invoice must belong to an organisation the caller is a member of and be linked to a plan item (`BILLING_ITEM_NOT_FOUND`, `42501`, otherwise and for other organisations); `has_role(owner, admin)` else `BILLING_PLAN_ADMIN_ONLY`; pausing needs a reason of 1 to 500 trimmed characters (`BILLING_REASON_REQUIRED`) and an unpaused item (already paused → no change, no error); resuming clears the pause (reason optional, written to the timeline). Writes `billing.reminders_changed` on the client's timeline (`Reminders paused for invoice <number>: <reason>` / `resumed`) with the member as actor. The sequence of reminders already sent is untouched, so resuming continues from the next unsent one.
- Tokens used are the Stage 1 ones; no new token.

- [ ] **Step 1: Failing tests:** `'an owner and an admin can pause with a reason and resume; a member cannot; another organisation's invoice is not found; an invoice with no plan is not found'`; `'pausing needs a reason; resuming does not'`; `'a paused invoice is not a candidate and resuming brings it back at its next unsent sequence'`; `'pausing twice is harmless; each change writes one timeline entry by the member'`; `'members read their organisation's billing_reminders and not another's'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Write the migration. The owner applies it (`billing_reminders_pause`). Run the file and `billing-reminders-run.test.ts`. Expected: pass; residue check.
- [ ] **Step 4:** Commit `feat(billing): pause and resume reminders on one invoice`.

---

### Task 4: The runner sends reminders

**Files:**
- Create: `features/billing-runner/reminders.ts` (pure), `features/documents/billing-reminder-copy.ts` (pure), `tests/unit/billing-reminders.test.ts`, `tests/unit/billing-reminder-copy.test.ts`, `tests/integration/rls/billing-reminders-db.test.ts`
- Modify: `features/billing-runner/run.ts`, `features/billing-runner/run-billing.ts`, `tests/unit/billing-runner.test.ts`, `tests/unit/billing-runner-route.test.ts`

**Interfaces:** Consumes Task 2. Produces:
- `billing-reminder-copy.ts`: `reminderEmail(view: DocumentView, input: { sequence: number; total: number; balance: string; currency: string; dueDateLabel: string | null; senderName: string }): { subject: string; text: string; html: string }` — subject `Reminder: invoice <number> from <company>`; a friendly, short text: the invoice number, the balance still owing with currency, the due date, the bank details, `Please use <number> as your payment reference`, `If you have already paid, please let us know and ignore this message`, sign-off with the company name once (as `monthlyInvoiceEmail`). Never says "final", "overdue", "legal" or "demand", and never "paid" except in the sentence above; the same wording for all five (the later ones are not harsher: the owner follows up personally).
- `reminders.ts`: `runReminders(deps: ReminderDeps, summary: { reminders: number; failed: number; skipped: number; logged: number }): Promise<void>` where `ReminderDeps = Pick<RunDeps, 'db' | 'maxItems' | 'send'> & { prepareReminder(input: { invoiceId: string; context: ReminderContext }): Promise<PreparedMonth | { error: 'PDF_FAILED' | 'NO_ADDRESS' }> }`. For each of `billing_reminder_candidates(maxItems)`: `billing_reminder_claim`; `busy` or `skipped` left; no address, a prepare error, or a send that throws → `billing_reminder_release` (and counted `failed`); log mode (`delivered: false`) → release without counting an attempt is not possible, so it is released and counted `logged`; delivered → `billing_reminder_record`; a failed record is logged by id and error code, counted `failed`, and the message is not sent again by this run. One item's failure never stops the others.
- `RunSummary` gains `reminders: number`; `runBilling` calls `runReminders` after the notice step with the same `db`, `send` and a new `prepareReminder` dependency on `RunDeps`; `run-billing.ts` supplies it (the invoice bundle loader of Task 5 of Stage 2, `makeDocumentPdf`, the size cap, `reminderEmail`).

- [ ] **Step 1: Failing tests.** `billing-reminder-copy.test.ts`: the facts present (number, balance, currency, due date, bank details, payment reference, the already-paid sentence), no "final", "overdue", "legal", "demand" or "reminder 5 of 5" style escalation, the company name once when it is the sender, HTML escaped. `billing-reminders.test.ts` (fake `db.rpc`): order candidates → claim → prepare → send → record; `busy`/`skipped` left alone; no address releases; a prepare error releases; a send that throws releases and the next item still runs; log mode releases and counts logged; a record failure is counted and not resent; counts only in the summary; at most `maxItems`. Extend `billing-runner.test.ts` (summary keys now include `reminders`) and `billing-runner-route.test.ts` (the pure modules stay free of `@/` and server-only; the wiring logs ids and codes only). `billing-reminders-db.test.ts` (scoped db wrapper as in `billing-runner-db.test.ts`: due items, the outbox and reminder candidates are cut down to the fixture): `'a run sends reminder 1 for an invoice 3 days past due and records it once; a second run sends nothing; the next one is sent only when its day comes'`; `'a failed send is released and retried by the next run, and is recorded once'`; `'two runs at once send one reminder'`.
- [ ] **Step 2:** Run the unit files. Expected: FAIL.
- [ ] **Step 3:** Implement. Run the unit files, `service-role-boundary.test.ts`, `pnpm typecheck`, then the database file. Expected: pass; residue check.
- [ ] **Step 4:** Commit `feat(billing): the runner sends payment reminders`.

---

### Task 5: The switch, the reminders panel and the outstanding balance

**Files:**
- Create: `features/documents/actions/billing-reminders-switch.ts`, `features/documents/components/billing-reminders-switch.tsx`, `features/documents/actions/billing-reminders.ts`, `features/documents/components/billing-reminders-panel.tsx`, `features/documents/queries/get-invoice-reminders.ts`, `features/documents/billing-reminders-view.ts` (pure), `tests/unit/billing-reminders-switch.test.ts`, `tests/unit/billing-reminders-view.test.ts`, `tests/unit/billing-reminders-actions.test.ts`
- Modify: `app/(unison)/settings/company/page.tsx`, `features/documents/types.ts`, `app/(unison)/finance/invoices/[invoiceId]/page.tsx`, `features/documents/queries/get-billing-plan.ts`, `features/documents/billing-plan-view.ts`, `features/documents/components/billing-plan-panel.tsx`, `tests/unit/billing-switch.test.ts`, `tests/unit/quote-portal-switch.test.ts`, `tests/unit/billing-plan-view.test.ts`

**Interfaces:** Consumes Tasks 1 to 3. Produces:
- `setBillingRemindersEnabledAction(_previous, form)`: the same shape, order and failure sentences as `setBillingAutoSendEnabledAction`; writes only `billing_reminders_enabled`; switching on is conditioned on `billing_plans_enabled = true` (`Turn on billing plans first, then try again.`); success on: `Payment reminders switched on. An unpaid plan invoice that falls due from today gets a friendly reminder 3 days after its due date, then every week, five in all.`; off: `Payment reminders switched off. No more reminders are sent; reminders already sent stay on record.` `BillingRemindersSwitch({ enabled, plansEnabled, canEdit })` after the automatic sending switch: checkbox labelled `Send friendly payment reminders`, explanation `For an unpaid invoice from a billing plan, a reminder goes to the client 3 days after the due date and then every week, up to five. A payment in full stops them at once. You can pause reminders on one invoice, and after the fifth you are told and given a task to follow up yourself. Invoices that fell due before this is switched on are never reminded.`, button `Save reminder setting`.
- `billing-reminders-view.ts` (pure): `describeReminders(input: { enabled: boolean; paused: { reason: string } | null; sent: Array<{ sequence: number; sentOn: string }>; dueDate: string | null; status: string; balance: number; today: string }): { line: string; tone: 'muted' | 'waiting' | 'attention' | 'done' }` with these lines: switch off → `Reminders are switched off.`; paid or cancelled → `No reminders: nothing is owing.`; paused → `Paused: <reason>`; five sent → `All five reminders were sent. Follow up with the client yourself.`; otherwise `<n> of 5 sent. Next on <date>` (`Next` omitted when it is not scheduled); none sent yet → `No reminder sent yet. The first goes out on <date>`. `nextReminderDate(dueDate: string, sentCount: number): string | null` — `due + 3 + 7 × sentCount` days, null after five.
- `billing-reminders-panel.tsx` on the invoice page for a plan invoice that is Issued, Partially Paid or Overdue: the line, a list of reminders sent (sequence, date, address) and, for an owner or admin, `Pause reminders` (reason required) / `Resume reminders` using `setInvoiceRemindersPausedAction(invoiceId, paused, _previous, form)` (one rpc `billing_reminders_set_paused`; success `Reminders paused.` / `Reminders resumed.`; refusals mapped through `documentErrorMessage`).
- The plan panel: `BillingPlanItemView.invoice` gains `balance: number` and `currency`; an item whose invoice is Issued, Partially Paid or Overdue shows its label followed by `, <currency> <balance> owing`; above the table, `Outstanding on this plan: <currency> <sum>` when the sum is above zero (never "paid"). `getBillingPlan` reads `balance_amount` and `currency`.

- [ ] **Step 1: Failing tests:** the source-guard style of `billing-auto-switch.test.ts` for the new switch action and component and the company page order (and update the two older page-order guards for a fifth child); `billing-reminders-view.test.ts` for every line, `nextReminderDate` for 0 to 5 sent (and a due date at a month end), and no label saying "paid" for an owing invoice; `billing-reminders-actions.test.ts` source guards (the pause action: UUID check, `documentContext()`, one rpc, permission, revalidation; the panel renders the controls only for owners and admins; the invoice page mounts the panel only for plan invoices); the plan view tests for the balance suffix and the outstanding line.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Read the page guide in `node_modules/next/dist/docs/`. Implement. Run the unit files and `pnpm typecheck`. Expected: pass.
- [ ] **Step 4:** Commit `feat(billing): the reminders switch, panel and outstanding balance`.

---

### Task 6: Verification and walk-through

**Files:** none.

- [ ] **Step 1:** `pnpm typecheck`, `pnpm test`, `pnpm build`. Expected: pass (lint cannot run: `eslint` is not installed).
- [ ] **Step 2:** `pnpm test:rls` against production. Expected: every file passes.
- [ ] **Step 3: Walk it** with a throwaway organisation (`setupBillingOrg` in a scratch script), `pnpm dev --port 3002`, `EMAIL_TRANSPORT=log`, `CRON_SECRET=walk-secret`: age a plan invoice to 3 days past due; call `/api/billing/run` with the secret; read the logged reminder (balance, bank details, reference, PDF attached); call again (nothing); in the browser: the switch renders after the other two and saves; the invoice page shows the reminders panel and pause/resume work with the sentence and the database following; the quote's plan panel shows the balance suffix and the outstanding line; phone width. Remove everything and confirm the baseline.
- [ ] **Step 4:** Final read of the whole Stage 3 diff against the Review Focus; fix anything found test-first.

### Task 7: Docs

- [ ] Add "From accept-to-invoice, Stage 3" to `docs/follow-ups.md` (a "Read before you switch reminders on" block: the switch is org-wide and needs billing plans; only invoices due from the day it is switched on; the real cron and `CRON_SECRET` from Stage 2; wording for the owner's approval; what was and was not verified; known limits; owner decisions), the roadmap line, and the design's Status line. Commit `docs: record accept-to-invoice stage 3`.

---

## Calls made in this plan (for review)

1. **Pause state lives on the plan item,** not the invoice: issued invoices are frozen to signed-in roles, and the plan item is a table only definer functions write.
2. **The sequence is the first unsent one,** sent when its day has come, one per invoice per run. A late runner therefore sends reminder 2 the day after it recovers and reminder 3 the day after that, never two at once.
3. **"Falls due after the switch was turned on"** is `due_date >=` the South African day of `billing_reminders_enabled_at`.
4. **"Plan invoice"** is any invoice linked to a billing plan item, first or monthly, whoever issued it.
5. **The reminders switch needs billing plans on,** not automatic sending: reminders are useful for the first invoice and for months issued by hand.
6. **One wording for all five** reminders, friendly and short; escalation is the owner's, by the follow-up task after the fifth.
7. **A failed send is released and retried each run,** five attempts per reminder, then the candidate stops; the runner counts it as failed.
8. **The follow-up task** is assigned to the quote's owner, High, due in three days, created in the same transaction as the fifth record (so it exists once).
9. **The notice emails** are also sent when only reminders are on (the gate in `private.billing_notify` becomes either switch).
10. **The outstanding balance** is shown on the quote's plan panel per invoice and as a total; the invoice page already shows its balance through payments.
