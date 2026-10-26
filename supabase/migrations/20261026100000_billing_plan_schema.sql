-- Accept to invoice, stage 1, task 1: the schema. Tables, columns, constraints, policies, grants and the two small trigger
-- changes only: the functions that build and use the plans come in later migrations. Nothing here changes behaviour while the
-- switch (billing_plans_enabled, default false) is off: every new column is empty or false for what already exists.
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. Quotes carry the terms they are billed on: a start date and a term in months, both or neither.
-- 2. The terms are frozen once a quote has gone out, exactly as the other commercial fields are (quotes_documents_before,
--    last defined in 20261011120000_documents_hardening.sql, is replaced with two more columns in its frozen list).
-- 3. The switch: organization_settings.billing_plans_enabled, with a time that only the database writes.
-- 4. billing_plans (one per quote) and billing_plan_items (one per month of the plan). Members read their organisation's
--    rows; nobody signed in writes, so the only writers are the definer functions that come later. No audit trigger: a
--    plan's changes are written to the quote's timeline by those functions.
-- 5. invoices.billing_plan_item_id: an invoice is the invoice of at most one plan item, and an item has at most one invoice.
-- 6. The activity vocabulary gains three kinds. features/crm-workspace/vocabulary.ts lists them in this order and
--    tests/unit/crm-workspace-vocabulary.test.ts fails if the two drift apart.

-- ---------------------------------------------------------------------------
-- 1. Quote terms.
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column start_date date,
  add column term_months smallint,
  add constraint quotes_billing_terms_check check ((start_date is null) = (term_months is null)),
  add constraint quotes_term_months_range check (term_months is null or term_months between 1 and 120);

-- ---------------------------------------------------------------------------
-- 2. The terms are frozen after sending. The body is 20261011120000_documents_hardening.sql unchanged except for the two
--    columns added to the frozen list (start_date and term_months): a signed-in role gets QUOTE_FROZEN for a change to
--    them on a sent quote. The service role is not a signed-in role and is unaffected.
-- ---------------------------------------------------------------------------
create or replace function public.quotes_documents_before() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_member boolean := current_user in ('authenticated', 'anon');
  v_new_draft boolean := new.status in ('Draft', 'Internal Review');
  v_old_draft boolean;
  v_sub numeric(14,2);
  v_std numeric(14,2);
  v_rate numeric(5,2);
begin
  if tg_op = 'INSERT' then
    if v_member then
      if not v_new_draft then
        raise exception 'QUOTE_USE_SEND' using errcode = '23514';
      end if;
      if new.quote_number is not null and btrim(new.quote_number) <> '' then
        raise exception 'DOCUMENT_NUMBER_GENERATED' using errcode = '23514';
      end if;
      new.bill_to := null;
      new.issuer := null;
      new.sent_at := null;
    end if;
    if new.quote_number is null or btrim(new.quote_number) = '' then
      new.quote_number := 'DRAFT-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    end if;
    select s.vat_rate into v_rate from public.organization_settings s where s.organization_id = new.organization_id;
    if found then
      new.vat_rate := v_rate;
    else
      -- No settings yet: the default rate, never a typed one.
      new.vat_rate := 15.00;
    end if;
    new.subtotal := 0;
    new.tax_amount := 0;
    new.total_amount := 0;
  else
    v_old_draft := old.status in ('Draft', 'Internal Review');
    if v_member then
      if new.quote_number is distinct from old.quote_number then
        raise exception 'DOCUMENT_NUMBER_GENERATED' using errcode = '23514';
      end if;
      if new.bill_to is distinct from old.bill_to or new.issuer is distinct from old.issuer then
        raise exception 'DOCUMENT_SNAPSHOT_GENERATED' using errcode = '23514';
      end if;
      if v_old_draft and not v_new_draft then
        raise exception 'QUOTE_USE_SEND' using errcode = '23514';
      end if;
      if not v_old_draft and v_new_draft then
        raise exception 'QUOTE_CANNOT_REOPEN' using errcode = '23514';
      end if;
      if v_new_draft then
        new.sent_at := null;
      end if;
      if not v_old_draft and (
        new.client_id is distinct from old.client_id
        or new.client_name is distinct from old.client_name
        or new.issue_date is distinct from old.issue_date
        or new.valid_until is distinct from old.valid_until
        or new.currency is distinct from old.currency
        or new.terms is distinct from old.terms
        or new.project_name is distinct from old.project_name
        or new.project_description is distinct from old.project_description
        or new.project_ref is distinct from old.project_ref
        or new.client_ref is distinct from old.client_ref
        or new.start_date is distinct from old.start_date
        or new.term_months is distinct from old.term_months
      ) then
        raise exception 'QUOTE_FROZEN' using errcode = '23514';
      end if;
    end if;
    -- The rate is fixed once a document has gone out and for a signed-in role; send_quote (the owner)
    -- sets it from the company details at the moment the quote is sent.
    if v_member or not v_old_draft then
      new.vat_rate := old.vat_rate;
    end if;
    select coalesce(sum(l.line_amount), 0), coalesce(sum(l.line_amount) filter (where l.vat_code = 'standard'), 0)
      into v_sub, v_std
      from public.quote_lines l
      where l.quote_id = new.id and l.organization_id = new.organization_id;
    new.subtotal := v_sub;
    new.tax_amount := round(v_std * new.vat_rate / 100, 2);
    new.total_amount := v_sub + new.tax_amount;
    -- Backstop: whatever raced with the send, a signed-in role never changes what a sent quote adds up to.
    if v_member and not v_old_draft and (new.subtotal is distinct from old.subtotal or new.tax_amount is distinct from old.tax_amount) then
      raise exception 'QUOTE_FROZEN' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.quotes_documents_before() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The switch. organization_settings already has its audit trigger and its policies (members read, owners and admins
--    write), so only owners and admins can change it. The time is the database's: it is set when the switch goes from off
--    to on (or is inserted on), cleared when it is off, and otherwise the old value is kept, so a time typed into the row,
--    in the same write or on its own, never sticks.
-- ---------------------------------------------------------------------------
alter table public.organization_settings
  add column billing_plans_enabled boolean not null default false,
  add column billing_plans_enabled_at timestamptz;

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
  return new;
