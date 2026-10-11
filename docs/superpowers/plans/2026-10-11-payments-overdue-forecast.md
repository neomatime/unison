# Payments, Automatic Overdue and a Calculated Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member records and voids payments against an issued invoice, the invoice works out its own balance and Paid / Partially Paid / Overdue status in the database, a nightly job sets Overdue, and the Forecast screen becomes a read-only month-by-month view built from payments, unpaid invoices and the sales pipeline.

**Architecture:** The database is the authority. A `payments` table that only security-definer functions write (`record_payment`, `void_payment`) recomputes the invoice's balance, status and paid date in the same transaction through one internal function; `cancel_invoice` is the only manual status change; a guard trigger stops a signed-in role typing status, balance or paid date on an issued invoice; a `pg_cron` job calls `mark_overdue_invoices()` each night. The forecast is one `security invoker` SQL function (`forecast_months`) whose rows a pure TypeScript builder turns into a table model. The UI mirrors the database.

**Tech Stack:** Next.js 16 App Router (server actions), React 19, Supabase Postgres (RLS, security definer functions, `pg_cron`), `node --test --experimental-strip-types`, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-11-payments-overdue-forecast-design.md` (the binding authority; where this plan departs from it, the departure is listed under "Decisions made while planning" and Task 4 writes it into the spec).

## Global Constraints

Every task's requirements include these. Values are copied from the spec.

- `unison-uat` (Supabase project `nwdzpjzllhhqwawmsxjd`) is **production**. Every test row is deleted, including its audit events. Rolled-back probes before applying any migration; **only the controller applies migrations or touches production**. Implementers never run the RLS suite or any SQL against the database.
- Migrations are append-only. Decisions are made in the database and tested there; the UI mirrors them. A control in the UI is a claim the product supports it; **no role-based behaviour is invented**: every active member can record, void and cancel.
- Payments: write path only through `record_payment` and `void_payment`; `authenticated` has `select` only on `payments`; no edit, no delete; a wrong payment is voided with a reason (1 to 500 characters) and stays on the list; a payment can never exceed the current balance; a payment date cannot be in the future (South African date) or before the invoice's issue date; methods are `Bank transfer`, `Card`, `Cash`, `Other`; a reference is optional, up to 120 characters; amounts have at most 2 decimals and are above 0.
- The one rule (balance, status, paid date): balance = total minus unvoided payments; balance 0 is **Paid** with the date of the latest unvoided payment; otherwise Partially Paid if unvoided payments exist, else Issued; a balance above 0 past the due date (South African date) is **Overdue**; Cancelled is manual and never changed by the rule.
- An invoice with an unvoided payment cannot be cancelled; a Draft or Cancelled invoice takes no payment.
- The nightly job runs at 22:05 UTC (00:05 in South Africa), is named `unison-mark-overdue-invoices`, writes one `invoice.overdue` timeline entry per invoice it changes, and changes nothing on a second run.
- New timeline kinds `payment.recorded`, `payment.voided`, `invoice.overdue`; entries are written on the invoice's client (none when the invoice has no client).
- Unit-tested modules use relative imports with the `.ts` extension, carry no `'use server'`/`'use client'` directive and import neither `server-only` nor `@/...`. They use `createElement`, not JSX, if they build elements.
- No real address, bank, VAT or phone value in code or tests. Secrets live in `.env.local` only.
- Never `git add -A`, `git checkout .`, `git restore .`, `git stash` or `git clean`; stage explicit paths. **Do not touch `public/`** and do not touch `features/commercial-finance/components/record-collection-workspace.tsx`. Commit only when the task says to; never push.
- This Next.js has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing route, config or caching code (AGENTS.md). Use the Edit/Write tools for file edits.
- End every commit message with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Decisions made while planning

Small departures from the spec, each with its reason. Task 4 writes them into the spec as an "Amendments" section.

1. **The job function is `public.mark_overdue_invoices()`, executable by `service_role` only** (not a `private` function), so the database test can run it through the service-role client; the cron job runs as the database owner. Its helper `private.refresh_invoice_payment_state` stays private.
2. **The forecast has a "Later" line** for invoices and opportunities due or closing after the ten-month window, so totals are never silently short. Collected money older than the window is not shown.
3. **No trigger blocks deleting an invoice that has payments:** members have no `delete` privilege on `invoices` at all (`grant select, insert, update`), so the spec's rule already holds; a test asserts it.
4. **The "more than the balance still owing" message does not repeat the amount;** the form shows the balance beside the field as the maximum.
5. **The guard is its own trigger** (`invoices_payment_state_guard`), not an edit of the large `invoices_documents_before` function; triggers fire alphabetically, so the existing `INVOICE_CANCELLED` / `INVOICE_CANNOT_REOPEN` tokens still win where they did.
6. **The old forecast code for the typed records is left in place unreachable** (kind `forecast` in the commercial-finance actions, queries, form and register); only its routes are removed. Removing it is a follow-up.

## Review Focus

Failure modes the spec implies that are most likely to hurt someone. Each has a test in the task named.

1. **Two people record payments at once, or one double-clicks:** the balance can never be overspent; the second payment is refused. *(Task 1 database test with parallel calls; Task 2 button disabled while pending.)*
2. **An amount typed as `1 500,50`, `1,500`, `0.001`, `-5` or a huge number** gets a plain message and nothing is sent to the database. *(Task 2 field reader tests.)*
3. **The date around South African midnight:** "today" is the South African date everywhere (the form default, the future-date check, the job), never the UTC date. *(Task 1 database test with today and tomorrow; Task 2 helper test with fixed instants.)*
4. **Voiding the only payment on an invoice that has since gone past its due date** returns it to Overdue, not Issued; voiding on a Paid invoice returns it to Partially Paid or Overdue. *(Task 1.)*
5. **A forecast with mixed currencies, undated, past-dated and far-future opportunities, voided payments, cancelled invoices, or no data at all** is correct and never adds currencies together. *(Task 3 database and unit tests.)*

---

## File structure

**Create**

- `supabase/migrations/20261011140000_payments_overdue.sql` (Task 1), `supabase/migrations/20261011150000_forecast_months.sql` (Task 3).
- `features/payments/vocabulary.ts`: methods and labels.
- `features/payments/fields.ts`: the payment and void-reason readers, `todayInJohannesburg`.
- `features/payments/actions/payments.ts`: `recordPaymentAction`, `voidPaymentAction`, `cancelInvoiceAction`.
- `features/payments/queries/list-payments.ts`: the payments of an invoice.
- `features/payments/components/record-payment-form.tsx`, `void-payment-form.tsx`, `payments-section.tsx`.
- `features/forecast/build-forecast.ts` (pure), `features/forecast/queries/get-forecast.ts`, `features/forecast/components/forecast-screen.tsx`.
- Tests: `tests/integration/rls/payments.test.ts`, `tests/integration/rls/forecast-months.test.ts`, `tests/unit/payments-fields.test.ts`, `tests/unit/payments-ui.test.ts`, `tests/unit/forecast-build.test.ts`.

**Modify**

- `features/crm-workspace/vocabulary.ts`, `tests/unit/crm-workspace-vocabulary.test.ts` (reads the newest definition already; only the lists change).
- `features/documents/errors.ts`, `tests/unit/documents-vocabulary.test.ts`.
- `tests/integration/rls/anon-privileges.test.ts`, `tests/integration/rls/documents-send-issue.test.ts` (two places that typed a status).
- `features/commercial-finance/actions/phase-six.ts` (issued-invoice branch), `features/commercial-finance/components/phase-six-form.tsx` (issued-invoice form), `tests/unit/documents-ui.test.ts`.
- `features/documents/components/document-actions.tsx` (Cancel invoice), `app/(unison)/finance/invoices/[invoiceId]/page.tsx`.
- `app/(unison)/finance/forecast/page.tsx`; delete `app/(unison)/finance/forecast/new/` and `[scenarioId]/`; `tests/unit/phase-six-commercial-finance.test.ts`, `tests/unit/ui-completeness.test.ts`.

---

### Task 1: The database (payments, the rule, the functions, the guard, the nightly job)

**Files:**
- Create: `supabase/migrations/20261011140000_payments_overdue.sql`
- Modify: `features/crm-workspace/vocabulary.ts`, `features/documents/errors.ts`, `tests/unit/documents-vocabulary.test.ts`, `tests/integration/rls/anon-privileges.test.ts`, `tests/integration/rls/documents-send-issue.test.ts`
- Test: `tests/integration/rls/payments.test.ts`

**Interfaces:**
- Consumes: slice A and B tables and functions (`invoices`, `issue_invoice`, `activities`, `activity_actor(uuid)`, `is_member_of(uuid)`, the `invoices_documents_before` trigger), `tests/integration/rls/helpers.ts`.
- Produces (Tasks 2 and 3 rely on these exact names):
  - Table `public.payments(id, organization_id, invoice_id, amount, received_on, method, reference, recorded_by, recorded_at, voided_at, voided_by, void_reason)`; `authenticated` has `select` only.
  - `public.record_payment(p_invoice uuid, p_amount numeric, p_received_on date, p_method text, p_reference text) returns uuid`.
  - `public.void_payment(p_payment uuid, p_reason text) returns void`.
  - `public.cancel_invoice(p_invoice uuid) returns void`.
  - `public.mark_overdue_invoices() returns integer` (service role only), cron job `unison-mark-overdue-invoices`.
  - Activity kinds `payment.recorded`, `payment.voided`, `invoice.overdue`.
  - Error tokens (all mapped in `errors.ts`): `INVOICE_NOT_PAYABLE`, `PAYMENT_AMOUNT_INVALID`, `PAYMENT_EXCEEDS_BALANCE`, `PAYMENT_DATE_FUTURE`, `PAYMENT_DATE_BEFORE_ISSUE`, `PAYMENT_METHOD_INVALID`, `PAYMENT_REFERENCE_TOO_LONG`, `PAYMENT_NOT_FOUND`, `PAYMENT_ALREADY_VOIDED`, `PAYMENT_VOID_REASON_REQUIRED`, `PAYMENT_VOID_REASON_TOO_LONG`, `PAYMENT_IMMUTABLE`, `INVOICE_NOT_ISSUED`, `INVOICE_ALREADY_CANCELLED`, `INVOICE_HAS_PAYMENTS`, `INVOICE_STATUS_AUTOMATIC` (plus the existing `INVOICE_NOT_FOUND`, `INVOICE_CANCELLED`).
- **You write and commit the files; you do not apply the migration and you do not run the RLS suite** (it writes to production). The controller probes the migration in a rolled-back transaction, applies it, runs the RLS files and sends any defect back to you as a fix round. Run only unit tests, `pnpm typecheck` and `pnpm test`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261011140000_payments_overdue.sql`:

