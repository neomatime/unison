-- Builds on 20261012221817_offerings_on_documents.sql (offering tables, set_document_offerings, set_document_terms, the frozen-column guard).
-- 1. Signed-in roles can no longer write the template columns directly (terms_sources, service_inclusions): set_document_terms is
--    the only write path, so the sources it validated are the sources stored. Direct changes raise TERMS_COLUMNS_GENERATED.
-- 2. terms_edited is set by the database: changing the terms text of a document that was filled from templates marks it
--    "edited from template"; the flag is never set by hand.
-- 3. An invoice created from a quote takes the quote's offerings, so its payment terms can be filled for the same offerings.
--    (The accepted quote's terms sources stay readable through the invoice's quote_id; they are not copied.)

create or replace function public.documents_terms_edit_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_text_column text := case tg_table_name when 'quotes' then 'terms' else 'payment_terms' end;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.terms_sources is not null or new.service_inclusions is not null or new.terms_edited then
      raise exception 'TERMS_COLUMNS_GENERATED' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.terms_sources is distinct from old.terms_sources or new.service_inclusions is distinct from old.service_inclusions then
    raise exception 'TERMS_COLUMNS_GENERATED' using errcode = '23514';
  end if;
  new.terms_edited := old.terms_edited;
  if (to_jsonb(new) ->> v_text_column) is distinct from (to_jsonb(old) ->> v_text_column) and old.terms_sources is not null then
    new.terms_edited := true;
  end if;
  return new;
end $$;

create trigger quotes_terms_edit_guard before insert or update on public.quotes
  for each row execute function public.documents_terms_edit_guard();
create trigger invoices_terms_edit_guard before insert or update on public.invoices
  for each row execute function public.documents_terms_edit_guard();
revoke all on function public.documents_terms_edit_guard() from public, anon, authenticated;

-- The same function as before (20261012120000), plus the quote's offerings.
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
      project_name, project_description, project_ref, client_ref, engagement_id, billing_kind)
    values (
      v_org, v_quote.client_id, v_quote.client_name, v_quote.owner_id, v_quote.opportunity_id, v_quote.id, v_quote.currency, 'Draft',
      v_quote.project_name, v_quote.project_description, v_quote.project_ref, v_quote.client_ref, v_quote.engagement_id, v_quote.billing_kind)
    returning id into v_new;
  exception when unique_violation then
    raise exception 'FIRST_INVOICE_EXISTS' using errcode = '23514';
  end;

  insert into public.invoice_lines (organization_id, invoice_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id, rate_locked)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code, l.price_list_item_id, l.rate_locked
  from public.quote_lines l
  where l.quote_id = p_quote_id and l.organization_id = v_org;

  insert into public.invoice_offerings (organization_id, invoice_id, position, offering_kind, offering_key)
  select o.organization_id, v_new, o.position, o.offering_kind, o.offering_key
  from public.quote_offerings o
  where o.quote_id = p_quote_id and o.organization_id = v_org;

  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_org, 'quote.invoiced', 'Draft invoice created from quote ' || v_quote.quote_number,
          jsonb_build_object('invoice_id', v_new, 'quote_id', p_quote_id, 'quote_number', v_quote.quote_number),
          public.activity_actor(v_org), p_quote_id);

  return v_new;
end $$;

revoke all on function public.create_invoice_from_quote(uuid) from public, anon;
grant execute on function public.create_invoice_from_quote(uuid) to authenticated;
