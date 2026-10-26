-- Accept to invoice, stage 1, task 4: the state of a billing plan. An owner or admin pauses, resumes or ends a plan, and the
-- database pauses a plan by itself when the quote it bills stops being Accepted or is archived, or when its client is
-- archived. Nothing here changes behaviour while the switch (organization_settings.billing_plans_enabled, default false) is
-- off: a plan exists only after the switch was on, so with no plan the two triggers find nothing and write nothing, and no
-- other function here is reachable from an existing screen.
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. private.billing_notice_users(quote): the logins to tell about a quote's billing. Not callable by any role.
-- 2. private.billing_plan_auto_pause(plan, reason): what the two triggers share. Not callable by any role.
-- 3. public.billing_plans_watch_quote() and public.billing_plans_watch_client(), with their triggers.
-- 4. public.billing_plan_set_state(plan, action, reason): the person's way to pause, resume or end a plan.
--
-- Lock order, the same in every billing function: the client row (shared, only to resume), then the quote row, then the plan
-- row, then the items, then invoices. create_plan_item_invoice, create_invoice_from_quote and approve_first_invoice take the
-- quote row first; the quote triggers run with the quote row already locked by the update that fired them; the client trigger
-- runs with the client row already locked by its update and takes the quote before the plan. So a pause, an ending or an
-- archiving that races a create or an approval is served before or after it, and nothing waits in a circle.
--
-- Dates are South African days where a date is needed; none is needed here. Money is never touched.

