-- A HIMARK administrator is not a member of the tenants they provision, so
-- organizations_select (is_member_of(id)) hides every one of them. This is the
-- read counterpart to provision_organization, carrying the identical check so
-- the rule lives in one place.
create or replace function public.list_provisioned_organizations()
returns table (
  id uuid,
  name text,
  slug text,
  status text,
  created_at timestamptz,
  admin_email text
)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  himark_id uuid;
begin
  select o.id into himark_id
  from public.organizations o
  where o.slug = 'himark' and o.status = 'active';

  if himark_id is null then
    raise exception 'internal organization not found' using errcode = '42501';
  end if;

  if auth.role() is distinct from 'service_role'
     and not public.has_role(himark_id, array['owner', 'admin']) then
    raise exception 'only a HIMARK administrator may list organizations'
      using errcode = '42501';
  end if;

  return query
  select
    o.id, o.name, o.slug, o.status, o.created_at,
    (
      select i.email from public.invitations i
      where i.organization_id = o.id and i.role_id = 'owner'
      order by i.created_at desc
      limit 1
    ) as admin_email
  from public.organizations o
  order by o.created_at desc;
end $$;

-- Supabase grants EXECUTE on newly created functions to anon by default, and
-- `revoke all ... from public` does not strip that grant since anon is not
-- PUBLIC. Revoke from both explicitly, matching provision_organization and
-- reissue_invitation.
revoke all on function public.list_provisioned_organizations() from public, anon;
grant execute on function public.list_provisioned_organizations() to authenticated, service_role;
