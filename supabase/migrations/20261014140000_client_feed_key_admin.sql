-- Owners and admins manage the HIVE client feed keys from Settings. The key itself is returned once
-- at creation; only its hash is stored. The service functions from 20261014100000 stay operator-only.

create or replace function public.create_client_feed_key(p_organization_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'unk_' || encode(extensions.gen_random_bytes(32), 'hex');
begin
  if (select auth.uid()) is null or not public.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Client feed administration is required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(trim(p_name)) > 80 then
    raise exception 'Give the key a name of up to 80 characters';
  end if;
  insert into public.client_api_keys (organization_id, name, key_hash)
  values (p_organization_id, trim(p_name), encode(extensions.digest(v_key, 'sha256'), 'hex'));
  return v_key;
end;
$$;

create or replace function public.list_client_feed_keys(p_organization_id uuid)
returns table (id uuid, name text, created_at timestamptz, last_used_at timestamptz, revoked_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.has_role(p_organization_id, array['owner', 'admin']) then
    raise exception 'Client feed administration is required' using errcode = '42501';
  end if;
  return query
    select k.id, k.name, k.created_at, k.last_used_at, k.revoked_at
    from public.client_api_keys k
    where k.organization_id = p_organization_id
    order by k.created_at desc;
end;
$$;

create or replace function public.revoke_client_feed_key(p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.client_api_keys where id = p_key_id;
  if v_org is null then
    raise exception 'Key not found';
  end if;
  if (select auth.uid()) is null or not public.has_role(v_org, array['owner', 'admin']) then
    raise exception 'Client feed administration is required' using errcode = '42501';
  end if;
  update public.client_api_keys set revoked_at = now() where id = p_key_id and revoked_at is null;
end;
$$;

revoke execute on function public.create_client_feed_key(uuid, text) from public, anon;
revoke execute on function public.list_client_feed_keys(uuid) from public, anon;
revoke execute on function public.revoke_client_feed_key(uuid) from public, anon;
grant execute on function public.create_client_feed_key(uuid, text) to authenticated;
grant execute on function public.list_client_feed_keys(uuid) to authenticated;
grant execute on function public.revoke_client_feed_key(uuid) to authenticated;