-- ---------------------------------------------------------------------------
-- 1. Who is told. The quote owner's login and the login of the member who made the link of the latest accepted response,
--    both through private.decision_recipients (20261020104000_quote_portal_follow_ups.sql), so an archived team member is
--    passed over exactly as it is there. With no accepted response the link is null and only the owner's login remains. One
--    row per login, never a null. Definer, so it reads the response whatever the caller; never granted.
-- ---------------------------------------------------------------------------
create or replace function private.billing_notice_users(p_quote_id uuid) returns table (user_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct x.user_id
  from public.quotes q
  left join lateral (
    select r.link_id
    from public.quote_responses r
    where r.quote_id = q.id and r.organization_id = q.organization_id and r.decision = 'accepted'
    order by r.decided_at desc, r.id desc
    limit 1) a on true
  cross join lateral private.decision_recipients(q.id, a.link_id) d
  cross join lateral unnest(array[d.owner_user_id, d.sender_user_id]) as x(user_id)
  where q.id = p_quote_id and x.user_id is not null
$$;

revoke all on function private.billing_notice_users(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A pause the database makes. Locks the plan's quote and then the plan, and only an active plan is touched: a plan that is
--    paused or ended, or one that is gone, is left exactly as it is, with nothing written and nobody told. Otherwise the plan
--    is paused with the reason, the quote's timeline gets billing.plan_changed (by the member who made the change, or nobody
--    when the service role did), and the people from billing_notice_users get a Finance notice that links to the quote. The
--    notices are written in a block of their own whose failure only warns (SQLSTATE, never text), so a notice that cannot be
--    written never undoes the change to the quote or the client that caused the pause. Nothing else changes: the items, the
--    invoices and the quote stay as they are, and resuming is always a person's decision.
-- ---------------------------------------------------------------------------
create or replace function private.billing_plan_auto_pause(p_plan_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_quote_id uuid;
  v_quote public.quotes%rowtype;
  v_plan public.billing_plans%rowtype;
begin
  select p.quote_id into v_quote_id from public.billing_plans p where p.id = p_plan_id;
  if not found then
    return;
  end if;
  select * into v_quote from public.quotes q where q.id = v_quote_id for no key update;
  if not found then
    return;
  end if;
  update public.billing_plans p set status = 'paused', status_reason = p_reason
  where p.id = p_plan_id and p.status = 'active'
  returning p.* into v_plan;
  if not found then
    return;
  end if;

  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_plan.organization_id, 'billing.plan_changed', 'Billing plan paused: ' || p_reason,
          jsonb_build_object('plan_id', v_plan.id, 'quote_id', v_plan.quote_id, 'action', 'pause', 'status', 'paused',
                             'reason', p_reason, 'automatic', true),
          public.activity_actor(v_plan.organization_id), v_plan.quote_id);

  begin
    insert into public.notifications (organization_id, user_id, title, body, category, href)
    select v_plan.organization_id, u.user_id, 'Billing plan paused for ' || v_quote.client_name,
           p_reason || '. Nothing will be invoiced until an owner or admin resumes it.',
           'Finance', '/commercial/quotes/' || v_quote.id
    from private.billing_notice_users(v_quote.id) u;
  exception when others then
    raise warning 'billing_plan_auto_pause: the notices for plan % were not written (SQLSTATE %)', p_plan_id, sqlstate;
  end;
end $$;

revoke all on function private.billing_plan_auto_pause(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The two watchers. Both run as the owner (the tables have no write grant for a signed-in role) in the transaction of the
--    update that fired them, after it, for each row. They never raise for a quote or a client that has no plan.
--      Quote: its status changed to anything but Accepted ("Quote moved to <status>"), or it was archived ("Quote archived");
--        when both happen in one update the status is the reason given.
--      Client: it was archived ("Client archived"); every active plan of that client, in the order of their quotes.
--    The WHEN clause keeps both from running for any other update. Trigger columns: quotes (status, archived_at) and clients
--    (archived_at).
-- ---------------------------------------------------------------------------
create or replace function public.billing_plans_watch_quote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
  v_reason text;
begin
  if new.status is distinct from old.status and new.status <> 'Accepted' then
    v_reason := 'Quote moved to ' || new.status;
  elsif old.archived_at is null and new.archived_at is not null then
    v_reason := 'Quote archived';
  else
    return new;
  end if;
  select p.id into v_plan from public.billing_plans p
  where p.quote_id = new.id and p.organization_id = new.organization_id and p.status = 'active';
  if found then
    perform private.billing_plan_auto_pause(v_plan, v_reason);
  end if;
  return new;
end $$;

revoke all on function public.billing_plans_watch_quote() from public, anon, authenticated;

create trigger billing_plans_watch_quote after update of status, archived_at on public.quotes
  for each row
  when ((new.status is distinct from old.status and new.status <> 'Accepted') or (old.archived_at is null and new.archived_at is not null))
  execute function public.billing_plans_watch_quote();

create or replace function public.billing_plans_watch_client() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
begin
  if old.archived_at is null and new.archived_at is not null then
    for v_plan in
      select p.id from public.billing_plans p
      where p.client_id = new.id and p.organization_id = new.organization_id and p.status = 'active'
      order by p.quote_id
    loop
      perform private.billing_plan_auto_pause(v_plan, 'Client archived');
    end loop;
  end if;
  return new;
end $$;

revoke all on function public.billing_plans_watch_client() from public, anon, authenticated;

create trigger billing_plans_watch_client after update of archived_at on public.clients
  for each row
  when (old.archived_at is null and new.archived_at is not null)
  execute function public.billing_plans_watch_client();

-- ---------------------------------------------------------------------------
-- 4. A person pauses, resumes or ends a plan. In order: the plan exists in an organisation the caller belongs to (a caller who
--    is not a member and a plan that does not exist get the same answer, before anything else is said); the caller is an owner
--    or admin; the action is one of the three; pause and end have a reason of 1 to 500 characters once trimmed (a reason that
--    is given to resume is held to the 500 as well and is kept on the timeline). Then the locks in the order above and the
--    plan is read again under them.
--      pause   the plan must be active (BILLING_PLAN_NOT_ACTIVE); it becomes paused with the reason.
--      resume  the plan must be paused: an ended plan never resumes (BILLING_PLAN_ENDED), and an active one has nothing to
--              resume (BILLING_PLAN_CANNOT_RESUME). Its quote must be Accepted and unarchived, its client there and not
--              archived, and the switch on, else BILLING_PLAN_CANNOT_RESUME. It becomes active and its reason is cleared.
--      end     the plan must not be ended already (BILLING_PLAN_NOT_ACTIVE); it becomes ended with the reason, and every open
--              item that has no invoice is cancelled with the same reason. An item keeps its month when an invoice is linked
--              to it, a Cancelled one included; an archived Draft is a discarded one (private.build_plan_item_invoice lets
--              the month go in the same way), so its item is cancelled too. No invoice is touched, issued, cancelled or
--              unlinked. It cannot be undone.
--    Each change writes billing.plan_changed on the quote ("Billing plan paused: <reason>", "Billing plan resumed", "Billing
--    plan ended: <reason>") with the plan, the action, the new status and the reason in its details. A refusal writes nothing.
--    Pausing and ending work whatever the switch says; only resuming needs it on.
-- ---------------------------------------------------------------------------
create or replace function public.billing_plan_set_state(p_plan_id uuid, p_action text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.billing_plans%rowtype;
  v_quote public.quotes%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''), E' \t\r\n');
  v_status text;
  v_subject text;
begin
  select * into v_plan from public.billing_plans p where p.id = p_plan_id;
  if not found or not public.is_member_of(v_plan.organization_id) then
    raise exception 'BILLING_PLAN_NOT_FOUND' using errcode = '42501';
  end if;
  if not public.has_role(v_plan.organization_id, array['owner', 'admin']) then
    raise exception 'BILLING_PLAN_ADMIN_ONLY' using errcode = '23514';
  end if;
  if p_action is null or p_action not in ('pause', 'resume', 'end') then
    raise exception 'BILLING_PLAN_ACTION_INVALID' using errcode = '23514';
  end if;
  if (p_action in ('pause', 'end') and v_reason = '') or char_length(v_reason) > 500 then
    raise exception 'BILLING_REASON_REQUIRED' using errcode = '23514';
  end if;

  -- The locks: the client (shared, so an archiving of it waits for this call or is waited for), the quote, then the plan.
  if p_action = 'resume' and v_plan.client_id is not null then
    perform 1 from public.clients c where c.id = v_plan.client_id and c.organization_id = v_plan.organization_id for share;
  end if;
  select * into v_quote from public.quotes q where q.id = v_plan.quote_id for no key update;
  if not found then
    raise exception 'BILLING_PLAN_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_plan from public.billing_plans p where p.id = p_plan_id for update;
  if not found then
    raise exception 'BILLING_PLAN_NOT_FOUND' using errcode = '42501';
  end if;

  if p_action = 'pause' then
    if v_plan.status <> 'active' then
      raise exception 'BILLING_PLAN_NOT_ACTIVE' using errcode = '23514';
    end if;
    update public.billing_plans p set status = 'paused', status_reason = v_reason where p.id = v_plan.id;
    v_status := 'paused';
    v_subject := 'Billing plan paused: ' || v_reason;
  elsif p_action = 'resume' then
    if v_plan.status = 'ended' then
      raise exception 'BILLING_PLAN_ENDED' using errcode = '23514';
    end if;
    if v_plan.status <> 'paused'
       or v_quote.status <> 'Accepted'
       or v_quote.archived_at is not null
       or v_plan.client_id is null
       or not exists (
         select 1 from public.clients c
         where c.id = v_plan.client_id and c.organization_id = v_plan.organization_id and c.archived_at is null)
       or not coalesce((select s.billing_plans_enabled from public.organization_settings s where s.organization_id = v_plan.organization_id), false)
    then
      raise exception 'BILLING_PLAN_CANNOT_RESUME' using errcode = '23514';
    end if;
    update public.billing_plans p set status = 'active', status_reason = null where p.id = v_plan.id;
    v_status := 'active';
    v_subject := 'Billing plan resumed';
  else
    if v_plan.status = 'ended' then
      raise exception 'BILLING_PLAN_NOT_ACTIVE' using errcode = '23514';
    end if;
    update public.billing_plans p set status = 'ended', status_reason = v_reason where p.id = v_plan.id;
    update public.billing_plan_items i set status = 'cancelled', cancelled_reason = v_reason
    where i.plan_id = v_plan.id and i.organization_id = v_plan.organization_id and i.status = 'open'
      and not exists (
        select 1 from public.invoices v
        where v.billing_plan_item_id = i.id and v.organization_id = v_plan.organization_id
          and not (v.status = 'Draft' and v.archived_at is not null));
    v_status := 'ended';
    v_subject := 'Billing plan ended: ' || v_reason;
  end if;

  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_plan.organization_id, 'billing.plan_changed', v_subject,
          jsonb_build_object('plan_id', v_plan.id, 'quote_id', v_plan.quote_id, 'action', p_action, 'status', v_status,
                             'reason', nullif(v_reason, ''), 'automatic', false),
          public.activity_actor(v_plan.organization_id), v_plan.quote_id);
end $$;

revoke all on function public.billing_plan_set_state(uuid, text, text) from public, anon;
grant execute on function public.billing_plan_set_state(uuid, text, text) to authenticated;
