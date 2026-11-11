-- Accept to invoice, stage 4, task 3: the readiness rule and the start decision (spec section 8). The rule lives in this one function so
-- it can become a setting later: the work may start when the start date has arrived (or the quote has none) and the first invoice is
-- fully paid (status Paid, which only a recorded payment can bring about). An owner or admin can decide otherwise, quote by quote, with
-- a reason. Additive: nothing is changed for a quote that has no billing plan, and nothing is sent anywhere (not to HIVE either).
-- Append-only: earlier migrations are applied and are not edited.
--
-- public.billing_readiness(quote) returns jsonb, for any member of the quote's organisation:
--   { "state": "no_plan" | "ended" | "overridden" | "waiting_start" | "waiting_payment" | "ready",
--     "start_date": date | null,
--     "first_invoice": { "id", "number", "status", "balance", "currency" } | null,
--     "override": { "at", "by_name", "reason" } | null,
--     "onboarding_id": uuid | null }
--   in this order: no plan; an ended plan (a client left or the agreement changed: nothing will start from it); an override; the start
--   date later than the South African today; a first invoice that is absent, a Draft, Cancelled or not Paid; otherwise ready.
-- public.billing_set_readiness_override(quote, override, reason): owner or admin; setting needs a reason of 1 to 500 characters once
--   trimmed; setting again updates the reason; removing clears it; each change is on the quote's timeline, by the member.

create or replace function public.billing_readiness(p_quote_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_quote public.quotes%rowtype;
  v_plan public.billing_plans%rowtype;
  v_item public.billing_plan_items%rowtype;
  v_invoice public.invoices%rowtype;
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
  v_onboarding uuid;
  v_state text;
  v_first jsonb := null;
  v_override jsonb := null;
  v_by text;
begin
  select * into v_quote from public.quotes q where q.id = p_quote_id;
  if not found or not public.is_member_of(v_quote.organization_id) then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;
  select o.id into v_onboarding from public.client_onboardings o where o.quote_id = p_quote_id and o.organization_id = v_quote.organization_id;

  select * into v_plan from public.billing_plans p where p.quote_id = p_quote_id and p.organization_id = v_quote.organization_id;
  if not found then
    return jsonb_build_object('state', 'no_plan', 'start_date', null, 'first_invoice', null, 'override', null, 'onboarding_id', v_onboarding);
  end if;

  select * into v_item from public.billing_plan_items i where i.plan_id = v_plan.id and i.organization_id = v_plan.organization_id and i.kind = 'first';
  if found then
    -- An archived Draft is a discarded one: it is not the first invoice.
    select * into v_invoice from public.invoices x
    where x.billing_plan_item_id = v_item.id and x.organization_id = v_plan.organization_id and not (x.status = 'Draft' and x.archived_at is not null)
    order by x.created_at desc limit 1;
    if found then
      v_first := jsonb_build_object('id', v_invoice.id, 'number', v_invoice.invoice_number, 'status', v_invoice.status,
                                    'balance', v_invoice.balance_amount, 'currency', v_invoice.currency);
    end if;
  end if;

  if v_plan.readiness_override_at is not null then
    select t.full_name into v_by from public.team_members t
    where t.user_id = v_plan.readiness_override_by and t.organization_id = v_plan.organization_id
    order by t.created_at limit 1;
    v_override := jsonb_build_object('at', v_plan.readiness_override_at, 'by_name', nullif(btrim(coalesce(v_by, '')), ''), 'reason', v_plan.readiness_override_reason);
  end if;

  if v_plan.status = 'ended' then
    v_state := 'ended';
  elsif v_override is not null then
    v_state := 'overridden';
  elsif v_plan.start_date is not null and v_plan.start_date > v_today then
    v_state := 'waiting_start';
  elsif v_first is null or (v_first ->> 'status') <> 'Paid' then
    v_state := 'waiting_payment';
  else
    v_state := 'ready';
  end if;

  return jsonb_build_object('state', v_state, 'start_date', v_plan.start_date, 'first_invoice', v_first, 'override', v_override, 'onboarding_id', v_onboarding);
end $$;

revoke all on function public.billing_readiness(uuid) from public, anon;
grant execute on function public.billing_readiness(uuid) to authenticated;

create or replace function public.billing_set_readiness_override(p_quote_id uuid, p_override boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_quote public.quotes%rowtype;
  v_plan public.billing_plans%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_quote from public.quotes q where q.id = p_quote_id;
  if not found or not public.is_member_of(v_quote.organization_id) then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;
  if not public.has_role(v_quote.organization_id, array['owner', 'admin']) then
    raise exception 'BILLING_PLAN_ADMIN_ONLY' using errcode = '23514';
  end if;
  select * into v_plan from public.billing_plans p where p.quote_id = p_quote_id and p.organization_id = v_quote.organization_id for update;
  if not found then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;
  if p_override is null or char_length(v_reason) > 500 or (p_override and v_reason = '') then
    raise exception 'BILLING_REASON_REQUIRED' using errcode = '23514';
  end if;

  if p_override then
    update public.billing_plans p set
      readiness_override_at = now(), readiness_override_by = (select auth.uid()), readiness_override_reason = v_reason
    where p.id = v_plan.id;
  else
    if v_plan.readiness_override_at is null then
      return;
    end if;
    update public.billing_plans p set readiness_override_at = null, readiness_override_by = null, readiness_override_reason = null where p.id = v_plan.id;
  end if;

  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_quote.organization_id, 'billing.readiness_overridden',
          case when p_override then 'Start decided despite waiting: ' || v_reason else 'Start decision removed' end,
          jsonb_build_object('quote_id', p_quote_id, 'override', p_override),
          public.activity_actor(v_quote.organization_id), p_quote_id);
end $$;

revoke all on function public.billing_set_readiness_override(uuid, boolean, text) from public, anon;
grant execute on function public.billing_set_readiness_override(uuid, boolean, text) to authenticated;
