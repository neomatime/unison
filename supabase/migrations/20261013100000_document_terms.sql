-- Commercial terms on quotes and invoices (build 2 of the terms engine).
-- A document remembers which approved template versions produced its terms, which offerings it was filled for, and its
-- service inclusions. Signed-in roles never write these columns directly: set_document_terms is the only write path
-- (it validates the sources), and a small trigger keeps them frozen once the document has gone out. The existing document
-- triggers and send_quote / issue_invoice are untouched: they already freeze the terms text.
-- An invoice created from a quote also records the sources the client accepted (quote_terms_sources) and takes the quote's
-- offerings and inclusions; its payment terms are resolved separately, so terms_sources on an invoice always describes
-- its own payment terms.

alter table public.quotes
  add column terms_sources jsonb not null default '[]'::jsonb check (jsonb_typeof(terms_sources) = 'array'),
  add column terms_inclusions text check (terms_inclusions is null or char_length(terms_inclusions) <= 10000),
  add column terms_edited boolean not null default false,
  add column terms_offerings text[] not null default '{}' check (cardinality(terms_offerings) <= 10);

alter table public.invoices
  add column terms_sources jsonb not null default '[]'::jsonb check (jsonb_typeof(terms_sources) = 'array'),
  add column terms_inclusions text check (terms_inclusions is null or char_length(terms_inclusions) <= 10000),
  add column terms_edited boolean not null default false,
  add column terms_offerings text[] not null default '{}' check (cardinality(terms_offerings) <= 10),
  add column quote_terms_sources jsonb not null default '[]'::jsonb check (jsonb_typeof(quote_terms_sources) = 'array');

create or replace function public.documents_terms_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_text_column text := case tg_table_name when 'quotes' then 'terms' else 'payment_terms' end;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.terms_sources <> '[]'::jsonb or new.terms_inclusions is not null or new.terms_edited or cardinality(new.terms_offerings) > 0
       or (tg_table_name = 'invoices' and v_new -> 'quote_terms_sources' <> '[]'::jsonb) then
      raise exception 'TERMS_COLUMNS_GENERATED' using errcode = '23514';
    end if;
    return new;
  end if;
  v_old := to_jsonb(old);
  if new.terms_sources is distinct from old.terms_sources
     or new.terms_inclusions is distinct from old.terms_inclusions
     or new.terms_offerings is distinct from old.terms_offerings
     or (v_new -> 'quote_terms_sources') is distinct from (v_old -> 'quote_terms_sources') then
    raise exception 'TERMS_COLUMNS_GENERATED' using errcode = '23514';
  end if;
  -- Typing over filled terms is remembered; the flag is never set by hand.
  new.terms_edited := old.terms_edited;
  if (v_new ->> v_text_column) is distinct from (v_old ->> v_text_column) and jsonb_array_length(old.terms_sources) > 0 then
    new.terms_edited := true;
  end if;
  return new;
end $$;

create trigger quotes_terms_guard before insert or update on public.quotes
  for each row execute function public.documents_terms_guard();
create trigger invoices_terms_guard before insert or update on public.invoices
  for each row execute function public.documents_terms_guard();
revoke all on function public.documents_terms_guard() from public, anon, authenticated;

