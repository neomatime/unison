-- projects.owner_id has always referenced auth.users(id) with nothing
-- tenant-scoping it, so a crafted submit could name a user in another
-- organisation and neither RLS nor a foreign key would refuse it. That is why
-- ownerId was removed from projectInputSchema rather than merely unused.
--
-- memberships already carries UNIQUE (organization_id, user_id), so a composite
-- key makes a cross-tenant owner unrepresentable, the same way
-- projects_client_fkey and projects_framework_fkey already do for their columns.
--
-- The (owner_id) column list is required, not decorative: without it Postgres
-- nulls EVERY column in the constraint, including organization_id, which is
-- not null. Migration 20260826111259 exists because that was missed once.
--
-- The existing owner_id -> auth.users key stays. It is redundant with this one
-- and harmless: deleting an auth user cascades to the membership, which nulls
-- the owner through this constraint.
alter table public.projects
  add constraint projects_owner_fkey
  foreign key (organization_id, owner_id)
  references public.memberships (organization_id, user_id)
  on delete set null (owner_id);

-- Owner names cannot be read through PostgREST: auth.users is not an exposed
-- schema and there is no profiles table. list-projects.ts currently renders
-- owner as an em dash with a comment saying exactly this. A security definer
-- function is the same shape list_provisioned_organizations already uses.
--
-- Returns every member with their status rather than only active ones. The
-- picker filters to active; the register needs the name of an owner whose
-- membership has since been removed, because ownership is accountability for
-- work already done and that record should not silently blank.
create or replace function public.list_organization_members(p_organization_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role_id text,
  status text
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.is_member_of(p_organization_id) then
    raise exception 'not a member of that organization' using errcode = '42501';
  end if;

  return query
    select m.user_id,
           u.email::text,
           (u.raw_user_meta_data ->> 'full_name')::text,
           m.role_id,
           m.status
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id
    order by coalesce(u.raw_user_meta_data ->> 'full_name', u.email::text);
end $$;

revoke all on function public.list_organization_members(uuid) from public, anon;
grant execute on function public.list_organization_members(uuid) to authenticated, service_role;