```sql
-- Stage 2, slice C: payments, the invoice balance and status worked out from them, an automatic Overdue,
-- and three timeline kinds. Append-only: earlier migrations are applied and are not edited.

-- ---------------------------------------------------------------------------
-- 1. New timeline kinds: the list from 20261011130000 plus three.
-- ---------------------------------------------------------------------------
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in ('call','meeting','email','note','lead.converted','client.created_from_lead','opportunity.created_from_lead','opportunity.stage_changed','quote.sent','quote.accepted','quote.emailed','invoice.emailed','quote.invoiced','payment.recorded','payment.voided','invoice.overdue'));

-- ---------------------------------------------------------------------------
-- 2. payments: one row per payment received. Members read; nobody writes except record_payment and
--    void_payment. There is no audit trigger: the rows are the log.
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  received_on date not null,
  method text not null check (method in ('Bank transfer','Card','Cash','Other')),
  reference text check (reference is null or char_length(reference) between 1 and 120),
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text check (void_reason is null or char_length(void_reason) between 1 and 500),
  constraint payments_void_together check ((voided_at is null) = (void_reason is null)),
  constraint payments_invoice_fkey foreign key (invoice_id, organization_id)
    references public.invoices(id, organization_id) on delete cascade,
  constraint payments_recorded_by_fkey foreign key (organization_id, recorded_by)
    references public.memberships(organization_id, user_id) on delete set null (recorded_by),
  constraint payments_voided_by_fkey foreign key (organization_id, voided_by)
    references public.memberships(organization_id, user_id) on delete set null (voided_by)
);

create index payments_invoice_idx on public.payments(invoice_id, received_on);
create index payments_org_received_idx on public.payments(organization_id, received_on) where voided_at is null;

alter table public.payments enable row level security;

create policy payments_select on public.payments for select to authenticated
  using (public.is_member_of(organization_id));

revoke all on public.payments from public, anon, authenticated;
grant select on public.payments to authenticated;

-- Not even a definer function can edit a recorded payment: only the three void fields may be set, once, and the two
-- "who" columns may be nulled by the foreign key's own action when a membership is removed.
create or replace function public.payments_immutable() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (new.id, new.organization_id, new.invoice_id, new.amount, new.received_on, new.method, new.reference, new.recorded_at)
     is distinct from
     (old.id, old.organization_id, old.invoice_id, old.amount, old.received_on, old.method, old.reference, old.recorded_at) then
    raise exception 'PAYMENT_IMMUTABLE' using errcode = '23514';
  end if;
  if old.voided_at is not null and (new.voided_at, new.void_reason) is distinct from (old.voided_at, old.void_reason) then
    raise exception 'PAYMENT_IMMUTABLE' using errcode = '23514';
  end if;
  if new.recorded_by is distinct from old.recorded_by and new.recorded_by is not null then
    raise exception 'PAYMENT_IMMUTABLE' using errcode = '23514';
  end if;
  if new.voided_by is distinct from old.voided_by and new.voided_by is not null and old.voided_at is not null then
    raise exception 'PAYMENT_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger payments_immutable before update on public.payments
  for each row execute function public.payments_immutable();
revoke all on function public.payments_immutable() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The one rule. Internal: the callers hold the invoice row lock.
-- ---------------------------------------------------------------------------
create or replace function private.refresh_invoice_payment_state(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices%rowtype;
  v_paid numeric(14,2);
  v_count integer;
  v_last date;
  v_balance numeric(14,2);
  v_status text;
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  select * into v_inv from public.invoices where id = p_invoice;
  if not found or v_inv.status in ('Draft', 'Cancelled') then
    return;
  end if;
  select coalesce(sum(p.amount), 0), count(*), max(p.received_on)
    into v_paid, v_count, v_last
    from public.payments p
    where p.invoice_id = p_invoice and p.organization_id = v_inv.organization_id and p.voided_at is null;
  v_balance := greatest(v_inv.total_amount - v_paid, 0);
  if v_balance = 0 then
    v_status := 'Paid';
  elsif v_count > 0 then
    v_status := 'Partially Paid';
  else
    v_status := 'Issued';
  end if;
  if v_balance > 0 and v_inv.due_date is not null and v_inv.due_date < v_today then
    v_status := 'Overdue';
  end if;
  update public.invoices set
    status = v_status,
    balance_amount = v_balance,
    paid_at = case when v_status = 'Paid' then (v_last::timestamp at time zone 'Africa/Johannesburg') else null end
  where id = p_invoice;
end $$;

revoke all on function private.refresh_invoice_payment_state(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. record_payment
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_invoice uuid, p_amount numeric, p_received_on date, p_method text, p_reference text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_inv public.invoices%rowtype;
  v_balance numeric(14,2);
  v_id uuid;
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  select i.organization_id into v_org from public.invoices i where i.id = p_invoice;
  if not found or not public.is_member_of(v_org) then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  -- The row lock serialises two simultaneous payments on the same invoice.
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_inv.status not in ('Issued', 'Partially Paid', 'Overdue') then
    raise exception 'INVOICE_NOT_PAYABLE' using errcode = '23514';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'PAYMENT_AMOUNT_INVALID' using errcode = '23514';
  end if;
  select v_inv.total_amount - coalesce(sum(p.amount), 0) into v_balance
    from public.payments p
    where p.invoice_id = p_invoice and p.organization_id = v_org and p.voided_at is null;
  if p_amount > v_balance then
    raise exception 'PAYMENT_EXCEEDS_BALANCE' using errcode = '23514';
  end if;
  if p_received_on is null or p_received_on > v_today then
    raise exception 'PAYMENT_DATE_FUTURE' using errcode = '23514';
  end if;
  if v_inv.issue_date is not null and p_received_on < v_inv.issue_date then
    raise exception 'PAYMENT_DATE_BEFORE_ISSUE' using errcode = '23514';
  end if;
  if p_method is null or p_method not in ('Bank transfer', 'Card', 'Cash', 'Other') then
    raise exception 'PAYMENT_METHOD_INVALID' using errcode = '23514';
  end if;
  if v_ref is not null and char_length(v_ref) > 120 then
    raise exception 'PAYMENT_REFERENCE_TOO_LONG' using errcode = '23514';
  end if;

  insert into public.payments (organization_id, invoice_id, amount, received_on, method, reference, recorded_by)
  values (v_org, p_invoice, p_amount, p_received_on, p_method, v_ref, public.activity_actor(v_org))
  returning id into v_id;

  perform private.refresh_invoice_payment_state(p_invoice);

  if v_inv.client_id is not null then
    insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
    values (v_org, 'payment.recorded',
            'Payment of ' || v_inv.currency || ' ' || to_char(p_amount, 'FM999999999990.00') || ' recorded on invoice ' || v_inv.invoice_number,
            jsonb_build_object('payment_id', v_id, 'invoice_id', p_invoice, 'number', v_inv.invoice_number, 'amount', p_amount),
            public.activity_actor(v_org), v_inv.client_id);
  end if;
  return v_id;
end $$;

revoke all on function public.record_payment(uuid, numeric, date, text, text) from public, anon;
grant execute on function public.record_payment(uuid, numeric, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. void_payment
-- ---------------------------------------------------------------------------
create or replace function public.void_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_invoice uuid;
  v_inv public.invoices%rowtype;
  v_pay public.payments%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select p.organization_id, p.invoice_id into v_org, v_invoice from public.payments p where p.id = p_payment;
  if not found or not public.is_member_of(v_org) then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_inv from public.invoices where id = v_invoice for update;
  select * into v_pay from public.payments where id = p_payment for update;
  if v_inv.status = 'Cancelled' then
    raise exception 'INVOICE_CANCELLED' using errcode = '23514';
  end if;
  if v_pay.voided_at is not null then
    raise exception 'PAYMENT_ALREADY_VOIDED' using errcode = '23514';
  end if;
  if v_reason = '' then
    raise exception 'PAYMENT_VOID_REASON_REQUIRED' using errcode = '23514';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'PAYMENT_VOID_REASON_TOO_LONG' using errcode = '23514';
  end if;

  update public.payments set voided_at = now(), voided_by = public.activity_actor(v_org), void_reason = v_reason
  where id = p_payment;

  perform private.refresh_invoice_payment_state(v_invoice);

  if v_inv.client_id is not null then
    insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
    values (v_org, 'payment.voided',
            'Payment of ' || v_inv.currency || ' ' || to_char(v_pay.amount, 'FM999999999990.00') || ' voided on invoice ' || v_inv.invoice_number,
            jsonb_build_object('payment_id', p_payment, 'invoice_id', v_invoice, 'number', v_inv.invoice_number, 'amount', v_pay.amount),
            public.activity_actor(v_org), v_inv.client_id);
  end if;
end $$;

revoke all on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. cancel_invoice: the only manual status change.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_inv public.invoices%rowtype;
begin
  select i.organization_id into v_org from public.invoices i where i.id = p_invoice;
  if not found or not public.is_member_of(v_org) then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_inv.status = 'Draft' then
    raise exception 'INVOICE_NOT_ISSUED' using errcode = '23514';
  end if;
  if v_inv.status = 'Cancelled' then
    raise exception 'INVOICE_ALREADY_CANCELLED' using errcode = '23514';
  end if;
  if exists (select 1 from public.payments p where p.invoice_id = p_invoice and p.organization_id = v_org and p.voided_at is null) then
    raise exception 'INVOICE_HAS_PAYMENTS' using errcode = '23514';
  end if;
  update public.invoices set status = 'Cancelled', balance_amount = 0, paid_at = null where id = p_invoice;
end $$;

revoke all on function public.cancel_invoice(uuid) from public, anon;
grant execute on function public.cancel_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The guard: a signed-in role cannot type status, balance or paid date on an issued invoice. The functions
--    above and the nightly job run as the table owner and are not held to it. A separate trigger fires after
--    invoices_documents_before (alphabetical order), so that function's INVOICE_CANCELLED and
--    INVOICE_CANNOT_REOPEN tokens still win where they did.
-- ---------------------------------------------------------------------------
create or replace function public.invoices_payment_state_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and old.status <> 'Draft' and (
    new.status is distinct from old.status
    or new.balance_amount is distinct from old.balance_amount
    or new.paid_at is distinct from old.paid_at
  ) then
    raise exception 'INVOICE_STATUS_AUTOMATIC' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger invoices_payment_state_guard before update on public.invoices
  for each row execute function public.invoices_payment_state_guard();
revoke all on function public.invoices_payment_state_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. The nightly job. Called by pg_cron as the database owner and, in tests, by the service role.
-- ---------------------------------------------------------------------------
create or replace function public.mark_overdue_invoices() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_count integer := 0;
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  for r in
    select i.id, i.organization_id, i.client_id, i.invoice_number, i.balance_amount, i.currency, i.due_date
    from public.invoices i
    where i.status in ('Issued', 'Partially Paid')
      and i.balance_amount > 0
      and i.due_date is not null
      and i.due_date < v_today
    order by i.id
    for update skip locked
  loop
    perform private.refresh_invoice_payment_state(r.id);
    if r.client_id is not null then
      insert into public.activities (organization_id, kind, subject, details, client_id)
      values (r.organization_id, 'invoice.overdue', 'Invoice ' || r.invoice_number || ' is overdue',
              jsonb_build_object('invoice_id', r.id, 'number', r.invoice_number, 'balance', r.balance_amount, 'due_date', r.due_date),
              r.client_id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke all on function public.mark_overdue_invoices() from public, anon, authenticated;
grant execute on function public.mark_overdue_invoices() to service_role;

create extension if not exists pg_cron;
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'unison-mark-overdue-invoices') then
    perform cron.schedule('unison-mark-overdue-invoices', '5 22 * * *', 'select public.mark_overdue_invoices();');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Opening payments, once: an issued invoice whose typed balance is below its total gets one payment for the
--    difference, so balance and status stay consistent under the new rule. Does nothing when there are none
--    (the production database has no invoices at the time of writing).
-- ---------------------------------------------------------------------------
insert into public.payments (organization_id, invoice_id, amount, received_on, method, reference, recorded_by)
select i.organization_id, i.id, i.total_amount - i.balance_amount,
       coalesce((i.paid_at at time zone 'Africa/Johannesburg')::date, i.issue_date, (now() at time zone 'Africa/Johannesburg')::date),
       'Other', 'Opening balance (migrated)', null
from public.invoices i
where i.status not in ('Draft', 'Cancelled')
  and i.balance_amount < i.total_amount
  and not exists (select 1 from public.payments p where p.invoice_id = i.id);

do $$
declare
  r record;
begin
  for r in select distinct invoice_id from public.payments where reference = 'Opening balance (migrated)' loop
    perform private.refresh_invoice_payment_state(r.invoice_id);
  end loop;
end;
$$;
```

- [ ] **Step 2: Update the code's lists, messages and the drift tests**

