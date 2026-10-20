-- Quote portal, slice 1: a revision supersedes its original only when both are for the same client.
-- Replaces the trigger function from 20261018101000_quote_portal_links.sql (section 5). That migration is applied, so
-- the function is replaced here. Append-only: earlier migrations are applied and are not edited.
--
-- Staff can change a revision draft's client before sending it. Before this change, sending such a revision moved the
-- other client's quote to Superseded and revoked its links, and the guard (quotes_supersede_guard) stops staff from
-- undoing that. Now a revision whose client differs from the original's supersedes nothing: the original stays Sent and
-- its links stay active. A same-client revision behaves exactly as before. send_quote requires a client, so a Sent
-- quote always has one; "is not distinct from" keeps the comparison exact even so.
--
-- The trigger (quotes_supersede_original, after update on public.quotes) is unchanged and is not recreated.
-- create or replace keeps the function's owner and privileges (execute for postgres and service_role only); the
-- revoke below is the one 20261018101000 states, repeated so this file says what they are, and changes nothing.

create or replace function public.quotes_supersede_original() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_client uuid;
begin
  if old.status in ('Draft', 'Internal Review') and new.status = 'Sent' and new.supersedes_quote_id is not null then
    select q.status, q.client_id into v_status, v_client from public.quotes q
     where q.id = new.supersedes_quote_id and q.organization_id = new.organization_id
     for update;
    if found and v_status = 'Sent' and v_client is not distinct from new.client_id then
      update public.quotes set status = 'Superseded'
       where id = new.supersedes_quote_id and organization_id = new.organization_id;
      update public.quote_access_links set revoked_at = now(), revoked_reason = 'superseded'
       where quote_id = new.supersedes_quote_id and organization_id = new.organization_id and revoked_at is null;
    end if;
  end if;
  return new;
end $$;

revoke all on function public.quotes_supersede_original() from public, anon, authenticated;