end $$;

revoke all on function public.organization_settings_billing_stamp() from public, anon, authenticated;

create trigger organization_settings_billing_stamp before insert or update on public.organization_settings
  for each row execute function public.organization_settings_billing_stamp();

-- ---------------------------------------------------------------------------
-- 4. The plan: one per quote, with the quote's terms copied on, and one item per month. Both belong to the quote's
--    organisation (composite keys) and go with the quote or the organisation. client_id is kept the way quotes keep it: the
--    client may be deleted later, which leaves the plan without one.
-- ---------------------------------------------------------------------------
create table public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  client_id uuid,
  start_date date,
  term_months smallint,
  status text not null default 'active',
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_plans_quote_id_key unique (quote_id),
  constraint billing_plans_id_organization_id_key unique (id, organization_id),
  constraint billing_plans_status_check check (status in ('active', 'paused', 'ended')),
  constraint billing_plans_terms_check check ((start_date is null) = (term_months is null)),
  constraint billing_plans_term_months_range check (term_months is null or term_months between 1 and 120),
  constraint billing_plans_quote_id_organization_id_fkey foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id) on delete cascade,
  constraint billing_plans_client_id_organization_id_fkey foreign key (client_id, organization_id)
    references public.clients(id, organization_id) on delete set null (client_id)
);

create index billing_plans_org_status_idx on public.billing_plans(organization_id, status);
create index billing_plans_client_idx on public.billing_plans(client_id, organization_id);

create trigger billing_plans_set_updated_at before update on public.billing_plans
  for each row execute function public.set_updated_at();

create table public.billing_plan_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null,
  quote_id uuid not null,
  month_number smallint not null,
  kind text not null,
  bill_on date not null,
  status text not null default 'open',
  cancelled_reason text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approval_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint billing_plan_items_quote_id_month_number_key unique (quote_id, month_number),
  constraint billing_plan_items_id_organization_id_key unique (id, organization_id),
  constraint billing_plan_items_month_number_check check (month_number >= 1),
  constraint billing_plan_items_kind_check check (kind in ('first', 'monthly')),
  constraint billing_plan_items_first_is_month_one check ((kind = 'first') = (month_number = 1)),
  constraint billing_plan_items_status_check check (status in ('open', 'cancelled')),
  constraint billing_plan_items_plan_id_organization_id_fkey foreign key (plan_id, organization_id)
    references public.billing_plans(id, organization_id) on delete cascade,
  constraint billing_plan_items_quote_id_organization_id_fkey foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id) on delete cascade
);

create index billing_plan_items_plan_idx on public.billing_plan_items(plan_id, organization_id, month_number);
create index billing_plan_items_due_idx on public.billing_plan_items(organization_id, status, bill_on);

alter table public.billing_plans enable row level security;
alter table public.billing_plan_items enable row level security;

create policy billing_plans_select on public.billing_plans for select to authenticated
  using (public.is_member_of(organization_id));
create policy billing_plan_items_select on public.billing_plan_items for select to authenticated
  using (public.is_member_of(organization_id));

-- The schema's convention: revoke everything, then grant only what is meant. There is no insert, update or delete grant and
-- no such policy, so the only writers are the definer functions added later (and the service role).
revoke all on public.billing_plans, public.billing_plan_items from anon, authenticated;
grant select on public.billing_plans, public.billing_plan_items to authenticated;

-- ---------------------------------------------------------------------------
-- 5. An invoice and the plan item it bills. Unique, so an item is invoiced once whatever races; the link is dropped (never the
--    invoice) when the item goes. Plain invoices keep it null. Who may set it, and when, is for the functions that come later.
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column billing_plan_item_id uuid,
  add constraint invoices_billing_plan_item_id_key unique (billing_plan_item_id),
  add constraint invoices_billing_plan_item_id_organization_id_fkey foreign key (billing_plan_item_id, organization_id)
    references public.billing_plan_items(id, organization_id) on delete set null (billing_plan_item_id);

-- ---------------------------------------------------------------------------
-- 6. The activity vocabulary: 20261020101000_quote_portal_timeline.sql plus the three billing kinds, in this order.
-- ---------------------------------------------------------------------------
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in ('call', 'meeting', 'email', 'note', 'lead.converted', 'client.created_from_lead', 'opportunity.created_from_lead', 'opportunity.stage_changed', 'quote.sent', 'quote.accepted', 'quote.emailed', 'invoice.emailed', 'quote.invoiced', 'payment.recorded', 'payment.voided', 'invoice.overdue', 'billing.package_set', 'billing.tier_changed', 'billing.support_added', 'billing.document_built', 'quote.declined', 'quote.superseded', 'billing.plan_created', 'billing.invoice_approved', 'billing.plan_changed'));
