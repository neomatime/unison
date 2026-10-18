-- Quote portal, slice 1: the read side of the public portal. These are the only way an unauthenticated link holder
-- reaches quote data, and only through the service role, from one server module: nothing here is granted to anon or
-- authenticated, so the public key cannot reach a quote through the database API.
-- Builds on 20261018100000_quote_portal_schema.sql and 20261018101000_quote_portal_links.sql. Append-only: earlier
-- migrations are applied and are not edited.
--
-- private.quote_snapshot  the frozen record and lines a client is shown (shared with slice 2, which hashes it).
-- portal_get_quote        reads a link and its quote; never writes.
-- portal_record_view      the only writer: stamps the link's viewed times, never the quote.

-- ---------------------------------------------------------------------------
-- 1. private.quote_snapshot: the frozen quote as the client sees it. A fixed key set and lines ordered by position
--    then id, so the output is deterministic for slice 2's hash. It never carries notes, the owner, the
--    organisation or any database id but the lines' own: terms_sources keeps each template layer and version and
--    drops their ids. Security invoker: it runs with the rights of the definer function that calls it. The private
--    schema grants usage to no API role and is not exposed through the data API (as in
--    20260911154613_phase_seven_eight_platform_automation.sql), so the grant below cannot be used from outside.
-- ---------------------------------------------------------------------------
create or replace function private.quote_snapshot(p_quote_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
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
-- 2. portal_get_quote: what a link shows. Stable, so it cannot write: opening or refreshing the portal, or a mail
--    scanner fetching the link, changes nothing. The token's shape is checked before it is hashed or looked up,
--    and a malformed, unknown or revoked token gets exactly { "state": "invalid" }, whichever it was.
--    The state, in this order: an archived quote is invalid (staff withdrew it); Superseded is superseded; a link
--    revoked for any reason but 'expired' is invalid; a link revoked as 'expired' by the nightly job, past its
--    expires_at, or on an Expired quote is expired; then Accepted, Declined, and Sent (open); anything else is
--    invalid. Expired and superseded show only the number, client and valid-until date.
-- ---------------------------------------------------------------------------
create or replace function public.portal_get_quote(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_invalid constant jsonb := jsonb_build_object('state', 'invalid');
  v_link public.quote_access_links%rowtype;
  v_quote public.quotes%rowtype;
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

  if v_quote.archived_at is not null then
    return v_invalid;
  elsif v_quote.status = 'Superseded' then
    v_state := 'superseded';
  elsif v_link.revoked_at is not null and v_link.revoked_reason is distinct from 'expired' then
    return v_invalid;
  elsif v_link.revoked_at is not null or now() >= v_link.expires_at or v_quote.status = 'Expired' then
    v_state := 'expired';
  elsif v_quote.status = 'Accepted' then
    v_state := 'accepted';
  elsif v_quote.status = 'Declined' then
    v_state := 'declined';
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

  select p.quote_number into v_replaces from public.quotes p
   where p.id = v_quote.supersedes_quote_id and p.organization_id = v_quote.organization_id;

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
    'expires_at', v_link.expires_at,
    'recipient_email', v_link.recipient_email,
    'recipient_name', v_link.recipient_name,
    'record', jsonb_build_object('quote_number', v_quote.quote_number, 'client_name', v_quote.client_name, 'valid_until', v_quote.valid_until),
    'version', v_version,
    'replaces_number', v_replaces,
    'owner', v_owner);
end $$;

revoke all on function public.portal_get_quote(text) from public, anon, authenticated;
grant execute on function public.portal_get_quote(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. portal_record_view: called by the page's script after it has loaded, so servers and mail scanners that run no
--    scripts do not count. For an open, accepted or declined link it sets first_viewed_at once and last_viewed_at
--    every time; for anything else it does nothing. It writes the link row only: the quote is not touched, so no
--    audit, search or milestone trigger on quotes fires.
-- ---------------------------------------------------------------------------
create or replace function public.portal_record_view(p_token text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if (public.portal_get_quote(p_token) ->> 'state') in ('open', 'accepted', 'declined') then
    update public.quote_access_links
       set first_viewed_at = coalesce(first_viewed_at, now()), last_viewed_at = now()
     where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
       and revoked_at is null and expires_at > now();
  end if;
end $$;

revoke all on function public.portal_record_view(text) from public, anon, authenticated;
grant execute on function public.portal_record_view(text) to service_role;