In `features/crm-workspace/vocabulary.ts` add to the end of `SYSTEM_ACTIVITY_KINDS` (order must equal the constraint's):

```ts
  'payment.recorded',
  'payment.voided',
  'invoice.overdue',
```

and to `ACTIVITY_LABELS`:

```ts
  'payment.recorded': 'Payment recorded',
  'payment.voided': 'Payment voided',
  'invoice.overdue': 'Invoice overdue',
```

`tests/unit/crm-workspace-vocabulary.test.ts` already compares the code's lists with the newest definition of the constraint across all migrations; no change is needed there (run it to prove the lists now equal the new migration).

In `features/documents/errors.ts` add to `MESSAGES` (after the delivery entries):

```ts
  ['INVOICE_NOT_PAYABLE', 'Only an issued invoice that still has a balance can be paid.'],
  ['PAYMENT_AMOUNT_INVALID', 'Enter an amount above zero, with at most two decimals.'],
  ['PAYMENT_EXCEEDS_BALANCE', 'The payment is more than the balance still owing.'],
  ['PAYMENT_DATE_FUTURE', "The payment date can't be in the future."],
  ['PAYMENT_DATE_BEFORE_ISSUE', "The payment date can't be before the invoice date."],
  ['PAYMENT_METHOD_INVALID', 'Choose Bank transfer, Card, Cash or Other.'],
  ['PAYMENT_REFERENCE_TOO_LONG', 'The reference is too long (120 characters at most).'],
  ['PAYMENT_NOT_FOUND', 'That payment was not found.'],
  ['PAYMENT_ALREADY_VOIDED', 'That payment has already been voided.'],
  ['PAYMENT_VOID_REASON_REQUIRED', 'A reason is required to void a payment.'],
  ['PAYMENT_VOID_REASON_TOO_LONG', 'The reason is too long (500 characters at most).'],
  ['PAYMENT_IMMUTABLE', "A recorded payment can't be changed. Void it and record it again."],
  ['INVOICE_NOT_ISSUED', 'Only an issued invoice can be cancelled.'],
  ['INVOICE_ALREADY_CANCELLED', 'This invoice is already cancelled.'],
  ['INVOICE_HAS_PAYMENTS', 'Void the payments first, then cancel the invoice.'],
  ['INVOICE_STATUS_AUTOMATIC', 'Status and balance are worked out from the payments.'],
```

In `tests/unit/documents-vocabulary.test.ts` the two token tests concatenate the earlier migrations (`sendIssue = migration(...send_issue) + migration(...hardening) + migration(...delivery)`). Add `+ migration('20261011140000_payments_overdue.sql')` to **both** concatenations (every new token is raised there) and add to the messages test: `assert.match(documentErrorMessage('PAYMENT_EXCEEDS_BALANCE')!, /more than the balance/i)` and `assert.match(documentErrorMessage('INVOICE_HAS_PAYMENTS')!, /void the payments/i)`.

In `tests/integration/rls/anon-privileges.test.ts` add `'payments'` to the `TABLES` list (keep the shape the other entries use).

In `tests/integration/rls/documents-send-issue.test.ts` two places type a status as a member, which is now refused. Replace (a) the two lines after `assert.equal((await memberClient.from('invoices').update({ notes: 'chased' })...` that update `{ status: 'Partially Paid', balance_amount: 100 }` and `{ status: 'Cancelled' }` with:

```ts
  refused((await memberClient.from('invoices').update({ status: 'Partially Paid', balance_amount: 100 }).eq('id', id)).error, 'INVOICE_STATUS_AUTOMATIC')
  assert.equal((await memberClient.rpc('cancel_invoice', { p_invoice: id })).error, null)
```

and (b) in the test `'a cancelled invoice stays cancelled'` replace `assert.equal((await memberClient.from('invoices').update({ status: 'Cancelled' }).eq('id', id)).error, null)` with `assert.equal((await memberClient.rpc('cancel_invoice', { p_invoice: id })).error, null)` (the three refusals after it keep their tokens: `invoices_documents_before` fires before the new guard).

- [ ] **Step 3: Write the database test**

Create `tests/integration/rls/payments.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let member: U
let other: U
let memberClient: SupabaseClient
let otherClient: SupabaseClient
let clientA: string
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NIL = '00000000-0000-0000-0000-000000000000'
const sast = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const addDays = (isoDate: string, days: number) => new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)

const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}
const refused = (error: { message: string } | null, token: string) => {
  assert.ok(error, `expected ${token}`)
  assert.match(error.message, new RegExp(token))
}
const row = async (table: string, id: string) => must(await admin.from(table).select('*').eq('id', id).single()) as Record<string, any>

/** An issued invoice of 230.00 (2 x 100 plus 15% VAT) for client A. */
async function issuedInvoice(over: Record<string, unknown> = {}) {
  const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Pay Client A', ...over }).select('id').single())
  assert.equal((await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 1, title: 'Advisory', quantity: 2, unit_price: 100 })).error, null)
  assert.equal((await memberClient.rpc('issue_invoice', { p_id: invoice.id })).error, null)
  return invoice.id as string
}
const pay = (invoice: string, over: Record<string, unknown> = {}, client: SupabaseClient = memberClient) =>
  client.rpc('record_payment', { p_invoice: invoice, p_amount: 100, p_received_on: sast(), p_method: 'Bank transfer', p_reference: 'REF-1', ...over })
const voidIt = (payment: string, reason = 'Entered in error', client: SupabaseClient = memberClient) => client.rpc('void_payment', { p_payment: payment, p_reason: reason })
const timeline = async (kind: string) => (await admin.from('activities').select('subject, details, created_by').eq('client_id', clientA).eq('kind', kind)).data!

before(async () => {
  orgA = await createFixtureOrg('payments-a')
  orgB = await createFixtureOrg('payments-b')
  member = await createFixtureUser(orgA, 'member')
  other = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  otherClient = await signedInClient(other.email, other.password)
  clientA = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Pay Client A', status: 'Active' }).select('id').single()).id
  must(await admin.from('organization_settings').insert({
    organization_id: orgA, legal_name: 'Test Co (Pty) Ltd', document_prefix: 'TST', vat_rate: 15, default_payment_terms: 'Pay within 30 days',
  }).select('id').single())
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [member?.id, other?.id].filter(Boolean))
})

// ---------------------------------------------------------------------------
// The table: nobody but the functions writes
// ---------------------------------------------------------------------------
test('a member reads payments but cannot insert, update or delete one; anon and other organisations see nothing; not even the service role can edit one', async () => {
  const invoice = await issuedInvoice()
  const id = must(await pay(invoice)).valueOf() as string
  assert.equal((await memberClient.from('payments').select('id').eq('id', id)).data!.length, 1)

  const insert = await memberClient.from('payments').insert({ organization_id: orgA, invoice_id: invoice, amount: 1, received_on: sast(), method: 'Cash' })
  assert.equal(insert.error?.code, '42501', 'a payment cannot be written by hand')
  assert.equal((await memberClient.from('payments').update({ amount: 1 }).eq('id', id)).error?.code, '42501')
  assert.equal((await memberClient.from('payments').delete().eq('id', id)).error?.code, '42501')

  const anon = await anonymous.from('payments').select('id').limit(1)
  assert.match(anon.error?.message ?? '', /permission denied for table payments/)
  assert.deepEqual((await otherClient.from('payments').select('id').eq('invoice_id', invoice)).data, [])

  refused((await admin.from('payments').update({ amount: 5 }).eq('id', id)).error, 'PAYMENT_IMMUTABLE')
  refused((await admin.from('payments').update({ received_on: addDays(sast(), -1) }).eq('id', id)).error, 'PAYMENT_IMMUTABLE')
  assert.equal(Number((await row('payments', id)).amount), 100)
})

// ---------------------------------------------------------------------------
// record_payment and the rule
// ---------------------------------------------------------------------------
test('a part payment makes the invoice Partially Paid with the right balance and writes the client timeline entry', async () => {
  const invoice = await issuedInvoice()
  const { data, error } = await pay(invoice, { p_amount: 100, p_reference: '  REF-9  ' })
  assert.equal(error, null)
  const payment = await row('payments', data as string)
  assert.equal(Number(payment.amount), 100)
  assert.equal(payment.reference, 'REF-9', 'the reference is trimmed')
  assert.equal(payment.method, 'Bank transfer')
  assert.equal(payment.recorded_by, member.id)
  assert.equal(payment.voided_at, null)
  const after = await row('invoices', invoice)
  assert.equal(after.status, 'Partially Paid')
  assert.equal(Number(after.balance_amount), 130)
  assert.equal(after.paid_at, null)
  const entries = (await timeline('payment.recorded')).filter((entry) => entry.details.payment_id === data)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].details.invoice_id, invoice)
  assert.equal(entries[0].created_by, member.id)
})

test('paying the rest makes it Paid with the date of the last payment, and nothing more can be paid', async () => {
  const invoice = await issuedInvoice()
  assert.equal((await pay(invoice, { p_amount: 100 })).error, null)
  const earlier = addDays(sast(), 0)
  assert.equal((await pay(invoice, { p_amount: 130, p_received_on: earlier })).error, null)
  const paid = await row('invoices', invoice)
  assert.equal(paid.status, 'Paid')
  assert.equal(Number(paid.balance_amount), 0)
  assert.equal(String(paid.paid_at).slice(0, 10) === earlier || String(paid.paid_at).slice(0, 10) === addDays(earlier, -1), true, 'paid_at is the payment date at South African midnight')
  refused((await pay(invoice, { p_amount: 1 })).error, 'INVOICE_NOT_PAYABLE')
})

test('a payment is refused for a bad amount, date, method or reference, an invoice that cannot take one, or another organisation', async () => {
  const invoice = await issuedInvoice()
  for (const amount of [0, -1, 1.234, null]) refused((await pay(invoice, { p_amount: amount })).error, 'PAYMENT_AMOUNT_INVALID')
  refused((await pay(invoice, { p_amount: 230.01 })).error, 'PAYMENT_EXCEEDS_BALANCE')
  refused((await pay(invoice, { p_received_on: addDays(sast(), 1) })).error, 'PAYMENT_DATE_FUTURE')
  refused((await pay(invoice, { p_received_on: '2000-01-01' })).error, 'PAYMENT_DATE_BEFORE_ISSUE')
  refused((await pay(invoice, { p_method: 'Cheque' })).error, 'PAYMENT_METHOD_INVALID')
  refused((await pay(invoice, { p_method: null })).error, 'PAYMENT_METHOD_INVALID')
  refused((await pay(invoice, { p_reference: 'x'.repeat(121) })).error, 'PAYMENT_REFERENCE_TOO_LONG')
  assert.equal((await pay(invoice, { p_reference: 'x'.repeat(120), p_amount: 10 })).error, null)
  assert.equal((await pay(invoice, { p_reference: '   ', p_amount: 10 })).error, null, 'a blank reference is stored as none')

  const draft = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Pay Client A' }).select('id').single()).id
  refused((await pay(draft)).error, 'INVOICE_NOT_PAYABLE')
  const cancelled = await issuedInvoice()
  assert.equal((await memberClient.rpc('cancel_invoice', { p_invoice: cancelled })).error, null)
  refused((await pay(cancelled)).error, 'INVOICE_NOT_PAYABLE')

  refused((await pay(invoice, {}, otherClient)).error, 'INVOICE_NOT_FOUND')
  refused((await pay(NIL)).error, 'INVOICE_NOT_FOUND')
  assert.ok((await pay(invoice, {}, anonymous)).error, 'anon cannot call it')
  assert.equal((await admin.from('payments').select('id').eq('organization_id', orgB)).data!.length, 0)
})

test('parallel payments can never overspend the balance', async () => {
  const invoice = await issuedInvoice()
  const results = await Promise.all(Array.from({ length: 5 }, () => pay(invoice, { p_amount: 100 })))
  const accepted = results.filter((result) => !result.error)
  assert.equal(accepted.length, 2, 'only two payments of 100 fit in 230')
  for (const result of results.filter((entry) => entry.error)) refused(result.error, 'PAYMENT_EXCEEDS_BALANCE')
  const after = await row('invoices', invoice)
  assert.equal(Number(after.balance_amount), 30)
  assert.equal(after.status, 'Partially Paid')
  const total = (await admin.from('payments').select('amount').eq('invoice_id', invoice)).data!.reduce((sum, entry) => sum + Number(entry.amount), 0)
  assert.equal(total, 200)
})

// ---------------------------------------------------------------------------
// void_payment
// ---------------------------------------------------------------------------
test('voiding keeps the payment, restores the balance and status, and writes a timeline entry', async () => {
  const invoice = await issuedInvoice()
  const first = must(await pay(invoice, { p_amount: 100 })).valueOf() as string
  const second = must(await pay(invoice, { p_amount: 130 })).valueOf() as string
  assert.equal((await row('invoices', invoice)).status, 'Paid')

  assert.equal((await voidIt(second, '  Wrong client  ')).error, null)
  const voided = await row('payments', second)
  assert.ok(voided.voided_at)
  assert.equal(voided.void_reason, 'Wrong client')
  assert.equal(voided.voided_by, member.id)
  assert.equal(Number(voided.amount), 130, 'the row is kept as it was')
  let invoiceRow = await row('invoices', invoice)
  assert.equal(invoiceRow.status, 'Partially Paid')
  assert.equal(Number(invoiceRow.balance_amount), 130)
  assert.equal(invoiceRow.paid_at, null)
  assert.equal((await timeline('payment.voided')).filter((entry) => entry.details.payment_id === second).length, 1)

  assert.equal((await voidIt(first)).error, null)
  invoiceRow = await row('invoices', invoice)
  assert.equal(invoiceRow.status, 'Issued')
  assert.equal(Number(invoiceRow.balance_amount), 230)
})

test('a void is refused without a reason, twice, for another organisation, or for an unknown payment', async () => {
  const invoice = await issuedInvoice()
  const id = must(await pay(invoice)).valueOf() as string
  for (const reason of ['', '   ']) refused((await voidIt(id, reason)).error, 'PAYMENT_VOID_REASON_REQUIRED')
  refused((await voidIt(id, 'x'.repeat(501))).error, 'PAYMENT_VOID_REASON_TOO_LONG')
  refused((await voidIt(id, 'Entered in error', otherClient)).error, 'PAYMENT_NOT_FOUND')
  refused((await voidIt(NIL)).error, 'PAYMENT_NOT_FOUND')
  assert.ok((await voidIt(id, 'x', anonymous)).error)
  assert.equal((await voidIt(id, 'x'.repeat(500))).error, null)
  refused((await voidIt(id)).error, 'PAYMENT_ALREADY_VOIDED')
  refused((await admin.from('payments').update({ void_reason: 'changed' }).eq('id', id)).error, 'PAYMENT_IMMUTABLE')
})

test('voiding the only payment on an invoice that has since gone past its due date returns it to Overdue', async () => {
  const invoice = await issuedInvoice()
  const id = must(await pay(invoice, { p_amount: 230 })).valueOf() as string
  assert.equal((await row('invoices', invoice)).status, 'Paid')
  must(await admin.from('invoices').update({ issue_date: addDays(sast(), -40), due_date: addDays(sast(), -10) }).eq('id', invoice).select('id'))
  assert.equal((await voidIt(id)).error, null)
  const after = await row('invoices', invoice)
  assert.equal(after.status, 'Overdue')
  assert.equal(Number(after.balance_amount), 230)
})

// ---------------------------------------------------------------------------
// cancel_invoice and the guard
// ---------------------------------------------------------------------------
test('cancel_invoice cancels an issued invoice with no unvoided payment, and only that', async () => {
  const draft = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Pay Client A' }).select('id').single()).id
  refused((await memberClient.rpc('cancel_invoice', { p_invoice: draft })).error, 'INVOICE_NOT_ISSUED')

  const invoice = await issuedInvoice()
  const id = must(await pay(invoice, { p_amount: 50 })).valueOf() as string
  refused((await memberClient.rpc('cancel_invoice', { p_invoice: invoice })).error, 'INVOICE_HAS_PAYMENTS')
  assert.equal((await voidIt(id)).error, null)
  assert.equal((await memberClient.rpc('cancel_invoice', { p_invoice: invoice })).error, null)
  const cancelled = await row('invoices', invoice)
  assert.equal(cancelled.status, 'Cancelled')
  assert.equal(Number(cancelled.balance_amount), 0)
  refused((await memberClient.rpc('cancel_invoice', { p_invoice: invoice })).error, 'INVOICE_ALREADY_CANCELLED')
  refused((await voidIt(id)).error, 'INVOICE_CANCELLED')

  refused((await otherClient.rpc('cancel_invoice', { p_invoice: await issuedInvoice() })).error, 'INVOICE_NOT_FOUND')
  refused((await memberClient.rpc('cancel_invoice', { p_invoice: NIL })).error, 'INVOICE_NOT_FOUND')
  assert.ok((await anonymous.rpc('cancel_invoice', { p_invoice: invoice })).error)
})

test('a member cannot type a status, a balance or a paid date on an issued invoice, but can change the notes; nobody can delete an invoice', async () => {
  const invoice = await issuedInvoice()
  for (const change of [{ status: 'Paid' }, { status: 'Overdue' }, { status: 'Cancelled' }, { balance_amount: 0 }, { paid_at: new Date().toISOString() }]) {
    refused((await memberClient.from('invoices').update(change).eq('id', invoice)).error, 'INVOICE_STATUS_AUTOMATIC')
  }
  assert.equal((await memberClient.from('invoices').update({ notes: 'chased on the phone' }).eq('id', invoice)).error, null)
  const after = await row('invoices', invoice)
  assert.equal(after.status, 'Issued')
  assert.equal(Number(after.balance_amount), 230)

  const draft = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Pay Client A' }).select('id').single()).id
  assert.equal((await memberClient.from('invoices').update({ notes: 'draft note' }).eq('id', draft)).error, null, 'a draft is untouched by the guard')
  assert.equal((await memberClient.from('invoices').delete().eq('id', invoice)).error?.code, '42501', 'no delete privilege on invoices')
  assert.equal((await row('invoices', invoice)).status, 'Issued')
})

// ---------------------------------------------------------------------------
// The nightly job
// ---------------------------------------------------------------------------
test('the nightly function sets Overdue once, writes one entry, and leaves everything else alone', async () => {
  const past = { issue_date: addDays(sast(), -40), due_date: addDays(sast(), -10) }
  const late = await issuedInvoice()
  const lateButPartlyPaid = await issuedInvoice()
  assert.equal((await pay(lateButPartlyPaid, { p_amount: 100 })).error, null)
  const notYetDue = await issuedInvoice()
  const paid = await issuedInvoice()
  assert.equal((await pay(paid, { p_amount: 230 })).error, null)
  const cancelled = await issuedInvoice()
  assert.equal((await memberClient.rpc('cancel_invoice', { p_invoice: cancelled })).error, null)
  const draft = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Pay Client A' }).select('id').single()).id
  for (const id of [late, lateButPartlyPaid, paid, cancelled]) must(await admin.from('invoices').update(past).eq('id', id).select('id'))

  const first = await admin.rpc('mark_overdue_invoices')
  assert.equal(first.error, null)
  assert.ok(Number(first.data) >= 2, 'at least the two late invoices changed')
  assert.equal((await row('invoices', late)).status, 'Overdue')
  assert.equal((await row('invoices', lateButPartlyPaid)).status, 'Overdue')
  assert.equal(Number((await row('invoices', lateButPartlyPaid)).balance_amount), 130)
  assert.equal((await row('invoices', notYetDue)).status, 'Issued')
  assert.equal((await row('invoices', paid)).status, 'Paid')
  assert.equal((await row('invoices', cancelled)).status, 'Cancelled')
  assert.equal((await row('invoices', draft)).status, 'Draft')

  const entries = async (id: string) => (await timeline('invoice.overdue')).filter((entry) => entry.details.invoice_id === id)
  assert.equal((await entries(late)).length, 1)
  assert.equal((await entries(lateButPartlyPaid)).length, 1)
  assert.equal((await entries(notYetDue)).length, 0)

  const second = await admin.rpc('mark_overdue_invoices')
  assert.equal(second.error, null)
  assert.equal((await entries(late)).length, 1, 'a second run writes nothing more')

  assert.equal((await pay(lateButPartlyPaid, { p_amount: 130 })).error, null)
  assert.equal((await row('invoices', lateButPartlyPaid)).status, 'Paid', 'paying an overdue invoice in full makes it Paid')
})

test('only the service role can run the nightly function', async () => {
  assert.ok((await memberClient.rpc('mark_overdue_invoices')).error, 'a member cannot run it')
  assert.ok((await anonymous.rpc('mark_overdue_invoices')).error, 'anon cannot run it')
})
```

- [ ] **Step 4: Run the unit tests and the typecheck**

Run: `node --test --experimental-strip-types tests/unit/crm-workspace-vocabulary.test.ts tests/unit/documents-vocabulary.test.ts`, then `pnpm typecheck` and `pnpm test`.
Expected: green. (The RLS files are not run by you; read `payments.test.ts` against the migration and make sure `pnpm typecheck` resolves its types. If you find a defect in the SQL or the test, confirm it against the earlier migrations, fix it, and list it under "Deviations" in your report.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261011140000_payments_overdue.sql features/crm-workspace/vocabulary.ts features/documents/errors.ts tests/unit/documents-vocabulary.test.ts tests/integration/rls/anon-privileges.test.ts tests/integration/rls/documents-send-issue.test.ts tests/integration/rls/payments.test.ts
git commit -m "$(cat <<'EOF'
feat(payments): payments table, record, void and cancel, the balance and status rule, the Overdue job (migration not yet applied)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

**Controller gate (not for the implementer):** probe the migration in a rolled-back transaction (including a synthetic invoice with a typed balance to exercise the opening-payment step), apply it as `payments_overdue`, confirm with `list_migrations`, check `cron.job` has `unison-mark-overdue-invoices` at `5 22 * * *`, run `payments.test.ts`, `anon-privileges.test.ts`, `documents-send-issue.test.ts`, `documents-delivery.test.ts` and `phase-six-commercial-finance.test.ts`, and confirm no fixture rows are left (`payments`, `activities`, `invoices`, `clients`, `audit_events`).

---

### Task 2: The invoice screens (Record payment, Payments list, Void, Cancel invoice)

**Files:**
- Create: `features/payments/vocabulary.ts`, `features/payments/fields.ts`, `features/payments/actions/payments.ts`, `features/payments/queries/list-payments.ts`, `features/payments/components/record-payment-form.tsx`, `features/payments/components/void-payment-form.tsx`, `features/payments/components/payments-section.tsx`
- Modify: `features/documents/components/document-actions.tsx`, `app/(unison)/finance/invoices/[invoiceId]/page.tsx`, `features/commercial-finance/actions/phase-six.ts`, `features/commercial-finance/components/phase-six-form.tsx`, `tests/unit/documents-ui.test.ts`
- Test: `tests/unit/payments-fields.test.ts`, `tests/unit/payments-ui.test.ts`

**Interfaces:**
- Consumes: Task 1's functions and tokens (applied to the database); `parseDecimal` (`features/documents/fields.ts`); `formatAmount`, `formatDocumentDate` (`features/documents/document-view.ts`); `documentContext` (`features/documents/server-context.ts`); `failureState` (`features/documents/action-failure.ts`); `revalidateDocumentPages` (`features/documents/revalidate.ts`); `getDocument` (`features/documents/queries/get-document.ts`); `ActionButton`; `TextField`, `TextAreaField`, `FormError`; `WorkspaceSection` (`features/crm-workspace/components/workspace-section`); `listOrganizationMembers` (`@/features/memberships/queries/list-organization-members`); `isUuid` (`@/lib/utils`).
- Produces: `PAYMENT_METHODS`, `type PaymentMethod`, `isPaymentMethod`; `todayInJohannesburg(now?: Date): string`; `readPaymentFields(form, today?)`, `readVoidReason(form)`; `recordPaymentAction(invoiceId, previous, form)`, `voidPaymentAction(paymentId, previous, form)`, `cancelInvoiceAction(invoiceId, previous, form)`; `listPayments(invoiceId): Promise<PaymentRow[]>` (React-`cache`d); `<PaymentsSection invoiceId />`; `DocumentActions` gets an optional `hasPayments?: boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/payments-fields.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { readPaymentFields, readVoidReason, todayInJohannesburg } from '../../features/payments/fields.ts'
import { PAYMENT_METHODS, isPaymentMethod } from '../../features/payments/vocabulary.ts'

const form = (values: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
const TODAY = '2026-10-11'
const valid = { amount: '1500', receivedOn: '2026-10-10', method: 'Bank transfer', reference: 'REF-1' }

test('the methods are the four the database allows', () => {
  assert.deepEqual([...PAYMENT_METHODS], ['Bank transfer', 'Card', 'Cash', 'Other'])
  assert.equal(isPaymentMethod('Card'), true)
  assert.equal(isPaymentMethod('Cheque'), false)
  assert.equal(isPaymentMethod(undefined), false)
})

test('todayInJohannesburg is the South African date, not the UTC date', () => {
  assert.equal(todayInJohannesburg(new Date('2026-10-10T21:59:00Z')), '2026-10-10')
  assert.equal(todayInJohannesburg(new Date('2026-10-10T22:01:00Z')), '2026-10-11', 'after 22:00 UTC it is already tomorrow in South Africa')
  assert.equal(todayInJohannesburg(new Date('2026-12-31T22:30:00Z')), '2027-01-01')
})

test('a valid payment is read as numbers and trimmed text', () => {
  assert.deepEqual(readPaymentFields(form(valid), TODAY), { amount: 1500, received_on: '2026-10-10', method: 'Bank transfer', reference: 'REF-1' })
  assert.deepEqual(readPaymentFields(form({ ...valid, amount: '99,50', reference: '   ' }), TODAY), { amount: 99.5, received_on: '2026-10-10', method: 'Bank transfer', reference: null })
  assert.deepEqual(readPaymentFields(form({ ...valid, amount: '1 500', receivedOn: TODAY }), TODAY), { amount: 1500, received_on: TODAY, method: 'Bank transfer', reference: 'REF-1' })
})

test('an amount typed the wrong way gets a plain message and nothing is sent on', () => {
  for (const amount of ['', 'abc', '-5', '1,500', '12.5.3', '1e3']) {
    const result = readPaymentFields(form({ ...valid, amount }), TODAY)
    assert.ok('error' in result, JSON.stringify(amount))
  }
  assert.deepEqual(readPaymentFields(form({ ...valid, amount: '0' }), TODAY), { error: 'Enter an amount above zero.' })
  assert.deepEqual(readPaymentFields(form({ ...valid, amount: '0.001' }), TODAY), { error: 'Enter at most two decimals.' })
  assert.deepEqual(readPaymentFields(form({ ...valid, amount: '10000000' }), TODAY), { error: 'That amount is too large.' })
})

test('the date, the method and the reference are checked', () => {
  assert.deepEqual(readPaymentFields(form({ ...valid, receivedOn: '' }), TODAY), { error: 'Enter the date the payment was received.' })
  assert.deepEqual(readPaymentFields(form({ ...valid, receivedOn: '2026-02-30' }), TODAY), { error: 'Enter the date the payment was received.' })
  assert.deepEqual(readPaymentFields(form({ ...valid, receivedOn: '2026-10-12' }), TODAY), { error: "The payment date can't be in the future." })
  assert.deepEqual(readPaymentFields(form({ ...valid, method: 'Cheque' }), TODAY), { error: 'Choose Bank transfer, Card, Cash or Other.' })
  assert.deepEqual(readPaymentFields(form({ ...valid, reference: 'x'.repeat(121) }), TODAY), { error: 'The reference is too long (120 characters at most).' })
  assert.ok(!('error' in readPaymentFields(form({ ...valid, reference: 'x'.repeat(120) }), TODAY)))
  assert.deepEqual(readPaymentFields(new FormData(), TODAY), { error: 'Enter the amount as a plain number, for example 1500 or 99.50 (no thousands separators).' })
})

test('a void needs a reason of up to 500 characters', () => {
  assert.deepEqual(readVoidReason(form({ reason: '  Wrong client  ' })), { reason: 'Wrong client' })
  assert.deepEqual(readVoidReason(form({ reason: '   ' })), { error: 'A reason is required to void a payment.' })
  assert.deepEqual(readVoidReason(new FormData()), { error: 'A reason is required to void a payment.' })
  assert.deepEqual(readVoidReason(form({ reason: 'x'.repeat(501) })), { error: 'The reason is too long (500 characters at most).' })
})
```

Create `tests/unit/payments-ui.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n')
const payments = (...parts: string[]) => read('features', 'payments', ...parts)

test('the payment actions check ids and input first, call only the database functions, and never write a table', () => {
  const source = payments('actions', 'payments.ts')
  assert.match(source, /^'use server'/)
  for (const line of source.split('\n')) {
    if (/^export /.test(line)) assert.match(line, /^export (async function|type) /, line)
  }
  assert.equal(source.split('isUuid(').length - 1 >= 3, true, 'every action checks its id')
  assert.match(source, /rpc\('record_payment'/)
  assert.match(source, /rpc\('void_payment'/)
  assert.match(source, /rpc\('cancel_invoice'/)
  assert.doesNotMatch(source, /from\('payments'\)|from\('invoices'\)/, 'no table is written from the action: the functions decide')
  assert.match(source, /readPaymentFields\(/)
  assert.match(source, /readVoidReason\(/)
  assert.match(source, /failureState\(/)
  assert.match(source, /revalidatePath\('\/finance\/forecast'\)/, 'the forecast page is refreshed by a payment')
})

test('the shared payment modules are loadable by tests', () => {
  for (const name of ['vocabulary.ts', 'fields.ts']) {
    const source = payments(name)
    assert.doesNotMatch(source, /^\s*['"]use (client|server)['"]/, name)
    assert.doesNotMatch(source, /server-only/, name)
    assert.doesNotMatch(source, /from\s+['"]@\//, name)
  }
})

test('the record payment form keeps what was typed after a failure, cannot be double-submitted, and clears after a success', () => {
  const source = payments('components', 'record-payment-form.tsx')
  assert.match(source, /^'use client'/)
  assert.match(source, /disabled=\{pending\}/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /startTransition\(/)
  assert.match(source, /\.reset\(\)/, 'a successful payment clears the form so it is not recorded twice')
  assert.match(source, /name="amount"/)
  assert.match(source, /name="receivedOn"/)
  assert.match(source, /name="method"/)
  assert.match(source, /name="reference"/)
  assert.match(source, /max=\{today\}/, 'the date field cannot pick a future day')
  assert.doesNotMatch(source, /server-only|lib\/email/, 'a client component imports no server code')
})

test('the void control asks for a reason and is disabled while pending', () => {
  const source = payments('components', 'void-payment-form.tsx')
  assert.match(source, /^'use client'/)
  assert.match(source, /name="reason"/)
  assert.match(source, /disabled=\{pending\}/)
  assert.match(source, /voidPaymentAction/)
})

test('the payments section tells a draft, a paid and a cancelled invoice apart, shows voided payments struck through, and lists who recorded each', () => {
  const source = payments('components', 'payments-section.tsx')
  assert.match(source, /Issue this invoice before recording payments/)
  assert.match(source, /paid in full/i)
  assert.match(source, /cancelled invoice takes no payments/i)
  assert.match(source, /line-through/)
  assert.match(source, /listPayments\(/)
  assert.match(source, /todayInJohannesburg\(/)
})

test('the payments list is read for one organisation and fails loudly', () => {
  const source = payments('queries', 'list-payments.ts')
  assert.match(source, /^import 'server-only'/)
  assert.match(source, /\.eq\('organization_id', organization\.id\)/)
  assert.match(source, /if \(\w+\.error\) throw/)
})

test('the invoice header offers Cancel invoice only when the invoice has no unvoided payment, and the page shows the payments', () => {
  const actions = read('features', 'documents', 'components', 'document-actions.tsx')
  assert.match(actions, /cancelInvoiceAction/)
  assert.match(actions, /hasPayments/)
  assert.match(actions, /kind === 'invoice' && !draft && !cancelled && !hasPayments/)
  const page = read('app', '(unison)', 'finance', 'invoices', '[invoiceId]', 'page.tsx')
  assert.match(page, /PaymentsSection invoiceId=/)
  assert.match(page, /listPayments\(/)
})

test('an issued invoice saves only its notes: the edit form and the action no longer take a status or a balance', () => {
  const action = read('features', 'commercial-finance', 'actions', 'phase-six.ts')
  const from = action.indexOf('} else if (kind === "invoice") {')
  const to = action.indexOf('} else if (kind === "expense") {')
  assert.ok(from > -1 && to > from)
  const invoice = action.slice(from, to)
  const issued = invoice.slice(invoice.indexOf('// Issued:'), invoice.indexOf('} else {', invoice.indexOf('// Issued:')))
  assert.ok(issued.includes('values = { notes: optional(form, "notes") };'), 'only the notes are written')
  assert.doesNotMatch(issued, /balance_amount|paid_at|status/, 'status, balance and paid date come from the payments')
  assert.match(issued, /INVOICE_FROZEN/, 'an old draft form posted to an issued invoice is told it is frozen')
  const form = read('features', 'commercial-finance', 'components', 'phase-six-form.tsx')
  const issuedForm = form.slice(form.indexOf('This invoice has been issued'), form.indexOf('The invoice number is assigned'))
  assert.doesNotMatch(issuedForm, /name="status"|name="balanceAmount"/)
  assert.match(issuedForm, /name="notes"/)
})
```

Also edit `tests/unit/documents-ui.test.ts` (it has `read`, `between`, `INVOICE_OPENER`, `EXPENSE_OPENER`): in the test titled `'a sent quote saves only its status and notes; an issued invoice only its status, balance, paid date and notes'` change the title to `'a sent quote saves only its status and notes; an issued invoice only its notes'` and its last assertion to `assert.deepEqual(keys, ['notes'])`; **delete** the whole test titled `'cancelling an issued invoice zeroes its balance, so a cancel-and-reissue is not counted twice'` (the database now does this in `cancel_invoice`, tested in `payments.test.ts`).

Run: `node --test --experimental-strip-types tests/unit/payments-fields.test.ts tests/unit/payments-ui.test.ts tests/unit/documents-ui.test.ts` — expected FAIL (modules and changes missing).

- [ ] **Step 2: The shared modules**

Create `features/payments/vocabulary.ts`:

```ts
// Shared by the form, the actions and unit tests: no directive, no imports. The list equals the payments.method check.
export const PAYMENT_METHODS = ['Bank transfer', 'Card', 'Cash', 'Other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value)
}
```

Create `features/payments/fields.ts`:

```ts
// Pure readers for the payment forms, so the validation the server actions depend on is unit testable. Relative
// imports only: Node's test runner cannot resolve '@/', and 'use server' modules cannot be imported by a test.
import { parseDecimal } from '../documents/fields.ts'
import { isPaymentMethod, type PaymentMethod } from './vocabulary.ts'

/** The South African calendar date ("2026-10-11"). The database uses the same zone for "today", the future-date check and the Overdue job. */
export function todayInJohannesburg(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  // "2026-02-30" is an Invalid Date (toISOString would throw), and "2026-02-29" in a non-leap year rolls over: both are refused.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export type PaymentFields = { amount: number; received_on: string; method: PaymentMethod; reference: string | null }

export function readPaymentFields(form: FormData, today: string = todayInJohannesburg()): PaymentFields | { error: string } {
  const amount = parseDecimal(String(form.get('amount') ?? '').trim())
  if (!amount) return { error: 'Enter the amount as a plain number, for example 1500 or 99.50 (no thousands separators).' }
  if (amount.decimals > 2) return { error: 'Enter at most two decimals.' }
  if (amount.value <= 0) return { error: 'Enter an amount above zero.' }
  if (amount.value > 9999999.99) return { error: 'That amount is too large.' }

  const receivedOn = String(form.get('receivedOn') ?? '').trim()
  if (!isRealDate(receivedOn)) return { error: 'Enter the date the payment was received.' }
  if (receivedOn > today) return { error: "The payment date can't be in the future." }

  const method = String(form.get('method') ?? '').trim()
  if (!isPaymentMethod(method)) return { error: 'Choose Bank transfer, Card, Cash or Other.' }

  const reference = String(form.get('reference') ?? '').trim()
  if (reference.length > 120) return { error: 'The reference is too long (120 characters at most).' }
  return { amount: amount.value, received_on: receivedOn, method, reference: reference || null }
}

export function readVoidReason(form: FormData): { reason: string } | { error: string } {
  const reason = String(form.get('reason') ?? '').trim()
  if (!reason) return { error: 'A reason is required to void a payment.' }
  if (reason.length > 500) return { error: 'The reason is too long (500 characters at most).' }
  return { reason }
}
```

(`parseDecimal` rejects `-5`, `1,500` and `1e3` already; check each of the test's bad amounts against it and keep the messages as the tests state them. `'0'` parses as value 0 with 0 decimals, giving "Enter an amount above zero.")

- [ ] **Step 3: The actions and the query**

Create `features/payments/actions/payments.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { isUuid } from '@/lib/utils'
import { failureState } from '../../documents/action-failure'
import { revalidateDocumentPages } from '../../documents/revalidate'
import { documentContext } from '../../documents/server-context'
import type { ActionState } from '../../documents/types'
import { readPaymentFields, readVoidReason } from '../fields'

function refresh() {
  revalidateDocumentPages()
  revalidatePath('/finance/forecast')
}

export async function recordPaymentAction(invoiceId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(invoiceId)) return { error: 'That invoice was not found.' }
  const fields = readPaymentFields(form)
  if ('error' in fields) return { error: fields.error }
  const { db } = await documentContext()
  const result = await db.rpc('record_payment', {
    p_invoice: invoiceId,
    p_amount: fields.amount,
    p_received_on: fields.received_on,
    p_method: fields.method,
    p_reference: fields.reference,
  })
  if (result.error) return failureState(result.error, 'The payment could not be recorded. Please try again.')
  refresh()
  return { success: 'Payment recorded.' }
}

export async function voidPaymentAction(paymentId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(paymentId)) return { error: 'That payment was not found.' }
  const reason = readVoidReason(form)
  if ('error' in reason) return { error: reason.error }
  const { db } = await documentContext()
  const result = await db.rpc('void_payment', { p_payment: paymentId, p_reason: reason.reason })
  if (result.error) return failureState(result.error, 'The payment could not be voided. Please try again.')
  refresh()
  return { success: 'Payment voided.' }
}

export async function cancelInvoiceAction(invoiceId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(invoiceId)) return { error: 'That invoice was not found.' }
  const { db } = await documentContext()
  const result = await db.rpc('cancel_invoice', { p_invoice: invoiceId })
  if (result.error) return failureState(result.error, 'The invoice could not be cancelled. Please try again.')
  refresh()
  return { success: 'Invoice cancelled.' }
}
```

Create `features/payments/queries/list-payments.ts`:

```ts
import 'server-only'

import { cache } from 'react'

import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { isUuid } from '@/lib/utils'
import { documentContext } from '../../documents/server-context'

export type PaymentRow = {
  id: string
  amount: number
  receivedOn: string
  method: string
  reference: string | null
  recordedBy: string
  voided: boolean
  voidReason: string | null
  voidedBy: string | null
  voidedAt: string | null
}

/** The payments of one invoice, newest first, voided ones included. Cached so the header and the section share one load. */
export const listPayments = cache(async (invoiceId: string): Promise<PaymentRow[]> => {
  if (!isUuid(invoiceId)) return []
  const { organization, db } = await documentContext()
  const [rows, members] = await Promise.all([
    db
      .from('payments')
      .select('id,amount,received_on,method,reference,recorded_by,recorded_at,voided_at,voided_by,void_reason')
      .eq('invoice_id', invoiceId)
      .eq('organization_id', organization.id)
      .order('received_on', { ascending: false })
      .order('recorded_at', { ascending: false }),
    listOrganizationMembers(),
  ])
  if (rows.error) throw rows.error
  const names = new Map<string, string>(members.map((member) => [member.userId, member.displayName]))
  const who = (id: string | null) => (id && names.get(id)) || 'Former member'
  return ((rows.data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    receivedOn: row.received_on,
    method: row.method,
    reference: row.reference,
    recordedBy: who(row.recorded_by),
    voided: row.voided_at !== null,
    voidReason: row.void_reason,
    voidedBy: row.voided_at !== null ? who(row.voided_by) : null,
    voidedAt: row.voided_at,
  }))
})
```

(A payment from the opening-balance migration has no recorder and reads "Former member"; that is acceptable and noted in the follow-ups.)

- [ ] **Step 4: The components**

Read `features/documents/components/email-document-form.tsx` (the slice B form) and follow it. Create `features/payments/components/record-payment-form.tsx`:

```tsx
'use client'

import { useActionState, useEffect, useRef, useTransition } from 'react'

import { TextField } from '@/components/ui/form-fields'
import { FormError } from '@/components/ui/form-layout'
import { recordPaymentAction } from '../actions/payments'
import { PAYMENT_METHODS } from '../vocabulary'

/**
 * Amount, date, method and reference. The action is called by hand so a failed save keeps what was typed (React resets
 * a form after its action); a successful one clears the form, so the same payment is not recorded twice.
 */
export function RecordPaymentForm({ invoiceId, balanceLabel, today }: { invoiceId: string; balanceLabel: string; today: string }) {
  const [state, run, pending] = useActionState(recordPaymentAction.bind(null, invoiceId), undefined)
  const [, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state])
  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(() => run(data))
      }}
      className="space-y-4 px-5 py-4"
    >
      <div className="grid gap-4 md:grid-cols-4">
        <TextField name="amount" label={`Amount (balance ${balanceLabel})`} required placeholder="0.00" />
        <label className="group block">
          <span className="text-sm font-medium text-foreground">Date received</span>
          <input type="date" name="receivedOn" required defaultValue={today} max={today} className="unison-field mt-1.5 min-h-10 w-full rounded-none border border-border bg-card px-3 text-sm" />
        </label>
        <label className="group block">
          <span className="text-sm font-medium text-foreground">Method</span>
          <select name="method" defaultValue="Bank transfer" className="unison-field mt-1.5 min-h-10 w-full rounded-none border border-border bg-card px-3 text-sm">
            {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
        </label>
        <TextField name="reference" label="Reference (optional)" />
      </div>
      <FormError message={state?.error} />
      {state?.success && !pending ? (
        <p role="status" className="border border-success/25 bg-success-soft/45 px-4 py-3 text-sm text-success">{state.success}</p>
      ) : null}
      <button type="submit" disabled={pending} className="border border-border bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? 'Recording…' : 'Record payment'}
      </button>
    </form>
  )
}
```

(If the project's primary-button classes differ from `bg-brand ... text-white`, copy the classes from `FormFooter`'s submit button as the slice B form did. Check `TextField` accepts `placeholder` and `required` as used in `email-document-form.tsx`.)

Create `features/payments/components/void-payment-form.tsx`:

```tsx
'use client'

import { useActionState, useState, useTransition } from 'react'

import { FormError } from '@/components/ui/form-layout'
import { voidPaymentAction } from '../actions/payments'

/** A small "Void" control: it asks for a reason first. The payment stays on the list, struck through. */
export function VoidPaymentForm({ paymentId, label }: { paymentId: string; label: string }) {
  const [open, setOpen] = useState(false)
  const [state, run, pending] = useActionState(voidPaymentAction.bind(null, paymentId), undefined)
  const [, startTransition] = useTransition()
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={`Void ${label}`} className="border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive">
        Void
      </button>
    )
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(() => run(data))
      }}
      className="flex flex-wrap items-start gap-2"
    >
      <input name="reason" required maxLength={500} placeholder="Reason for voiding" aria-label={`Reason for voiding ${label}`} className="unison-field min-h-9 w-56 rounded-none border border-border bg-card px-3 text-sm" />
      <button type="submit" disabled={pending} className="border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-60">
        {pending ? 'Voiding…' : 'Confirm void'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="border border-border px-3 py-1.5 text-xs font-semibold">Cancel</button>
      <FormError message={state?.error} />
    </form>
  )
}
```

Create `features/payments/components/payments-section.tsx`:

```tsx
import { WorkspaceSection } from '@/features/crm-workspace/components/workspace-section'
import { formatAmount, formatDocumentDate } from '../../documents/document-view'
import { getDocument } from '../../documents/queries/get-document'
import { listPayments } from '../queries/list-payments'
import { todayInJohannesburg } from '../fields'
import { RecordPaymentForm } from './record-payment-form'
import { VoidPaymentForm } from './void-payment-form'

/** Record a payment against an issued invoice, and the list of payments (voided ones struck through). */
export async function PaymentsSection({ invoiceId }: { invoiceId: string }) {
  const bundle = await getDocument('invoice', invoiceId)
  if (!bundle) return null
  const status = String(bundle.record.status)
  const currency = String(bundle.record.currency ?? 'ZAR')
  const payments = status === 'Draft' ? [] : await listPayments(invoiceId)
  const canPay = status === 'Issued' || status === 'Partially Paid' || status === 'Overdue'
  const note = status === 'Draft'
    ? 'Issue this invoice before recording payments.'
    : status === 'Paid'
      ? 'This invoice is paid in full.'
      : status === 'Cancelled'
        ? 'A cancelled invoice takes no payments.'
        : null
  return (
    <div id="payments" className="scroll-mt-24">
      <WorkspaceSection title="Payments" description="The balance and the status are worked out from these. A wrong payment is voided, never deleted.">
        {canPay ? (
          <RecordPaymentForm invoiceId={invoiceId} balanceLabel={`${currency} ${formatAmount(bundle.record.balance_amount)}`} today={todayInJohannesburg()} />
        ) : (
          <p className="px-5 py-4 text-sm text-muted-foreground">{note}</p>
        )}
        {status !== 'Draft' ? (
          <div className="border-t border-border">
            {payments.length ? (
              <ul className="divide-y divide-border">
                {payments.map((payment) => {
                  const label = `payment of ${currency} ${formatAmount(payment.amount)} on ${formatDocumentDate(payment.receivedOn) ?? payment.receivedOn}`
                  return (
                    <li key={payment.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                      <div className={payment.voided ? 'text-muted-foreground line-through' : 'text-foreground'}>
                        <p className="font-medium">{currency} {formatAmount(payment.amount)} · {payment.method} · {formatDocumentDate(payment.receivedOn) ?? payment.receivedOn}</p>
                        <p className="mt-1 text-xs">{payment.reference ? `${payment.reference} · ` : ''}Recorded by {payment.recordedBy}</p>
                      </div>
                      {payment.voided ? (
                        <p className="text-xs text-muted-foreground">Voided by {payment.voidedBy}: {payment.voidReason}</p>
                      ) : (
                        <VoidPaymentForm paymentId={payment.id} label={label} />
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-muted-foreground">No payments recorded yet.</p>
            )}
          </div>
        ) : null}
      </WorkspaceSection>
    </div>
  )
}
```

(The row text for a voided payment is struck through; the "Voided by" note sits beside it, not struck through.)

- [ ] **Step 5: Wire the header, the page, the edit form and the save action**

In `features/documents/components/document-actions.tsx` add the import `import { cancelInvoiceAction } from '../../payments/actions/payments'`, add `hasPayments = false` to the props (`{ kind, id, status, archived = false, hasPayments = false }: { ...; hasPayments?: boolean }`) and, after the Issue invoice button, add:

```tsx
      {kind === 'invoice' && !draft && !cancelled && !hasPayments ? (
        <ActionButton action={cancelInvoiceAction.bind(null, id)} label="Cancel invoice" tone="danger" confirmText="Cancel this invoice? It can't be reopened; raise a new invoice instead." />
      ) : null}
```

In `app/(unison)/finance/invoices/[invoiceId]/page.tsx`: import `listPayments` and `PaymentsSection`; make `InvoiceHeaderActions` read the payments and pass `hasPayments`:

```tsx
async function InvoiceHeaderActions({ invoiceId }: { invoiceId: string }) {
  const bundle = await getDocument('invoice', invoiceId)
  if (!bundle) return null
  const hasPayments = (await listPayments(invoiceId)).some((payment) => !payment.voided)
  return <DocumentActions kind="invoice" id={invoiceId} status={String(bundle.record.status)} hasPayments={hasPayments} />
}
```

and render `<PaymentsSection invoiceId={invoiceId} />` in `InvoiceWorkspace` between the lines and the email section.

In `features/commercial-finance/components/phase-six-form.tsx` replace the issued-invoice block (the `<Notice>` plus the `status`, `balanceAmount` and `notes` fields) with:

```tsx
          <Notice>
            This invoice has been issued, so its lines, prices and details are frozen. Its status and balance are worked out from the payments you record on the invoice page. You can still change the notes. To correct it, cancel it and raise a new one.
          </Notice>
          <TextArea name="notes" label="Payment notes" value={value("notes")} />
```

and remove any import left unused by that change (`INVOICE_ISSUED_STATUSES`, `Select`, `Field` if no longer used elsewhere in the file: check before removing).

In `features/commercial-finance/actions/phase-six.ts` replace the issued-invoice branch body (from `// Issued:` to the `values = {...};` that sets status, balance, paid date) with:

```ts
      // Issued: only the notes can change; the balance and the payment state come from the payments (record_payment,
      // void_payment) and cancelling is cancel_invoice. An old draft form posted after the invoice was issued carries
      // the draft's fields: say it is frozen.
      if (form.has("dueDate") || form.has("clientId")) {
        return { error: documentErrorMessage("INVOICE_FROZEN") ?? "This invoice has already been issued and can no longer be edited." };
      }
      values = { notes: optional(form, "notes") };
```

(keep the `if (state && !isDraftStatus("invoice", state.status)) {` line and the `} else {` of the draft branch; remove the now-unused `INVOICE_ISSUED_STATUSES` and `INVOICE_DRAFT_STATUSES` imports and the `number` helper only if nothing else uses them.)

- [ ] **Step 6: Run everything**

Run: `node --test --experimental-strip-types tests/unit/payments-fields.test.ts tests/unit/payments-ui.test.ts tests/unit/documents-ui.test.ts` then `pnpm typecheck`, `pnpm test`, and `pnpm build`.
Expected: green. Do not sign in or create records.

- [ ] **Step 7: Commit**

```bash
git add features/payments features/documents/components/document-actions.tsx "app/(unison)/finance/invoices/[invoiceId]/page.tsx" features/commercial-finance/actions/phase-six.ts features/commercial-finance/components/phase-six-form.tsx tests/unit/payments-fields.test.ts tests/unit/payments-ui.test.ts tests/unit/documents-ui.test.ts
git commit -m "$(cat <<'EOF'
feat(payments): record and void payments and cancel an invoice from the invoice page; status and balance are no longer typed

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The calculated Forecast

**Files:**
- Create: `supabase/migrations/20261011150000_forecast_months.sql`, `features/forecast/build-forecast.ts`, `features/forecast/queries/get-forecast.ts`, `features/forecast/components/forecast-screen.tsx`
- Modify: `app/(unison)/finance/forecast/page.tsx`, `tests/unit/phase-six-commercial-finance.test.ts`, `tests/unit/ui-completeness.test.ts`
- Delete: `app/(unison)/finance/forecast/new/` and `app/(unison)/finance/forecast/[scenarioId]/` (use `git rm -r` on those two directories only)
- Test: `tests/integration/rls/forecast-months.test.ts`, `tests/unit/forecast-build.test.ts`

**Interfaces:**
- Consumes: Task 1's `payments`; `todayInJohannesburg` (`features/payments/fields.ts`); `formatAmount` (`features/documents/document-view.ts`); `getSessionContext`, `createServerSupabase`; `WorkPage` (`@/components/shared/work-page`, read how the slice A document page uses it).
- Produces: `public.forecast_months(p_org uuid)` returning `(bucket text, month date, currency text, collected numeric, invoices_due numeric, pipeline numeric)`; `buildForecast(rows, today): ForecastModel`; `getForecast()`; `<ForecastScreen />`.
- As in Task 1: you write and commit the migration and the RLS test; the controller probes, applies and runs them.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261011150000_forecast_months.sql`:

```sql
-- Stage 2, slice C: the forecast as a calculation. security invoker, so row level security applies and a caller
-- sees only organisations they belong to; p_org narrows it to one. Months are South African calendar months.
-- bucket: 'month' (month set), 'later' (after the window) or 'undated' (an opportunity with no expected close).
create or replace function public.forecast_months(p_org uuid)
returns table (bucket text, month date, currency text, collected numeric, invoices_due numeric, pipeline numeric)
language sql stable security invoker set search_path = '' as $$
  with b as (
    select date_trunc('month', now() at time zone 'Africa/Johannesburg')::date as this_month,
           (date_trunc('month', now() at time zone 'Africa/Johannesburg') + interval '6 months')::date as last_month,
           (date_trunc('month', now() at time zone 'Africa/Johannesburg') - interval '3 months')::date as first_month,
           (now() at time zone 'Africa/Johannesburg')::date as today
  ),
  coll as (
    select 'month'::text as bucket, date_trunc('month', p.received_on)::date as month, i.currency, sum(p.amount) as amount
    from public.payments p
    join public.invoices i on i.id = p.invoice_id and i.organization_id = p.organization_id
    cross join b
    where p.organization_id = p_org and p.voided_at is null
      and date_trunc('month', p.received_on)::date >= b.first_month
    group by 1, 2, 3
  ),
  due_src as (
    select greatest(date_trunc('month', coalesce(i.due_date, b.today))::date, b.this_month) as m, i.currency, i.balance_amount as amount
    from public.invoices i cross join b
    where i.organization_id = p_org and i.status in ('Issued', 'Partially Paid', 'Overdue') and i.balance_amount > 0
  ),
  due as (
    select case when s.m > b.last_month then 'later' else 'month' end as bucket,
           case when s.m > b.last_month then null else s.m end as month,
           s.currency, sum(s.amount) as amount
    from due_src s cross join b
    group by 1, 2, 3
  ),
  pipe_src as (
    select case when o.expected_close is null then null else greatest(date_trunc('month', o.expected_close)::date, b.this_month) end as m,
           o.currency, o.expected_value * o.probability_percent / 100.0 as amount
    from public.sales_opportunities o cross join b
    where o.organization_id = p_org and o.stage not in ('Won', 'Lost') and o.archived_at is null
  ),
  pipe as (
    select case when s.m is null then 'undated' when s.m > b.last_month then 'later' else 'month' end as bucket,
           case when s.m is null or s.m > b.last_month then null else s.m end as month,
           s.currency, sum(s.amount) as amount
    from pipe_src s cross join b
    group by 1, 2, 3
  )
  select u.bucket, u.month, u.currency, round(sum(u.collected), 2), round(sum(u.invoices_due), 2), round(sum(u.pipeline), 2)
  from (
    select bucket, month, currency, amount as collected, 0::numeric as invoices_due, 0::numeric as pipeline from coll
    union all select bucket, month, currency, 0::numeric, amount, 0::numeric from due
    union all select bucket, month, currency, 0::numeric, 0::numeric, amount from pipe
  ) u
  group by u.bucket, u.month, u.currency
  order by u.currency, u.bucket, u.month
$$;

revoke all on function public.forecast_months(uuid) from public, anon;
grant execute on function public.forecast_months(uuid) to authenticated;
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/forecast-build.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildForecast, type ForecastRow } from '../../features/forecast/build-forecast.ts'

const TODAY = '2026-10-11'
const row = (over: Partial<ForecastRow>): ForecastRow => ({ bucket: 'month', month: '2026-10-01', currency: 'ZAR', collected: 0, invoices_due: 0, pipeline: 0, ...over })

test('no data gives no blocks', () => {
  assert.deepEqual(buildForecast([], TODAY).blocks, [])
})

test('a block has the three previous months, the current month and the next six, zero-filled, with the current one marked', () => {
  const [block] = buildForecast([row({ collected: 100 })], TODAY).blocks
  assert.deepEqual(block.months.map((entry) => entry.month), [
    '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01', '2027-04-01',
  ])
  assert.deepEqual(block.months.map((entry) => entry.label).slice(0, 4), ['Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026'])
  assert.equal(block.months.filter((entry) => entry.isCurrent).length, 1)
  assert.equal(block.months.find((entry) => entry.isCurrent)!.month, '2026-10-01')
  assert.equal(block.months[0].collected, 0)
  assert.equal(block.months[3].collected, 100)
})

test('rows are placed by month, currency blocks are separate and never added together', () => {
  const model = buildForecast([
    row({ month: '2026-10-01', currency: 'ZAR', collected: 500, invoices_due: 200 }),
    row({ month: '2026-11-01', currency: 'ZAR', pipeline: 300.5 }),
    row({ month: '2026-10-01', currency: 'USD', collected: 40 }),
  ], TODAY)
  assert.deepEqual(model.blocks.map((block) => block.currency), ['USD', 'ZAR'])
  const zar = model.blocks.find((block) => block.currency === 'ZAR')!
  assert.deepEqual(zar.totals, { collected: 500, due: 200, pipeline: 300.5 })
  assert.equal(model.blocks.find((block) => block.currency === 'USD')!.totals.collected, 40)
})

test('the later and no-date lines are kept apart and counted in the totals', () => {
  const [block] = buildForecast([
    row({ bucket: 'later', month: null, invoices_due: 70, pipeline: 30 }),
    row({ bucket: 'undated', month: null, pipeline: 1000 }),
    row({ collected: 10 }),
  ], TODAY).blocks
  assert.deepEqual(block.later, { collected: 0, due: 70, pipeline: 30 })
  assert.deepEqual(block.undated, { collected: 0, due: 0, pipeline: 1000 })
  assert.deepEqual(block.totals, { collected: 10, due: 70, pipeline: 1030 })
})

test('a block with no later or undated rows has none, and string amounts from the database are read as numbers', () => {
  const [block] = buildForecast([row({ collected: '1234.56' as unknown as number, pipeline: '0.10' as unknown as number })], TODAY).blocks
  assert.equal(block.later, null)
  assert.equal(block.undated, null)
  assert.equal(block.totals.collected, 1234.56)
  assert.equal(block.totals.pipeline, 0.1)
})

test('sums do not drift: ten cents ten times is one rand', () => {
  const rows = Array.from({ length: 10 }, (_, index) => row({ month: `2026-${String(index + 1).padStart(2, '0')}-01`, pipeline: 0.1 }))
  const [block] = buildForecast([...rows, row({ bucket: 'undated', month: null, pipeline: 0.1 })], TODAY).blocks
  // Rows for 2026-01 to 2026-10: only 2026-07 to 2026-10 are inside the window (four rows), plus the undated one.
  assert.equal(block.totals.pipeline, 0.5, 'five tenths, exactly, not 0.5000000000000001')
})

test('a row for a month outside the window is ignored', () => {
  const [block] = buildForecast([row({ month: '2025-01-01', collected: 999 }), row({ collected: 1 })], TODAY).blocks
  assert.equal(block.totals.collected, 1)
})
```

Create `tests/integration/rls/forecast-months.test.ts` (it writes only fixture rows through the signed-in client or the service role and deletes them in `after`):

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }
type Row = { bucket: string; month: string | null; currency: string; collected: number; invoices_due: number; pipeline: number }

let orgA: string
let orgB: string
let member: U
let other: U
let memberClient: SupabaseClient
let otherClient: SupabaseClient
let clientA: string

const sast = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const addDays = (isoDate: string, days: number) => new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
const firstOfMonth = (isoDate: string, plusMonths = 0) => {
  const [year, month] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + plusMonths, 1))
  return date.toISOString().slice(0, 10)
}
const must = <T>(result: { data: T; error: { message: string } | null }): NonNullable<T> => {
  if (result.error || result.data === null || result.data === undefined) throw new Error(result.error?.message ?? 'no data')
  return result.data as NonNullable<T>
}

