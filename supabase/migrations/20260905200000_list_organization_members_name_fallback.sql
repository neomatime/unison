-- Fixes a naming inconsistency between the shell and the owner picker/register,
-- without editing any of the three already-applied migrations for this
-- function (20260905180000, 20260905180500, 20260905190000). The body's
-- membership check is unchanged; only the selected name column changes.
--
-- The shell resolves a display name with lib/auth/display-name.ts's
-- resolveDisplayName(), which checks user_metadata.full_name and then
-- user_metadata.name before falling back to deriving one from the email
-- address -- because which claim key holds the provider's name depends on
-- what that provider actually sent (see the comment on resolveDisplayName
-- and features/auth-ui/actions/sign-in-with-microsoft.ts). This function
-- selected only raw_user_meta_data ->> 'full_name', so a member whose
-- metadata carried `name` but not `full_name` would be named one way in the
-- shell and by another name (or blank) here -- a real divergence, not a
-- hypothetical one: resolveDisplayName has a standing unit test for exactly
-- the name-without-full_name case.
--
-- Only Azure is wired up today, and its claim lands as `full_name` per the
-- sign-in action's comment, so this has not yet been observed in practice.
-- Making the two agree now is cheaper than carrying the discrepancy forward.
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
           coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
           m.role_id,
           m.status
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id
    order by coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email::text);
end $$;

-- Grants must be restated on every create or replace -- they do not carry
-- forward from the prior definition.
revoke all on function public.list_organization_members(uuid) from public, anon;
grant execute on function public.list_organization_members(uuid) to authenticated, service_role;
