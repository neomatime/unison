-- Accept to invoice, stage 3, task 2: the database chooses, claims and records payment reminders. Everything here is for the billing
-- runner, which has no signed-in user: the public functions are granted to the service role alone. Nothing runs until an
-- organisation turns on both billing_plans_enabled and billing_reminders_enabled (both default to false).
-- Append-only: earlier migrations are applied and are not edited.
--
-- private.billing_check_email_record   the address, subject and hash rules public.record_document_email applies, in one place for the
--                                      reminder record.
-- private.billing_reminder_next        the one place that says whether an invoice is due a reminder, and which (spec section 6).
-- public.billing_reminder_candidates   what the runner should work on, oldest due date first. (p_on, on this and the two functions
--                                      around it, is a test seam: the day to evaluate; the runner passes none.)
-- public.billing_reminder_claim        locks one invoice, re-checks, and claims the next reminder for ten minutes.
-- public.billing_reminder_record       records the reminder the runner sent; the fifth also tells the owner and makes a follow-up task.
-- public.billing_reminder_release      gives an unsent claim back.
-- private.billing_notify               replaced: the notice's email is also queued when only reminders are switched on.
--
-- The rules (spec section 6 and the plan's calls 1 to 5):
--  * only plan invoices (linked to a billing plan item), only while Issued, Partially Paid or Overdue with a balance, so a recorded
--    payment in full ends reminders at once and a part payment keeps them going for the balance;
--  * only invoices whose due date falls on or after the South African day the reminders switch was turned on (nothing retroactive);
--  * the item must be open and its reminders not paused by a person;
--  * reminder n is due on due date + 3 + 7 x (n - 1) days; the next one to send is the first not yet sent, one per invoice per run;
--  * the unique key (invoice, sequence) and the ten-minute claim mean a reminder is never sent twice.

-- ---------------------------------------------------------------------------
-- 1. The email record rules.
-- ---------------------------------------------------------------------------
create or replace function private.billing_check_email_record(p_to text, p_subject text, p_sha256 text, p_bytes integer) returns void
language plpgsql immutable set search_path = '' as $$
declare
  v_to text := btrim(coalesce(p_to, ''));
  v_subject text := btrim(coalesce(p_subject, ''));
begin
  -- One plain ASCII address: no display name, no list, no whitespace, no control characters.
  if char_length(v_to) > 254
     or v_to !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?[.])+[A-Za-z]{2,}$'
     or v_to ~ '(^[.]|[.]@|[.][.])' then
    raise exception 'EMAIL_ADDRESS_INVALID' using errcode = '23514';
  end if;
  if char_length(v_subject) not between 1 and 300
     or position(chr(10) in v_subject) > 0 or position(chr(13) in v_subject) > 0 then
    raise exception 'EMAIL_SUBJECT_INVALID' using errcode = '23514';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_bytes is null or p_bytes < 1 or p_bytes > 20000000 then
    raise exception 'EMAIL_RECORD_INVALID' using errcode = '23514';
  end if;
end $$;

