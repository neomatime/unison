-- CRM overview: two timestamp corrections the revenue and activity figures depend
-- on, then four read-only aggregation functions for the Overview dashboard.

-- ---------------------------------------------------------------------------
-- 1. Milestone timestamps that stay put.
--
-- savePhaseSixRecordAction rebuilds the whole row on every save, so editing a won
-- opportunity re-stamped won_at to now() (and a sent or accepted quote its
-- sent_at / accepted_at). Revenue booked in March and edited in October moved to
-- October, or into the next year. These triggers make the timestamps mean what
-- their names say, for every writer and not only that action.
-- ---------------------------------------------------------------------------

create or replace function public.keep_opportunity_won_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.stage = 'Won' then
    if tg_op = 'UPDATE' and old.stage = 'Won' and old.won_at is not null then
      new.won_at := old.won_at;
    else
      new.won_at := coalesce(new.won_at, now());
    end if;
  else
    new.won_at := null;
  end if;
  return new;
end $$;

create trigger sales_opportunities_keep_won_at
  before insert or update on public.sales_opportunities
  for each row execute function public.keep_opportunity_won_at();

create or replace function public.keep_quote_milestones() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    -- sent_at is the first time the quote was sent; later edits and status moves keep it.
    if old.sent_at is not null then
      new.sent_at := old.sent_at;
    elsif new.status = 'Sent' then
      new.sent_at := coalesce(new.sent_at, now());
    end if;
    -- accepted_at holds while the quote stays Accepted and clears if it is reopened.
    if new.status = 'Accepted' then
      new.accepted_at := coalesce(case when old.status = 'Accepted' then old.accepted_at end, new.accepted_at, now());
    else
      new.accepted_at := null;
    end if;
  else
    if new.status = 'Sent' then
      new.sent_at := coalesce(new.sent_at, now());
    end if;
    if new.status = 'Accepted' then
      new.accepted_at := coalesce(new.accepted_at, now());
    else
      new.accepted_at := null;
    end if;
  end if;
  return new;
end $$;

create trigger quotes_keep_milestones
  before insert or update on public.quotes
  for each row execute function public.keep_quote_milestones();

revoke all on function public.keep_opportunity_won_at() from public, anon, authenticated;
revoke all on function public.keep_quote_milestones() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Dashboard reads. All are security invoker, so RLS scopes every row, and each
-- refuses a caller who is not a member of the organisation rather than answering
-- with zeros. p_modules is the caller's entitled module ids: a section whose
-- module is not in it comes back as JSON null ("not in your plan"), which is
-- different from a counted zero.
-- ---------------------------------------------------------------------------

