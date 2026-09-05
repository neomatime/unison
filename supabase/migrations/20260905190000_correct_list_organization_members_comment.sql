-- Corrects the justification comment on
-- 20260905180500_list_organization_members_service_role.sql, without editing
-- that applied migration. The function body (the actual bypass) is unchanged
-- byte-for-byte; only the explanatory comment above it is replaced.
--
-- That comment justified the service_role bypass by pointing at "cleanup/
-- admin tooling and the RLS suite's own service-role-driven checks". Neither
-- half of that held up: there is no cleanup or admin tooling anywhere in this
-- codebase that calls list_organization_members, and the RLS suite's use of
-- `admin.rpc(...)` to make the *success* assertion was itself the defect
-- flagged in code review -- production's only caller runs as `authenticated`
-- through a signed-in session (see the "a signed-in member can list their own
-- organisation members" spec added to project-owner.test.ts), and the suite
-- now asserts that path directly instead of routing the assertion through
-- service_role. A migration comment is permanent schema documentation; the
-- next reader would otherwise preserve this bypass for a reason that was
-- never true.
--
-- The honest justification is parity with public.list_provisioned_organizations
-- (20260826163312_list_provisioned_organizations.sql): both are read-only,
-- security definer, granted to `authenticated, service_role` the same way,
-- and both guard with the same shape --
--   if auth.role() is distinct from 'service_role' and not <membership check>
-- -- rather than public.delete_organization, which this bypass was previously
-- (and wrongly) compared to: delete_organization is a write path, and citing
-- it invites a reader to reason "this function can already mutate state under
-- service_role, so letting it read is no bigger a bypass" -- a comparison
-- that doesn't apply here and overstates what this grant needs defending
-- against.
--
-- Nor does the bypass raise any privilege ceiling of its own: service_role
-- already holds the GoTrue Admin API (auth.admin.*), which can read every
-- row this function returns -- user_id, email, full_name, role_id, status --
-- directly from auth.users and public.memberships with no RLS or
-- is_member_of() check at all. Granting service_role a shortcut to data it
-- can already reach by another route adds no new exposure.
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

-- Grants must be restated on every create or replace -- they do not carry
-- forward from the prior definition.
revoke all on function public.list_organization_members(uuid) from public, anon;
grant execute on function public.list_organization_members(uuid) to authenticated, service_role;
