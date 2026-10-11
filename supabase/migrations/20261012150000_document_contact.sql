-- The client contact a quote or invoice is addressed to ("Attention: ..."), printed under the client's name.
-- Quotes already carry contact_name; invoices get the same column.
-- 1. A quote or invoice that has gone out keeps its contact: a signed-in role cannot change it (QUOTE_FROZEN / INVOICE_FROZEN),
--    the same freeze every other printed detail has. The guard is its own small trigger so the existing document triggers are untouched.
-- 2. An invoice made from a quote (the Create invoice button, or a chosen Source quote) takes the quote's contact when it has none of its own.

alter table public.invoices
  add column contact_name text check (contact_name is null or char_length(contact_name) <= 200);

create or replace function public.documents_contact_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and new.contact_name is distinct from old.contact_name then
    if tg_table_name = 'quotes' and old.status not in ('Draft', 'Internal Review') then
      raise exception 'QUOTE_FROZEN' using errcode = '23514';
    end if;
    if tg_table_name = 'invoices' and old.status <> 'Draft' then
      raise exception 'INVOICE_FROZEN' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger quotes_contact_guard before update on public.quotes
  for each row execute function public.documents_contact_guard();
create trigger invoices_contact_guard before update on public.invoices
  for each row execute function public.documents_contact_guard();

create or replace function public.invoices_contact_from_quote() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.quote_id is not null and (new.contact_name is null or btrim(new.contact_name) = '') then
    select q.contact_name into new.contact_name
    from public.quotes q
    where q.id = new.quote_id and q.organization_id = new.organization_id;
  end if;
  return new;
end $$;

create trigger invoices_contact_from_quote before insert on public.invoices
  for each row execute function public.invoices_contact_from_quote();

revoke all on function public.documents_contact_guard() from public, anon, authenticated;
revoke all on function public.invoices_contact_from_quote() from public, anon, authenticated;
