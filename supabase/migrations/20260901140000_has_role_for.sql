-- has_role(org, roles) resolves auth.uid() internally, so it returns false for
-- every caller under the service role and cannot express "is this NAMED actor a
-- HIMARK administrator". provision_organization and reissue_invitation both need
-- that question once they stop being callable from an authenticated session.
--
-- The predicate moves here and has_role delegates, so the session path and the
-- service-role path cannot drift apart.
create function public.has_role_for(org uuid, actor uuid, roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = actor
      and organization_id = org
      and status = 'active'
      and role_id = any(roles)
  );
$$;

-- Same signature, so this replaces the body in place: every RLS policy that
-- depends on has_role keeps working and its existing grants carry.
create or replace function public.has_role(org uuid, roles text[])
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.has_role_for(org, auth.uid(), roles); $$;

-- No grant to authenticated. Its callers are security definer functions, which
-- execute as the owner regardless. service_role gets execute so the RLS suite
-- can test the predicate directly rather than only through its callers.
revoke all on function public.has_role_for(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.has_role_for(uuid, uuid, text[]) to service_role;
