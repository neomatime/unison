-- Accept to invoice, stage 4, task 2: an onboarding record and a task when a quote is accepted. Behind the same switch as the rest of the
-- acceptance work (organization_settings.billing_plans_enabled, default false): with it off acceptance does exactly what it did.
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. private.add_business_days(date, integer): Monday to Friday, no public holidays. From a Friday, a Saturday or a Sunday one business
--    day is the Monday.
-- 2. private.billing_make_onboarding(quote): the client's onboarding record for the quote (one per quote, owned by the quote's owner,
--    with the quote's start date) and, only when it made the record, one task for the owner to contact the client by the end of the
--    next business day (17:00 South African time). Idempotent: a second call, the nightly sweep and a re-acceptance return the same
--    record and make no second task.
-- 3. private.billing_on_acceptance (last defined in 20261111104000_billing_notice_emails.sql) replaced: unchanged except for one new
--    guarded block, after the plan step and before the notice, that calls private.billing_make_onboarding.

create or replace function private.add_business_days(p_from date, p_days integer) returns date
language plpgsql immutable set search_path = '' as $$
declare
  v_day date := p_from;
  v_done integer := 0;
begin
  if p_from is null or p_days is null or p_days < 0 then
    raise exception 'DAYS_INVALID' using errcode = '22023';
  end if;
  while v_done < p_days loop
    v_day := v_day + 1;
    if extract(isodow from v_day) < 6 then
      v_done := v_done + 1;
    end if;
  end loop;
  return v_day;
end $$;

revoke all on function private.add_business_days(date, integer) from public, anon, authenticated;

create or replace function private.billing_make_onboarding(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_quote public.quotes%rowtype;
  v_id uuid;
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_due date;
begin
  select * into v_quote from public.quotes q where q.id = p_quote_id;
  if not found then
    return null;
  end if;
  select o.id into v_id from public.client_onboardings o where o.quote_id = p_quote_id and o.organization_id = v_quote.organization_id;
  if found then
    return v_id;
  end if;

  insert into public.client_onboardings (organization_id, client_id, client_name, owner_id, onboarding_type, stage, status, start_date, notes, quote_id)
  values (v_quote.organization_id, v_quote.client_id, v_quote.client_name, v_quote.owner_id, 'Standard Client', 'Welcome', 'Active', v_quote.start_date,
          'Made when ' || v_quote.client_name || ' accepted quotation ' || v_quote.quote_number || '.', p_quote_id)
  on conflict (quote_id) do nothing
  returning id into v_id;
  if v_id is null then
    -- Another call made it a moment ago: that record is the one, and its task is that call's to make.
    select o.id into v_id from public.client_onboardings o where o.quote_id = p_quote_id and o.organization_id = v_quote.organization_id;
    return v_id;
  end if;

  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_quote.organization_id, 'billing.onboarding_created', 'Onboarding started for ' || v_quote.client_name,
          jsonb_build_object('onboarding_id', v_id, 'quote_id', p_quote_id, 'quote_number', v_quote.quote_number),
          public.activity_actor(v_quote.organization_id), p_quote_id);

  v_due := private.add_business_days(v_today, 1);
  insert into public.tasks (organization_id, title, description, onboarding_id, client_id, assignee_id, priority, status, due_at)
  values (v_quote.organization_id, 'Contact ' || v_quote.client_name || ' within one business day',
          v_quote.client_name || ' accepted quotation ' || v_quote.quote_number || '. Make contact to welcome them and confirm the start date.',
          v_id, v_quote.client_id, v_quote.owner_id, 'High', 'Planned',
          ((v_due::text || ' 17:00:00')::timestamp at time zone 'Africa/Johannesburg'));
  return v_id;
end $$;

revoke all on function private.billing_make_onboarding(uuid) from public, anon, authenticated;

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

  -- Onboarding (accept to invoice, stage 4): the client's onboarding record and the task to contact them. Made once per quote, in a block
  -- of its own whose failure only warns, so a problem here leaves the Sales update, the plan, the draft invoice and the notice standing.
  begin
    perform private.billing_make_onboarding(v_quote.id);
  exception when others then
    raise warning 'billing_on_acceptance: the onboarding for quote % failed (SQLSTATE %)', v_quote.id, sqlstate;
  end;

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
