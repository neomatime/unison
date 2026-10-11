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
