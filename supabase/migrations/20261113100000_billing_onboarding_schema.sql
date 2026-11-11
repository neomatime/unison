-- Accept to invoice, stage 4, task 1: the schema for starting the work. Additive and inert: nothing reads or writes the new columns
-- until the functions of the next migrations exist, and nothing runs for an organisation until it has billing plans switched on.
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. client_onboardings.quote_id: the quote an onboarding was made for. Unique, so one quote can never make two (the acceptance and the
--    nightly sweep are both allowed to try); the key is composite with the organisation, so an onboarding can only point at a quote of
--    its own organisation; deleting the quote keeps the onboarding and clears the link.
-- 2. billing_plans.readiness_override_*: a person's recorded decision that the work may start before the start date has arrived and the
--    first invoice is paid, with a reason. On the plan (a table only definer functions write).
-- 3. The activity vocabulary: the newest list (20261112100000) plus billing.onboarding_created and billing.readiness_overridden.

-- ---------------------------------------------------------------------------
-- 1. The onboarding's quote.
-- ---------------------------------------------------------------------------
alter table public.client_onboardings
  add column quote_id uuid,
  add constraint client_onboardings_quote_id_key unique (quote_id),
  add constraint client_onboardings_quote_id_organization_id_fkey foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id) on delete set null (quote_id);

-- ---------------------------------------------------------------------------
-- 2. The start decision.
-- ---------------------------------------------------------------------------
alter table public.billing_plans
  add column readiness_override_at timestamptz,
  add column readiness_override_by uuid references auth.users(id) on delete set null,
  add column readiness_override_reason text,
  add constraint billing_plans_readiness_override_reason_check check (char_length(readiness_override_reason) <= 500),
  add constraint billing_plans_readiness_override_pair_check check ((readiness_override_at is null) = (readiness_override_reason is null));

-- ---------------------------------------------------------------------------
-- 3. The activity vocabulary.
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
  'invoice.reminder_sent', 'billing.reminders_changed',
  'billing.onboarding_created', 'billing.readiness_overridden'
));
