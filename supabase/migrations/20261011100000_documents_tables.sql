-- Stage 2, slice A, part 1: the data behind quotes and invoices that are real documents.
--
-- Totals are calculated by the database from the lines, so a stored total can never
-- disagree with its lines. A draft carries a generated reference ("DRAFT-" and eight hex
-- characters) in its number column until part 2 sends or issues it and hands out the real
-- number. Part 2 also adds the guard and freeze rules; this part only has what is needed
-- to store lines, settings and a price list and to keep the totals right.

-- ---------------------------------------------------------------------------
-- 1. Clients: the billing address and VAT number both designs print.
-- ---------------------------------------------------------------------------
alter table public.clients
  add column address_line1 text,
  add column address_line2 text,
  add column city text,
  add column postal_code text,
  add column country text,
  add column vat_number text;

-- ---------------------------------------------------------------------------
-- 2. Company (issuer) settings, one row per organisation. Members read; owners and
--    admins write. Image paths may only name a file under /brand, so a setting can never
--    point a document at somebody else's server.
-- ---------------------------------------------------------------------------
create table public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  legal_name text,
  tagline text,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  country text,
  vat_number text,
  email text,
  phone text,
  website text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_branch_code text,
  bank_account_type text,
  document_prefix text
    check (document_prefix is null or (document_prefix ~ '^[A-Z0-9]{2,8}$' and document_prefix <> 'DRAFT')),
  vat_rate numeric(5,2) not null default 15.00 check (vat_rate >= 0 and vat_rate <= 100),
  default_quote_terms text,
  default_payment_terms text,
  quote_closing_text text,
  invoice_closing_text text,
  default_quote_valid_days integer not null default 30 check (default_quote_valid_days between 1 and 365),
  default_payment_days integer not null default 30 check (default_payment_days between 0 and 365),
  logo_path text check (logo_path is null or logo_path ~ '^/brand/[A-Za-z0-9_-][A-Za-z0-9._-]*$'),
  header_image_path text check (header_image_path is null or header_image_path ~ '^/brand/[A-Za-z0-9_-][A-Za-z0-9._-]*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organization_settings_set_updated_at before update on public.organization_settings
  for each row execute function public.set_updated_at();
create trigger organization_settings_audit after insert or update or delete on public.organization_settings
  for each row execute function public.record_audit_event();

alter table public.organization_settings enable row level security;
create policy organization_settings_select on public.organization_settings
  for select to authenticated using (public.is_member_of(organization_id));
create policy organization_settings_insert on public.organization_settings
  for insert to authenticated with check (public.has_role(organization_id, array['owner', 'admin']));
create policy organization_settings_update on public.organization_settings
  for update to authenticated
  using (public.has_role(organization_id, array['owner', 'admin']))
  with check (public.has_role(organization_id, array['owner', 'admin']));

revoke all on public.organization_settings from anon, authenticated;
grant select, insert, update on public.organization_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The price list. Any member manages it; items are archived, never deleted, so a
--    line's reference stays meaningful.
-- ---------------------------------------------------------------------------
create table public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0 and unit_price <= 9999999.99),
  vat_code text not null default 'standard' check (vat_code in ('standard', 'zero')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create index price_list_items_org_idx on public.price_list_items(organization_id, archived_at, title);

create trigger price_list_items_set_updated_at before update on public.price_list_items
  for each row execute function public.set_updated_at();
create trigger price_list_items_audit after insert or update or delete on public.price_list_items
  for each row execute function public.record_audit_event();

alter table public.price_list_items enable row level security;
create policy price_list_items_select on public.price_list_items
  for select to authenticated using (public.is_member_of(organization_id));
create policy price_list_items_insert on public.price_list_items
  for insert to authenticated with check (public.is_member_of(organization_id));
create policy price_list_items_update on public.price_list_items
  for update to authenticated
  using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id));

