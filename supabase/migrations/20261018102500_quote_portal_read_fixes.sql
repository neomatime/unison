-- Quote portal, slice 1, read-side fixes (review of 20261018102000_quote_portal_read.sql). Append-only: the applied
-- migrations are not edited; the four functions below are replaced with the same signatures and their grants stated
-- again.
--
-- 1. A revoked link is invalid unless the system revoked it for the state its quote is in (Ruling 13): a link staff
--    revoked (a wrong address, an email that was never sent) no longer shows the superseded card when its quote is
--    later superseded. Accepted and Declined come before any date check, so a client who decided still reaches the
--    record after valid_until.
-- 2. revoke_quote_access_link cannot store the system's reasons 'expired' or 'superseded', and a reason is at most
--    500 characters (Ruling 15). The supersede trigger and mark_expired_quotes set their reasons directly.
-- 3. private.quote_snapshot renders timestamps in UTC in every session (Ruling 16).
-- 4. replaces_number names only a numbered predecessor of the same client (Ruling 17).
-- 5. The expired and superseded payloads carry no recipient and no link expiry (Ruling 18).

-- ---------------------------------------------------------------------------
-- 1. private.quote_snapshot: unchanged but for `set timezone = 'UTC'`, so sent_at and accepted_at read the same
--    (ending +00:00) whichever session calls it. Same key set and ordering.
-- ---------------------------------------------------------------------------
create or replace function private.quote_snapshot(p_quote_id uuid) returns jsonb
language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select jsonb_build_object(
    'record', jsonb_build_object(
      'quote_number', q.quote_number,
      'status', q.status,
      'issue_date', q.issue_date,
      'valid_until', q.valid_until,
      'currency', q.currency,
      'client_name', q.client_name,
      'contact_name', q.contact_name,
      'client_ref', q.client_ref,
      'project_name', q.project_name,
      'project_description', q.project_description,
      'project_ref', q.project_ref,
      'vat_rate', q.vat_rate,
      'subtotal', q.subtotal,
      'tax_amount', q.tax_amount,
      'total_amount', q.total_amount,
      'terms', q.terms,
      'service_inclusions', q.service_inclusions,
      'terms_sources', case when q.terms_sources is null then null else (
        select coalesce(jsonb_agg(jsonb_build_object('layer', s.value -> 'layer', 'version', s.value -> 'version') order by s.ordinality), '[]'::jsonb)
        from jsonb_array_elements(q.terms_sources) with ordinality as s(value, ordinality)) end,
      'bill_to', q.bill_to,
      'issuer', q.issuer,
      'sent_at', q.sent_at,
      'accepted_at', q.accepted_at),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'position', l.position,
        'title', l.title,
        'description', l.description,
        'quantity', l.quantity,
        'unit_price', l.unit_price,
        'vat_code', l.vat_code,
        'line_amount', l.line_amount,
        'charge_kind', l.charge_kind) order by l.position, l.id)
      from public.quote_lines l
      where l.quote_id = q.id and l.organization_id = q.organization_id), '[]'::jsonb))
  from public.quotes q
  where q.id = p_quote_id
$$;

