-- Quote portal, slice 1: fixes after the review of 20261018101000_quote_portal_links.sql. That migration is applied,
-- so the two functions are replaced here. Append-only: earlier migrations are applied and are not edited.
--
-- 1. revise_quote keeps what duplicate_quote leaves behind: the scope (service_inclusions), the terms provenance
--    (terms_sources, terms_edited) and the offerings. A revision sent unchanged now goes out with the same inclusions,
--    template versions and offerings as the original. duplicate_quote itself ("Duplicate as new draft") is unchanged.
-- 2. create_quote_access_link refuses an archived quote. Everything else in it is as applied.

-- ---------------------------------------------------------------------------
-- 1. revise_quote. Runs as the table owner, so the terms guards for signed-in roles (documents_terms_guard,
--    documents_terms_edit_guard) do not stop it writing the template columns onto its own new draft.
-- ---------------------------------------------------------------------------
create or replace function public.revise_quote(p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_src public.quotes%rowtype;
  v_new uuid;
begin
  select q.organization_id into v_org from public.quotes q where q.id = p_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_src from public.quotes where id = p_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_src.status not in ('Sent', 'Declined', 'Expired') then
    raise exception 'QUOTE_CANNOT_REVISE' using errcode = '23514';
  end if;
  v_new := public.duplicate_quote(p_id);
  update public.quotes set
    supersedes_quote_id = p_id,
    service_inclusions = v_src.service_inclusions,
    terms_sources = v_src.terms_sources,
    terms_edited = v_src.terms_edited
  where id = v_new and organization_id = v_org;
  insert into public.quote_offerings (organization_id, quote_id, position, offering_kind, offering_key)
  select o.organization_id, v_new, o.position, o.offering_kind, o.offering_key
  from public.quote_offerings o
  where o.quote_id = p_id and o.organization_id = v_org;
  return v_new;
end $$;

revoke all on function public.revise_quote(uuid) from public, anon;
grant execute on function public.revise_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. create_quote_access_link: as applied, plus QUOTE_ARCHIVED_LINK right after the status check.
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
  if v_quote.archived_at is not null then
    raise exception 'QUOTE_ARCHIVED_LINK' using errcode = '23514';
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
