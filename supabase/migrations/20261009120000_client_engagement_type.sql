-- Retainer vs project clients: a nullable, additive column (existing rows stay
-- untyped and are reported as such), and the Overview clients KPI splits on it.

alter table public.clients
  add column engagement_type text
  check (engagement_type in ('Retainer', 'Project'));

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
      'retainer', count(*) filter (where archived_at is null and engagement_type = 'Retainer'),
      'project', count(*) filter (where archived_at is null and engagement_type = 'Project'),
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
