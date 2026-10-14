-- The feed also carries the client's own primary contact (contact_name / contact_email),
-- which HIVE uses to fill a new client. Contacts from the contacts table are unchanged.

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
