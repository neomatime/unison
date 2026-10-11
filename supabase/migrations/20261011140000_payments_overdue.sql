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
