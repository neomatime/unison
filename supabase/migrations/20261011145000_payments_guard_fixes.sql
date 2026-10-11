-- Stage 2, slice C: two fixes to 20261011140000_payments_overdue.sql (already applied, so not edited).
-- Append-only: earlier migrations are applied and are not edited.

-- ---------------------------------------------------------------------------
-- 1. The guard also covers drafts and inserts. A signed-in role can never leave a typed paid date on an invoice:
--    on insert and on a draft's update it is dropped (like a typed balance), and on an issued invoice a change to
--    status, balance or paid date is refused. issue_invoice and the payment functions run as the table owner and
--    are not held to it.
-- ---------------------------------------------------------------------------
create or replace function public.invoices_payment_state_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.paid_at := null;
    elsif old.status = 'Draft' then
      new.paid_at := null;
    elsif new.status is distinct from old.status
       or new.balance_amount is distinct from old.balance_amount
       or new.paid_at is distinct from old.paid_at then
      raise exception 'INVOICE_STATUS_AUTOMATIC' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger invoices_payment_state_guard on public.invoices;
create trigger invoices_payment_state_guard before insert or update on public.invoices
  for each row execute function public.invoices_payment_state_guard();
revoke all on function public.invoices_payment_state_guard() from public, anon, authenticated;

-- One-off clean-up: the rule sets a paid date only for status Paid, so a paid date on any other status was typed.
update public.invoices set paid_at = null
where status in ('Draft', 'Issued', 'Partially Paid', 'Overdue') and paid_at is not null;

-- ---------------------------------------------------------------------------
-- 2. The nightly job selects by the stored balance, but the rule works the balance out from the payments, so a stale
--    stored balance must not produce an overdue entry. It now writes the entry and counts the invoice only when the
--    rule has actually left it Overdue.
-- ---------------------------------------------------------------------------
create or replace function public.mark_overdue_invoices() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_count integer := 0;
  v_status text;
  v_balance numeric(14,2);
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
    select i.status, i.balance_amount into v_status, v_balance from public.invoices i where i.id = r.id;
    if v_status = 'Overdue' then
      if r.client_id is not null then
        insert into public.activities (organization_id, kind, subject, details, client_id)
        values (r.organization_id, 'invoice.overdue', 'Invoice ' || r.invoice_number || ' is overdue',
                jsonb_build_object('invoice_id', r.id, 'number', r.invoice_number, 'balance', v_balance, 'due_date', r.due_date),
                r.client_id);
      end if;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

revoke all on function public.mark_overdue_invoices() from public, anon, authenticated;
grant execute on function public.mark_overdue_invoices() to service_role;
