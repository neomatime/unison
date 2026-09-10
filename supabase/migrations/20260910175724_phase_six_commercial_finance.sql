create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_name text not null,
  contact_name text not null,
  contact_email text,
  contact_phone text,
  source text not null default 'Referral'
    check (source in ('Referral','Website','Campaign','Event','Partner','Outbound','Other')),
  owner_id uuid,
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  currency text not null default 'ZAR' check (char_length(currency) = 3),
  status text not null default 'New'
    check (status in ('New','Contacted','Qualified','Disqualified','Converted')),
  last_activity_at timestamptz,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (owner_id, organization_id)
    references public.team_members(id, organization_id) on delete set null (owner_id)
);

create index leads_org_status_idx on public.leads(organization_id, status, archived_at);
create index leads_owner_idx on public.leads(owner_id, organization_id);

create table public.sales_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  client_id uuid,
  client_name text not null,
  lead_id uuid,
  owner_id uuid,
  stage text not null default 'Discovery'
    check (stage in ('Discovery','Qualified','Proposal','Negotiation','Won','Lost')),
  expected_value numeric(14,2) not null default 0 check (expected_value >= 0),
  currency text not null default 'ZAR' check (char_length(currency) = 3),
  probability_percent smallint not null default 0 check (probability_percent between 0 and 100),
  expected_close date,
  next_step text,
  lost_reason text,
  won_at timestamptz,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (client_id, organization_id)
    references public.clients(id, organization_id) on delete set null (client_id),
  foreign key (lead_id, organization_id)
    references public.leads(id, organization_id) on delete set null (lead_id),
  foreign key (owner_id, organization_id)
    references public.team_members(id, organization_id) on delete set null (owner_id)
);

create index sales_opportunities_org_stage_idx on public.sales_opportunities(organization_id, stage, archived_at);
create index sales_opportunities_client_idx on public.sales_opportunities(client_id, organization_id);
create index sales_opportunities_lead_idx on public.sales_opportunities(lead_id, organization_id);
create index sales_opportunities_owner_idx on public.sales_opportunities(owner_id, organization_id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_number text not null,
  client_id uuid,
  client_name text not null,
  contact_name text,
  lead_id uuid,
  opportunity_id uuid,
  owner_id uuid,
  valid_until date,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  currency text not null default 'ZAR' check (char_length(currency) = 3),
  status text not null default 'Draft'
    check (status in ('Draft','Internal Review','Sent','Accepted','Declined','Expired')),
  sent_at timestamptz,
  accepted_at timestamptz,
  terms text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, quote_number),
  unique (id, organization_id),
  foreign key (client_id, organization_id)
    references public.clients(id, organization_id) on delete set null (client_id),
  foreign key (lead_id, organization_id)
    references public.leads(id, organization_id) on delete set null (lead_id),
  foreign key (opportunity_id, organization_id)
    references public.sales_opportunities(id, organization_id) on delete set null (opportunity_id),
  foreign key (owner_id, organization_id)
    references public.team_members(id, organization_id) on delete set null (owner_id)
);

create index quotes_org_status_idx on public.quotes(organization_id, status, archived_at);
create index quotes_client_idx on public.quotes(client_id, organization_id);
create index quotes_lead_idx on public.quotes(lead_id, organization_id);
create index quotes_opportunity_idx on public.quotes(opportunity_id, organization_id);
create index quotes_owner_idx on public.quotes(owner_id, organization_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_number text not null,
  client_id uuid,
  client_name text not null,
  project_id uuid,
  quote_id uuid,
  opportunity_id uuid,
  owner_id uuid,
  issue_date date,
  due_date date,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  balance_amount numeric(14,2) not null default 0 check (balance_amount >= 0),
  currency text not null default 'ZAR' check (char_length(currency) = 3),
  status text not null default 'Draft'
    check (status in ('Draft','Issued','Partially Paid','Paid','Overdue','Cancelled')),
  paid_at timestamptz,
  payment_terms text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number),
  unique (id, organization_id),
  check (due_date is null or issue_date is null or due_date >= issue_date),
  check (balance_amount <= total_amount),
  foreign key (client_id, organization_id)
    references public.clients(id, organization_id) on delete set null (client_id),
  foreign key (project_id, organization_id)
    references public.projects(id, organization_id) on delete set null (project_id),
  foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id) on delete set null (quote_id),
  foreign key (opportunity_id, organization_id)
    references public.sales_opportunities(id, organization_id) on delete set null (opportunity_id),
  foreign key (owner_id, organization_id)
    references public.team_members(id, organization_id) on delete set null (owner_id)
);