create or replace function public.crm_overview_kpis(
  p_organization_id uuid,
  p_modules text[],
  p_timezone text default 'Africa/Johannesburg'
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  tz text := coalesce(nullif(trim(p_timezone), ''), 'Africa/Johannesburg');
  local_now timestamp := now() at time zone tz;
  month_start timestamptz := date_trunc('month', local_now) at time zone tz;
  year_start timestamptz := date_trunc('year', local_now) at time zone tz;
  prev_year_start timestamptz := (date_trunc('year', local_now) - interval '1 year') at time zone tz;
  prev_year_point timestamptz := (local_now - interval '1 year') at time zone tz;
  clients_json jsonb;
  leads_json jsonb;
  quotes_json jsonb;
  revenue_json jsonb;
begin
  if not public.is_member_of(p_organization_id) then
    raise exception 'You are not a member of this organisation.' using errcode = '42501';
  end if;

  if 'clients' = any (p_modules) then
    select jsonb_build_object(
      'total', count(*) filter (where archived_at is null),
      'at_previous_month_end', count(*) filter (
        where created_at < month_start and (archived_at is null or archived_at >= month_start)
      )
    ) into clients_json
    from public.clients where organization_id = p_organization_id;
  end if;

  if 'leads' = any (p_modules) then
    select jsonb_build_object(
      'open', count(*) filter (where archived_at is null and status in ('New', 'Contacted', 'Qualified')),
      'created_this_month', count(*) filter (where archived_at is null and created_at >= month_start)
    ) into leads_json
    from public.leads where organization_id = p_organization_id;
  end if;

  if 'quotes' = any (p_modules) then
    select jsonb_build_object(
      'active', count(*) filter (where archived_at is null and status in ('Draft', 'Internal Review', 'Sent')),
      'sent', count(*) filter (where archived_at is null and status = 'Sent')
    ) into quotes_json
    from public.quotes where organization_id = p_organization_id;
  end if;

  if 'sales' = any (p_modules) then
    select jsonb_build_object(
      'by_currency', coalesce((
        select jsonb_agg(jsonb_build_object(
          'currency', x.currency,
          'year_to_date', x.ytd,
          'previous_year_to_date', x.prev,
          'deals', x.deals
        ) order by x.currency)
        from (
          select currency,
            coalesce(sum(expected_value) filter (where won_at >= year_start and won_at <= now()), 0) as ytd,
            coalesce(sum(expected_value) filter (where won_at >= prev_year_start and won_at <= prev_year_point), 0) as prev,
            count(*) filter (where won_at >= year_start and won_at <= now()) as deals
          from public.sales_opportunities
          where organization_id = p_organization_id and archived_at is null and stage = 'Won' and won_at is not null
          group by currency
        ) x
      ), '[]'::jsonb),
      'won_without_date', (
        select count(*) from public.sales_opportunities
        where organization_id = p_organization_id and archived_at is null and stage = 'Won' and won_at is null
      )
    ) into revenue_json;
  end if;

  return jsonb_build_object(
    'timezone', tz,
    'clients', clients_json,
    'leads', leads_json,
    'quotes', quotes_json,
    'revenue', revenue_json
  );
end $$;

create or replace function public.crm_overview_pipeline(
  p_organization_id uuid,
  p_modules text[],
  p_timezone text default 'Africa/Johannesburg'
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  tz text := coalesce(nullif(trim(p_timezone), ''), 'Africa/Johannesburg');
  local_now timestamp := now() at time zone tz;
  year_start timestamptz := date_trunc('year', local_now) at time zone tz;
  stages_json jsonb;
  won_json jsonb;
begin
  if not public.is_member_of(p_organization_id) then
    raise exception 'You are not a member of this organisation.' using errcode = '42501';
  end if;
  if not ('sales' = any (p_modules)) then
    return jsonb_build_object('stages', null, 'won', null);
  end if;

  with live_opps as (
    select id, name, client_name, expected_value, currency, expected_close, stage, created_at
    from public.sales_opportunities
    where organization_id = p_organization_id
      and archived_at is null
      and stage in ('Discovery', 'Qualified', 'Proposal', 'Negotiation')
  )
  select coalesce(jsonb_agg(staged.stage_json order by staged.ord), '[]'::jsonb) into stages_json
  from (
    select s.ord,
      jsonb_build_object(
        'stage', s.stage,
        'count', (select count(*) from live_opps o where o.stage = s.stage),
        'totals', (
          select coalesce(jsonb_agg(jsonb_build_object('currency', t.currency, 'amount', t.amount) order by t.currency), '[]'::jsonb)
          from (select o.currency, sum(o.expected_value) as amount from live_opps o where o.stage = s.stage group by o.currency) t
        ),
        'previews', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', p.id, 'name', p.name, 'client_name', p.client_name,
            'expected_value', p.expected_value, 'currency', p.currency, 'expected_close', p.expected_close
          ) order by p.expected_value desc, p.created_at desc), '[]'::jsonb)
          from (
            select * from live_opps o where o.stage = s.stage
            order by o.expected_value desc, o.created_at desc limit 3
          ) p
        )
      ) as stage_json
    from (values (1, 'Discovery'), (2, 'Qualified'), (3, 'Proposal'), (4, 'Negotiation')) as s(ord, stage)
  ) staged;

  with won as (
    select id, name, client_name, expected_value, currency, won_at
    from public.sales_opportunities
    where organization_id = p_organization_id
      and archived_at is null
      and stage = 'Won'
      and won_at >= year_start and won_at <= now()
  )
  select jsonb_build_object(
    'count', (select count(*) from won),
    'totals', (
      select coalesce(jsonb_agg(jsonb_build_object('currency', t.currency, 'amount', t.amount) order by t.currency), '[]'::jsonb)
      from (select w.currency, sum(w.expected_value) as amount from won w group by w.currency) t
    ),
    'previews', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'client_name', p.client_name,
        'expected_value', p.expected_value, 'currency', p.currency, 'won_at', p.won_at
      ) order by p.won_at desc), '[]'::jsonb)
      from (select * from won w order by w.won_at desc limit 3) p
    )
  ) into won_json;

  return jsonb_build_object('stages', stages_json, 'won', won_json);
