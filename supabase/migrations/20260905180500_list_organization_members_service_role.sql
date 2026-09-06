-- Fixes a contract gap in 20260905180000_project_owner_and_members.sql,
-- rather than editing that applied migration.
--
-- The interface for list_organization_members grants execute to both
-- `authenticated` and `service_role` (see task-1-brief.md). But the function
-- body as first written checks only `public.is_member_of(p_organization_id)`,
-- which reads `auth.uid()` -- and a service-role call carries no `sub` claim,
-- so `auth.uid()` is null and is_member_of() can never match a membership
-- row. Granting execute to service_role while leaving no way for a
-- service-role caller to ever satisfy the check makes that grant a dead
-- letter: cleanup/admin tooling and the RLS suite's own service-role-driven
-- checks (project-owner.test.ts calls this via `admin.rpc`, the same
-- service-role client the suite uses for fixture setup) would always be
-- refused with 'not a member of that organization', 42501.
--
-- public.delete_organization already carries the fix for exactly this
-- situation:
--   if auth.role() is distinct from 'service_role' and not public.has_role(...)
-- This mirrors that established idiom rather than inventing a new one.
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
  if auth.role() is distinct from 'service_role' and not public.is_member_of(p_organization_id) then
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