revoke all on public.price_list_items from anon, authenticated;
grant select, insert, update on public.price_list_items to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Lines. The amount is calculated by the database. The bounds keep any one line
--    (and a sensible number of them) inside numeric(14,2).
-- ---------------------------------------------------------------------------
create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid not null,
  position integer not null default 1 check (position >= 1),
  title text not null check (length(trim(title)) > 0),
  description text,
  quantity numeric(12,3) not null check (quantity > 0 and quantity <= 99999.999),
  unit_price numeric(14,2) not null check (unit_price >= 0 and unit_price <= 9999999.99),
  vat_code text not null default 'standard' check (vat_code in ('standard', 'zero')),
  line_amount numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  price_list_item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (quote_id, organization_id) references public.quotes(id, organization_id) on delete cascade,
  foreign key (price_list_item_id, organization_id)
    references public.price_list_items(id, organization_id) on delete set null (price_list_item_id)
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  position integer not null default 1 check (position >= 1),
  title text not null check (length(trim(title)) > 0),
  description text,
  quantity numeric(12,3) not null check (quantity > 0 and quantity <= 99999.999),
  unit_price numeric(14,2) not null check (unit_price >= 0 and unit_price <= 9999999.99),
  vat_code text not null default 'standard' check (vat_code in ('standard', 'zero')),
  line_amount numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  price_list_item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (invoice_id, organization_id) references public.invoices(id, organization_id) on delete cascade,
  foreign key (price_list_item_id, organization_id)
    references public.price_list_items(id, organization_id) on delete set null (price_list_item_id)
);

create index quote_lines_quote_idx on public.quote_lines(quote_id, position);
create index quote_lines_price_item_idx on public.quote_lines(price_list_item_id, organization_id);
create index invoice_lines_invoice_idx on public.invoice_lines(invoice_id, position);
create index invoice_lines_price_item_idx on public.invoice_lines(price_list_item_id, organization_id);

create trigger quote_lines_set_updated_at before update on public.quote_lines
  for each row execute function public.set_updated_at();
create trigger invoice_lines_set_updated_at before update on public.invoice_lines
  for each row execute function public.set_updated_at();
-- Inserts are the content of the document; only changes and removals are audited.
create trigger quote_lines_audit after update or delete on public.quote_lines
  for each row execute function public.record_audit_event();
create trigger invoice_lines_audit after update or delete on public.invoice_lines
  for each row execute function public.record_audit_event();

alter table public.quote_lines enable row level security;
alter table public.invoice_lines enable row level security;
do $$
declare
  table_name text;
begin
  foreach table_name in array array['quote_lines', 'invoice_lines']
  loop
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_member_of(organization_id))', table_name, table_name);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.is_member_of(organization_id))', table_name, table_name);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id))', table_name, table_name);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.is_member_of(organization_id))', table_name, table_name);
  end loop;
end $$;

revoke all on public.quote_lines, public.invoice_lines from anon, authenticated;
grant select, insert, update, delete on public.quote_lines, public.invoice_lines to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Number counters. Nobody but the numbering function (part 2) touches them.
-- ---------------------------------------------------------------------------
create table public.document_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('quote', 'invoice')),
  year integer not null check (year between 2000 and 9999),
  last_number integer not null default 0 check (last_number >= 0),
  primary key (organization_id, kind, year)
);

alter table public.document_counters enable row level security;
revoke all on public.document_counters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Quotes and invoices: what the designs print, and a snapshot of who it was addressed
--    to and who it came from, filled in when the document goes out (part 2).
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column issue_date date,
  add column project_name text,
  add column project_description text,
  add column project_ref text,
  add column client_ref text,
  add column vat_rate numeric(5,2) not null default 15.00 check (vat_rate >= 0 and vat_rate <= 100),
  add column bill_to jsonb,
  add column issuer jsonb;

alter table public.invoices
  add column project_name text,
  add column project_description text,
  add column project_ref text,
  add column client_ref text,
  add column vat_rate numeric(5,2) not null default 15.00 check (vat_rate >= 0 and vat_rate <= 100),
  add column bill_to jsonb,
  add column issuer jsonb;

-- A real number only appears once the document has gone out.
alter table public.quotes
  add constraint quotes_draft_reference_only_in_draft
  check (status in ('Draft', 'Internal Review') or quote_number !~ '^DRAFT-');
alter table public.invoices
  add constraint invoices_draft_reference_only_in_draft
  check (status = 'Draft' or invoice_number !~ '^DRAFT-');

