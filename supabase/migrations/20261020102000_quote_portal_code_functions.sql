-- Quote portal, slice 2: the snapshot hash, the response flag on the viewable payload, and the confirmation code.
-- Append-only: earlier migrations are applied and are not edited; portal_get_quote is replaced with the same signature
-- and its grants stated again.
--
-- 1. private.quote_snapshot_hash: sha256 of the frozen record's own jsonb text, the value the page shows and the decide
--    function (later) recomputes. Never a JavaScript re-serialisation.
-- 2. portal_get_quote: the body of 20261018102500_quote_portal_read_fixes.sql section 2, unchanged except that the three
--    viewable states (open, accepted, declined) also carry snapshot_hash and response. Expired, superseded and invalid
--    payloads are unchanged.
-- 3. portal_issue_code: the six-digit code for an open link, kept only as a salted hash.

-- ---------------------------------------------------------------------------
-- 1. private.quote_snapshot_hash. Invoker, like private.quote_snapshot: it is reached only from the definer functions.
--    The snapshot renders its timestamps in UTC (Ruling 16) and jsonb text is canonical, so the hash is the same in
--    every session.
-- ---------------------------------------------------------------------------
create or replace function private.quote_snapshot_hash(p_quote_id uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select encode(extensions.digest(private.quote_snapshot(p_quote_id)::text, 'sha256'), 'hex')
$$;

revoke all on function private.quote_snapshot_hash(uuid) from public, anon, authenticated;
grant execute on function private.quote_snapshot_hash(uuid) to service_role;

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
--    Open, accepted and declined also carry snapshot_hash (private.quote_snapshot_hash) and response: null, or
--    { decision, decided_at } when this link has a decision recorded.
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
  v_response jsonb;
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
    -- One decision per link (quote_responses_link_id_key), so at most one row.
    select jsonb_build_object('decision', r.decision, 'decided_at', r.decided_at) into v_response
    from public.quote_responses r
    where r.link_id = v_link.id and r.organization_id = v_link.organization_id;
    return jsonb_build_object(
      'state', v_state,
      'expires_at', v_link.expires_at,
      'recipient_email', v_link.recipient_email,
      'recipient_name', v_link.recipient_name,
      'record', v_snapshot -> 'record',
      'lines', v_snapshot -> 'lines',
      'version', v_version,
      'replaces_number', v_replaces,
      'owner', v_owner,
      'snapshot_hash', private.quote_snapshot_hash(v_quote.id),
      'response', v_response);
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
-- 3. portal_issue_code. Refusals are returned, not raised: { ok: false, reason }. In this order:
--      the state from portal_get_quote: invalid -> invalid; anything but open -> not_open;
--      this link already carries a decision -> already_decided;
--      the link row is locked, so requests at the same moment are counted one after another;
--      throttled when the link has had 5 codes in the last hour, or its codes from the last hour hold 10 failed
--      attempts, or all its codes hold 30;
--      otherwise one code row is written and the code is returned, once. Nothing else is written.
--    The code is uniform over 000000-999999: four random bytes, redrawn when they fall in the uneven tail above the
--    last whole million. Only sha256(salt || ':' || code) is kept, with a salt of its own.
-- ---------------------------------------------------------------------------
create or replace function public.portal_issue_code(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_code_lifetime constant interval := interval '10 minutes';
  c_window constant interval := interval '1 hour';
  c_codes_per_window constant integer := 5;
  c_failures_per_window constant integer := 10;
  c_failures_in_all constant integer := 30;
  c_uniform_limit constant bigint := 4294000000; -- the largest multiple of 1,000,000 not above 2^32
  v_payload jsonb;
  v_state text;
  v_link_id uuid;
  v_org uuid;
  v_recipient text;
  v_codes_in_window integer;
  v_failures_in_window integer;
  v_failures_in_all integer;
  v_bytes bytea;
  v_draw bigint;
  v_code text;
  v_salt text;
  v_expires timestamptz;
begin
  v_payload := public.portal_get_quote(p_token);
  v_state := v_payload ->> 'state';
  if v_state = 'invalid' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  elsif v_state is distinct from 'open' then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  -- An open state means the token is well formed and its link exists.
  select l.id, l.organization_id, l.recipient_email into v_link_id, v_org, v_recipient
  from public.quote_access_links l
  where l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if exists (select 1 from public.quote_responses r where r.link_id = v_link_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_decided');
  end if;

  perform 1 from public.quote_access_links l where l.id = v_link_id for update;

  select count(*) filter (where c.created_at > now() - c_window),
         coalesce(sum(c.attempts) filter (where c.created_at > now() - c_window), 0),
         coalesce(sum(c.attempts), 0)
    into v_codes_in_window, v_failures_in_window, v_failures_in_all
  from public.quote_access_codes c
  where c.link_id = v_link_id;
  if v_codes_in_window >= c_codes_per_window
     or v_failures_in_window >= c_failures_per_window
     or v_failures_in_all >= c_failures_in_all then
    return jsonb_build_object('ok', false, 'reason', 'throttled');
  end if;

  loop
    v_bytes := extensions.gen_random_bytes(4);
    v_draw := (get_byte(v_bytes, 0)::bigint << 24) | (get_byte(v_bytes, 1)::bigint << 16)
            | (get_byte(v_bytes, 2)::bigint << 8) | get_byte(v_bytes, 3)::bigint;
    exit when v_draw < c_uniform_limit;
  end loop;
  v_code := lpad((v_draw % 1000000)::text, 6, '0');
  v_salt := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.quote_access_codes (organization_id, link_id, code_salt, code_hash, expires_at)
  values (v_org, v_link_id, v_salt, encode(extensions.digest(v_salt || ':' || v_code, 'sha256'), 'hex'), now() + c_code_lifetime)
  returning expires_at into v_expires;

  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'expires_at', v_expires,
    'recipient_email', v_recipient,
    'quote_number', v_payload -> 'record' ->> 'quote_number',
    'client_name', v_payload -> 'record' ->> 'client_name');
end $$;

revoke all on function public.portal_issue_code(text) from public, anon, authenticated;
grant execute on function public.portal_issue_code(text) to service_role;
