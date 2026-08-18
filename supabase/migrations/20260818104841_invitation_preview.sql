-- Lets an UNAUTHENTICATED invitee resolve their token far enough to create an
-- account. Without this there is no way into the product: sign-up was removed
-- (invite-only), and accept_invitation() requires an authenticated, verified
-- caller — so a genuinely new person could never satisfy either.
--
-- Deliberately minimal. It returns the invited address and the organization
-- name and nothing else: the address so the signup form can bind the account
-- to it rather than trusting a submitted value, the name so the invitee can
-- see what they are joining. No id, no role, no inviter, no membership data.
--
-- Not a meaningful oracle: tokens are 256 bits from a CSPRNG, and anyone
-- holding one already received the email containing the address it names. An
-- unknown, expired, revoked or accepted token returns zero rows — the same
-- answer for all four, so it cannot be used to distinguish them.
create or replace function public.invitation_preview(raw_token text)
returns table (email text, organization_name text)
language sql stable security definer set search_path = ''
as $$
  select i.email, o.name
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token_hash = extensions.digest(raw_token, 'sha256')::text
    and i.status = 'pending'
    and i.expires_at > now()
    and o.status = 'active';
$$;

revoke execute on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;