revoke all on function private.billing_check_email_record(text, text, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Which reminder is due.
-- ---------------------------------------------------------------------------
create or replace function private.billing_reminder_next(p_invoice_id uuid, p_on date default null) returns smallint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_invoice public.invoices%rowtype;
  v_settings public.organization_settings%rowtype;
  v_item public.billing_plan_items%rowtype;
  -- The South African day. p_on lets a test ask what would be due on another day; the runner never passes it.
  v_today date := coalesce(p_on, (now() at time zone 'Africa/Johannesburg')::date);
  v_sent integer;
  v_next integer;
  v_attempts smallint;
begin
  select * into v_invoice from public.invoices i where i.id = p_invoice_id;
  if not found or v_invoice.billing_plan_item_id is null then
    return null;
  end if;
  if v_invoice.status not in ('Issued', 'Partially Paid', 'Overdue') or v_invoice.balance_amount <= 0 or v_invoice.due_date is null then
    return null;
  end if;

  select * into v_settings from public.organization_settings s where s.organization_id = v_invoice.organization_id;
  if not found or not v_settings.billing_plans_enabled or not v_settings.billing_reminders_enabled
     or v_settings.billing_reminders_enabled_at is null then
    return null;
  end if;
  -- Nothing retroactive: an invoice due before the day the switch was turned on is never reminded.
  if v_invoice.due_date < (v_settings.billing_reminders_enabled_at at time zone 'Africa/Johannesburg')::date then
    return null;
  end if;

  select * into v_item from public.billing_plan_items i
  where i.id = v_invoice.billing_plan_item_id and i.organization_id = v_invoice.organization_id;
  if not found or v_item.status <> 'open' or v_item.reminders_paused_at is not null then
    return null;
  end if;

  select count(*) into v_sent from public.billing_reminders r where r.invoice_id = p_invoice_id and r.sent_at is not null;
  v_next := v_sent + 1;
  if v_next > 5 or v_today < v_invoice.due_date + (3 + 7 * (v_next - 1)) then
    return null;
  end if;

  select r.attempts into v_attempts from public.billing_reminders r
  where r.invoice_id = p_invoice_id and r.sequence = v_next and r.sent_at is null;
  if v_attempts is not null and v_attempts >= 5 then
    return null;
  end if;
  return v_next::smallint;
end $$;

revoke all on function private.billing_reminder_next(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. What the runner should work on.
-- ---------------------------------------------------------------------------
create or replace function public.billing_reminder_candidates(p_limit integer, p_on date default null) returns table (invoice_id uuid, sequence smallint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'LIMIT_INVALID' using errcode = '22023';
  end if;
  return query
  select d.id, d.next_sequence
  from (
    select i.id, i.due_date, private.billing_reminder_next(i.id, p_on) as next_sequence
    from public.invoices i
    where i.billing_plan_item_id is not null
      and i.status in ('Issued', 'Partially Paid', 'Overdue') and i.balance_amount > 0
  ) d
  where d.next_sequence is not null
  order by d.due_date, d.id
  limit p_limit;
end $$;

revoke all on function public.billing_reminder_candidates(integer, date) from public, anon, authenticated;
grant execute on function public.billing_reminder_candidates(integer, date) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Claim the next reminder of one invoice.
-- ---------------------------------------------------------------------------
create or replace function public.billing_reminder_claim(p_invoice_id uuid, p_on date default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices%rowtype;
  v_item public.billing_plan_items%rowtype;
  v_quote public.quotes%rowtype;
  v_owner record;
  v_company text;
  v_sequence smallint;
  v_claimed timestamptz;
  v_inserted integer;
begin
  if not exists (select 1 from public.invoices i where i.id = p_invoice_id) then
    return jsonb_build_object('state', 'skipped');
  end if;
  -- A row another run holds is that run's: this one waits for nothing.
  select * into v_invoice from public.invoices i where i.id = p_invoice_id for update skip locked;
  if not found then
    return jsonb_build_object('state', 'busy');
  end if;
  v_sequence := private.billing_reminder_next(p_invoice_id, p_on);
  if v_sequence is null then
    return jsonb_build_object('state', 'skipped');
  end if;

  select r.claimed_until into v_claimed from public.billing_reminders r
  where r.invoice_id = p_invoice_id and r.sequence = v_sequence and r.sent_at is null;
  if found then
    if v_claimed is not null and v_claimed > now() then
      return jsonb_build_object('state', 'busy');
    end if;
    update public.billing_reminders r set claimed_until = now() + interval '10 minutes'
    where r.invoice_id = p_invoice_id and r.sequence = v_sequence and r.sent_at is null;
  else
    insert into public.billing_reminders (organization_id, invoice_id, sequence, claimed_until)
    values (v_invoice.organization_id, p_invoice_id, v_sequence, now() + interval '10 minutes')
    on conflict (invoice_id, sequence) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      return jsonb_build_object('state', 'busy');
    end if;
  end if;

  select * into v_quote from public.quotes q where q.id = v_invoice.quote_id;
  select t.email, t.full_name into v_owner from public.team_members t
  where t.id = v_quote.owner_id and t.organization_id = v_invoice.organization_id and t.archived_at is null;
  select s.legal_name into v_company from public.organization_settings s where s.organization_id = v_invoice.organization_id;
  select * into v_item from public.billing_plan_items i where i.id = v_invoice.billing_plan_item_id;

  return jsonb_build_object(
    'state', 'ready',
    'invoice_id', p_invoice_id,
    'sequence', v_sequence,
    'to', private.billing_client_email(p_invoice_id),
    'reply_to', v_owner.email,
    'sender_name', coalesce(nullif(btrim(v_owner.full_name), ''), v_company),
    'number', v_invoice.invoice_number,
    'balance', v_invoice.balance_amount,
    'currency', v_invoice.currency,
    'due_date', v_invoice.due_date,
    'month_number', v_item.month_number);
end $$;

revoke all on function public.billing_reminder_claim(uuid, date) from public, anon, authenticated;
grant execute on function public.billing_reminder_claim(uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Record what was sent.
-- ---------------------------------------------------------------------------
create or replace function public.billing_reminder_record(
  p_invoice_id uuid, p_sequence smallint, p_to text, p_subject text, p_sha256 text, p_bytes integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices%rowtype;
  v_row public.billing_reminders%rowtype;
  v_quote public.quotes%rowtype;
  v_to text := btrim(coalesce(p_to, ''));
begin
  select * into v_invoice from public.invoices i where i.id = p_invoice_id for update;
  if not found then
    raise exception 'BILLING_REMINDER_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_row from public.billing_reminders r
  where r.invoice_id = p_invoice_id and r.sequence = p_sequence and r.sent_at is null for update;
  if not found then
    raise exception 'BILLING_REMINDER_NOT_FOUND' using errcode = '42501';
  end if;

  perform private.billing_check_email_record(p_to, p_subject, p_sha256, p_bytes);

  update public.billing_reminders r set
    sent_at = now(), to_address = v_to, subject = btrim(p_subject), balance_at_send = v_invoice.balance_amount,
    pdf_sha256 = p_sha256, claimed_until = null
  where r.id = v_row.id;

  if v_invoice.client_id is not null then
    insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
    values (v_invoice.organization_id, 'invoice.reminder_sent',
            'Reminder ' || p_sequence || ' of 5 sent for invoice ' || v_invoice.invoice_number || ' to ' || v_to,
            jsonb_build_object('document_id', p_invoice_id, 'number', v_invoice.invoice_number, 'to', v_to,
                               'sequence', p_sequence, 'balance', v_invoice.balance_amount),
            public.activity_actor(v_invoice.organization_id), v_invoice.client_id);
  end if;

  -- After the last reminder the owner is told, once, and gets one task to follow up personally. This runs only the one time the fifth
  -- reminder is recorded (a recorded sequence cannot be recorded again), in a block whose failure only warns.
  if p_sequence = 5 then
    begin
      select * into v_quote from public.quotes q where q.id = v_invoice.quote_id;
      perform private.billing_notify(v_invoice.organization_id, v_invoice.quote_id,
        v_invoice.client_name || ' has not paid invoice ' || v_invoice.invoice_number || ' after five reminders',
        'The reminders have finished. Please follow up with the client yourself.');
      insert into public.tasks (organization_id, title, description, client_id, assignee_id, priority, status, due_at)
      values (v_invoice.organization_id, 'Follow up: ' || v_invoice.client_name || ' has not paid invoice ' || v_invoice.invoice_number,
              'Five payment reminders were sent for invoice ' || v_invoice.invoice_number || '. Contact the client about the balance still owing.',
              v_invoice.client_id, v_quote.owner_id, 'High', 'Planned', now() + interval '3 days');
    exception when others then
      raise warning 'billing_reminder_record: the follow-up for invoice % failed (SQLSTATE %)', p_invoice_id, sqlstate;
    end;
  end if;
  return v_row.id;
end $$;

revoke all on function public.billing_reminder_record(uuid, smallint, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.billing_reminder_record(uuid, smallint, text, text, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Give a claim back.
-- ---------------------------------------------------------------------------
create or replace function public.billing_reminder_release(p_invoice_id uuid, p_sequence smallint, p_count_attempt boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.billing_reminders r set
    claimed_until = null,
    attempts = case when p_count_attempt then least(r.attempts + 1, 100) else r.attempts end
  where r.invoice_id = p_invoice_id and r.sequence = p_sequence and r.sent_at is null;
end $$;

revoke all on function public.billing_reminder_release(uuid, smallint, boolean) from public, anon, authenticated;
grant execute on function public.billing_reminder_release(uuid, smallint, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 7. The notice's email: queued when automatic sending or reminders are on.
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
    where s.organization_id = p_organization_id and s.billing_plans_enabled
      and (s.billing_auto_send_enabled or s.billing_reminders_enabled)) then
    insert into public.billing_notice_emails (organization_id, user_id, quote_id, subject, body)
    select p_organization_id, u.user_id, p_quote_id, left(p_title, 300), left(p_body, 4000)
    from private.billing_notice_users(p_quote_id) u;
  end if;
  return v_told;
end $$;

revoke all on function private.billing_notify(uuid, uuid, text, text) from public, anon, authenticated;
