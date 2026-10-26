-- Accept to invoice, stage 1, task 5: what happens when a client accepts a quote on the portal, and the nightly sweep. With the
-- organisation's switch (organization_settings.billing_plans_enabled, default false) off, nothing here does anything: acceptance
-- does exactly what it did (status, record, the existing notices), no plan, no invoice, no opportunity change, and the sweep
-- ignores the organisation. portal_decide is not edited; the only change to what it calls is one guarded block in
-- private.decision_follow_ups.
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. private.billing_on_acceptance(quote): in one unit, the Sales record goes Won, the plan and its draft first invoice are built
--    and the quote's owner and the member who sent the link are told. Not callable by any role.
-- 2. private.decision_follow_ups(response): replaced from 20261020104000_quote_portal_follow_ups.sql, which it repeats exactly,
--    plus one block at the end that calls the function above for an acceptance.
-- 3. public.billing_nightly(): the sweep (an acceptance whose billing step failed is billed once whatever was wrong is put right;
--    one made before the switch was turned on, by hand, or no longer standing is left alone) and the reminders (a first invoice
--    nobody has approved is brought up again every two days). Scheduled every night; for the service role only.
--
-- Lock order, the same in every billing function: the quote row first, then the plan and its items, then invoices. portal_decide
-- holds the quote row (for update) when it calls decision_follow_ups; the sweep takes it before it bills a quote and looks again
-- under it, so a sweep that races an acceptance, or another sweep, waits for it and finds the plan. The unique keys on the plan
-- tables stay the last line of defence. No email is sent, by the database or by the job.
--
-- Money is never typed or recomputed here: the invoice lines are copies of the quote's lines (private.build_plan_item_invoice),
-- and the Sales value is a sum of the quote's own line amounts. Dates are South African days where a date is needed.

