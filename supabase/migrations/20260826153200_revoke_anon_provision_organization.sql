-- Supabase grants EXECUTE on newly created functions to anon by default;
-- `revoke all ... from public` in the original migration does not strip that
-- grant, since anon is not PUBLIC. delete_organization and
-- claim_directory_membership both revoke from public AND anon explicitly --
-- match that precedent so provision_organization is not callable
-- unauthenticated, even though auth.uid() being null already makes the
-- has_role() check refuse it today.
revoke execute on function public.provision_organization(text, text, text, text, timestamptz) from public, anon;
