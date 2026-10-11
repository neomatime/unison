-- Pricing and credit model, part 1 hardening (review round 1). Append-only: 20261012100000_rate_card.sql is already applied.
-- 1. A locked line could be moved to another document by changing its parent (invoice_id / quote_id). The parent, like the
--    rest of the content of a locked line, is now fixed for a signed-in role. The function is shared by both line tables,
--    so the parent columns are read through to_jsonb (a column the table does not have reads as null on both sides).
-- 2. A rate card item could be moved to another organisation by an owner or admin who belongs to both. Its organisation is
--    now part of its identity. Custom items (no rate_key) behave exactly as before.
-- The triggers created earlier keep pointing at these functions.

create or replace function public.price_list_items_rate_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.rate_key is not null or new.item_kind is not null or new.package_key is not null or new.credits is not null
         or new.rate_status is not null or new.initiative_limit is not null then
        raise exception 'RATE_CARD_FIXED' using errcode = '23514';
      end if;
    else
      if new.rate_key is distinct from old.rate_key or new.item_kind is distinct from old.item_kind
         or new.package_key is distinct from old.package_key or new.credits is distinct from old.credits
         or new.rate_status is distinct from old.rate_status
         or (old.rate_key is not null and new.organization_id is distinct from old.organization_id) then
        raise exception 'RATE_CARD_FIXED' using errcode = '23514';
      end if;
      if old.rate_key is not null then
        if not public.has_role(old.organization_id, array['owner', 'admin']) then
          raise exception 'RATE_CARD_ADMIN_ONLY' using errcode = '23514';
        end if;
      elsif new.initiative_limit is distinct from old.initiative_limit then
        raise exception 'RATE_CARD_FIXED' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.price_list_items_rate_guard() from public, anon, authenticated;

create or replace function public.document_lines_rate_lock() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.rate_locked then
        raise exception 'RATE_LINE_LOCKED' using errcode = '23514';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.rate_locked is distinct from old.rate_locked then
        raise exception 'RATE_LINE_LOCKED' using errcode = '23514';
      end if;
      -- Position (moving a line within its document) is free; the content of a locked line, and which document it
      -- sits on, are not.
      if old.rate_locked and (
        new.title is distinct from old.title
        or new.description is distinct from old.description
        or new.quantity is distinct from old.quantity
        or new.unit_price is distinct from old.unit_price
        or new.vat_code is distinct from old.vat_code
        or new.price_list_item_id is distinct from old.price_list_item_id
        or new.organization_id is distinct from old.organization_id
        or to_jsonb(new) ->> 'invoice_id' is distinct from to_jsonb(old) ->> 'invoice_id'
        or to_jsonb(new) ->> 'quote_id' is distinct from to_jsonb(old) ->> 'quote_id'
      ) then
        raise exception 'RATE_LINE_LOCKED' using errcode = '23514';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.document_lines_rate_lock() from public, anon, authenticated;