revoke all on function private.quote_snapshot(uuid) from public, anon, authenticated;
grant execute on function private.quote_snapshot(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. portal_get_quote. Stable, so it cannot write. The token's shape is checked before it is hashed or looked up;
--    every invalid answer is exactly { "state": "invalid" }. The state, in this order:
--      (0) the quote is archived: invalid;
--      (1) the link is revoked, and not by the system for the state the quote is in ('superseded' on a Superseded
--          quote, or 'expired'): invalid;
--      (2) Superseded: superseded;
--      (3) Accepted: accepted; Declined: declined (before any date: the quote's status is authoritative);
--      (4) a remaining revoked link ('expired'), now() >= expires_at, or Expired: expired;
--      (5) Sent: open;
--      (6) anything else: invalid.
--    Expired and superseded carry only the number, client and valid-until date, with the version, the replaced
--    number and the owner: no lines, no recipient, no link expiry.
-- ---------------------------------------------------------------------------
create or replace function public.portal_get_quote(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_invalid constant jsonb := jsonb_build_object('state', 'invalid');
  v_link public.quote_access_links%rowtype;
  v_quote public.quotes%rowtype;
  v_reason text;
  v_state text;
  v_version integer;
  v_replaces text;
  v_owner jsonb;
  v_snapshot jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return v_invalid;
  end if;
  select * into v_link from public.quote_access_links l
   where l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then
    return v_invalid;
  end if;
  select * into v_quote from public.quotes q
   where q.id = v_link.quote_id and q.organization_id = v_link.organization_id;
  if not found then
    return v_invalid;
  end if;
  v_reason := coalesce(v_link.revoked_reason, '');

  if v_quote.archived_at is not null then
    return v_invalid;
  elsif v_link.revoked_at is not null
        and not ((v_reason = 'superseded' and v_quote.status = 'Superseded') or v_reason = 'expired') then
    return v_invalid;
  elsif v_quote.status = 'Superseded' then
    v_state := 'superseded';
  elsif v_quote.status = 'Accepted' then
    v_state := 'accepted';
  elsif v_quote.status = 'Declined' then
    v_state := 'declined';
  elsif v_link.revoked_at is not null or now() >= v_link.expires_at or v_quote.status = 'Expired' then
    v_state := 'expired';
  elsif v_quote.status = 'Sent' then
    v_state := 'open';
  else
    return v_invalid;
  end if;

  -- Version: 1 plus the quotes before this one along supersedes_quote_id. A draft can be pointed into a cycle, so
  -- the walk never revisits a quote and stops at 50.
  with recursive chain(id, previous_id, path) as (
    select v_quote.id, v_quote.supersedes_quote_id, array[v_quote.id]
    union all
    select p.id, p.supersedes_quote_id, c.path || p.id
    from chain c
    join public.quotes p on p.id = c.previous_id and p.organization_id = v_quote.organization_id
    where not p.id = any(c.path) and cardinality(c.path) < 50
  )
  select max(cardinality(c.path)) into v_version from chain c;

  -- The replaced number is shown only when it is the same client's and a real number.
  select p.quote_number into v_replaces from public.quotes p
   where p.id = v_quote.supersedes_quote_id and p.organization_id = v_quote.organization_id
     and p.client_id = v_quote.client_id
     and p.quote_number is not null and p.quote_number not like 'DRAFT-%';

  select jsonb_build_object('name', t.full_name, 'email', t.email, 'job_title', t.job_title) into v_owner
  from public.team_members t
  where t.id = v_quote.owner_id and t.organization_id = v_quote.organization_id;

  if v_state in ('open', 'accepted', 'declined') then
    v_snapshot := private.quote_snapshot(v_quote.id);
    return jsonb_build_object(
      'state', v_state,
      'expires_at', v_link.expires_at,
      'recipient_email', v_link.recipient_email,
      'recipient_name', v_link.recipient_name,
      'record', v_snapshot -> 'record',
      'lines', v_snapshot -> 'lines',
      'version', v_version,
      'replaces_number', v_replaces,
      'owner', v_owner);
  end if;

  return jsonb_build_object(
    'state', v_state,
    'record', jsonb_build_object('quote_number', v_quote.quote_number, 'client_name', v_quote.client_name, 'valid_until', v_quote.valid_until),
    'version', v_version,
    'replaces_number', v_replaces,
    'owner', v_owner);
end $$;

revoke all on function public.portal_get_quote(text) from public, anon, authenticated;
grant execute on function public.portal_get_quote(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. portal_record_view: the same state rules, through portal_get_quote, so an accepted or declined link past its
--    expiry is stamped and a revoked one never is. The link row is locked before the state is read, so a revoke
--    or a supersede cannot land between the check and the stamp. Only the link row is written.
-- ---------------------------------------------------------------------------
create or replace function public.portal_record_view(p_token text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_link_id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return;
  end if;
  select l.id into v_link_id from public.quote_access_links l
   where l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   for update;
  if not found then
    return;
  end if;
  if (public.portal_get_quote(p_token) ->> 'state') in ('open', 'accepted', 'declined') then
    update public.quote_access_links
       set first_viewed_at = coalesce(first_viewed_at, now()), last_viewed_at = now()
     where id = v_link_id;
  end if;
end $$;

revoke all on function public.portal_record_view(text) from public, anon, authenticated;
grant execute on function public.portal_record_view(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. revoke_quote_access_link: the body of 20261018101000_quote_portal_links.sql, except that the reserved reasons
--    'expired' and 'superseded' (after trimming, in any case) and a blank reason become 'revoked by staff', and the
--    reason is cut to 500 characters. Still idempotent: a revoked link keeps its first time and reason.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_quote_access_link(p_link_id uuid, p_reason text default 'revoked by staff')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select l.organization_id into v_org from public.quote_access_links l where l.id = p_link_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'LINK_NOT_FOUND' using errcode = '42501';
  end if;
  if v_reason = '' or lower(v_reason) in ('expired', 'superseded') then
    v_reason := 'revoked by staff';
  end if;
  update public.quote_access_links
     set revoked_at = now(), revoked_reason = left(v_reason, 500)
   where id = p_link_id and organization_id = v_org and revoked_at is null;
end $$;

revoke all on function public.revoke_quote_access_link(uuid, text) from public, anon;
grant execute on function public.revoke_quote_access_link(uuid, text) to authenticated;
