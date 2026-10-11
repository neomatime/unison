-- Stage 3, part 1: the register summary cards as a database function, and the forecast ignoring archived invoices.
-- Append-only: earlier migrations are applied and are not edited.

-- ---------------------------------------------------------------------------
-- 1. register_summary: counts and money (per currency) over a register's NON-ARCHIVED rows, with the cards the
--    registers show. security invoker, so row level security applies; p_org narrows to one organisation.
--    Money is returned as { "ZAR": 1234.5, "USD": 10 }; amounts in different currencies are never added.
-- ---------------------------------------------------------------------------
create or replace function public.register_summary(p_org uuid, p_kind text) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_kind = 'lead' then
    return jsonb_build_object(
      'count', (select count(*) from public.leads where organization_id = p_org and archived_at is null),
      'qualified', (select count(*) from public.leads where organization_id = p_org and archived_at is null and status = 'Qualified'),
      'value', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, sum(estimated_value) as amount from public.leads where organization_id = p_org and archived_at is null group by currency) s));
  elsif p_kind = 'quote' then
    return jsonb_build_object(
      'count', (select count(*) from public.quotes where organization_id = p_org and archived_at is null),
      'accepted', (select count(*) from public.quotes where organization_id = p_org and archived_at is null and status = 'Accepted'),
      'value', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, sum(total_amount) as amount from public.quotes where organization_id = p_org and archived_at is null group by currency) s));
  elsif p_kind = 'opportunity' then
    return jsonb_build_object(
      'open', (select count(*) from public.sales_opportunities where organization_id = p_org and archived_at is null and stage not in ('Won', 'Lost')),
      'pipeline', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, sum(expected_value) as amount from public.sales_opportunities
        where organization_id = p_org and archived_at is null and stage not in ('Won', 'Lost') group by currency) s),
      'weighted', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, round(sum(expected_value * probability_percent / 100.0), 2) as amount from public.sales_opportunities
        where organization_id = p_org and archived_at is null and stage not in ('Won', 'Lost') group by currency) s));
  elsif p_kind = 'invoice' then
    return jsonb_build_object(
      'count', (select count(*) from public.invoices where organization_id = p_org and archived_at is null),
      'outstanding', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, sum(balance_amount) as amount from public.invoices
        where organization_id = p_org and archived_at is null and status in ('Issued', 'Partially Paid', 'Overdue') and balance_amount > 0
        group by currency) s),
      'overdue', (select count(*) from public.invoices where organization_id = p_org and archived_at is null and status = 'Overdue'));
  elsif p_kind = 'expense' then
    return jsonb_build_object(
      'spend', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, sum(amount) as amount from public.expenses where organization_id = p_org and archived_at is null group by currency) s),
      'awaiting', (select count(*) from public.expenses where organization_id = p_org and archived_at is null and status in ('Submitted', 'Awaiting Approval')),
      'approved', (select coalesce(jsonb_object_agg(s.currency, s.amount), '{}'::jsonb) from (
        select currency, sum(amount) as amount from public.expenses where organization_id = p_org and archived_at is null and status = 'Approved' group by currency) s));
  end if;
  raise exception 'REGISTER_KIND_UNKNOWN' using errcode = '22023';
end $$;

revoke all on function public.register_summary(uuid, text) from public, anon;
grant execute on function public.register_summary(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. forecast_months (from 20261011150000) with one change: an archived invoice is no longer counted as money still
--    due. Archiving is real from this part on. Collected money stays: a payment received is a payment received.
-- ---------------------------------------------------------------------------
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
    where i.organization_id = p_org and i.archived_at is null
      and i.status in ('Issued', 'Partially Paid', 'Overdue') and i.balance_amount > 0
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
