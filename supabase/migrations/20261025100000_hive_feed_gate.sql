-- Quote portal, slice 3: the HIVE feed gate.
--
-- organization_settings.hive_feed_requires_accepted_quote (default false) narrows the client feed HIVE reads to the
-- clients with a non-archived Accepted quote in the same organisation, by either path (the portal or staff by hand).
-- While it is false, get_clients_for_api_key returns exactly what it returned before this migration: the same clients,
-- keys, values, order, paging and updated_since filtering, with updatedAt the client's own updated_at.
--
-- With it true, a client is a candidate only while it has such a quote, and the updated_since comparison and the
-- returned updatedAt use the later of the client's updated_at and its latest accepted_at, so a client that becomes
-- eligible after HIVE's last pull is returned by HIVE's next incremental pull. Nothing else in the response changes.
--
-- Who may change the setting is already limited to owners and admins by organization_settings_update.

alter table public.organization_settings
  add column hive_feed_requires_accepted_quote boolean not null default false;

-- ---------------------------------------------------------------------------
-- The one definition of eligibility: the client's quotes in that organisation with status Accepted that are not
-- archived. Always one row (a count of zero and null dates when there are none).
-- ---------------------------------------------------------------------------
create or replace function private.client_accepted_quotes(p_organization_id uuid, p_client_id uuid)
returns table (accepted_count integer, accepted_since timestamptz, latest_accepted_at timestamptz)
language sql stable set search_path = '' as $$
  select count(*)::integer, min(q.accepted_at), max(q.accepted_at)
  from public.quotes q
  where q.organization_id = p_organization_id
    and q.client_id = p_client_id
    and q.status = 'Accepted'
    and q.archived_at is null
$$;

revoke all on function private.client_accepted_quotes(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The feed, from 20261014120000_client_feed_primary_contact.sql. Changed: the setting is read once, the eligibility
-- join, and the time used for updated_since and updatedAt (feed_updated_at), which is updated_at while the setting is off.
-- ---------------------------------------------------------------------------
create or replace function public.get_clients_for_api_key(
  p_key text,
  p_updated_since timestamptz default null,
  p_cursor uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key public.client_api_keys%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_gated boolean;
  v_rows jsonb;
  v_total integer;
  v_last uuid;
begin
  select * into v_key
  from public.client_api_keys
  where key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
    and revoked_at is null;
  if v_key.id is null then
    return null;
  end if;

  update public.client_api_keys set last_used_at = now() where id = v_key.id;

  -- No settings row means the default: the gate is off.
  select s.hive_feed_requires_accepted_quote into v_gated
  from public.organization_settings s
  where s.organization_id = v_key.organization_id;
  v_gated := coalesce(v_gated, false);

  with page as (
    select c.*, f.feed_updated_at
    from public.clients c
    cross join lateral private.client_accepted_quotes(c.organization_id, c.id) a
    cross join lateral (
      select case when v_gated
        then greatest(c.updated_at, coalesce(a.latest_accepted_at, c.updated_at))
        else c.updated_at
      end as feed_updated_at
    ) f
    where c.organization_id = v_key.organization_id
      and (not v_gated or a.accepted_count > 0)
      and (p_updated_since is null or f.feed_updated_at >= p_updated_since)
      and (p_cursor is null or c.id > p_cursor)
    order by c.id
    limit v_limit + 1
  ), shown as (
    select * from page order by id limit v_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'status', s.status,
      'archived', s.archived_at is not null,
      'industry', s.industry,
      'website', s.website,
      'contactName', s.contact_name,
      'contactEmail', s.contact_email,
      'billingEmail', s.billing_email,
      'billingAddress', jsonb_build_object(
        'line1', s.address_line1, 'line2', s.address_line2, 'city', s.city,
        'postalCode', s.postal_code, 'country', s.country),
      'vatNumber', s.vat_number,
      'contacts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ct.id, 'fullName', ct.full_name, 'email', ct.email, 'phone', ct.phone,
          'jobTitle', ct.job_title, 'primary', ct.is_primary) order by ct.is_primary desc, ct.full_name)
        from public.contacts ct
        where ct.client_id = s.id and ct.organization_id = s.organization_id and ct.archived_at is null
      ), '[]'::jsonb),
      'createdAt', s.created_at,
      'updatedAt', s.feed_updated_at
    ) order by s.id), '[]'::jsonb),
    (select count(*)::integer from page),
    (select id from shown order by id desc limit 1)
  into v_rows, v_total, v_last
  from shown s;

  return jsonb_build_object(
    'clients', v_rows,
    'nextCursor', case when v_total > v_limit then v_last else null end
  );
end;
$$;
revoke execute on function public.get_clients_for_api_key(text, timestamptz, uuid, integer) from public;
grant execute on function public.get_clients_for_api_key(text, timestamptz, uuid, integer) to anon;
