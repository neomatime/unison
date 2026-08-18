-- Fence public.rls_test_give_azure_identity() to fixture-shaped targets only.
--
-- 20260818171200_rls_test_give_azure_identity.sql restricted this to
-- service_role and is correct about not raising the privilege ceiling --
-- service_role could already reach auth.identities through a raw SQL
-- connection. But it changed *how* that write is reached: before that
-- migration, nothing on the REST/RPC surface could touch auth.identities at
-- all, because PostgREST never exposes the auth schema. After it, anyone
-- holding the service-role key can attach an azure identity to ANY user_id
-- over a plain HTTP call, with no argument checking. Called with the wrong
-- target_user_id -- a copy-paste in a test, a reused admin script, a leaked
-- key -- it will happily attach a fabricated Microsoft identity to a real
-- account, including an organization's actual owner.
--
-- Fix: refuse any target whose own email doesn't look like a fixture. Every
-- fixture in tests/integration/rls/helpers.ts uses a `*.test` address
-- (createFixtureUser: `rls-<uuid>@unison.test`; directory-membership.test.ts:
-- `<local>@dir-<rand>.test`) -- `.test` is the IANA-reserved TLD for exactly
-- this purpose and no real HIMARK account can ever legitimately hold one.
-- Raises loudly rather than silently doing nothing, so a misuse is visible
-- immediately rather than looking like a silent no-op.
create or replace function public.rls_test_give_azure_identity(target_user_id uuid, target_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actual_email text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'rls_test_give_azure_identity is for the test suite only' using errcode = '42501';
  end if;

  select email into actual_email from auth.users where id = target_user_id;

  if actual_email is null or lower(actual_email) not like '%.test' then
    raise exception 'rls_test_give_azure_identity refuses % -- target user''s email must end in .test (the fixture convention), got %',
      target_user_id, coalesce(actual_email, '<no such user>')
      using errcode = '42501';
  end if;

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