/** An issued invoice of 230.00 (or the given quantity x 100 plus 15% VAT) due on the given date, in the given currency. */
async function issued(dueDate: string, currency = 'ZAR', quantity = 2) {
  const invoice = must(await memberClient.from('invoices').insert({ organization_id: orgA, client_id: clientA, client_name: 'Fc Client A', currency }).select('id').single())
  assert.equal((await memberClient.from('invoice_lines').insert({ organization_id: orgA, invoice_id: invoice.id, position: 1, title: 'Advisory', quantity, unit_price: 100 })).error, null)
  assert.equal((await memberClient.rpc('issue_invoice', { p_id: invoice.id })).error, null)
  must(await admin.from('invoices').update({ issue_date: addDays(sast(), -60), due_date: dueDate }).eq('id', invoice.id).select('id'))
  return invoice.id as string
}
const opportunity = async (over: Record<string, unknown>) =>
  must(await memberClient.from('sales_opportunities').insert({ organization_id: orgA, name: `Opp ${Math.random()}`, client_name: 'Fc Client A', stage: 'Proposal', expected_value: 1000, probability_percent: 50, currency: 'ZAR', ...over }).select('id').single())
const forecast = async (client: SupabaseClient = memberClient, org: string = orgA) => {
  const result = await client.rpc('forecast_months', { p_org: org })
  assert.equal(result.error, null)
  return (result.data as Row[]).map((entry) => ({ ...entry, collected: Number(entry.collected), invoices_due: Number(entry.invoices_due), pipeline: Number(entry.pipeline) }))
}
const find = (rows: Row[], bucket: string, month: string | null, currency = 'ZAR') => rows.find((entry) => entry.bucket === bucket && entry.month === month && entry.currency === currency)

