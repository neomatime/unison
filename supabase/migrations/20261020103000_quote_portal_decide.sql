-- Quote portal, slice 2: the decision. portal_decide records a client's accept or decline in one transaction; the two
-- private functions beside it say who is told (decision_recipients) and write what follows a decision
-- (decision_follow_ups, which does nothing until the next migration gives it a body).
-- Append-only: earlier migrations are applied and are not edited.
--
-- 1. private.decision_recipients: the quote's owner and the member who sent the link, and the address to tell.
-- 2. private.decision_follow_ups: a no-op here; the follow-ups migration replaces its body.
-- 3. public.portal_decide: the checks, in a fixed order, and the writes.

-- ---------------------------------------------------------------------------
-- 1. private.decision_recipients. One row for the quote:
--      owner_*  the quote's owner, quotes.owner_id -> team_members in the quote's organisation (none when the quote has
--               no owner). owner_user_id is null for a profile with no login: such an owner has an email but no
--               in-app notice.
--      sender_* the member who made the link: sender_user_id is the link's created_by (null once that membership is
--               gone), and sender_member_id and sender_email come from that login's team profile in the same
--               organisation (the earliest unarchived one when there are several), or are null when it has none.
--      notify_email the owner's team email, else the sender's, else null.
--    Invoker, like private.quote_snapshot_hash: it is reached only from the definer functions and is never granted.
-- ---------------------------------------------------------------------------
create or replace function private.decision_recipients(p_quote_id uuid, p_link_id uuid)
returns table (
  owner_member_id uuid, owner_user_id uuid, owner_name text, owner_email text,
  sender_member_id uuid, sender_user_id uuid, sender_email text, notify_email text)
language sql stable security invoker set search_path = '' as $$
  select o.id, o.user_id, o.full_name, o.email, s.id, l.created_by, s.email, coalesce(o.email, s.email)
  from public.quotes q
  left join public.team_members o on o.id = q.owner_id and o.organization_id = q.organization_id
  left join public.quote_access_links l on l.id = p_link_id and l.quote_id = q.id and l.organization_id = q.organization_id
  left join lateral (
    select t.id, t.email
    from public.team_members t
    where t.organization_id = q.organization_id and t.user_id = l.created_by
    order by t.archived_at nulls first, t.created_at, t.id
    limit 1) s on true
  where q.id = p_quote_id
$$;

