-- Test-only bridge: lets the RLS test suite simulate a Microsoft sign-in by
-- inserting an auth.identities row for a fixture user.
--
-- The obvious approach -- admin.schema('auth').from('identities').insert()
-- via supabase-js -- does not work on this project: PostgREST here only
-- exposes the `public` and `graphql_public` schemas (confirmed live:
-- attempting it returns PGRST106 "Invalid schema: auth", hint "Only the
-- following schemas are exposed: public, graphql_public"). There is also no
-- GoTrue Admin API endpoint for creating an identity -- unlike auth.users,
-- which admin.auth.admin.createUser()/updateUserById() reach through a
-- dedicated REST endpoint, identity linking normally only happens through
-- the real OAuth handshake, and auth-js's admin surface has no equivalent
-- write method for auth.identities.
--
-- A SECURITY DEFINER function is the same bridge claim_directory_membership()
-- itself already uses to read from auth.users/auth.identities from the
-- public-schema side, just in the write direction and scoped to the one
-- shape a test fixture needs.
--
-- Restricted to service_role only -- both by grant and by an explicit
-- auth.role() check, mirroring delete_organization()'s pattern in
-- 20260816232306_deletable_organizations.sql -- so this can never be reached
-- by an authenticated end user. It exists purely for tests run with the
-- service-role secret key (tests/integration/rls/helpers.ts).
create or replace function public.rls_test_give_azure_identity(target_user_id uuid, target_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'rls_test_give_azure_identity is for the test suite only' using errcode = '42501';
  end if;

  -- created_at/updated_at are nullable at the schema level, but GoTrue's own
  -- reader chokes on a null timestamp here ("Database error querying
  -- schema" / "Database error loading user" on the very next sign-in) --
  -- confirmed live against every genuinely-created identity row, which
  -- always carries both. Setting them explicitly matches what a real OAuth
  -- linking would have written.
  insert into auth.identities (provider, provider_id, user_id, identity_data, last_sign_in_at, created_at, updated_at)
  values (
    'azure',
    'azure-' || target_user_id::text,
    target_user_id,
    jsonb_build_object('sub', 'azure-' || target_user_id::text, 'email', target_email),
    now(), now(), now()
  );
end $$;

revoke execute on function public.rls_test_give_azure_identity(uuid, text) from public, anon, authenticated;
grant execute on function public.rls_test_give_azure_identity(uuid, text) to service_role;
