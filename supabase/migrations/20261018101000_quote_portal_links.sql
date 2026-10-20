-- Quote portal, slice 1: the functions that create and revoke a client link, revise a quote, supersede the original
-- when its revision is sent, and expire quotes nightly; and the guard that keeps "Superseded" automatic.
-- Builds on 20261018100000_quote_portal_schema.sql. Append-only: earlier migrations are applied and are not edited.
--
-- Every function here is security definer with an empty search_path, so each runs as the table owner: the
-- signed-in-role guards on quotes (current_user in authenticated/anon) do not apply to what they write, and
-- private.index_record_change accepts the owner.

-- ---------------------------------------------------------------------------
-- 1. duplicate_quote: the body from 20261013240000_drop_retired_billing_columns.sql, with charge_kind copied on
--    every line. create or replace keeps the grants; they are stated again so this file says what they are.
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_quote(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_src public.quotes%rowtype;
  v_new uuid;
begin
  select * into v_src from public.quotes where id = p_id;
  if not found or not public.is_member_of(v_src.organization_id) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  insert into public.quotes (
    organization_id, client_id, client_name, contact_name, lead_id, opportunity_id, owner_id, currency, status,
    terms, notes, project_name, project_description, project_ref, client_ref)
  values (
    v_src.organization_id, v_src.client_id, v_src.client_name, v_src.contact_name, v_src.lead_id, v_src.opportunity_id,
    v_src.owner_id, v_src.currency, 'Draft', v_src.terms, v_src.notes, v_src.project_name, v_src.project_description,
    v_src.project_ref, v_src.client_ref)
  returning id into v_new;
  insert into public.quote_lines (organization_id, quote_id, position, title, description, quantity, unit_price, vat_code, charge_kind)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code, l.charge_kind
  from public.quote_lines l
  where l.quote_id = p_id and l.organization_id = v_src.organization_id;
  return v_new;
end $$;

revoke all on function public.duplicate_quote(uuid) from public, anon;
grant execute on function public.duplicate_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. create_quote_access_link: one link for one recipient of a Sent quote. Returns the raw token once; only its
--    sha256 is stored, and the token is never written, logged or raised. The link expires at the start of the
--    day after valid_until in South African time (so a quote valid until today stays reachable until midnight
--    there), or 30 days after creation when the quote has no valid-until date.
-- ---------------------------------------------------------------------------
create or replace function public.create_quote_access_link(p_quote_id uuid, p_recipient_email text, p_recipient_name text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_quote public.quotes%rowtype;
  v_email text := lower(btrim(coalesce(p_recipient_email, '')));
  v_expires timestamptz;
  v_token text;
begin
  -- A caller outside the organisation learns nothing, not even that the quote exists.
  select q.organization_id into v_org from public.quotes q where q.id = p_quote_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  if not coalesce((select s.quote_portal_enabled from public.organization_settings s where s.organization_id = v_org), false) then
    raise exception 'QUOTE_PORTAL_OFF' using errcode = '23514';
  end if;
  -- The row lock keeps the status from changing while the link is made, so a supersede at the same moment
  -- waits for this link and then revokes it with the others.
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_quote.status <> 'Sent' then
    raise exception 'QUOTE_NOT_SENT' using errcode = '23514';
  end if;
  -- One plain ASCII address: the same rule as isValidEmailAddress and record_document_email.
  if char_length(v_email) > 254
     or v_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?[.])+[A-Za-z]{2,}$'
     or v_email ~ '(^[.]|[.]@|[.][.])' then
    raise exception 'RECIPIENT_INVALID' using errcode = '23514';
  end if;
  if v_quote.valid_until is null then
    v_expires := now() + interval '30 days';
  else
    v_expires := ((v_quote.valid_until + 1)::timestamp at time zone 'Africa/Johannesburg');
  end if;
  if v_expires <= now() then
    raise exception 'QUOTE_EXPIRED' using errcode = '23514';
  end if;

  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  insert into public.quote_access_links (organization_id, quote_id, token_hash, recipient_email, recipient_name, created_by, expires_at)
  values (v_org, p_quote_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_email, nullif(btrim(p_recipient_name), ''),
          public.activity_actor(v_org), v_expires);
  return v_token;
end $$;

revoke all on function public.create_quote_access_link(uuid, text, text) from public, anon;
grant execute on function public.create_quote_access_link(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. revoke_quote_access_link: idempotent. A link already revoked keeps its original time and reason.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_quote_access_link(p_link_id uuid, p_reason text default 'revoked by staff')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select l.organization_id into v_org from public.quote_access_links l where l.id = p_link_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'LINK_NOT_FOUND' using errcode = '42501';
  end if;
  update public.quote_access_links
     set revoked_at = now(), revoked_reason = coalesce(nullif(btrim(p_reason), ''), 'revoked by staff')
   where id = p_link_id and organization_id = v_org and revoked_at is null;
end $$;

revoke all on function public.revoke_quote_access_link(uuid, text) from public, anon;
grant execute on function public.revoke_quote_access_link(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. revise_quote: a new draft copied from a Sent, Declined or Expired quote, pointing back at it. The original
--    changes only when the revision is sent (section 5).
-- ---------------------------------------------------------------------------
create or replace function public.revise_quote(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_status text;
  v_new uuid;
begin
  select q.organization_id into v_org from public.quotes q where q.id = p_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  select q.status into v_status from public.quotes q where q.id = p_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_status not in ('Sent', 'Declined', 'Expired') then
    raise exception 'QUOTE_CANNOT_REVISE' using errcode = '23514';
  end if;
  v_new := public.duplicate_quote(p_id);
  update public.quotes set supersedes_quote_id = p_id where id = v_new and organization_id = v_org;
  return v_new;
end $$;

revoke all on function public.revise_quote(uuid) from public, anon;
grant execute on function public.revise_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Sending a revision supersedes its original, but only an original that is still Sent: an Accepted, Declined
--    or Expired original keeps its status, its record and its links. Only send_quote (and the service role) can
--    move a quote from a draft status to Sent, so this runs inside the send.
-- ---------------------------------------------------------------------------
create or replace function public.quotes_supersede_original() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  if old.status in ('Draft', 'Internal Review') and new.status = 'Sent' and new.supersedes_quote_id is not null then
    select q.status into v_status from public.quotes q
     where q.id = new.supersedes_quote_id and q.organization_id = new.organization_id
     for update;
    if found and v_status = 'Sent' then
      update public.quotes set status = 'Superseded'
       where id = new.supersedes_quote_id and organization_id = new.organization_id;
      update public.quote_access_links set revoked_at = now(), revoked_reason = 'superseded'
       where quote_id = new.supersedes_quote_id and organization_id = new.organization_id and revoked_at is null;
    end if;
  end if;
  return new;
end $$;

create trigger quotes_supersede_original after update on public.quotes
  for each row
  when (old.status in ('Draft', 'Internal Review') and new.status = 'Sent' and new.supersedes_quote_id is not null)
  execute function public.quotes_supersede_original();
revoke all on function public.quotes_supersede_original() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The guard: a signed-in role cannot point a quote that has gone out at another one, set Superseded, or move a
--    Superseded quote to another status. Superseded is set only by section 5. The definer functions above, the
--    nightly job, postgres and the service role are not held to it. A draft's pointer stays editable.
-- ---------------------------------------------------------------------------
create or replace function public.quotes_supersede_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if old.status not in ('Draft', 'Internal Review') and new.supersedes_quote_id is distinct from old.supersedes_quote_id then
      raise exception 'QUOTE_SUPERSEDED_AUTOMATIC' using errcode = '23514';
    end if;
    if new.status = 'Superseded' and old.status <> 'Superseded' then
      raise exception 'QUOTE_SUPERSEDED_AUTOMATIC' using errcode = '23514';
    end if;
    if old.status = 'Superseded' and new.status <> 'Superseded' then
      raise exception 'QUOTE_SUPERSEDED_AUTOMATIC' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger quotes_supersede_guard before update on public.quotes
  for each row execute function public.quotes_supersede_guard();
revoke all on function public.quotes_supersede_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. The nightly job: Sent quotes whose valid-until date has passed in South African time become Expired, and
--    their links are revoked. A quote valid until today is left until tomorrow's run. Called by pg_cron as the
--    database owner for every organisation and, in tests, by the service role for one organisation.
-- ---------------------------------------------------------------------------
create or replace function public.mark_expired_quotes(p_organization_id uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_count integer := 0;
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  for r in
    select q.id, q.organization_id
    from public.quotes q
    where q.status = 'Sent'
      and q.archived_at is null
      and q.valid_until < v_today
      and (p_organization_id is null or q.organization_id = p_organization_id)
    order by q.id
    for update skip locked
  loop
    update public.quotes set status = 'Expired' where id = r.id and organization_id = r.organization_id;
    update public.quote_access_links set revoked_at = now(), revoked_reason = 'expired'
     where quote_id = r.id and organization_id = r.organization_id and revoked_at is null;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke all on function public.mark_expired_quotes(uuid) from public, anon, authenticated;
grant execute on function public.mark_expired_quotes(uuid) to service_role;

create extension if not exists pg_cron;
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'unison-mark-expired-quotes') then
    perform cron.schedule('unison-mark-expired-quotes', '10 22 * * *', 'select public.mark_expired_quotes();');
  end if;
end;
$$;
