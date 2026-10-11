-- Pick a package on the quote or invoice itself.
-- fill_document_from_package: a new, still empty draft quote or invoice gets the lines of a package at the rate card prices
--   (a retainer tier: its monthly fee and its one-time implementation fee; a project: its project fee).
-- add_rate_card_line: one rate card item (retainer, implementation fee, project, support service, top-up credits) added to a
--   draft quote or invoice at its fixed price.
-- Both create LOCKED lines (a signed-in role cannot create or change those directly), only on a draft in the caller's own
-- organisation, and neither links the document to a client package (the Billing package section keeps its own once-only
-- rules). Append-only: earlier migrations are not edited.

create or replace function public.fill_document_from_package(p_kind text, p_document uuid, p_package_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_status text;
  v_lines integer;
  v_item public.price_list_items%rowtype;
  v_impl public.price_list_items%rowtype;
begin
  if p_kind not in ('quote', 'invoice') then
    raise exception 'DOCUMENT_KIND_UNKNOWN' using errcode = '22023';
  end if;
  if p_kind = 'quote' then
    select q.organization_id, q.status into v_org, v_status from public.quotes q where q.id = p_document for update;
  else
    select i.organization_id, i.status into v_org, v_status from public.invoices i where i.id = p_document for update;
  end if;
  if not found or not public.is_member_of(v_org) then
    if p_kind = 'quote' then
      raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
    end if;
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  if p_kind = 'quote' and v_status not in ('Draft', 'Internal Review') then
    raise exception 'QUOTE_NOT_DRAFT' using errcode = '23514';
  end if;
  if p_kind = 'invoice' and v_status <> 'Draft' then
    raise exception 'INVOICE_NOT_DRAFT' using errcode = '23514';
  end if;
  if p_kind = 'quote' then
    select count(*) into v_lines from public.quote_lines l where l.quote_id = p_document and l.organization_id = v_org;
  else
    select count(*) into v_lines from public.invoice_lines l where l.invoice_id = p_document and l.organization_id = v_org;
  end if;
  if v_lines > 0 then
    raise exception 'DOCUMENT_NOT_EMPTY' using errcode = '23514';
  end if;

  select * into v_item from public.price_list_items
  where organization_id = v_org and package_key = p_package_key
    and item_kind in ('retainer_monthly', 'project') and archived_at is null;
  if not found then
    raise exception 'PACKAGE_UNKNOWN' using errcode = '23514';
  end if;

  perform private.add_rate_line(p_kind, p_document, v_org, 1, v_item, 1);
  if v_item.item_kind = 'retainer_monthly' then
    v_impl := private.rate_item(v_org, 'retainer.' || p_package_key || '.implementation');
    perform private.add_rate_line(p_kind, p_document, v_org, 2, v_impl, 1);
  end if;
end $$;

create or replace function public.add_rate_card_line(p_kind text, p_document uuid, p_rate_key text, p_quantity numeric default 1) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_status text;
  v_position integer;
  v_item public.price_list_items%rowtype;
begin
  if p_kind not in ('quote', 'invoice') then
    raise exception 'DOCUMENT_KIND_UNKNOWN' using errcode = '22023';
  end if;
  if p_kind = 'quote' then
    select q.organization_id, q.status into v_org, v_status from public.quotes q where q.id = p_document for update;
  else
    select i.organization_id, i.status into v_org, v_status from public.invoices i where i.id = p_document for update;
  end if;
  if not found or not public.is_member_of(v_org) then
    if p_kind = 'quote' then
      raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
    end if;
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  if p_kind = 'quote' and v_status not in ('Draft', 'Internal Review') then
    raise exception 'QUOTE_NOT_DRAFT' using errcode = '23514';
  end if;
  if p_kind = 'invoice' and v_status <> 'Draft' then
    raise exception 'INVOICE_NOT_DRAFT' using errcode = '23514';
  end if;

  v_item := private.rate_item(v_org, p_rate_key);
  -- Top-up credits are bought by the whole credit; every other item is one of itself.
  if v_item.item_kind in ('retainer_top_up', 'project_top_up') then
    if p_quantity is null or p_quantity < 1 or p_quantity > 10000 or p_quantity <> trunc(p_quantity) then
      raise exception 'RATE_QUANTITY_INVALID' using errcode = '23514';
    end if;
  elsif p_quantity is distinct from 1 then
    raise exception 'RATE_QUANTITY_INVALID' using errcode = '23514';
  end if;

  if p_kind = 'quote' then
    select coalesce(max(l.position), 0) + 1 into v_position from public.quote_lines l where l.quote_id = p_document and l.organization_id = v_org;
  else
    select coalesce(max(l.position), 0) + 1 into v_position from public.invoice_lines l where l.invoice_id = p_document and l.organization_id = v_org;
  end if;
  perform private.add_rate_line(p_kind, p_document, v_org, v_position, v_item, p_quantity);
end $$;

revoke all on function public.fill_document_from_package(text, uuid, text) from public, anon;
revoke all on function public.add_rate_card_line(text, uuid, text, numeric) from public, anon;
grant execute on function public.fill_document_from_package(text, uuid, text) to authenticated;
grant execute on function public.add_rate_card_line(text, uuid, text, numeric) to authenticated;