-- ---------------------------------------------------------------------------
-- 7. Before every write: a draft reference when there is no number, the VAT rate
--    copied from the settings on insert and never changed after, and the totals
--    calculated from the lines whoever writes them. An invoice that is still a draft
--    has its balance follow its total.
-- ---------------------------------------------------------------------------
create or replace function public.quotes_documents_before() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_sub numeric(14,2);
  v_std numeric(14,2);
  v_rate numeric(5,2);
begin
  if tg_op = 'INSERT' then
    if new.quote_number is null or btrim(new.quote_number) = '' then
      new.quote_number := 'DRAFT-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    end if;
    select s.vat_rate into v_rate from public.organization_settings s where s.organization_id = new.organization_id;
    if found then
      new.vat_rate := v_rate;
    end if;
    new.subtotal := 0;
    new.tax_amount := 0;
    new.total_amount := 0;
  else
    new.vat_rate := old.vat_rate;
    select coalesce(sum(l.line_amount), 0), coalesce(sum(l.line_amount) filter (where l.vat_code = 'standard'), 0)
      into v_sub, v_std
      from public.quote_lines l
      where l.quote_id = new.id and l.organization_id = new.organization_id;
    new.subtotal := v_sub;
    new.tax_amount := round(v_std * new.vat_rate / 100, 2);
    new.total_amount := v_sub + new.tax_amount;
  end if;
  return new;
end $$;

create or replace function public.invoices_documents_before() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_sub numeric(14,2);
  v_std numeric(14,2);
  v_rate numeric(5,2);
begin
  if tg_op = 'INSERT' then
    if new.invoice_number is null or btrim(new.invoice_number) = '' then
      new.invoice_number := 'DRAFT-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    end if;
    select s.vat_rate into v_rate from public.organization_settings s where s.organization_id = new.organization_id;
    if found then
      new.vat_rate := v_rate;
    end if;
    new.subtotal := 0;
    new.tax_amount := 0;
    new.total_amount := 0;
  else
    new.vat_rate := old.vat_rate;
    select coalesce(sum(l.line_amount), 0), coalesce(sum(l.line_amount) filter (where l.vat_code = 'standard'), 0)
      into v_sub, v_std
      from public.invoice_lines l
      where l.invoice_id = new.id and l.organization_id = new.organization_id;
    new.subtotal := v_sub;
    new.tax_amount := round(v_std * new.vat_rate / 100, 2);
    new.total_amount := v_sub + new.tax_amount;
  end if;
  if new.status = 'Draft' then
    new.balance_amount := new.total_amount;
  end if;
  return new;
end $$;

create trigger quotes_documents_before
  before insert or update on public.quotes
  for each row execute function public.quotes_documents_before();
create trigger invoices_documents_before
  before insert or update on public.invoices
  for each row execute function public.invoices_documents_before();

-- A line changing touches its document, which makes the trigger above recalculate it.
create or replace function public.touch_quote_for_line() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.quotes set updated_at = now() where id = new.quote_id and organization_id = new.organization_id;
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.quote_id is distinct from new.quote_id) then
    update public.quotes set updated_at = now() where id = old.quote_id and organization_id = old.organization_id;
  end if;
  return null;
end $$;

create or replace function public.touch_invoice_for_line() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.invoices set updated_at = now() where id = new.invoice_id and organization_id = new.organization_id;
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.invoice_id is distinct from new.invoice_id) then
    update public.invoices set updated_at = now() where id = old.invoice_id and organization_id = old.organization_id;
  end if;
  return null;
end $$;

create trigger quote_lines_touch_quote
  after insert or update or delete on public.quote_lines
  for each row execute function public.touch_quote_for_line();
create trigger invoice_lines_touch_invoice
  after insert or update or delete on public.invoice_lines
  for each row execute function public.touch_invoice_for_line();

revoke all on function public.quotes_documents_before() from public, anon, authenticated;
revoke all on function public.invoices_documents_before() from public, anon, authenticated;
revoke all on function public.touch_quote_for_line() from public, anon, authenticated;
revoke all on function public.touch_invoice_for_line() from public, anon, authenticated;
