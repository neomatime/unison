-- Quote portal, slice 3: the HIVE feed status staff see.
--
-- get_hive_feed_status(p_organization_id, p_client_id) tells a member of the organisation whether the accepted-quote gate
-- is on, whether the organisation has a live feed key and when HIVE last read the feed. For a client of the organisation
-- it also says whether that client would appear in the feed and, with the gate on, since when. An owner or admin also gets
-- how many clients the organisation has and how many of them the gate would leave.
--
-- UNISON can only say whether a client would appear in the feed and when HIVE last read it; nothing here says whether
-- HIVE did anything with it. Eligibility is not decided here: it is private.client_accepted_quotes, the same definition
-- get_clients_for_api_key uses. No key, key hash or key name is ever returned.

create or replace function public.get_hive_feed_status(
  p_organization_id uuid,
  p_client_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gated boolean;
  v_has_live_key boolean;
  v_last_read_at timestamptz;
  v_client jsonb := null;
  v_count integer;
  v_since timestamptz;
  v_summary jsonb := null;
  v_total integer;
  v_with_accepted integer;
begin
  if (select auth.uid()) is null or not public.is_member_of(p_organization_id) then
    raise exception 'Organization membership is required' using errcode = '42501';
  end if;

  -- No settings row means the default: the gate is off.
  select s.hive_feed_requires_accepted_quote into v_gated
  from public.organization_settings s
  where s.organization_id = p_organization_id;
  v_gated := coalesce(v_gated, false);

  -- Revoked keys are ignored: only the organisation's live keys say when HIVE last read the feed.
  select count(*) > 0, max(k.last_used_at) into v_has_live_key, v_last_read_at
  from public.client_api_keys k
  where k.organization_id = p_organization_id
    and k.revoked_at is null;

  -- A client of another organisation, or none at all, is no client here: null, never an error.
  if p_client_id is not null
     and exists (
       select 1 from public.clients c
       where c.id = p_client_id and c.organization_id = p_organization_id
     ) then
    select a.accepted_count, a.accepted_since into v_count, v_since
    from private.client_accepted_quotes(p_organization_id, p_client_id) a;

    v_client := jsonb_build_object(
      'included', not v_gated or v_count > 0,
      'since', case when v_gated and v_count > 0 then v_since else null end
    );
  end if;

  -- The counts are over every client of the organisation whatever the setting is, as the feed would return them with the
  -- gate off (total) and with it on (with an accepted quote).
  if public.has_role(p_organization_id, array['owner', 'admin']) then
    select count(*)::integer, (count(*) filter (where a.accepted_count > 0))::integer into v_total, v_with_accepted
    from public.clients c
    cross join lateral private.client_accepted_quotes(c.organization_id, c.id) a
    where c.organization_id = p_organization_id;

    v_summary := jsonb_build_object('total_clients', v_total, 'with_accepted_quote', v_with_accepted);
  end if;

  return jsonb_build_object(
    'gate_enabled', v_gated,
    'has_live_key', v_has_live_key,
    'last_read_at', v_last_read_at,
    'client', v_client,
    'summary', v_summary
  );
end;
$$;

revoke execute on function public.get_hive_feed_status(uuid, uuid) from public, anon;
grant execute on function public.get_hive_feed_status(uuid, uuid) to authenticated;
