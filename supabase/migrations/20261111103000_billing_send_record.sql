-- Accept to invoice, stage 2, task 4: sending a month the system has issued. Three functions for the billing runner, granted to the
-- service role alone; nothing runs until an organisation turns on both billing_plans_enabled and billing_auto_send_enabled.
-- Append-only: earlier migrations are applied and are not edited.
--
-- public.billing_send_context          leases an issued, unemailed month for ten minutes and says who to write to.
-- public.billing_record_send           records the email the runner sent (document_emails, no sender, the timeline entry).
-- public.billing_record_send_failure   counts a failed attempt, holds the month as EMAIL_FAILED, and tells the people on the first
--                                      failure and on giving up (the fifth), never in between.
--
-- A month is only ever emailed by the runner when the system issued it (system_issued_at): an invoice a person issued by hand is
-- that person's to email.

-- ---------------------------------------------------------------------------
-- 1. The lease and the context.
-- ---------------------------------------------------------------------------
create or replace function public.billing_send_context(p_item_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.billing_plan_items%rowtype;
  v_invoice uuid;
  v_quote public.quotes%rowtype;
  v_owner record;
  v_company text;
  v_term smallint;
begin
  if not exists (select 1 from public.billing_plan_items i where i.id = p_item_id) then
    return jsonb_build_object('state', 'skipped');
  end if;
  -- A row another run holds is that run's: this one waits for nothing.
  select * into v_item from public.billing_plan_items i where i.id = p_item_id for update skip locked;
  if not found then
    return jsonb_build_object('state', 'busy');
  end if;
  if v_item.send_lease_until is not null and v_item.send_lease_until > now() then
    return jsonb_build_object('state', 'busy');
  end if;
  if not private.billing_item_due_for_send(p_item_id) then
    return jsonb_build_object('state', 'skipped');
  end if;

  select v.id into v_invoice from public.invoices v
  where v.billing_plan_item_id = p_item_id and v.status not in ('Draft', 'Cancelled');
  select * into v_quote from public.quotes q where q.id = v_item.quote_id;
  select t.email, t.full_name into v_owner from public.team_members t
  where t.id = v_quote.owner_id and t.organization_id = v_quote.organization_id and t.archived_at is null;
  select s.legal_name into v_company from public.organization_settings s where s.organization_id = v_item.organization_id;
  select p.term_months into v_term from public.billing_plans p where p.id = v_item.plan_id;

  update public.billing_plan_items i set send_lease_until = now() + interval '10 minutes' where i.id = p_item_id;

  return jsonb_build_object(
    'state', 'ready',
    'invoice_id', v_invoice,
    'organization_id', v_item.organization_id,
    'to', private.billing_client_email(v_invoice),
    'reply_to', v_owner.email,
    'sender_name', coalesce(nullif(btrim(v_owner.full_name), ''), v_company),
    'month_number', v_item.month_number,
    'term_months', v_term);
end $$;

revoke all on function public.billing_send_context(uuid) from public, anon, authenticated;
grant execute on function public.billing_send_context(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Recording what was sent.
-- ---------------------------------------------------------------------------
create or replace function public.billing_record_send(
  p_item_id uuid, p_to text, p_subject text, p_body text, p_sha256 text, p_bytes integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.billing_plan_items%rowtype;
  v_invoice uuid;
  v_email uuid;
begin
  select * into v_item from public.billing_plan_items i where i.id = p_item_id for update;
  if not found or v_item.system_issued_at is null then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;
  select v.id into v_invoice from public.invoices v
  where v.billing_plan_item_id = p_item_id and v.status not in ('Draft', 'Cancelled');
  -- A message that went out is recorded even if a switch was turned off a moment ago; one that was already recorded is not again.
  if v_invoice is null or exists (select 1 from public.document_emails e where e.invoice_id = v_invoice) then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;

  v_email := private.record_document_email_core('invoice', v_invoice, p_to, p_subject, p_body, p_sha256, p_bytes);

  update public.billing_plan_items i set
    send_lease_until = null, send_attempts = 0,
    attention_code = case when i.attention_code = 'EMAIL_FAILED' then null else i.attention_code end,
    attention_detail = case when i.attention_code = 'EMAIL_FAILED' then null else i.attention_detail end,
    attention_notified_at = case when i.attention_code = 'EMAIL_FAILED' then null else i.attention_notified_at end
  where i.id = p_item_id;
  return v_email;
end $$;

revoke all on function public.billing_record_send(uuid, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.billing_record_send(uuid, text, text, text, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. A failed attempt.
-- ---------------------------------------------------------------------------
create or replace function public.billing_record_send_failure(p_item_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.billing_plan_items%rowtype;
  v_quote public.quotes%rowtype;
  v_attempts integer;
  v_gave_up boolean;
  v_first boolean;
begin
  if p_code is null or p_code not in ('MAIL_REJECTED', 'PDF_FAILED', 'NO_ADDRESS', 'NOT_CONFIGURED') then
    raise exception 'BILLING_FAILURE_CODE_INVALID' using errcode = '22023';
  end if;
  select * into v_item from public.billing_plan_items i where i.id = p_item_id for update;
  if not found or v_item.system_issued_at is null then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;

  v_attempts := least(v_item.send_attempts + 1, 100);
  v_gave_up := v_attempts >= 5;
  v_first := v_item.attention_code is distinct from 'EMAIL_FAILED' or v_item.attention_notified_at is null;

  update public.billing_plan_items i set
    send_attempts = v_attempts, send_lease_until = null,
    attention_code = 'EMAIL_FAILED', attention_detail = p_code,
    attention_notified_at = case when v_first or v_gave_up then now() else i.attention_notified_at end
  where i.id = p_item_id;

  if (v_first and not v_gave_up) or v_gave_up then
    select * into v_quote from public.quotes q where q.id = v_item.quote_id;
    insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
    values (v_item.organization_id, 'billing.item_held',
            case when v_gave_up then 'Month ' || v_item.month_number || ' could not be emailed and will not be retried'
                 else 'Month ' || v_item.month_number || ' could not be emailed' end,
            jsonb_build_object('billing_plan_item_id', p_item_id, 'month_number', v_item.month_number, 'reason', 'EMAIL_FAILED', 'code', p_code, 'attempts', v_attempts),
            public.activity_actor(v_item.organization_id), v_item.quote_id);
    begin
      perform private.billing_notify(v_item.organization_id, v_item.quote_id,
        case when v_gave_up then 'Month ' || v_item.month_number || ' for ' || v_quote.client_name || ' will not be retried'
             else 'Month ' || v_item.month_number || ' for ' || v_quote.client_name || ' could not be emailed' end,
        case when v_gave_up
             then 'Invoice for month ' || v_item.month_number || ' of quotation ' || v_quote.quote_number
                  || ' was issued but could not be emailed after ' || v_attempts || ' tries. Send it from the invoice page.'
             else 'Invoice for month ' || v_item.month_number || ' of quotation ' || v_quote.quote_number
                  || ' was issued but the email did not go. It will be tried again on the next run.' end);
    exception when others then
      raise warning 'billing_record_send_failure: the notice for plan item % failed (SQLSTATE %)', p_item_id, sqlstate;
    end;
  end if;

  return jsonb_build_object('attempts', v_attempts, 'gave_up', v_gave_up);
end $$;

revoke all on function public.billing_record_send_failure(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_record_send_failure(uuid, text) to service_role;