before(async () => {
  orgA = await createFixtureOrg('forecast-a')
  orgB = await createFixtureOrg('forecast-b')
  member = await createFixtureUser(orgA, 'member')
  other = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  otherClient = await signedInClient(other.email, other.password)
  clientA = must(await admin.from('clients').insert({ organization_id: orgA, name: 'Fc Client A', status: 'Active' }).select('id').single()).id
  must(await admin.from('organization_settings').insert({ organization_id: orgA, legal_name: 'Test Co (Pty) Ltd', document_prefix: 'TST', vat_rate: 15 }).select('id').single())
})

after(async () => {
  await cleanup([orgA, orgB].filter(Boolean), [member?.id, other?.id].filter(Boolean))
})

test('collected, due and pipeline are grouped by month and currency; overdue and past dates fold into the current month; later and undated stand apart', async () => {
  const today = sast()
  const thisMonth = firstOfMonth(today)
  const nextMonth = firstOfMonth(today, 1)

  // Invoices (balance 230 each unless said): overdue, due next month, due far away, USD, paid, cancelled, part-paid.
  const overdue = await issued(addDays(today, -20))
  await issued(addDays(nextMonth, 3))
  await issued(firstOfMonth(today, 9))
  await issued(addDays(nextMonth, 3), 'USD', 1)
  const paid = await issued(addDays(nextMonth, 3))
  assert.equal((await memberClient.rpc('record_payment', { p_invoice: paid, p_amount: 230, p_received_on: today, p_method: 'Cash', p_reference: null })).error, null)
  const cancelled = await issued(addDays(nextMonth, 3))
  assert.equal((await memberClient.rpc('cancel_invoice', { p_invoice: cancelled })).error, null)
  const voidedOne = must(await memberClient.rpc('record_payment', { p_invoice: overdue, p_amount: 30, p_received_on: today, p_method: 'Card', p_reference: null })).valueOf() as string
  assert.equal((await memberClient.rpc('void_payment', { p_payment: voidedOne, p_reason: 'Wrong invoice' })).error, null)
  assert.equal((await memberClient.rpc('record_payment', { p_invoice: overdue, p_amount: 50, p_received_on: today, p_method: 'Bank transfer', p_reference: null })).error, null)

  // Opportunities: open next month 1000 x 50% = 500; undated 2000 x 100%; past close 400 x 25% = 100; far future; Won, Lost, archived; USD.
  await opportunity({ expected_close: addDays(nextMonth, 5) })
  await opportunity({ expected_value: 2000, probability_percent: 100, expected_close: null })
  await opportunity({ expected_value: 400, probability_percent: 25, expected_close: addDays(today, -90) })
  await opportunity({ expected_value: 800, probability_percent: 50, expected_close: firstOfMonth(today, 12) })
  await opportunity({ stage: 'Won', expected_close: addDays(nextMonth, 5) })
  await opportunity({ stage: 'Lost', expected_close: addDays(nextMonth, 5) })
  await opportunity({ expected_close: addDays(nextMonth, 5), archived_at: new Date().toISOString() })
  await opportunity({ currency: 'USD', expected_value: 100, probability_percent: 10, expected_close: addDays(nextMonth, 5) })

  const rows = await forecast()

  // Collected: 230 (paid) + 50 (the unvoided payment on the overdue invoice) this month; the voided 30 is ignored.
  assert.equal(find(rows, 'month', thisMonth)!.collected, 280)
  // Due: the overdue invoice (230 - 50 = 180) folds into this month; the cancelled and the paid one are not counted.
  assert.equal(find(rows, 'month', thisMonth)!.invoices_due, 180)
  assert.equal(find(rows, 'month', nextMonth)!.invoices_due, 230)
  assert.equal(find(rows, 'later', null)!.invoices_due, 230)
  assert.equal(find(rows, 'month', nextMonth, 'USD')!.invoices_due, 115)
  // Pipeline: the past close (100) folds into this month; next month 500; the far one is 'later' (400); the undated one stands apart.
  assert.equal(find(rows, 'month', thisMonth)!.pipeline, 100)
  assert.equal(find(rows, 'month', nextMonth)!.pipeline, 500)
  assert.equal(find(rows, 'later', null)!.pipeline, 400)
  assert.equal(find(rows, 'undated', null)!.pipeline, 2000)
  assert.equal(find(rows, 'month', nextMonth, 'USD')!.pipeline, 10)
  assert.equal(rows.every((entry) => entry.bucket !== 'month' || entry.month !== null), true)
})