revoke all on function private.decision_recipients(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. private.decision_follow_ups: called by portal_decide after the status change, inside the decision's transaction.
--    It does nothing here; the follow-ups migration (owner notices, the decline recovery task) replaces this body with
--    create or replace and keeps the signature. Definer, never granted.
-- ---------------------------------------------------------------------------
create or replace function private.decision_follow_ups(p_response_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  return;
end $$;

revoke all on function private.decision_follow_ups(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. portal_decide. Refusals are returned, never raised, as { ok: false, reason[, attempts_left] }, so a counted
--    failed attempt commits. Only an unexpected error raises. The checks, in this order:
--      1. the token's shape, its link and the link's quote, else invalid. Link, quote and organisation all come from
--         this one lookup. Then the locks: the quote row, then the link row (the order quotes_supersede_original
--         takes them in), and only then the state and version from portal_get_quote, so the state, the response
--         check and every write below see one settled quote;
--      2. state invalid: invalid. This link already has a response and the state is open, accepted or declined:
--         the recorded outcome with replay true, writing nothing (a double submit, a retry, or a reopened quote whose
--         link was used). Any other state: not_open. From here on the state is open and the link has no response;
--      3. the fields, else incomplete (not counted): the decision; name and position 2 to 120 characters and
--         organisation 2 to 160 after trimming, with no control character; consent given and its wording 20 to 500
--         characters; a reason from the six and comments of at most 2000 characters with no control character but
--         newline and tab, both on a decline only; a six-digit code; a 64-character lower-case hex hash;
--      4. the hash of the page the client saw equals the quote's hash now, else stale (not counted);
--      5. failed attempts on this link's codes: 10 in the last hour or 30 in all give throttled (the caps
--         portal_issue_code applies);
--      6. the link's newest code, locked: none or consumed gives code_missing; expired gives code_expired (not
--         counted); 5 attempts give code_locked; a wrong code adds an attempt and returns code_wrong with the
--         attempts left;
--      7. the response row, the code consumed, the quote's status (whose triggers set accepted_at and write the
--         timeline entry), then the follow-ups.
--    The single-line fields are stored trimmed; the consent wording and the comments are stored exactly as given.
--    The IP address and user agent are evidence only: an address over 64 characters is dropped and the user agent is
--    cut to 300 characters, so neither can refuse a decision.
-- ---------------------------------------------------------------------------
create or replace function public.portal_decide(
  p_token text, p_code text, p_decision text, p_signatory_name text, p_signatory_position text,
  p_signatory_organisation text, p_consent_text text, p_consent boolean, p_snapshot_hash text,
  p_decline_reason text, p_decline_comments text, p_ip text, p_user_agent text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_attempts_per_code constant integer := 5;
  c_window constant interval := interval '1 hour';
  c_failures_per_window constant integer := 10;
  c_failures_in_all constant integer := 30;
  c_reasons constant text[] := array['Budget considerations', 'Timing is not right', 'Scope does not meet our requirements',
                                     'Internal approval pending', 'Chose another provider', 'Other'];
  v_invalid constant jsonb := jsonb_build_object('ok', false, 'reason', 'invalid');
  v_name text := btrim(p_signatory_name);
  v_position text := btrim(p_signatory_position);
  v_organisation text := btrim(p_signatory_organisation);
  v_link public.quote_access_links%rowtype;
  v_quote public.quotes%rowtype;
  v_payload jsonb;
  v_state text;
  v_response public.quote_responses%rowtype;
  v_replay boolean;
  v_failures_in_window integer;
  v_failures_in_all integer;
  v_code public.quote_access_codes%rowtype;
  v_attempts integer;
  v_owner_name text;
  v_notify_email text;
begin
  -- 1. The token, its link and quote; the locks; the state read under them.
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return v_invalid;
  end if;
  select * into v_link from public.quote_access_links l
   where l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found then
    return v_invalid;
  end if;
  select * into v_quote from public.quotes q
   where q.id = v_link.quote_id and q.organization_id = v_link.organization_id
   for update;
  if not found then
    return v_invalid;
  end if;
  select * into v_link from public.quote_access_links l where l.id = v_link.id for update;
  if not found then
    return v_invalid;
  end if;
  v_payload := public.portal_get_quote(p_token);
  v_state := v_payload ->> 'state';

  -- 2. The state, and a decision this link already made.
  if v_state = 'invalid' then
    return v_invalid;
  end if;
  select * into v_response from public.quote_responses r where r.link_id = v_link.id;
  v_replay := found and v_state in ('open', 'accepted', 'declined');

  if not v_replay then
    if v_state is distinct from 'open' then
      return jsonb_build_object('ok', false, 'reason', 'not_open');
    end if;

    -- 3. The fields. A null anywhere makes the whole test null, which is refused too.
    if not coalesce(
         p_decision in ('accepted', 'declined')
         and char_length(v_name) between 2 and 120 and v_name !~ '[[:cntrl:]]'
         and char_length(v_position) between 2 and 120 and v_position !~ '[[:cntrl:]]'
         and char_length(v_organisation) between 2 and 160 and v_organisation !~ '[[:cntrl:]]'
         and p_consent
         and char_length(p_consent_text) between 20 and 500
         and (p_decline_reason is null or (p_decision = 'declined' and p_decline_reason = any (c_reasons)))
         and (p_decline_comments is null
              or (p_decision = 'declined' and char_length(p_decline_comments) <= 2000
                  and translate(p_decline_comments, E'\n\t', '') !~ '[[:cntrl:]]'))
         and p_code ~ '^[0-9]{6}$'
         and p_snapshot_hash ~ '^[0-9a-f]{64}$',
         false) then
      return jsonb_build_object('ok', false, 'reason', 'incomplete');
    end if;

    -- 4. The page the client saw is the quote as it is now.
    if p_snapshot_hash is distinct from private.quote_snapshot_hash(v_quote.id) then
      return jsonb_build_object('ok', false, 'reason', 'stale');
    end if;

    -- 5. The failed-attempt caps, summed over the link's codes.
    select coalesce(sum(c.attempts) filter (where c.created_at > now() - c_window), 0), coalesce(sum(c.attempts), 0)
      into v_failures_in_window, v_failures_in_all
    from public.quote_access_codes c
    where c.link_id = v_link.id;
    if v_failures_in_window >= c_failures_per_window or v_failures_in_all >= c_failures_in_all then
      return jsonb_build_object('ok', false, 'reason', 'throttled');
    end if;

    -- 6. The link's newest code. A wrong code is counted and the count is kept: this is a return, not a raise.
    select * into v_code from public.quote_access_codes c
     where c.link_id = v_link.id
     order by c.created_at desc, c.id desc
     limit 1
     for update;
    if not found or v_code.consumed_at is not null then
      return jsonb_build_object('ok', false, 'reason', 'code_missing');
    elsif v_code.expires_at <= now() then
      return jsonb_build_object('ok', false, 'reason', 'code_expired');
    elsif v_code.attempts >= c_attempts_per_code then
      return jsonb_build_object('ok', false, 'reason', 'code_locked');
    elsif v_code.code_hash <> encode(extensions.digest(v_code.code_salt || ':' || p_code, 'sha256'), 'hex') then
      update public.quote_access_codes set attempts = attempts + 1 where id = v_code.id
      returning attempts into v_attempts;
      return jsonb_build_object('ok', false, 'reason', 'code_wrong', 'attempts_left', c_attempts_per_code - v_attempts);
    end if;

    -- 7. The record, the code consumed, the status, the follow-ups.
    insert into public.quote_responses (
      organization_id, quote_id, link_id, decision, signatory_name, signatory_position, signatory_organisation,
      verified_email, consent_text, consent_given, code_verified_at, snapshot_hash, terms_sources, quote_number,
      quote_version, ip_address, user_agent, decline_reason, decline_comments)
    values (
      v_link.organization_id, v_quote.id, v_link.id, p_decision, v_name, v_position, v_organisation,
      v_link.recipient_email, p_consent_text, true, now(), p_snapshot_hash, v_quote.terms_sources, v_quote.quote_number,
      (v_payload ->> 'version')::integer,
      case when char_length(p_ip) <= 64 then p_ip end, left(p_user_agent, 300), p_decline_reason, p_decline_comments)
    returning * into v_response;

    update public.quote_access_codes set consumed_at = now() where id = v_code.id;

    update public.quotes set status = case p_decision when 'accepted' then 'Accepted' else 'Declined' end
     where id = v_quote.id and organization_id = v_quote.organization_id;

    perform private.decision_follow_ups(v_response.id);
  end if;

  -- The outcome, from the response row: the one just written, or the one this link recorded before.
  select r.owner_name, r.notify_email into v_owner_name, v_notify_email
  from private.decision_recipients(v_quote.id, v_link.id) r;
  return jsonb_build_object(
    'ok', true,
    'replay', v_replay,
    'decision', v_response.decision,
    'decided_at', v_response.decided_at,
    'quote_id', v_response.quote_id,
    'quote_number', v_response.quote_number,
    'client_name', v_quote.client_name,
    'recipient_email', v_response.verified_email,
    'signatory_name', v_response.signatory_name,
    'signatory_position', v_response.signatory_position,
    'decline_reason', v_response.decline_reason,
    'decline_comments', v_response.decline_comments,
    'owner_name', v_owner_name,
    'notify_email', v_notify_email);
end $$;

revoke all on function public.portal_decide(text, text, text, text, text, text, text, boolean, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.portal_decide(text, text, text, text, text, text, text, boolean, text, text, text, text, text)
  to service_role;
