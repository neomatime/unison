-- Read-only client feed for HIVE. One API key per organisation, stored as a
-- SHA-256 hash, revocable. The HTTP route calls get_clients_for_api_key with the
-- anon key; the function checks the key itself, so no service role is needed.

create table public.client_api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index client_api_keys_org_idx on public.client_api_keys (organization_id);

alter table public.client_api_keys enable row level security;
-- No policies: nobody reads or writes the table through the API.
revoke all on public.client_api_keys from anon, authenticated;

-- Run in the SQL editor by an operator. Returns the key once; only the hash is kept.
create or replace function public.create_client_api_key(p_organization_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'unk_' || encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.client_api_keys (organization_id, name, key_hash)
  values (p_organization_id, trim(p_name), encode(extensions.digest(v_key, 'sha256'), 'hex'));
  return v_key;
end;
$$;
revoke execute on function public.create_client_api_key(uuid, text) from public, anon, authenticated;

create or replace function public.revoke_client_api_key(p_key_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.client_api_keys set revoked_at = now() where id = p_key_id and revoked_at is null;
$$;
revoke execute on function public.revoke_client_api_key(uuid) from public, anon, authenticated;

-- Pages through clients for the key's organisation. Returns null for an unknown
-- or revoked key. p_cursor is the id of the last client of the previous page.
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

  with page as (
    select c.*
    from public.clients c
    where c.organization_id = v_key.organization_id
      and (p_updated_since is null or c.updated_at >= p_updated_since)
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
      'updatedAt', s.updated_at
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