end $$;

create or replace function public.crm_overview_revenue(
  p_organization_id uuid,
  p_modules text[],
  p_timezone text default 'Africa/Johannesburg'
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  tz text := coalesce(nullif(trim(p_timezone), ''), 'Africa/Johannesburg');
  local_now timestamp := now() at time zone tz;
  month_start timestamptz := date_trunc('month', local_now) at time zone tz;
  prev_year_start timestamptz := (date_trunc('year', local_now) - interval '1 year') at time zone tz;
  month_start_date date := date_trunc('month', local_now)::date;
  next_year_start_date date := (date_trunc('year', local_now) + interval '1 year')::date;
  result jsonb;
begin
  if not public.is_member_of(p_organization_id) then
    raise exception 'You are not a member of this organisation.' using errcode = '42501';
  end if;
  if not ('sales' = any (p_modules)) then
    return null;
  end if;

  with won as (
    select to_char(won_at at time zone tz, 'YYYY-MM') as month,
           least((extract(day from (won_at at time zone tz))::int - 1) / 7, 3) + 1 as week,
           won_at >= month_start as this_month,
           currency, expected_value
    from public.sales_opportunities
    where organization_id = p_organization_id and archived_at is null and stage = 'Won'
      and won_at >= prev_year_start and won_at <= now()
  ), open_opps as (
    select expected_close, currency, expected_value
    from public.sales_opportunities
    where organization_id = p_organization_id and archived_at is null
      and stage in ('Discovery', 'Qualified', 'Proposal', 'Negotiation')
  )
  select jsonb_build_object(
    'timezone', tz,
    'won_by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', g.month, 'currency', g.currency, 'amount', g.amount, 'deals', g.deals) order by g.month, g.currency)
      from (select month, currency, sum(expected_value) as amount, count(*) as deals from won group by month, currency) g
    ), '[]'::jsonb),
    'won_this_month_by_week', coalesce((
      select jsonb_agg(jsonb_build_object('week', g.week, 'currency', g.currency, 'amount', g.amount, 'deals', g.deals) order by g.week, g.currency)
      from (select week, currency, sum(expected_value) as amount, count(*) as deals from won where this_month group by week, currency) g
    ), '[]'::jsonb),
    'pipeline_by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', g.month, 'currency', g.currency, 'amount', g.amount, 'deals', g.deals) order by g.month, g.currency)
      from (
        select to_char(expected_close, 'YYYY-MM') as month, currency, sum(expected_value) as amount, count(*) as deals
        from open_opps
        where expected_close >= month_start_date and expected_close < next_year_start_date
        group by 1, currency
      ) g
    ), '[]'::jsonb),
    'pipeline_this_month_by_week', coalesce((
      select jsonb_agg(jsonb_build_object('week', g.week, 'currency', g.currency, 'amount', g.amount, 'deals', g.deals) order by g.week, g.currency)
      from (
        select least((extract(day from expected_close)::int - 1) / 7, 3) + 1 as week, currency, sum(expected_value) as amount, count(*) as deals
        from open_opps
        where expected_close >= month_start_date and expected_close < (month_start_date + interval '1 month')::date
        group by 1, currency
      ) g
    ), '[]'::jsonb),
    'pipeline_not_charted', jsonb_build_object(
      'no_close_date', (select count(*) from open_opps where expected_close is null),
      'past_close_date', (select count(*) from open_opps where expected_close < month_start_date),
      'next_year_or_later', (select count(*) from open_opps where expected_close >= next_year_start_date)
    )
  ) into result;

  return result;