test('another organisation sees nothing, and a caller sees nothing for an organisation they do not belong to', async () => {
  assert.deepEqual(await forecast(otherClient, orgA), [])
  assert.deepEqual(await forecast(memberClient, orgB), [])
  assert.deepEqual(await forecast(otherClient, orgB), [])
})

test('an organisation with no data gets no rows', async () => {
  const quiet = await createFixtureOrg('forecast-quiet')
  const quietUser = await createFixtureUser(quiet, 'member')
  try {
    const client = await signedInClient(quietUser.email, quietUser.password)
    assert.deepEqual(await forecast(client, quiet), [])
  } finally {
    await cleanup([quiet], [quietUser.id])
  }
})
```

Run: `node --test --experimental-strip-types tests/unit/forecast-build.test.ts` — expected FAIL (module missing).

- [ ] **Step 3: The pure builder**

Create `features/forecast/build-forecast.ts`:

```ts
// Turns the rows of public.forecast_months into the table the screen shows. Pure: no directive, no imports.
// Money is summed in whole cents so ten cents ten times is one rand.

export type ForecastRow = {
  bucket: 'month' | 'later' | 'undated'
  month: string | null
  currency: string
  collected: number | string
  invoices_due: number | string
  pipeline: number | string
}

export type ForecastLine = { collected: number; due: number; pipeline: number }
export type ForecastMonth = ForecastLine & { month: string; label: string; isCurrent: boolean }
export type ForecastBlock = {
  currency: string
  months: ForecastMonth[]
  later: ForecastLine | null
  undated: ForecastLine | null
  totals: ForecastLine
}
export type ForecastModel = { blocks: ForecastBlock[]; windowStart: string; windowEnd: string }

