-- Accept to invoice, stage 2, task 6: billing notices also go by email. Additive and inert until an organisation turns on both
-- billing_plans_enabled and billing_auto_send_enabled; with automatic sending off every notice is in the app only, as before.
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. private.billing_notify (20261111102000_billing_run_item.sql) replaced: the in-app notice exactly as before and, only when the
--    organisation has automatic sending on, one billing_notice_emails row per recipient (the same title and body). The runner sends
--    the outbox; the pause notices of private.billing_plan_auto_pause keep their own in-app insert and stay in the app.
-- 2. private.billing_on_acceptance and public.billing_nightly (both 20261026104000_billing_on_acceptance.sql) replaced: the body is
--    unchanged except that their notice inserts call private.billing_notify (the first-invoice-ready notice and the two-day approval
--    reminder). The held-month and failed-send notices of Stage 2 already go through it.
-- 3. public.billing_pending_notice_emails and public.billing_mark_notice_email, for the runner (service role only).

-- ---------------------------------------------------------------------------
-- 1. The notice, with its email.
-- ---------------------------------------------------------------------------
create or replace function private.billing_notify(p_organization_id uuid, p_quote_id uuid, p_title text, p_body text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_told integer;
begin
  insert into public.notifications (organization_id, user_id, title, body, category, href)
  select p_organization_id, u.user_id, p_title, p_body, 'Finance', '/commercial/quotes/' || p_quote_id
  from private.billing_notice_users(p_quote_id) u;
  get diagnostics v_told = row_count;

  if exists (
    select 1 from public.organization_settings s
    where s.organization_id = p_organization_id and s.billing_plans_enabled and s.billing_auto_send_enabled) then
    insert into public.billing_notice_emails (organization_id, user_id, quote_id, subject, body)
    select p_organization_id, u.user_id, p_quote_id, left(p_title, 300), left(p_body, 4000)
    from private.billing_notice_users(p_quote_id) u;
  end if;
  return v_told;
end $$;

revoke all on function private.billing_notify(uuid, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The two Stage 1 functions that tell people, now through it.
-- ---------------------------------------------------------------------------
create or replace function private.billing_on_acceptance(p_quote_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_quote public.quotes%rowtype;
  v_value numeric(14,2);
  v_opportunity uuid;
  v_plan uuid;
  v_plan_status text;
  v_item uuid;
  v_made boolean := false;
  v_body text;
begin
  select * into v_quote from public.quotes q where q.id = p_quote_id for no key update;
  if not found or v_quote.status <> 'Accepted' or v_quote.archived_at is not null then
    return;
  end if;
  if not coalesce((select s.billing_plans_enabled from public.organization_settings s where s.organization_id = v_quote.organization_id), false) then
    return;
  end if;
  if v_quote.client_id is not null and exists (
    select 1 from public.clients c
    where c.id = v_quote.client_id and c.organization_id = v_quote.organization_id and c.archived_at is not null) then
    return;
  end if;
  if not exists (select 1 from public.billing_plans p where p.quote_id = v_quote.id)
     and exists (
       select 1 from public.invoices i
       where i.quote_id = v_quote.id and i.organization_id = v_quote.organization_id
         and i.status <> 'Cancelled' and not (i.status = 'Draft' and i.archived_at is not null)) then
    return;
  end if;

  -- Sales.
  select coalesce(sum(l.line_amount) filter (where l.charge_kind is distinct from 'monthly'), 0)
         + coalesce(sum(l.line_amount) filter (where l.charge_kind = 'monthly'), 0) * coalesce(v_quote.term_months, 1)
    into v_value
    from public.quote_lines l
    where l.quote_id = v_quote.id and l.organization_id = v_quote.organization_id;

  if v_quote.opportunity_id is not null then
    update public.sales_opportunities o
       set stage = 'Won',
           lost_reason = case when o.stage = 'Won' then o.lost_reason else null end,
           expected_value = case when o.expected_value = 0 then v_value else o.expected_value end
     where o.id = v_quote.opportunity_id and o.organization_id = v_quote.organization_id
       and (o.stage <> 'Won' or (o.expected_value = 0 and v_value <> 0));
  else
    insert into public.sales_opportunities (organization_id, name, client_id, client_name, owner_id, stage, expected_value, currency)
    values (v_quote.organization_id, coalesce(nullif(btrim(v_quote.project_name), ''), 'Quotation ' || v_quote.quote_number),
            v_quote.client_id, v_quote.client_name, v_quote.owner_id, 'Won', v_value, v_quote.currency)
    returning id into v_opportunity;
    update public.quotes q set opportunity_id = v_opportunity
     where q.id = v_quote.id and q.organization_id = v_quote.organization_id;
  end if;

  -- Plan. The invoice is built from the quote as it is now, so it carries the opportunity set above.
  v_plan := private.ensure_billing_plan(v_quote.id);
  select p.status into v_plan_status from public.billing_plans p where p.id = v_plan;
  select i.id into v_item from public.billing_plan_items i where i.plan_id = v_plan and i.month_number = 1;
  if v_plan_status = 'active' and v_item is not null
     and not exists (select 1 from public.invoices i where i.billing_plan_item_id = v_item) then
    perform private.build_plan_item_invoice(v_item);
    v_made := true;
  end if;

  -- Notice.
  if v_made then
    v_body := 'Check the draft invoice for quotation ' || v_quote.quote_number
              || ', then press Approve and send. Only an owner or admin can approve it.';
    if v_quote.start_date is null and v_quote.term_months is null and exists (
      select 1 from public.quote_lines l
      where l.quote_id = v_quote.id and l.organization_id = v_quote.organization_id and l.charge_kind = 'monthly') then
      v_body := v_body || ' Its monthly invoices have to be created by hand.';
    end if;
    perform private.billing_notify(v_quote.organization_id, v_quote.id, v_quote.client_name || ' accepted: first invoice ready to approve', v_body);
  end if;
end $$;

revoke all on function private.billing_on_acceptance(uuid) from public, anon, authenticated, service_role;

create or replace function public.billing_nightly() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_quote public.quotes%rowtype;
  v_swept integer := 0;
  v_reminded integer := 0;
  v_due boolean;
  v_told integer;
begin
  for r in
    select q.id
    from public.quotes q
    join public.organization_settings s on s.organization_id = q.organization_id and s.billing_plans_enabled
    where q.status = 'Accepted' and q.archived_at is null
      and not exists (select 1 from public.billing_plans p where p.quote_id = q.id)
      and not exists (
        select 1 from public.invoices i
        where i.quote_id = q.id and i.organization_id = q.organization_id
          and i.status <> 'Cancelled' and not (i.status = 'Draft' and i.archived_at is not null))
      and exists (
        select 1 from public.quote_responses x
        where x.quote_id = q.id and x.organization_id = q.organization_id and x.decision = 'accepted'
          and x.decided_at >= s.billing_plans_enabled_at)
    order by q.id
  loop
    begin
      select * into v_quote from public.quotes q where q.id = r.id for update;
      if found then
        -- Read again, in a statement of its own, after any wait for the lock.
        select v_quote.status = 'Accepted' and v_quote.archived_at is null
               and not exists (select 1 from public.billing_plans p where p.quote_id = v_quote.id)
               and not exists (
                 select 1 from public.invoices i
                 where i.quote_id = v_quote.id and i.organization_id = v_quote.organization_id
                   and i.status <> 'Cancelled' and not (i.status = 'Draft' and i.archived_at is not null))
               and exists (
                 select 1
                 from public.organization_settings s
                 join public.quote_responses x on x.organization_id = s.organization_id and x.quote_id = v_quote.id
                 where s.organization_id = v_quote.organization_id and s.billing_plans_enabled
                   and x.decision = 'accepted' and x.decided_at >= s.billing_plans_enabled_at)
          into v_due;
        if v_due then
          perform private.billing_on_acceptance(v_quote.id);
          if exists (select 1 from public.billing_plans p where p.quote_id = v_quote.id) then
            v_swept := v_swept + 1;
          end if;
        end if;
      end if;
    exception when others then
      raise warning 'billing_nightly: the billing step for quote % failed (SQLSTATE %)', r.id, sqlstate;
    end;
  end loop;

  for r in
    select i.id as item_id, i.quote_id, i.organization_id
    from public.billing_plan_items i
    join public.billing_plans p on p.id = i.plan_id and p.organization_id = i.organization_id
    join public.organization_settings s on s.organization_id = i.organization_id and s.billing_plans_enabled
    where i.kind = 'first' and i.status = 'open' and i.approved_at is null and p.status = 'active'
      and i.created_at <= now() - interval '2 days'
      and (i.approval_reminded_at is null or i.approval_reminded_at <= now() - interval '2 days' + interval '1 hour')
      and exists (
        select 1 from public.invoices v
        where v.billing_plan_item_id = i.id and v.organization_id = i.organization_id
          and v.status = 'Draft' and v.archived_at is null)
    order by i.id
    for update of i skip locked
  loop
    begin
      select private.billing_notify(q.organization_id, q.id, 'First invoice for ' || q.client_name || ' is waiting for approval',
             'The draft invoice for quotation ' || q.quote_number
               || ' has not been approved yet. Check it, then press Approve and send. Only an owner or admin can approve it.')
        into v_told
      from public.quotes q
      where q.id = r.quote_id and q.organization_id = r.organization_id;
      v_told := coalesce(v_told, 0);
      if v_told > 0 then
        update public.billing_plan_items i set approval_reminded_at = now() where i.id = r.item_id;
        v_reminded := v_reminded + 1;
      end if;
    exception when others then
      raise warning 'billing_nightly: the reminder for plan item % failed (SQLSTATE %)', r.item_id, sqlstate;
    end;
  end loop;

  return jsonb_build_object('swept', v_swept, 'reminded', v_reminded);
end $$;

revoke all on function public.billing_nightly() from public, anon, authenticated;
grant execute on function public.billing_nightly() to service_role;

-- ---------------------------------------------------------------------------
-- 3. The outbox, for the runner.
-- ---------------------------------------------------------------------------
create or replace function public.billing_pending_notice_emails(p_limit integer) returns table (id uuid, to_address text, subject text, body text, quote_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'LIMIT_INVALID' using errcode = '22023';
  end if;
  return query
  select o.id, u.email::text, o.subject, o.body, o.quote_id
  from public.billing_notice_emails o
  join auth.users u on u.id = o.user_id
  where o.sent_at is null and o.attempts < 5 and u.email is not null and btrim(u.email) <> ''
  order by o.created_at, o.id
  limit p_limit;
end $$;

revoke all on function public.billing_pending_notice_emails(integer) from public, anon, authenticated;
grant execute on function public.billing_pending_notice_emails(integer) to service_role;

create or replace function public.billing_mark_notice_email(p_id uuid, p_sent boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_sent then
    update public.billing_notice_emails o set sent_at = coalesce(o.sent_at, now()) where o.id = p_id;
  else
    update public.billing_notice_emails o set attempts = least(o.attempts + 1, 100) where o.id = p_id;
  end if;
end $$;

revoke all on function public.billing_mark_notice_email(uuid, boolean) from public, anon, authenticated;
grant execute on function public.billing_mark_notice_email(uuid, boolean) to service_role;