create or replace function public.set_document_terms(
  p_kind text, p_id uuid, p_terms text, p_inclusions text, p_sources jsonb, p_offerings text[], p_edited boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_status text;
  v_source jsonb;
  v_offering text;
  v_terms text := nullif(btrim(replace(coalesce(p_terms, ''), E'\r', '')), '');
  v_inclusions text := nullif(btrim(replace(coalesce(p_inclusions, ''), E'\r', '')), '');
begin
  if p_kind not in ('quote', 'invoice') then
    raise exception 'TERMS_NOT_FOUND' using errcode = '42501';
  end if;
  if p_kind = 'quote' then
    select organization_id, status into v_org, v_status from public.quotes where id = p_id for update;
  else
    select organization_id, status into v_org, v_status from public.invoices where id = p_id for update;
  end if;
  if not found or not public.is_member_of(v_org) then
    raise exception 'TERMS_NOT_FOUND' using errcode = '42501';
  end if;
  if (p_kind = 'quote' and v_status not in ('Draft', 'Internal Review')) or (p_kind = 'invoice' and v_status <> 'Draft') then
    raise exception 'TERMS_NOT_DRAFT_DOCUMENT' using errcode = '23514';
  end if;
  if char_length(coalesce(v_terms, '')) > 20000 or char_length(coalesce(v_inclusions, '')) > 10000 then
    raise exception 'TERMS_TOO_LONG' using errcode = '23514';
  end if;

  if p_sources is null or jsonb_typeof(p_sources) <> 'array' or jsonb_array_length(p_sources) > 20 then
    raise exception 'TERMS_SOURCE_INVALID' using errcode = '23514';
  end if;
  for v_source in select * from jsonb_array_elements(p_sources) loop
    if jsonb_typeof(v_source) <> 'object'
       or coalesce(v_source ->> 'version_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (
         select 1 from public.terms_template_versions v
         where v.id = (v_source ->> 'version_id')::uuid and v.organization_id = v_org and v.status in ('approved', 'archived')
           and v.template_id::text = v_source ->> 'template_id' and v.version::text = v_source ->> 'version'
       ) then
      raise exception 'TERMS_SOURCE_INVALID' using errcode = '23514';
    end if;
  end loop;

  if coalesce(cardinality(p_offerings), 0) > 10 then
    raise exception 'TERMS_OFFERING_UNKNOWN' using errcode = '23514';
  end if;
  foreach v_offering in array coalesce(p_offerings, '{}') loop
    if v_offering !~ '^(retainer|project|support)\.[a-z0-9_]{1,60}$' then
      raise exception 'TERMS_OFFERING_UNKNOWN' using errcode = '23514';
    end if;
  end loop;

  if p_kind = 'quote' then
    update public.quotes
       set terms = v_terms, terms_inclusions = v_inclusions, terms_sources = p_sources,
           terms_offerings = coalesce(p_offerings, '{}'), terms_edited = coalesce(p_edited, false)
     where id = p_id;
  else
    update public.invoices
       set payment_terms = v_terms, terms_inclusions = v_inclusions, terms_sources = p_sources,
           terms_offerings = coalesce(p_offerings, '{}'), terms_edited = coalesce(p_edited, false)
     where id = p_id;
  end if;
end $$;

revoke all on function public.set_document_terms(text, uuid, text, text, jsonb, text[], boolean) from public, anon;
grant execute on function public.set_document_terms(text, uuid, text, text, jsonb, text[], boolean) to authenticated;

-- The same function as before (20261012120000), plus the quote's offerings, inclusions and accepted sources.
create or replace function public.create_invoice_from_quote(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_quote public.quotes%rowtype;
  v_new uuid;
begin
  select q.organization_id into v_org from public.quotes q where q.id = p_quote_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  -- The row lock serialises two simultaneous calls on the same quote and stops a status change in between.
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_quote.archived_at is not null then
    raise exception 'QUOTE_ARCHIVED' using errcode = '23514';
  end if;
  if v_quote.status <> 'Accepted' then
    raise exception 'QUOTE_NOT_ACCEPTED' using errcode = '23514';
  end if;

  begin
    insert into public.invoices (
      organization_id, client_id, client_name, owner_id, opportunity_id, quote_id, currency, status,
      project_name, project_description, project_ref, client_ref, engagement_id, billing_kind,
      terms_offerings, terms_inclusions, quote_terms_sources)
    values (
      v_org, v_quote.client_id, v_quote.client_name, v_quote.owner_id, v_quote.opportunity_id, v_quote.id, v_quote.currency, 'Draft',
      v_quote.project_name, v_quote.project_description, v_quote.project_ref, v_quote.client_ref, v_quote.engagement_id, v_quote.billing_kind,
      v_quote.terms_offerings, v_quote.terms_inclusions, v_quote.terms_sources)
    returning id into v_new;
  exception when unique_violation then
    raise exception 'FIRST_INVOICE_EXISTS' using errcode = '23514';
  end;

  insert into public.invoice_lines (organization_id, invoice_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id, rate_locked)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code, l.price_list_item_id, l.rate_locked
  from public.quote_lines l
  where l.quote_id = p_quote_id and l.organization_id = v_org;

  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_org, 'quote.invoiced', 'Draft invoice created from quote ' || v_quote.quote_number,
          jsonb_build_object('invoice_id', v_new, 'quote_id', p_quote_id, 'quote_number', v_quote.quote_number),
          public.activity_actor(v_org), p_quote_id);

  return v_new;
end $$;

revoke all on function public.create_invoice_from_quote(uuid) from public, anon;
grant execute on function public.create_invoice_from_quote(uuid) to authenticated;
