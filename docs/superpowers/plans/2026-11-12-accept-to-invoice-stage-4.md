# Accept to invoice, Stage 4: starting the work — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a client accepts a quote on the portal, UNISON also makes the client's onboarding record (one per quote, owned by the quote's owner, with the quote's start date) and a task for the owner to contact the client within one business day. The quote page shows a readiness line (the work may start when the start date has arrived and the first invoice is fully paid), and an owner or admin can override that, quote by quote, with a reason.

**Architecture:** Three database pieces on top of Stage 1's acceptance path: the onboarding record and task are made by `private.billing_on_acceptance` (replaced), idempotent by a unique `quote_id` on the onboarding; the readiness rule lives in one function (`public.billing_readiness`) so it can become a setting later; the override is one definer function writing to the billing plan. The UI adds one small panel next to the plan panel. Nothing is sent to HIVE.

**Tech Stack:** as Stages 2 and 3.

**Spec:** `docs/superpowers/specs/2026-10-26-accept-to-invoice-to-payment-design.md` §2 (Onboarding), §8 (Starting the work), §9 stage 4. Stages 1 to 3 are built; this plan changes only their acceptance function and adds a panel.

## Global Constraints

- **Production is the only database** (`unison-uat`, `nwdzpjzllhhqwawmsxjd`), `pnpm test:rls` runs against it, and the owner applies each migration (the assistant cannot); each is verified by looking at the functions in `pg_proc`, not the migration list. Every fixture row is removed and verified gone. **Baseline before Task 1**: `audit_events` with no organisation (1320); counts of `invoices` (1), `quotes` (3), `client_onboardings` (1), `tasks`, `billing_plans` (0); the real organisation's billing switches (all false).
- **The real organisation is never switched on and its data is never touched.** Nothing here has a new switch: onboarding at acceptance rides on the Stage 1 switch (`billing_plans_enabled`), exactly as the Sales update does. With it off, acceptance does what it did.
- **Nothing is pushed to HIVE** and the HIVE feed (`get_clients_for_api_key`) is not edited. No new environment variable, dependency or service-role file.
- **The rule "the work starts on the later of the start date and the first invoice being paid" lives in one function** (`public.billing_readiness`). The UI, the tests and any later setting read that function; the front end never recomputes it.
- **Nothing is marked paid except by a recorded payment.** "Paid" in the readiness line means the first invoice's status is `Paid` (its balance is 0 through recorded payments). The override is a recorded decision with a reason; it never changes an invoice.
- **Wording:** "may start", "waiting for the start date", "waiting for the first invoice to be paid", "started by decision of <name>". Never "completed" or "synced".
- **Git, Next 16, house style, test commands:** as in the Stage 2 plan's Global Constraints.

## Review Focus