-- ---------------------------------------------------------------------------
-- 1. private.billing_on_acceptance. Returns without doing anything unless the organisation's switch is on, the quote is Accepted
--    and not archived, and its client (when it has one) is not archived: the pause trigger of 20261026103000_billing_plan_state.sql
--    fires only on the act of archiving a client, so a plan made for a client that is already archived would never be paused;
--    the sweep bills the quote once the client is back. It also returns for a quote that has no plan but already has a live
--    invoice (one that is not Cancelled and not an archived Draft: the rule create_invoice_from_quote uses), so a quote staff
--    have invoiced by hand is never invoiced a second time. Otherwise, in order, and as one unit (an error anywhere, such as
--    BILLING_QUOTE_NOT_ELIGIBLE for a quote without a client, raises and leaves nothing behind in the caller's block):
--      Sales   the quote's opportunity (same organisation), or, when it has none, a new one: the project name, else
--              "Quotation <number>", the quote's client, owner and currency, stage Won, probability the table's default;
--              it is then the quote's opportunity. An existing one becomes Won (its lost reason cleared) when it is not Won
--              already, and gets the agreement value only while its expected value is 0, so a figure staff typed stays; its
--              probability and every other field are untouched. keep_opportunity_won_at sets won_at.
--              The agreement value is the quote's once-off lines (a line with no kind is once-off) plus its monthly lines times
--              the term in months (once when the quote has no terms), excluding VAT.
--      Plan    private.ensure_billing_plan, then, unless item 1 already has an invoice (an archived draft counts: staff
--              discarded it), private.build_plan_item_invoice for it. A plan that is not active gets no new invoice.
--      Notice  one Finance notice to each login of private.billing_notice_users, linking to the quote, only when this call made
--              the draft. It names who can approve, and says the monthly invoices are made by hand when the quote has monthly
--              lines but no terms.
--    The quote is locked (for no key update) at the start; the caller already holds a stronger lock on it.
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
    insert into public.notifications (organization_id, user_id, title, body, category, href)
    select v_quote.organization_id, u.user_id, v_quote.client_name || ' accepted: first invoice ready to approve', v_body,
           'Finance', '/commercial/quotes/' || v_quote.id
    from private.billing_notice_users(v_quote.id) u;
  end if;
end $$;

revoke all on function private.billing_on_acceptance(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. private.decision_follow_ups: 20261020104000_quote_portal_follow_ups.sql, unchanged, plus the last block. For an acceptance
--    it calls private.billing_on_acceptance in a block of its own whose handler only raises a warning naming the response and
--    the error code (never the client's text): the subtransaction rolls the billing step's partial work back (the opportunity,
--    the plan, the draft, the notices) and the acceptance, the record and the notices above stand. A response is followed up
--    once (a replay of a decision records nothing and calls nothing), and the quote is already locked by portal_decide.
-- ---------------------------------------------------------------------------
create or replace function private.decision_follow_ups(p_response_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_response public.quote_responses%rowtype;
  v_quote public.quotes%rowtype;
  v_to record;
  v_text text;
begin
  -- What was decided, on which quote, and who is told.
  begin
    select * into strict v_response from public.quote_responses r where r.id = p_response_id;
    select * into strict v_quote from public.quotes q
     where q.id = v_response.quote_id and q.organization_id = v_response.organization_id;
    select * into strict v_to from private.decision_recipients(v_quote.id, v_response.link_id);
  exception when others then
    raise warning 'decision_follow_ups: response % could not be read (SQLSTATE %)', p_response_id, sqlstate;
    return;
  end;

  -- The notices.
  begin
    insert into public.notifications (organization_id, user_id, title, body, category, href)
    select v_response.organization_id, u.user_id,
           v_quote.client_name || case v_response.decision when 'accepted' then ' accepted' else ' declined' end
             || ' quotation ' || v_quote.quote_number,
           case v_response.decision
             when 'accepted' then 'Signed by ' || v_response.signatory_name || ', ' || v_response.signatory_position || '.'
             else v_response.signatory_name || ', ' || v_response.signatory_position
                  || '. Reason: ' || coalesce(v_response.decline_reason, 'none given') || '.'
           end,
           'Commercial', '/commercial/quotes/' || v_quote.id
    from (select distinct x.user_id
          from unnest(array[v_to.owner_user_id, v_to.sender_user_id]) as x(user_id)
          where x.user_id is not null) u;
  exception when others then
    raise warning 'decision_follow_ups: the notices for response % were not written (SQLSTATE %)', p_response_id, sqlstate;
  end;

  -- The decline recovery.
  if v_response.decision = 'declined' then
    begin
      v_text := case v_response.decline_reason
          when 'Budget considerations' then
            'Review whether a smaller, clearly scoped engagement could meet their most important need. Do not discount automatically.'
          when 'Timing is not right' then 'Offer to reconnect on a date the client chooses.'
          when 'Scope does not meet our requirements' then
            'Offer a discovery conversation and a revised quotation if the need can be met.'
          when 'Internal approval pending' then
            'Offer a concise business case, supporting documents or an executive conversation.'
          when 'Chose another provider' then 'Thank them and close the opportunity respectfully, no repeated contact.'
          else 'One courteous, optional follow-up if it suits the relationship.'
        end
        || E'\n\nReason given: ' || coalesce(v_response.decline_reason, 'none given') || '.'
        || coalesce(E'\n\nClient''s comments:\n' || v_response.decline_comments, '');

      if v_response.decline_reason = 'Chose another provider' then
        insert into public.activities (organization_id, kind, subject, body, details, opportunity_id, client_id, quote_id)
        values (
          v_response.organization_id, 'note',
          v_quote.client_name || ' declined quotation ' || v_quote.quote_number, v_text,
          jsonb_build_object('quote_id', v_quote.id, 'response_id', v_response.id),
          v_quote.opportunity_id,
          case when v_quote.opportunity_id is null then v_quote.client_id end,
          case when v_quote.opportunity_id is null and v_quote.client_id is null then v_quote.id end);
      else
        insert into public.tasks (
          organization_id, title, description, opportunity_id, client_id, assignee_id, priority, status, due_at)
        values (
          v_response.organization_id,
          'Follow up: ' || v_quote.client_name || ' declined quotation ' || v_quote.quote_number, v_text,
          v_quote.opportunity_id,
          case when v_quote.opportunity_id is null then v_quote.client_id end,
          coalesce(v_to.owner_member_id, v_to.sender_member_id),
          'Medium', 'Planned', now() + interval '3 days');
      end if;
    exception when others then
      raise warning 'decision_follow_ups: the decline recovery for response % was not written (SQLSTATE %)', p_response_id, sqlstate;
    end;
  end if;

  -- Billing: an accepted quote is billed when the organisation's switch is on (private.billing_on_acceptance returns without
  -- doing anything otherwise). Its own block, like the others: a failure rolls back what the billing step had done and only
  -- warns, naming the response and the error code, never any text from the client.
  if v_response.decision = 'accepted' then
    begin
      perform private.billing_on_acceptance(v_quote.id);
    exception when others then
      raise warning 'decision_follow_ups: the billing step for response % failed (SQLSTATE %)', p_response_id, sqlstate;
    end;
  end if;
end $$;

revoke all on function private.decision_follow_ups(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. public.billing_nightly: { "swept": n, "reminded": n }. Called by pg_cron as the database owner and, in tests, by the service
--    role; no signed-in role can call it. It touches only organisations whose switch is on.
--      Sweep     every Accepted, unarchived quote with an accepted response made at or after the time the switch was turned on
--                (billing_plans_enabled_at: an acceptance from before it, a quote accepted by hand, which has no response, and
--                a quote that is no longer Accepted are never swept), that has no plan and no live invoice. Each is handled in a
--                block of its own: the quote row is locked first (so the sweep waits for an acceptance or another sweep that
--                holds it), the conditions are read again under the lock, and then private.billing_on_acceptance runs; a failure
--                only warns (the quote's id and the error code, no text) and the sweep goes on. "swept" counts the quotes that
--                have a plan afterwards (a quote whose client is archived, or one that has no client yet, is passed over and
--                counted when it is billed).
--      Reminders each first item that is open and unapproved, of an active plan, whose invoice is still a Draft that has not
--                been archived, created at least two days ago and not reminded in the last two days (less an hour, so that a
--                run that starts a moment before its time two days after the last one still counts), gets one Finance notice
--                to each login of private.billing_notice_users, and approval_reminded_at is set to now. An item nobody could be
--                told about is not stamped. Items another run is working on are skipped, so two runs never remind twice.
--    The people are the same ones the acceptance told: the quote's owner and the member who sent the link.
-- ---------------------------------------------------------------------------
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
      insert into public.notifications (organization_id, user_id, title, body, category, href)
      select r.organization_id, u.user_id, 'First invoice for ' || q.client_name || ' is waiting for approval',
             'The draft invoice for quotation ' || q.quote_number
               || ' has not been approved yet. Check it, then press Approve and send. Only an owner or admin can approve it.',
             'Finance', '/commercial/quotes/' || q.id
      from public.quotes q
      cross join lateral private.billing_notice_users(q.id) u
      where q.id = r.quote_id and q.organization_id = r.organization_id;
      get diagnostics v_told = row_count;
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
-- The nightly job, after the overdue (22:05) and expiry (22:10) jobs: 22:20 UTC, which is 00:20 in South Africa. The same guard
-- as 20261011140000_payments_overdue.sql, so running this migration twice schedules it once.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'unison-billing-nightly') then
    perform cron.schedule('unison-billing-nightly', '20 22 * * *', 'select public.billing_nightly();');
  end if;
end;
$$;
