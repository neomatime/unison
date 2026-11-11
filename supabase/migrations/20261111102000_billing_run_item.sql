-- Accept to invoice, stage 2, task 3: the database chooses and issues each due month. Everything here is for the billing runner,
-- which has no signed-in user: the two public functions are granted to the service role alone. Nothing runs until an organisation
-- turns on both billing_plans_enabled and billing_auto_send_enabled (both default to false).
-- Append-only: earlier migrations are applied and are not edited.
--
-- private.billing_notify         the in-app notice every billing event uses (Stage 2, task 6 adds the email to it).
-- private.billing_item_due_for_issue / _for_send
--                                the one place that says whether a plan item may be issued, or its issued invoice emailed.
-- public.billing_due_items       what the runner should work on, oldest first.
-- public.billing_run_item        locks one item, re-checks everything, and issues it, holds it, or says the hourly cap is reached.
--
-- The rules (spec section 4 and 5, and the plan's calls 3 to 5):
--  * a month is due when its plan is active, the item is open and monthly, its date (a South African day) has come, item 1 was
--    approved and its email recorded, nothing but an unarchived Draft is linked to it, and it is not held as CATCH_UP;
--  * the checks are the ones the first invoice passes (private.billing_invoice_blockers); a failure keeps the Draft, numbers
--    nothing, marks the month CHECKS_FAILED and tells the owner once per distinct failure;
--  * when more than one month of a plan is due at once, all are kept as Drafts and held (CATCH_UP) for a person;
--  * the hourly email cap is the caller's number; reaching it writes nothing.

-- ---------------------------------------------------------------------------
-- 1. The notice.
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
  return v_told;
end $$;

revoke all on function private.billing_notify(uuid, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. May this item be issued? May its invoice be emailed?
-- ---------------------------------------------------------------------------
create or replace function private.billing_item_due_for_issue(p_item_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.billing_plan_items i
    join public.billing_plans p on p.id = i.plan_id and p.organization_id = i.organization_id
    join public.organization_settings s on s.organization_id = i.organization_id
      and s.billing_plans_enabled and s.billing_auto_send_enabled
    where i.id = p_item_id
      and i.kind = 'monthly' and i.status = 'open'
      and p.status = 'active'
      and i.bill_on <= (now() at time zone 'Africa/Johannesburg')::date
      and i.attention_code is distinct from 'CATCH_UP'
      and not exists (select 1 from public.invoices v where v.billing_plan_item_id = i.id and v.status <> 'Draft')
      and exists (
        select 1
        from public.billing_plan_items f
        join public.invoices fi on fi.billing_plan_item_id = f.id and fi.organization_id = f.organization_id
        where f.plan_id = i.plan_id and f.organization_id = i.organization_id
          and f.kind = 'first' and f.approved_at is not null
          and exists (select 1 from public.document_emails e where e.invoice_id = fi.id and e.organization_id = fi.organization_id))
  )
$$;

revoke all on function private.billing_item_due_for_issue(uuid) from public, anon, authenticated;

create or replace function private.billing_item_due_for_send(p_item_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.billing_plan_items i
    join public.organization_settings s on s.organization_id = i.organization_id
      and s.billing_plans_enabled and s.billing_auto_send_enabled
    where i.id = p_item_id
      and i.system_issued_at is not null
      and i.send_attempts < 5
      and (i.send_lease_until is null or i.send_lease_until <= now())
      and exists (select 1 from public.invoices v where v.billing_plan_item_id = i.id and v.status not in ('Draft', 'Cancelled'))
      and not exists (
        select 1 from public.document_emails e
        join public.invoices v on v.id = e.invoice_id and v.organization_id = e.organization_id
        where v.billing_plan_item_id = i.id)
  )
$$;

revoke all on function private.billing_item_due_for_send(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. What the runner should work on.
-- ---------------------------------------------------------------------------
create or replace function public.billing_due_items(p_limit integer) returns table (item_id uuid, step text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'LIMIT_INVALID' using errcode = '22023';
  end if;
  return query
  select d.id, d.step
  from (
    select i.id, 'issue'::text as step, i.bill_on as on_date, i.month_number as month_no
    from public.billing_plan_items i
    where i.kind = 'monthly' and i.status = 'open' and i.bill_on <= v_today and private.billing_item_due_for_issue(i.id)
    union all
    select i.id, 'send'::text, i.bill_on, i.month_number
    from public.billing_plan_items i
    where i.system_issued_at is not null and private.billing_item_due_for_send(i.id)
  ) d
  order by d.on_date, d.month_no, d.id
  limit p_limit;
end $$;

revoke all on function public.billing_due_items(integer) from public, anon, authenticated;
grant execute on function public.billing_due_items(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Issue, hold or skip one item.
-- ---------------------------------------------------------------------------
create or replace function public.billing_run_item(p_item_id uuid, p_email_cap integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.billing_plan_items%rowtype;
  v_quote public.quotes%rowtype;
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_invoice uuid;
  v_blockers text[] := '{}';
  v_detail text;
  v_changed boolean;
  v_due_count integer;
  v_lowest smallint;
  v_recent integer;
  v_done jsonb;
  v_number text;
  v_vat numeric;
begin
  if p_email_cap is null or p_email_cap < 1 then
    raise exception 'EMAIL_CAP_INVALID' using errcode = '22023';
  end if;

  -- The row lock first; a month another run holds is left to it. Everything is then read again under the lock, so a month that was
  -- issued, paused or cancelled a moment ago is skipped and nothing is written.
  select * into v_item from public.billing_plan_items i where i.id = p_item_id for update skip locked;
  if not found or not private.billing_item_due_for_issue(p_item_id) then
    return jsonb_build_object('state', 'skipped', 'codes', '[]'::jsonb, 'invoice_id', null);
  end if;

  select count(*) into v_recent from public.document_emails e
  where e.organization_id = v_item.organization_id and e.sent_at >= now() - interval '1 hour';
  if v_recent >= p_email_cap then
    return jsonb_build_object('state', 'capped', 'codes', '[]'::jsonb, 'invoice_id', null);
  end if;

  select * into v_quote from public.quotes q where q.id = v_item.quote_id;
  select v.id into v_invoice from public.invoices v
  where v.billing_plan_item_id = p_item_id and v.status = 'Draft' and v.archived_at is null;

  -- More than one month of this plan due at once: every one is kept as a Draft and held for a person; one notice for the plan.
  select count(*), min(o.month_number) into v_due_count, v_lowest
  from public.billing_plan_items o
  where o.plan_id = v_item.plan_id and o.organization_id = v_item.organization_id
    and o.kind = 'monthly' and o.status = 'open' and o.bill_on <= v_today
    and not exists (select 1 from public.invoices x where x.billing_plan_item_id = o.id and x.status <> 'Draft');
  if v_due_count > 1 then
    if v_invoice is null then
      v_invoice := private.build_plan_item_invoice(p_item_id);
    end if;
    update public.billing_plan_items i set attention_code = 'CATCH_UP', attention_detail = null where i.id = p_item_id;
    insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
    values (v_item.organization_id, 'billing.item_held', 'Month ' || v_item.month_number || ' held for your check: more than one month is due',
            jsonb_build_object('billing_plan_item_id', p_item_id, 'month_number', v_item.month_number, 'reason', 'CATCH_UP'),
            public.activity_actor(v_item.organization_id), v_item.quote_id);
    if v_item.month_number = v_lowest then
      begin
        perform private.billing_notify(v_item.organization_id, v_item.quote_id, v_quote.client_name || ': more than one month is due',
          'More than one month of the billing plan for quotation ' || v_quote.quote_number
          || ' is due at once, so they were prepared as drafts and not sent. Check each draft, then issue and email it yourself.');
      exception when others then
        raise warning 'billing_run_item: the notice for plan item % failed (SQLSTATE %)', p_item_id, sqlstate;
      end;
    end if;
    return jsonb_build_object('state', 'held', 'codes', '["CATCH_UP"]'::jsonb, 'invoice_id', v_invoice);
  end if;

  if v_invoice is null then
    v_invoice := private.build_plan_item_invoice(p_item_id);
  end if;

  v_blockers := private.billing_invoice_blockers(v_invoice);
  if coalesce(array_length(v_blockers, 1), 0) > 0 then
    v_detail := left(array_to_string(v_blockers, ','), 200);
  else
    -- The checks passed; issuing can still refuse (a due date typed on the draft before the issue date). That is a hold too, named by
    -- the database's own token, and the subtransaction gives back the number it took.
    begin
      v_done := private.issue_invoice_apply(v_invoice);
    exception when others then
      v_detail := case when sqlerrm ~ '^[A-Z][A-Z_]{2,60}$' then sqlerrm else 'ISSUE_FAILED' end;
      v_blockers := array[v_detail];
    end;
  end if;

  if v_detail is not null then
    v_changed := v_item.attention_code is distinct from 'CHECKS_FAILED' or v_item.attention_detail is distinct from v_detail;
    update public.billing_plan_items i set
      attention_code = 'CHECKS_FAILED', attention_detail = v_detail,
      attention_notified_at = case when v_changed then now() else i.attention_notified_at end
    where i.id = p_item_id;
    if v_changed then
      insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
      values (v_item.organization_id, 'billing.item_held', 'Month ' || v_item.month_number || ' held: ' || v_detail,
              jsonb_build_object('billing_plan_item_id', p_item_id, 'month_number', v_item.month_number, 'reason', 'CHECKS_FAILED', 'codes', v_detail),
              public.activity_actor(v_item.organization_id), v_item.quote_id);
      begin
        perform private.billing_notify(v_item.organization_id, v_item.quote_id, 'Month ' || v_item.month_number || ' for ' || v_quote.client_name || ' needs your attention',
          'Month ' || v_item.month_number || ' of the billing plan for quotation ' || v_quote.quote_number
          || ' is waiting: its checks did not pass. Fix what the quote page lists, and it will go out on the next run.');
      exception when others then
        raise warning 'billing_run_item: the notice for plan item % failed (SQLSTATE %)', p_item_id, sqlstate;
      end;
    end if;
    return jsonb_build_object('state', 'held', 'codes', to_jsonb(v_blockers), 'invoice_id', v_invoice);
  end if;

  v_number := v_done ->> 'number';
  update public.billing_plan_items i set
    system_issued_at = now(), attention_code = null, attention_detail = null, attention_notified_at = null,
    send_lease_until = null, send_attempts = 0
  where i.id = p_item_id;
  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_item.organization_id, 'billing.invoice_auto_issued', 'Invoice ' || v_number || ' issued automatically for month ' || v_item.month_number,
          jsonb_build_object('invoice_id', v_invoice, 'invoice_number', v_number, 'billing_plan_item_id', p_item_id, 'month_number', v_item.month_number),
          public.activity_actor(v_item.organization_id), v_item.quote_id);

  -- Spec call 8: the VAT rate in force on the day of issue applies. When it is not the quote's, the people are told, not blocked.
  select i.vat_rate into v_vat from public.invoices i where i.id = v_invoice;
  if v_vat is distinct from v_quote.vat_rate then
    begin
      perform private.billing_notify(v_item.organization_id, v_item.quote_id, 'Month ' || v_item.month_number || ' for ' || v_quote.client_name || ' was issued at a different VAT rate',
        'The VAT rate on invoice ' || v_number || ' is ' || v_vat || '%, not the ' || v_quote.vat_rate || '% on quotation ' || v_quote.quote_number
        || '. The rate in force on the day of issue applies.');
    exception when others then
      raise warning 'billing_run_item: the VAT notice for plan item % failed (SQLSTATE %)', p_item_id, sqlstate;
    end;
  end if;

  return jsonb_build_object('state', 'issued', 'codes', '[]'::jsonb, 'invoice_id', v_invoice);
end $$;

revoke all on function public.billing_run_item(uuid, integer) from public, anon, authenticated;
grant execute on function public.billing_run_item(uuid, integer) to service_role;
