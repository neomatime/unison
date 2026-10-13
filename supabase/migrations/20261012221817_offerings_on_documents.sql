alter table public.quotes
  add column service_inclusions text check (service_inclusions is null or char_length(service_inclusions) <= 10000),
  add column terms_sources jsonb check (terms_sources is null or jsonb_typeof(terms_sources) = 'array'),
  add column terms_edited boolean not null default false;
alter table public.invoices
  add column service_inclusions text check (service_inclusions is null or char_length(service_inclusions) <= 10000),
  add column terms_sources jsonb check (terms_sources is null or jsonb_typeof(terms_sources) = 'array'),
  add column terms_edited boolean not null default false;

create table public.quote_offerings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  position integer not null check (position >= 1),
  offering_kind text not null check (offering_kind in ('retainer', 'project', 'support')),
  offering_key text not null check (offering_key ~ '^[a-z0-9_]{1,60}$'),
  created_at timestamptz not null default now(),
  unique (quote_id, offering_kind, offering_key),
  unique (quote_id, position),
  foreign key (quote_id, organization_id) references public.quotes(id, organization_id) on delete cascade
);
create table public.invoice_offerings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null,
  position integer not null check (position >= 1),
  offering_kind text not null check (offering_kind in ('retainer', 'project', 'support')),
  offering_key text not null check (offering_key ~ '^[a-z0-9_]{1,60}$'),
  created_at timestamptz not null default now(),
  unique (invoice_id, offering_kind, offering_key),
  unique (invoice_id, position),
  foreign key (invoice_id, organization_id) references public.invoices(id, organization_id) on delete cascade
);
create index quote_offerings_org_idx on public.quote_offerings (organization_id, quote_id);
create index invoice_offerings_org_idx on public.invoice_offerings (organization_id, invoice_id);

create trigger quote_offerings_audit after insert or update or delete on public.quote_offerings
  for each row execute function public.record_audit_event();
create trigger invoice_offerings_audit after insert or update or delete on public.invoice_offerings
  for each row execute function public.record_audit_event();

alter table public.quote_offerings enable row level security;
alter table public.invoice_offerings enable row level security;
create policy quote_offerings_select on public.quote_offerings for select to authenticated using (public.is_member_of(organization_id));
create policy invoice_offerings_select on public.invoice_offerings for select to authenticated using (public.is_member_of(organization_id));
revoke all on public.quote_offerings, public.invoice_offerings from anon, authenticated;
grant select on public.quote_offerings, public.invoice_offerings to authenticated;