1. **Accepting twice, or the sweep racing the acceptance, makes one onboarding and one task** (Task 2).
2. **A failure in the onboarding step never undoes the acceptance, the plan or the draft invoice** (Task 2: the step has its own guarded block).
3. **The readiness rule is exact at the edges:** the start date is today (ready on the date), the first invoice is partly paid (not ready), a cancelled first invoice (not ready, not "paid"), a quote with no start date (the date condition is met), a paused or ended plan (still reported, never "may start" for an ended plan's unpaid invoice) (Task 3).
4. **The override is a person's decision:** owner or admin only, a reason is required, another organisation's quote cannot be touched, and removing it returns to the rule (Task 3).
5. **A business day is a business day:** a Friday acceptance gives a task due Monday; a Saturday gives Monday; a Sunday gives Monday (Task 2).

---

### Task 1: Schema — the onboarding's quote, the override

**Files:**
- Create: `supabase/migrations/20261113100000_billing_onboarding_schema.sql`, `tests/integration/rls/billing-onboarding-schema.test.ts`
- Modify: `features/crm-workspace/vocabulary.ts`, `tests/integration/rls/billing-fixtures.ts`

**Interfaces:** Produces:
- `client_onboardings.quote_id uuid` with `constraint client_onboardings_quote_id_key unique (quote_id)` and a composite FK `(quote_id, organization_id)` → `quotes (id, organization_id)` `on delete set null (quote_id)`.
- `billing_plans`: `readiness_override_at timestamptz`, `readiness_override_by uuid references auth.users on delete set null`, `readiness_override_reason text check (char_length <= 500)`, with `check ((readiness_override_at is null) = (readiness_override_reason is null))`.
- `activities_kind_check` replaced from its newest definition plus `billing.onboarding_created`, `billing.readiness_overridden`; `vocabulary.ts` lists them in that order with labels `Onboarding started`, `Start decision`.
- Fixtures: `BillingOrg` gains `onboardingOf(quoteId): Promise<Record<string, any> | null>` (service role) and `tasksOf(onboardingId): Promise<Array<Record<string, any>>>`.

- [ ] **Step 1:** Record the baseline. Find the newest `activities_kind_check`.
- [ ] **Step 2: Failing tests:** `'quote_id on an onboarding is unique and belongs to the same organisation; deleting the quote keeps the onboarding'`; `'the override columns are both set or both null and the reason is at most 500 characters'`; `'a member cannot write the override columns or quote_id on a billing plan or onboarding they can read'` (the policies on `client_onboardings` already let members write their own rows: assert that setting `quote_id` through the API to another organisation's quote is refused by the composite FK).
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Write the migration, vocabulary and fixtures. The owner applies it (`billing_onboarding_schema`). Run the new file, `billing-plan-schema.test.ts` and the vocabulary unit test. Expected: pass; residue check.
- [ ] **Step 5:** Commit `feat(billing): the onboarding's quote and the start override`.

---

### Task 2: Onboarding and a task at acceptance

**Files:**
- Create: `supabase/migrations/20261113101000_billing_onboarding_on_acceptance.sql`, `tests/integration/rls/billing-onboarding-acceptance.test.ts`

**Interfaces:** Consumes Task 1. Produces:
- `private.add_business_days(p_from date, p_days integer) returns date` (immutable, no grants): Monday to Friday only, no holidays; from a Friday, Saturday or Sunday one business day is the Monday; zero returns the date unchanged.
- `private.billing_make_onboarding(p_quote_id uuid) returns uuid` (revoked from all roles; definer): returns the existing onboarding for the quote if there is one; otherwise inserts `client_onboardings` (organisation, the quote's client and client name, `owner_id` = the quote's owner team member, `onboarding_type` `Standard Client`, `stage` `Welcome`, `status` `Active`, `start_date` = the quote's `start_date`, `notes` `Made when <client> accepted quotation <number>.`, `quote_id`) with `on conflict (quote_id) do nothing` and re-reads; writes `billing.onboarding_created` on the quote's timeline (`Onboarding started for <client>`); and, only when it made the record, one `tasks` row (`Contact <client> within one business day`, description `<client> accepted quotation <number>. Make contact to welcome them and confirm the start date.`, `onboarding_id`, `client_id`, `assignee_id` the quote owner's team member, `High`, `Planned`, `due_at` = the South African day `private.add_business_days(today, 1)` at 17:00 South African time).
- `private.billing_on_acceptance` replaced from its newest definition (`20261111104000_billing_notice_emails.sql`): unchanged, plus after the Plan step and before the Notice step, a block `begin perform private.billing_make_onboarding(v_quote.id); exception when others then raise warning 'billing_on_acceptance: the onboarding for quote % failed (SQLSTATE %)', v_quote.id, sqlstate; end;` so an onboarding failure leaves the Sales update, the plan, the draft invoice and the notice standing. It runs only when the plan step ran (the function already returns early otherwise).
- `public.billing_nightly` is unchanged: the sweep calls `billing_on_acceptance`, which now makes the onboarding too (idempotently).

- [ ] **Step 1: Failing tests** (`billing-onboarding-acceptance.test.ts`, through `acceptedOnPortal`): `'switch off: acceptance makes no onboarding and no task'`; `'switch on: one onboarding for the quote with the client, the owner's team profile, the quote's start date, Welcome, Active; one task assigned to the owner, High, linked to the onboarding, due the next business day at 17:00 South African time'`; `'a quote with no terms and a once-off-only quote get an onboarding too, with no start date'`; `'accepting a revision of the quote, the sweep, and two sweeps at once leave one onboarding and one task'` (use the sweep through `billing_nightly` after nulling nothing: assert idempotence by calling `billing_on_acceptance` indirectly through the sweep for a quote whose plan was deleted by the service role); `'a failing onboarding step (the quote's owner archived is not a failure; force one by pointing the quote's client to a deleted row is not possible, so make the insert fail by pre-inserting a conflicting onboarding for another quote is not a failure either): the guarded block is checked by a source guard that the block exists inside billing_on_acceptance and that its handler only warns'`; `'add_business_days: Mon+1=Tue, Thu+1=Fri, Fri+1=Mon, Sat+1=Mon, Sun+1=Mon, Fri+5=Fri, +0 unchanged'` (the function is private, so it is exercised through the task due dates by setting the system clock-free path: the test sets nothing and instead asserts the due date equals the same calculation done in the test for today); `'the acceptance, the plan, the draft invoice and the notice are unchanged'` (re-run the Stage 1 acceptance assertions that matter: plan items, draft invoice, notice count).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Write the migration. The owner applies it (`billing_onboarding_on_acceptance`). Run the file, `billing-acceptance.test.ts`, `billing-notice-emails.test.ts`, `quote-portal-decide.test.ts`, `quote-portal-follow-ups.test.ts`. Expected: pass; residue check (also `tasks` and `client_onboardings` at baseline).
- [ ] **Step 4:** Commit `feat(billing): an onboarding record and a task when a quote is accepted`.

---

### Task 3: The readiness rule and the override

**Files:**
- Create: `supabase/migrations/20261113102000_billing_readiness.sql`, `tests/integration/rls/billing-readiness.test.ts`

**Interfaces:** Consumes Tasks 1 and 2. Produces:
- `public.billing_readiness(p_quote_id uuid) returns jsonb` (`revoke ... from public, anon; grant ... to authenticated`; the caller must be a member of the quote's organisation, else `BILLING_ITEM_NOT_FOUND`, `42501`; stable): `{ "state": "no_plan" | "waiting_start" | "waiting_payment" | "ready" | "overridden", "start_date": date | null, "first_invoice": { "id", "number", "status", "balance", "currency" } | null, "override": { "at", "by_name", "reason" } | null, "onboarding_id": uuid | null }`. The rule, in order: no plan → `no_plan`; an override on the plan → `overridden`; the start date set and later than the South African today → `waiting_start`; the first invoice absent, a Draft, Cancelled or with any balance, or its plan ended → `waiting_payment`; otherwise `ready`. "Fully paid" is status `Paid`. `by_name` is the team member name of the person who set the override, else null.
- `public.billing_set_readiness_override(p_quote_id uuid, p_override boolean, p_reason text) returns void` (`revoke ... from public, anon; grant ... to authenticated`): owner or admin else `BILLING_PLAN_ADMIN_ONLY`; the quote must have a plan (`BILLING_ITEM_NOT_FOUND`); setting needs a reason of 1 to 500 trimmed characters (`BILLING_REASON_REQUIRED`); setting while set updates the reason; removing clears it; each change writes `billing.readiness_overridden` on the quote (`Start decided despite waiting: <reason>` / `Start decision removed`) with the member as actor.

- [ ] **Step 1: Failing tests:** `'no plan, then a plan whose start date is tomorrow: waiting_start; today: not waiting for the date; no start date: not waiting for the date'`; `'first invoice a Draft, Issued with a balance, partly paid, Cancelled: waiting_payment; fully paid (a recorded payment through record_payment) with the date reached: ready'`; `'both conditions are needed: paid but the date later is waiting_start; the date reached but unpaid is waiting_payment'`; `'an ended plan is never ready'`; `'an override makes the state overridden whatever else is true, needs an owner or admin and a reason, can be updated and removed, and removing returns to the rule'`; `'another organisation's quote and a member's attempt are refused'`; `'the timeline records each change by the member'`; `'billing_readiness is readable by every member of the organisation and not by anon or another organisation'`; `'the South African date is used (a source guard: no current_date, now()::date)'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Write the migration. The owner applies it (`billing_readiness`). Run the file. Expected: pass; residue check.
- [ ] **Step 4:** Commit `feat(billing): the readiness rule and the start override`.

---

### Task 4: The readiness line on the quote page

**Files:**
- Create: `features/documents/billing-readiness-view.ts` (pure), `features/documents/queries/get-billing-readiness.ts`, `features/documents/actions/billing-readiness.ts`, `features/documents/components/billing-readiness-panel.tsx`, `tests/unit/billing-readiness-view.test.ts`, `tests/unit/billing-readiness-actions.test.ts`
- Modify: `app/(unison)/commercial/quotes/[quoteId]/page.tsx` (mount after `BillingPlanPanel`)

**Interfaces:** Consumes Task 3. Produces:
- `billing-readiness-view.ts`: `describeReadiness(r: { state: 'no_plan' | 'waiting_start' | 'waiting_payment' | 'ready' | 'overridden'; startDate: string | null; firstInvoice: { number: string; status: string; balance: number; currency: string } | null; override: { byName: string | null; reason: string } | null }): { line: string; tone: 'muted' | 'waiting' | 'attention' | 'done' }` — `ready` → `The work may start: the start date has arrived and the first invoice is paid.` (done); `waiting_start` → `Waiting for the start date, <d Month yyyy>.` (waiting); `waiting_payment` → `Waiting for the first invoice to be paid: <number>, <currency> <balance> owing.` or, with no invoice or a draft, `Waiting for the first invoice to be approved and paid.` (attention); `overridden` → `Started by decision of <name>: <reason>` (done; `somebody` when there is no name); `no_plan` renders nothing.
- `getBillingReadiness(quoteId)`: rpc `billing_readiness`, the plan's `canManage` from `roleHasPermission(role, 'company.manage')`, and the onboarding link (`/operations/onboarding/<id>`); null when `no_plan`.
- `setBillingReadinessOverrideAction(quoteId: string, override: boolean, _previous: ActionState, form: FormData): Promise<ActionState>` — UUID check, `documentContext()`, permission `company.manage` before the one rpc `billing_set_readiness_override`, reads only `reason`, `documentErrorMessage` on error, `revalidateDocumentPages()`; success `Start decision saved.` / `Start decision removed.`.
- `BillingReadinessPanel({ quoteId })` (server component, titled "Starting the work"; renders nothing when there is no plan): the line, a link `Open the onboarding record` when there is one, and, for owners and admins while the state is `waiting_start` or `waiting_payment`, `Start anyway` with a required reason (`Why can the work start before this is met?`) and, while `overridden`, `Remove this decision`.

- [ ] **Step 1: Failing tests:** `billing-readiness-view.test.ts` for every line and tone, the date format, the owing figure, a missing name, a draft first invoice, no `paid`/`completed`/`synced` words beyond the quoted sentences; `billing-readiness-actions.test.ts` source guards (`'use server'` with only async exports; permission before the one rpc; reads only `reason`; the panel renders the controls only inside a `canManage` branch; the quote page mounts the panel after `BillingPlanPanel`; no client component imports a server module).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Read the page guide in `node_modules/next/dist/docs/`. Implement. Run both files and `pnpm typecheck`. Expected: pass.
- [ ] **Step 4:** Commit `feat(billing): the readiness line and the start override on the quote page`.

---

### Task 5: Verification, walk-through and docs

- [ ] **Step 1:** `pnpm typecheck`, `pnpm test`, `pnpm build`. Expected: pass.
- [ ] **Step 2:** `pnpm test:rls` against production. Expected: every file passes.
- [ ] **Step 3: Walk it** with a throwaway organisation (`setupBillingOrg`, scratch script, `pnpm dev --port 3002`): accept on the portal; the onboarding record and the task exist; the quote page shows the readiness line for each state (waiting for the date, waiting for payment, ready after a recorded payment, overridden and removed); the override needs a reason; phone width. Remove everything and confirm the baseline.
- [ ] **Step 4:** Final read of the Stage 4 diff against the Review Focus; fix anything found test-first.
- [ ] **Step 5:** Docs: "From accept-to-invoice, Stage 4" in `docs/follow-ups.md` (what it does; production changes; verified and not verified; known limits, including that plans made before Stage 4 have no onboarding record; owner decisions, including whether "work starts when paid" is the default for all quotes), the roadmap line (all four stages built), and the design's Status line. Commit `docs: record accept-to-invoice stage 4`.

---

## Calls made in this plan (for review)

1. **No new switch.** Onboarding at acceptance rides on the Stage 1 "Billing plans" switch, like the Sales update; the design lists switches only for Stages 1 to 3.
2. **One onboarding per quote** (`quote_id` unique), made idempotently; the sweep and a re-acceptance never duplicate it. Plans made before Stage 4 shipped get none (the existing manual onboarding form still works).
3. **The task** is for the quote's owner, High, due the next business day at 17:00 South African time (Monday to Friday, no public holidays).
4. **The readiness rule** is the design's: the start date has arrived (or there is none) and the first invoice's status is `Paid`; an ended plan is never ready; an override beats everything. It lives in `billing_readiness` only.
5. **The override** is stored on the billing plan, needs an owner or admin and a reason, is visible on the quote and the timeline, and can be removed.
6. **A Draft or Cancelled first invoice** is "waiting for the first invoice to be approved and paid", not "paid".
7. **Nothing is pushed to HIVE** (the design's decision; a read-only "first invoice paid" field can be added to the client feed later if HIVE asks).
