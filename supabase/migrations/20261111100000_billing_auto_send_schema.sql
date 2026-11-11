-- Accept to invoice, stage 2, task 1: the schema for automatic sending. Everything here is additive and inert until the new switch
-- (organization_settings.billing_auto_send_enabled, default false) is turned on, and nothing reads it yet.
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. The switch and its time. public.organization_settings_billing_stamp() (last defined in 20261026100000_billing_plan_schema.sql)
--    now stamps billing_auto_send_enabled_at with the rules it already applies to billing_plans_enabled_at: stamped on a switch
--    from off to on (and on an insert that is on), null when off, otherwise the old time is kept; a typed value is overwritten.
-- 2. The state a plan item carries while the runner works on it: when the system issued its invoice, a short lease so two runs never
--    send the same invoice at once, how many sends have failed, and why the month is waiting for a person (attention_code), with the
--    codes that say so (attention_detail, never client data) and when the owner was told.
-- 3. The outbox the billing notice emails wait in until the runner sends them. No policy and no grant to a signed-in role: only the
--    service role reads and writes it.
-- 4. The activity vocabulary: 20261109190000_prospect_engagement.sql (the newest) plus billing.invoice_auto_issued and
--    billing.item_held, in that order.

-- ---------------------------------------------------------------------------
-- 1. The switch.
-- ---------------------------------------------------------------------------
alter table public.organization_settings
  add column billing_auto_send_enabled boolean not null default false,
  add column billing_auto_send_enabled_at timestamptz;

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
  return new;
end $$;
revoke all on function public.organization_settings_billing_stamp() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Item state.
-- ---------------------------------------------------------------------------
alter table public.billing_plan_items
  add column system_issued_at timestamptz,
  add column send_lease_until timestamptz,
  add column send_attempts smallint not null default 0,
  add column attention_code text,
  add column attention_detail text,
  add column attention_notified_at timestamptz,
  add constraint billing_plan_items_send_attempts_check check (send_attempts between 0 and 100),
  add constraint billing_plan_items_attention_code_check check (attention_code in ('CHECKS_FAILED', 'CATCH_UP', 'EMAIL_FAILED')),
  add constraint billing_plan_items_attention_detail_check check (char_length(attention_detail) <= 200);

-- ---------------------------------------------------------------------------
-- 3. The notice outbox.
-- ---------------------------------------------------------------------------
create table public.billing_notice_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  quote_id uuid,
  subject text not null,
  body text not null,
  attempts smallint not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint billing_notice_emails_subject_check check (char_length(subject) between 1 and 300),
  constraint billing_notice_emails_body_check check (char_length(body) <= 4000),
  constraint billing_notice_emails_attempts_check check (attempts between 0 and 100)
);

create index billing_notice_emails_unsent_idx on public.billing_notice_emails(created_at) where sent_at is null;

alter table public.billing_notice_emails enable row level security;
revoke all on public.billing_notice_emails from anon, authenticated;
grant select, insert, update on public.billing_notice_emails to service_role;

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
  'billing.invoice_auto_issued', 'billing.item_held'
));