end $$;

create or replace function public.crm_overview_activity(
  p_organization_id uuid,
  p_modules text[],
  p_limit integer default 8
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  row_limit integer := least(greatest(coalesce(p_limit, 8), 1), 25);
  result jsonb;
begin
  if not public.is_member_of(p_organization_id) then
    raise exception 'You are not a member of this organisation.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', ev.kind, 'record_id', ev.record_id, 'title', ev.title,
    'subtitle', ev.subtitle, 'occurred_at', ev.occurred_at
  ) order by ev.occurred_at desc, ev.record_id), '[]'::jsonb) into result
  from (
    select * from (
      select * from (
        select 'lead.created'::text as kind, id as record_id, company_name as title, contact_name as subtitle, created_at as occurred_at
        from public.leads
        where organization_id = p_organization_id and archived_at is null and 'leads' = any (p_modules)
        order by created_at desc limit row_limit
      ) a
      union all
      select * from (
        select 'client.created'::text, id, name, industry, created_at
        from public.clients
        where organization_id = p_organization_id and archived_at is null and 'clients' = any (p_modules)
        order by created_at desc limit row_limit
      ) b
      union all
      select * from (
        select 'quote.created'::text, id, quote_number, client_name, created_at
        from public.quotes
        where organization_id = p_organization_id and archived_at is null and 'quotes' = any (p_modules)
        order by created_at desc limit row_limit
      ) c
      union all
      select * from (
        select 'quote.sent'::text, id, quote_number, client_name, sent_at
        from public.quotes
        where organization_id = p_organization_id and archived_at is null and sent_at is not null and 'quotes' = any (p_modules)
        order by sent_at desc limit row_limit
      ) d
      union all
      select * from (
        select 'quote.accepted'::text, id, quote_number, client_name, accepted_at
        from public.quotes
        where organization_id = p_organization_id and archived_at is null and accepted_at is not null and 'quotes' = any (p_modules)
        order by accepted_at desc limit row_limit
      ) e
      union all
      select * from (
        select 'opportunity.created'::text, id, name, client_name, created_at
        from public.sales_opportunities
        where organization_id = p_organization_id and archived_at is null and 'sales' = any (p_modules)
        order by created_at desc limit row_limit
      ) f
      union all
      select * from (
        select 'opportunity.won'::text, id, name, client_name, won_at
        from public.sales_opportunities
        where organization_id = p_organization_id and archived_at is null and stage = 'Won' and won_at is not null and 'sales' = any (p_modules)
        order by won_at desc limit row_limit
      ) g
      union all
      select * from (
        select 'invoice.created'::text, id, invoice_number, client_name, created_at
        from public.invoices
        where organization_id = p_organization_id and archived_at is null and 'invoices' = any (p_modules)
        order by created_at desc limit row_limit
      ) h
      union all
      select * from (
        select 'vendor.added'::text, id, name, vendor_type, created_at
        from public.vendors
        where organization_id = p_organization_id and archived_at is null and 'vendors' = any (p_modules)
        order by created_at desc limit row_limit
      ) i
      union all
      select * from (
        select 'onboarding.started'::text, id, client_name, onboarding_type, created_at
        from public.client_onboardings
        where organization_id = p_organization_id and archived_at is null and 'onboarding' = any (p_modules)
        order by created_at desc limit row_limit
      ) j
    ) merged
    order by occurred_at desc, record_id
    limit row_limit
  ) ev;

  return result;
end $$;

revoke all on function public.crm_overview_kpis(uuid, text[], text) from public, anon;
revoke all on function public.crm_overview_pipeline(uuid, text[], text) from public, anon;
revoke all on function public.crm_overview_revenue(uuid, text[], text) from public, anon;
revoke all on function public.crm_overview_activity(uuid, text[], integer) from public, anon;
grant execute on function public.crm_overview_kpis(uuid, text[], text) to authenticated;
grant execute on function public.crm_overview_pipeline(uuid, text[], text) to authenticated;
grant execute on function public.crm_overview_revenue(uuid, text[], text) to authenticated;
grant execute on function public.crm_overview_activity(uuid, text[], integer) to authenticated;