create or replace function private.document_draft_org(p_kind text, p_document uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_status text;
begin
  if p_kind not in ('quote', 'invoice') then
    raise exception 'DOCUMENT_KIND_UNKNOWN' using errcode = '22023';
  end if;
  if p_kind = 'quote' then
    select q.organization_id into v_org from public.quotes q where q.id = p_document;
  else
    select i.organization_id into v_org from public.invoices i where i.id = p_document;
  end if;
  if not found or not public.is_member_of(v_org) then
    if p_kind = 'quote' then
      raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
    end if;
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  if p_kind = 'quote' then
    select q.status into v_status from public.quotes q where q.id = p_document for update;
    if v_status not in ('Draft', 'Internal Review') then
      raise exception 'QUOTE_NOT_DRAFT' using errcode = '23514';
    end if;
  else
    select i.status into v_status from public.invoices i where i.id = p_document for update;
    if v_status <> 'Draft' then
      raise exception 'INVOICE_NOT_DRAFT' using errcode = '23514';
    end if;
  end if;
  return v_org;
end $$;
revoke all on function private.document_draft_org(text, uuid) from public, anon, authenticated;

create or replace function public.set_document_offerings(p_kind text, p_document uuid, p_offerings jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.document_draft_org(p_kind, p_document);
  v_count integer;
begin
  if p_offerings is null then
    raise exception 'OFFERING_INVALID' using errcode = '22023';
  end if;
  if jsonb_typeof(p_offerings) <> 'array' then
    raise exception 'OFFERING_INVALID' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_offerings);
  if v_count > 10 then
    raise exception 'OFFERING_INVALID' using errcode = '22023';
  end if;
  if (
    select count(*) from jsonb_array_elements(p_offerings) e
    where jsonb_typeof(e) = 'object' and (e ->> 'kind') in ('retainer', 'project', 'support') and (e ->> 'key') ~ '^[a-z0-9_]{1,60}$'
  ) <> v_count
  or (
    select count(distinct (e ->> 'kind') || ':' || (e ->> 'key')) from jsonb_array_elements(p_offerings) e
  ) <> v_count then
    raise exception 'OFFERING_INVALID' using errcode = '22023';
  end if;
  if p_kind = 'quote' then
    delete from public.quote_offerings where quote_id = p_document and organization_id = v_org;
    insert into public.quote_offerings (organization_id, quote_id, position, offering_kind, offering_key)
    select v_org, p_document, t.ord, t.e ->> 'kind', t.e ->> 'key'
    from jsonb_array_elements(p_offerings) with ordinality as t(e, ord);
  else
    delete from public.invoice_offerings where invoice_id = p_document and organization_id = v_org;
    insert into public.invoice_offerings (organization_id, invoice_id, position, offering_kind, offering_key)
    select v_org, p_document, t.ord, t.e ->> 'kind', t.e ->> 'key'
    from jsonb_array_elements(p_offerings) with ordinality as t(e, ord);
  end if;
end $$;

create or replace function public.set_document_terms(p_kind text, p_document uuid, p_terms text, p_inclusions text, p_sources jsonb, p_edited boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.document_draft_org(p_kind, p_document);
  v_terms text := replace(replace(coalesce(p_terms, ''), E'\r\n', E'\n'), E'\r', E'\n');
  v_inc text := replace(replace(coalesce(p_inclusions, ''), E'\r\n', E'\n'), E'\r', E'\n');
  v_src jsonb := case when p_sources is null or jsonb_typeof(p_sources) = 'null' then '[]'::jsonb else p_sources end;
  v_asked integer;
  v_found integer;
  v_clean jsonb;
begin
  if p_kind = 'invoice' then
    v_inc := '';
  end if;
  if char_length(v_terms) > 20000 or char_length(v_inc) > 10000 then
    raise exception 'TERMS_TOO_LONG' using errcode = '22001';
  end if;
  if jsonb_typeof(v_src) <> 'array' then
    raise exception 'TERMS_SOURCE_INVALID' using errcode = '22023';
  end if;
  v_asked := jsonb_array_length(v_src);
  if v_asked > 10 then
    raise exception 'TERMS_SOURCE_INVALID' using errcode = '22023';
  end if;
  select count(*), coalesce(jsonb_agg(jsonb_build_object('layer', e.layer, 'templateId', v.template_id, 'versionId', v.id, 'version', v.version) order by e.ord), '[]'::jsonb)
    into v_found, v_clean
  from (
    select (s ->> 'layer') as layer,
           case when (s ->> 'versionId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (s ->> 'versionId')::uuid end as version_id,
           ord
    from jsonb_array_elements(v_src) with ordinality as t(s, ord)
    where jsonb_typeof(s) = 'object' and (s ->> 'layer') in ('company', 'offering', 'category')
  ) e
  join public.terms_template_versions v on v.id = e.version_id and v.organization_id = v_org and v.status in ('approved', 'archived');
  if v_found <> v_asked then
    raise exception 'TERMS_SOURCE_INVALID' using errcode = '22023';
  end if;
  if p_kind = 'quote' then
    update public.quotes set terms = nullif(v_terms, ''), service_inclusions = nullif(v_inc, ''),
      terms_sources = case when v_found = 0 then null else v_clean end, terms_edited = coalesce(p_edited, false)
    where id = p_document and organization_id = v_org;
  else
    update public.invoices set payment_terms = nullif(v_terms, ''), service_inclusions = null,
      terms_sources = case when v_found = 0 then null else v_clean end, terms_edited = coalesce(p_edited, false)
    where id = p_document and organization_id = v_org;
  end if;
end $$;

create or replace function public.add_proposed_support_line(p_kind text, p_document uuid, p_service_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := private.document_draft_org(p_kind, p_document);
  v_currency text;
  v_item public.price_list_items%rowtype;
  v_position integer;
begin
  if p_kind = 'quote' then
    select q.currency into v_currency from public.quotes q where q.id = p_document;
  else
    select i.currency into v_currency from public.invoices i where i.id = p_document;
  end if;
  if v_currency <> 'ZAR' then
    raise exception 'RATE_CARD_CURRENCY' using errcode = '23514';
  end if;
  select * into v_item from public.price_list_items
  where organization_id = v_org and rate_key = 'support.' || coalesce(p_service_key, '') and item_kind = 'support' and archived_at is null;
  if not found then
    raise exception 'RATE_ITEM_UNAVAILABLE' using errcode = '23514';
  end if;
  if p_kind = 'quote' then
    select coalesce(max(l.position), 0) + 1 into v_position from public.quote_lines l where l.quote_id = p_document and l.organization_id = v_org;
    insert into public.quote_lines (organization_id, quote_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id)
    values (v_org, p_document, v_position, v_item.title, 'Proposed starting price, to be confirmed before sending.', 1, v_item.unit_price, v_item.vat_code, v_item.id);
  else
    select coalesce(max(l.position), 0) + 1 into v_position from public.invoice_lines l where l.invoice_id = p_document and l.organization_id = v_org;
    insert into public.invoice_lines (organization_id, invoice_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id)
    values (v_org, p_document, v_position, v_item.title, 'Proposed starting price, to be confirmed before sending.', 1, v_item.unit_price, v_item.vat_code, v_item.id);
  end if;
end $$;

revoke all on function public.set_document_offerings(text, uuid, jsonb) from public, anon;
revoke all on function public.set_document_terms(text, uuid, text, text, jsonb, boolean) from public, anon;
revoke all on function public.add_proposed_support_line(text, uuid, text) from public, anon;
grant execute on function public.set_document_offerings(text, uuid, jsonb) to authenticated;
grant execute on function public.set_document_terms(text, uuid, text, text, jsonb, boolean) to authenticated;
grant execute on function public.add_proposed_support_line(text, uuid, text) to authenticated;

create or replace function public.documents_terms_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_table_name = 'quotes' then
      if old.status not in ('Draft', 'Internal Review')
         and (new.service_inclusions is distinct from old.service_inclusions
              or new.terms_sources is distinct from old.terms_sources
              or new.terms_edited is distinct from old.terms_edited) then
        raise exception 'QUOTE_FROZEN' using errcode = '23514';
      end if;
    else
      if old.status <> 'Draft'
         and (new.service_inclusions is distinct from old.service_inclusions
              or new.terms_sources is distinct from old.terms_sources
              or new.terms_edited is distinct from old.terms_edited
              or (to_jsonb(new) ->> 'quote_id') is distinct from (to_jsonb(old) ->> 'quote_id')) then
        raise exception 'INVOICE_FROZEN' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.documents_terms_guard() from public, anon, authenticated;
create trigger quotes_terms_guard before update on public.quotes for each row execute function public.documents_terms_guard();
create trigger invoices_terms_guard before update on public.invoices for each row execute function public.documents_terms_guard();

update public.price_list_items set title = 'AI & Automation: monthly'
where rate_key = 'support.operations_improvement' and title = 'Operations Improvement Support: monthly';
update public.terms_templates set title = 'AI & Automation'
where target_kind = 'support' and target_key = 'operations_improvement' and title = 'Operations Improvement Support';