const cents = (raw: number | string) => Math.round(Number(raw) * 100)
const money = (value: number) => value / 100

const LABEL = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function monthStart(today: string, plusMonths: number): string {
  const [year, month] = today.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + plusMonths, 1)).toISOString().slice(0, 10)
}

/** The three months before the current one, the current one, and the next six (ten months, South African calendar). */
export function buildForecast(rows: ForecastRow[], today: string): ForecastModel {
  const monthKeys = Array.from({ length: 10 }, (_, index) => monthStart(today, index - 3))
  const current = monthStart(today, 0)
  const currencies = [...new Set(rows.map((row) => row.currency))].sort()

  const blocks = currencies.map((currency): ForecastBlock => {
    const own = rows.filter((row) => row.currency === currency)
    const sum = (selected: ForecastRow[]) => ({
      collected: selected.reduce((total, row) => total + cents(row.collected), 0),
      due: selected.reduce((total, row) => total + cents(row.invoices_due), 0),
      pipeline: selected.reduce((total, row) => total + cents(row.pipeline), 0),
    })
    const line = (selected: ForecastRow[]): ForecastLine => {
      const total = sum(selected)
      return { collected: money(total.collected), due: money(total.due), pipeline: money(total.pipeline) }
    }
    const months = monthKeys.map((month): ForecastMonth => ({
      month,
      label: LABEL.format(new Date(`${month}T00:00:00Z`)),
      isCurrent: month === current,
      ...line(own.filter((row) => row.bucket === 'month' && row.month === month)),
    }))
    const laterRows = own.filter((row) => row.bucket === 'later')
    const undatedRows = own.filter((row) => row.bucket === 'undated')
    const counted = [...own.filter((row) => row.bucket === 'month' && row.month !== null && monthKeys.includes(row.month)), ...laterRows, ...undatedRows]
    return {
      currency,
      months,
      later: laterRows.length ? line(laterRows) : null,
      undated: undatedRows.length ? line(undatedRows) : null,
      totals: line(counted),
    }
  })
  return { blocks, windowStart: monthKeys[0], windowEnd: monthKeys[monthKeys.length - 1] }
}
```

- [ ] **Step 4: The query, the screen and the page**

Create `features/forecast/queries/get-forecast.ts`:

```ts
import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { todayInJohannesburg } from '../../payments/fields'
import { buildForecast, type ForecastModel, type ForecastRow } from '../build-forecast'