create index invoices_org_status_idx on public.invoices(organization_id, status, due_date, archived_at);
create index invoices_client_idx on public.invoices(client_id, organization_id);
create index invoices_project_idx on public.invoices(project_id, organization_id);
create index invoices_quote_idx on public.invoices(quote_id, organization_id);
create index invoices_opportunity_idx on public.invoices(opportunity_id, organization_id);
create index invoices_owner_idx on public.invoices(owner_id, organization_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  description text not null,
  category text not null default 'Other'
    check (category in ('Travel','Software','Professional Services','Office','Marketing','Events','Other')),
  vendor_id uuid,
  vendor_name text,
  project_id uuid,
  client_id uuid,
  submitted_by uuid,
  approved_by uuid,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'ZAR' check (char_length(currency) = 3),
  expense_date date not null,
  status text not null default 'Draft'
    check (status in ('Draft','Submitted','Awaiting Approval','Approved','Rejected')),
  receipt_reference text,
  notes text,
  submitted_at timestamptz,
  approved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (vendor_id, organization_id)
    references public.vendors(id, organization_id) on delete set null (vendor_id),
  foreign key (project_id, organization_id)
    references public.projects(id, organization_id) on delete set null (project_id),
  foreign key (client_id, organization_id)
    references public.clients(id, organization_id) on delete set null (client_id),
  foreign key (submitted_by, organization_id)
    references public.team_members(id, organization_id) on delete set null (submitted_by),
  foreign key (approved_by, organization_id)
    references public.team_members(id, organization_id) on delete set null (approved_by)
);

create index expenses_org_status_idx on public.expenses(organization_id, status, expense_date, archived_at);
create index expenses_vendor_idx on public.expenses(vendor_id, organization_id);
create index expenses_project_idx on public.expenses(project_id, organization_id);
create index expenses_client_idx on public.expenses(client_id, organization_id);
create index expenses_submitted_by_idx on public.expenses(submitted_by, organization_id);
create index expenses_approved_by_idx on public.expenses(approved_by, organization_id);

create table public.financial_forecasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  period_label text not null,
  period_start date,
  period_end date,
  forecast_type text not null default 'Revenue'
    check (forecast_type in ('Revenue','Expenses','Cash Flow','Budget vs Actual')),
  actual_value numeric(14,2) not null default 0,
  projected_value numeric(14,2) not null default 0,
  confidence_percent smallint not null default 50 check (confidence_percent between 0 and 100),
  currency text not null default 'ZAR' check (char_length(currency) = 3),
  status text not null default 'Draft'
    check (status in ('Draft','Current','Approved','Archived')),
  owner_id uuid,
  assumptions text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id),
  check (period_end is null or period_start is null or period_end >= period_start),
  foreign key (owner_id, organization_id)
    references public.team_members(id, organization_id) on delete set null (owner_id)
);

create index financial_forecasts_org_status_idx on public.financial_forecasts(organization_id, status, period_start, archived_at);
create index financial_forecasts_owner_idx on public.financial_forecasts(owner_id, organization_id);

alter table public.leads enable row level security;
alter table public.sales_opportunities enable row level security;
alter table public.quotes enable row level security;
alter table public.invoices enable row level security;
alter table public.expenses enable row level security;
alter table public.financial_forecasts enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'leads',
    'sales_opportunities',
    'quotes',
    'invoices',
    'expenses',
    'financial_forecasts'
  ]
  loop
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.is_member_of(organization_id))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.is_member_of(organization_id))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id))',
      table_name,
      table_name
    );
  end loop;
end $$;

create trigger leads_set_updated_at before update on public.leads
for each row execute function public.set_updated_at();
create trigger sales_opportunities_set_updated_at before update on public.sales_opportunities
for each row execute function public.set_updated_at();
create trigger quotes_set_updated_at before update on public.quotes
for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
for each row execute function public.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses
for each row execute function public.set_updated_at();
create trigger financial_forecasts_set_updated_at before update on public.financial_forecasts
for each row execute function public.set_updated_at();

create trigger leads_audit after insert or update or delete on public.leads
for each row execute function public.record_audit_event();
create trigger sales_opportunities_audit after insert or update or delete on public.sales_opportunities
for each row execute function public.record_audit_event();
create trigger quotes_audit after insert or update or delete on public.quotes
for each row execute function public.record_audit_event();
create trigger invoices_audit after insert or update or delete on public.invoices
for each row execute function public.record_audit_event();
create trigger expenses_audit after insert or update or delete on public.expenses
for each row execute function public.record_audit_event();
create trigger financial_forecasts_audit after insert or update or delete on public.financial_forecasts
for each row execute function public.record_audit_event();

revoke all on
  public.leads,
  public.sales_opportunities,
  public.quotes,
  public.invoices,
  public.expenses,
  public.financial_forecasts
from anon;

grant select, insert, update on
  public.leads,
  public.sales_opportunities,
  public.quotes,
  public.invoices,
  public.expenses,
  public.financial_forecasts
to authenticated;
