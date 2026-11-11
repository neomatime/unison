-- Accept to invoice, stage 3, task 1: the schema for payment reminders. Everything here is additive and inert until the new switch
-- (organization_settings.billing_reminders_enabled, default false) is turned on, and nothing reads it yet.
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. The switch and its time. public.organization_settings_billing_stamp() (last defined in 20261111100000_billing_auto_send_schema.sql)
--    now stamps billing_reminders_enabled_at with the rules it already applies to the other two switches: stamped on a switch from
--    off to on (and on an insert that is on), null when off, otherwise the old time is kept; a typed value is overwritten.
-- 2. Pause state on the plan item: a person's recorded decision to stop reminders on one invoice, with a reason. It lives on the plan
--    item (a table only definer functions write), not on the invoice, which signed-in roles cannot change once it is issued.
-- 3. public.billing_reminders: one row per reminder of an invoice (sequence 1 to 5). The unique key (invoice, sequence) is what makes
--    a reminder impossible to send twice. A row is first a claim (claimed_until, no sent_at) and becomes a sent reminder only when the
--    mail server accepted it. Members of the organisation read; nobody signed in writes.
-- 4. The activity vocabulary: the newest list (20261111100000) plus invoice.reminder_sent and billing.reminders_changed, in that order.

-- ---------------------------------------------------------------------------
-- 1. The switch.
-- ---------------------------------------------------------------------------
alter table public.organization_settings
  add column billing_reminders_enabled boolean not null default false,
  add column billing_reminders_enabled_at timestamptz;

create or replace function public.organization_settings_billing_stamp() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not new.billing_plans_enabled then
    new.billing_plans_enabled_at := null;
  elsif tg_op = 'INSERT' then
    new.billing_plans_enabled_at := now();
  elsif not old.billing_plans_enabled then
    new.billing_plans_enabled_at := now();
  else
    new.billing_plans_enabled_at := coalesce(old.billing_plans_enabled_at, now());
  end if;

  if not new.billing_auto_send_enabled then
    new.billing_auto_send_enabled_at := null;
  elsif tg_op = 'INSERT' then
    new.billing_auto_send_enabled_at := now();
  elsif not old.billing_auto_send_enabled then
    new.billing_auto_send_enabled_at := now();
  else
    new.billing_auto_send_enabled_at := coalesce(old.billing_auto_send_enabled_at, now());
  end if;

  if not new.billing_reminders_enabled then
    new.billing_reminders_enabled_at := null;
  elsif tg_op = 'INSERT' then
    new.billing_reminders_enabled_at := now();
  elsif not old.billing_reminders_enabled then
    new.billing_reminders_enabled_at := now();
  else
    new.billing_reminders_enabled_at := coalesce(old.billing_reminders_enabled_at, now());
  end if;
  return new;
end $$;
revoke all on function public.organization_settings_billing_stamp() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Pause state.
-- ---------------------------------------------------------------------------
alter table public.billing_plan_items
  add column reminders_paused_at timestamptz,
  add column reminders_paused_by uuid references auth.users(id) on delete set null,
  add column reminders_pause_reason text,
  add constraint billing_plan_items_reminders_pause_reason_check check (char_length(reminders_pause_reason) <= 500),
  add constraint billing_plan_items_reminders_pause_pair_check check ((reminders_paused_at is null) = (reminders_pause_reason is null));

-- ---------------------------------------------------------------------------
-- 3. The reminders.
-- ---------------------------------------------------------------------------
create table public.billing_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null,
  sequence smallint not null,
  claimed_until timestamptz,
  attempts smallint not null default 0,
  sent_at timestamptz,
  to_address text,
  subject text,
  balance_at_send numeric(14, 2),
  pdf_sha256 text,
  created_at timestamptz not null default now(),
  constraint billing_reminders_invoice_sequence_key unique (invoice_id, sequence),
  constraint billing_reminders_sequence_check check (sequence between 1 and 5),
  constraint billing_reminders_attempts_check check (attempts between 0 and 100),
  constraint billing_reminders_sent_needs_address_check check (sent_at is null or to_address is not null),
  constraint billing_reminders_invoice_fkey foreign key (invoice_id, organization_id)
    references public.invoices(id, organization_id) on delete cascade
);

create index billing_reminders_org_idx on public.billing_reminders(organization_id, invoice_id);

alter table public.billing_reminders enable row level security;
create policy billing_reminders_select on public.billing_reminders for select to authenticated
  using (public.is_member_of(organization_id));

revoke all on public.billing_reminders from anon, authenticated;
grant select on public.billing_reminders to authenticated;
grant select, insert, update, delete on public.billing_reminders to service_role;

-- ---------------------------------------------------------------------------
-- 4. The activity vocabulary.
-- ---------------------------------------------------------------------------
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in (
  'call', 'meeting', 'email', 'note', 'lead.converted', 'client.created_from_lead',
  'opportunity.created_from_lead', 'opportunity.stage_changed', 'quote.sent', 'quote.accepted',
  'quote.emailed', 'invoice.emailed', 'quote.invoiced', 'payment.recorded', 'payment.voided',
  'invoice.overdue', 'billing.package_set', 'billing.tier_changed', 'billing.support_added',
  'billing.document_built', 'quote.declined', 'quote.superseded', 'billing.plan_created',
  'billing.invoice_approved', 'billing.plan_changed', 'prospect.engagement_submitted',
  'billing.invoice_auto_issued', 'billing.item_held',
  'invoice.reminder_sent', 'billing.reminders_changed'
));