/** The forecast for the signed-in organisation. A failed read is an error, never an empty forecast. */
export async function getForecast(): Promise<ForecastModel> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const result = await db.rpc('forecast_months', { p_org: organization.id })
  if (result.error) throw result.error
  return buildForecast((result.data ?? []) as ForecastRow[], todayInJohannesburg())
}
```

Create `features/forecast/components/forecast-screen.tsx` (a server component): read how `app/(unison)/commercial/quotes/[quoteId]/document/page.tsx` uses `WorkPage` and follow it; render, for each `ForecastBlock`, a heading with the currency and a table with the columns **Month**, **Collected**, **Due from invoices**, **Pipeline (weighted)**, one row per month (the current month marked "This month"), then a **Later** row and a **No date** row when present, then a **Total** row; amounts through `formatAmount` from `features/documents/document-view`. With no blocks, show "Nothing to forecast yet: record payments, issue invoices or add opportunities with an expected close date." Under the tables, a "How this is worked out" list with exactly these four lines:
- "Collected: payments received in the month (voided payments are left out)."
- "Due from invoices: the balance still owing on issued, partly paid and overdue invoices, in the month the invoice is due; anything already overdue counts in this month."
- "Pipeline: open opportunities as expected value times probability, in the month they are expected to close; one expected earlier than this month counts in this month; one with no expected close is shown on the No date line."
- "Each currency is shown on its own and never added to another."

Replace `app/(unison)/finance/forecast/page.tsx` with:

```tsx
import { ForecastScreen } from '@/features/forecast/components/forecast-screen'

export default function Page() {
  return <ForecastScreen />
}
```

(keep `layout.tsx` with its `ModuleGate`). Delete the two removed routes: `git rm -r "app/(unison)/finance/forecast/new" "app/(unison)/finance/forecast/[scenarioId]"`.

Update the two tests that enumerated the old register: in `tests/unit/phase-six-commercial-finance.test.ts` remove `"app/(unison)/finance/forecast/page.tsx",` from the `routes` list; in `tests/unit/ui-completeness.test.ts` remove `'finance/forecast'` from the array in the test `'commercial and finance registers use the shared production register'` (the `visibleRoutes` test keeps checking the forecast `page.tsx` exists). Add to `tests/unit/payments-ui.test.ts`:

```ts
test('the forecast page is the calculated screen, the old typed-record routes are gone, and the screen explains how each column is worked out', () => {
  const page = read('app', '(unison)', 'finance', 'forecast', 'page.tsx')
  assert.match(page, /ForecastScreen/)
  assert.doesNotMatch(page, /PhaseSixRegister/)
  for (const gone of [['new', 'page.tsx'], ['[scenarioId]', 'page.tsx'], ['[scenarioId]', 'edit', 'page.tsx']]) {
    assert.throws(() => read('app', '(unison)', 'finance', 'forecast', ...gone), /ENOENT/, gone.join('/'))
  }
  const screen = read('features', 'forecast', 'components', 'forecast-screen.tsx')
  for (const text of ['Collected', 'Due from invoices', 'Pipeline (weighted)', 'No date', 'Later', 'How this is worked out', 'never added to another', 'Nothing to forecast yet']) {
    assert.match(screen, new RegExp(text.replace(/[()]/g, '\\$&')), text)
  }
  const query = read('features', 'forecast', 'queries', 'get-forecast.ts')
  assert.match(query, /^import 'server-only'/)
  assert.match(query, /if \(result\.error\) throw result\.error/)
  const build = read('features', 'forecast', 'build-forecast.ts')
  assert.doesNotMatch(build, /server-only|from\s+['"]@\//)
})
```

- [ ] **Step 5: Run everything**

Run: `node --test --experimental-strip-types tests/unit/forecast-build.test.ts tests/unit/payments-ui.test.ts tests/unit/phase-six-commercial-finance.test.ts tests/unit/ui-completeness.test.ts`, then `pnpm typecheck`, `pnpm test`, `pnpm build`.
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261011150000_forecast_months.sql features/forecast "app/(unison)/finance/forecast/page.tsx" tests/unit/forecast-build.test.ts tests/unit/payments-ui.test.ts tests/unit/phase-six-commercial-finance.test.ts tests/unit/ui-completeness.test.ts tests/integration/rls/forecast-months.test.ts
git add -u "app/(unison)/finance/forecast"
git status --short | grep -v public/
git commit -m "$(cat <<'EOF'
feat(forecast): a calculated month-by-month forecast from payments, unpaid invoices and the pipeline (migration not yet applied)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

(`git status` before committing must show only the paths above, the two deleted route folders, and nothing else.)

**Controller gate:** probe the forecast migration in a rolled-back transaction, apply it as `forecast_months`, run `forecast-months.test.ts`, confirm no fixture rows remain.

---

### Task 4: Controller: proof, documents and hand-over (not dispatched to an implementer)

Production steps and anything needing judgement or the user.

- [ ] **Step 1: Migration gates** (after Tasks 1 and 3): rolled-back probe, apply, `list_migrations`, check `cron.job` for `unison-mark-overdue-invoices` (`5 22 * * *`), run `mark_overdue_invoices()` once by hand through the service role and confirm it returns without error, run the RLS files named in each gate and the other documents RLS files, confirm no fixture rows or orphan audit rows from this slice remain.
- [ ] **Step 2: Gates on the branch:** `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:rls` (expect only the two known `provision-organization` failures).
- [ ] **Step 3: Preview check.** With a temporary unauthenticated fixture route (deleted afterwards), render the payment form, the payments list with a voided row, and the forecast with fixture data in the browser pane at desktop and phone width; remove every temporary file; confirm `git status`.
- [ ] **Step 4: Documents.** Append an "Amendments made while planning and building" section (the six decisions above, plus anything the reviews add) to the spec; add a "From slice C" section to `docs/follow-ups.md` (not exercised signed in; the old typed-forecast code and its data-portability export remain unreachable; opening-balance payments show "Former member"; no refunds, credit notes or overpayment credits; the schedule has only been run by hand; amounts of mixed currencies are not combined); tick the roadmap's three Stage 2 items (payments table, Overdue, forecast) with "built, waiting for the signed-in walk-through" and add the walk-through box; update the memory file.
- [ ] **Step 5: Hand-over.** Tell the user the signed-in checklist (issue an invoice, record a part payment, see Partially Paid and the balance, void it, record the rest and see Paid, cancel another, look at the Forecast), and that the nightly job fires at 00:05 South African time. Finish the branch only when the user chooses.

---

## Self-review

**Spec coverage.**
- `payments` table, immutability, select-only, void fields, composite keys: Task 1 (section 2 of the migration; tests 1, 5).
- The one rule, balance, status, paid date, Overdue in the rule: Task 1 (section 3; tests 2, 3, 6, 8).
- `record_payment` refusals (state, amount, overpayment, date, issue date, method, reference, other org, lock): Task 1 (section 4; tests 2 to 4).
- `void_payment` (reason, already voided, cancelled, restores status): Task 1 (section 5; tests 5 to 7).
- `cancel_invoice` and "no cancel while payments exist": Task 1 (section 6; test 8). Typed status/balance/paid date refused, notes still editable, no delete: Task 1 (section 7; test 9).
- Nightly job, 00:05 SAST, one entry, idempotent: Task 1 (section 8; test 10); schedule checked by the controller.
- New timeline kinds, code lists and labels, drift test: Task 1 (section 1 and step 2).
- Opening payments: Task 1 (section 9), exercised by the controller's probe.
- Record payment form, Payments list, Void, Cancel invoice, edit form and action lose status/balance: Task 2.
- Registers and dashboard unchanged: nothing to build (they read `status` and `balance_amount`).
- Forecast: calculation in the database and the screen, old routes removed: Task 3. The "Later" line is a planned addition (decision 2).
- Errors list in the spec: all present in `errors.ts` (Task 1) and the field readers (Task 2).
- Testing section: database tests (Tasks 1 and 3), unit tests (Tasks 2 and 3), preview check and cron check (Task 4).

**Placeholder scan.** No TBD or TODO; every code step has code. Two places defer to an existing file for exact class names or props (`email-document-form.tsx` and `WorkPage` usage) and say what to copy.

**Type consistency.** Token names in the migration equal `errors.ts` entries and the test regexes. `record_payment` / `void_payment` / `cancel_invoice` argument names (`p_invoice`, `p_amount`, `p_received_on`, `p_method`, `p_reference`, `p_payment`, `p_reason`) are the same in the SQL, the actions and the tests. `PaymentRow`, `listPayments`, `PaymentsSection`, `DocumentActions.hasPayments` match across Task 2. `ForecastRow` matches the SQL columns; `buildForecast(rows, today)` is called with `todayInJohannesburg()`. The kinds list in the migration equals `SYSTEM_ACTIVITY_KINDS` in order.
